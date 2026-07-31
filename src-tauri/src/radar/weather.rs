//! Provider meteorológico (Open-Meteo) e alertas derivados.
//!
//! Licenciamento: o endpoint público do Open-Meteo é gratuito para uso não
//! comercial. Para distribuição comercial é necessário plano dedicado com
//! chave. [`WeatherProviderMode`] existe para tornar essa escolha explícita em
//! vez de escondê-la — nenhuma chave é embutida no binário.

use super::{
    config,
    error::{ProviderError, ProviderErrorKind},
    http::{ExpectedContent, FetchSpec, SecureHttpClient},
    models::{
        clean_text, normalize_location, valid_timezone, RadarLocation, RadarSeverity, RadarWeather,
        RadarWeatherAlert, RadarWeatherAlertKind, RadarWeatherCurrent, RadarWeatherDay,
        RadarWeatherHour,
    },
};
use chrono::{NaiveDate, NaiveDateTime};
use reqwest::Url;
use serde::Deserialize;
use std::collections::HashSet;

pub const PROVIDER_ID: &str = "open-meteo";
pub const PROVIDER_NAME: &str = "Open-Meteo";
pub const ATTRIBUTION_URL: &str = "https://open-meteo.com/";

const FORECAST_HOST: &str = "api.open-meteo.com";
const GEOCODING_HOST: &str = "geocoding-api.open-meteo.com";
const FORECAST_URL: &str = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL: &str = "https://geocoding-api.open-meteo.com/v1/search";

const FORECAST_HOSTS: &[&str] = &[FORECAST_HOST];
const GEOCODING_HOSTS: &[&str] = &[GEOCODING_HOST];

/// Quantos pontos horários futuros a UI recebe.
const HOURLY_POINTS: usize = 24;
/// Mínimo exigido pelo plano para considerar a previsão utilizável.
const MIN_HOURLY_POINTS: usize = 12;

/// Modo de operação do provider climático. A distribuição comercial precisa
/// escolher conscientemente entre gateway próprio ou chave do usuário.
///
/// `Commercial` ainda não é construído em runtime: a origem segura da chave
/// (gateway próprio ou credencial do usuário) é uma decisão de produto pendente,
/// documentada no relatório. O caminho de código existe e é testado para que a
/// escolha não fique escondida atrás de uma chave embutida no binário.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum WeatherProviderMode {
    /// Endpoint público, sem chave. Uso pessoal / não comercial.
    #[default]
    Public,
    /// Endpoint dedicado com chave fornecida por configuração segura do
    /// sistema — nunca embutida no binário nem versionada.
    Commercial { host: String, api_key: String },
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ForecastResponse {
    timezone: Option<String>,
    current: Option<ForecastCurrent>,
    hourly: Option<ForecastHourly>,
    daily: Option<ForecastDaily>,
}

#[derive(Debug, Deserialize)]
struct ForecastCurrent {
    time: Option<String>,
    temperature_2m: Option<f64>,
    apparent_temperature: Option<f64>,
    relative_humidity_2m: Option<f64>,
    precipitation: Option<f64>,
    rain: Option<f64>,
    weather_code: Option<i32>,
    wind_speed_10m: Option<f64>,
    wind_gusts_10m: Option<f64>,
    surface_pressure: Option<f64>,
    is_day: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct ForecastHourly {
    #[serde(default)]
    time: Vec<String>,
    #[serde(default)]
    temperature_2m: Vec<Option<f64>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    apparent_temperature: Vec<Option<f64>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    relative_humidity_2m: Vec<Option<f64>>,
    #[serde(default)]
    precipitation_probability: Vec<Option<f64>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    precipitation: Vec<Option<f64>>,
    #[serde(default)]
    weather_code: Vec<Option<i32>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    wind_speed_10m: Vec<Option<f64>>,
}

#[derive(Debug, Deserialize)]
struct ForecastDaily {
    #[serde(default)]
    time: Vec<String>,
    #[serde(default)]
    weather_code: Vec<Option<i32>>,
    #[serde(default)]
    temperature_2m_max: Vec<Option<f64>>,
    #[serde(default)]
    temperature_2m_min: Vec<Option<f64>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    sunrise: Vec<Option<String>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    sunset: Vec<Option<String>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    precipitation_probability_max: Vec<Option<f64>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    precipitation_sum: Vec<Option<f64>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    wind_speed_10m_max: Vec<Option<f64>>,
    #[serde(default, deserialize_with = "nullable_vec")]
    uv_index_max: Vec<Option<f64>>,
}

/// Trata um array ausente **ou explicitamente `null`** como vazio.
///
/// Campos opcionais precisam degradar para "indisponível" em vez de derrubar a
/// previsão inteira: `#[serde(default)]` sozinho só cobre o caso ausente.
fn nullable_vec<'de, D, T>(deserializer: D) -> Result<Vec<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    Ok(Option::<Vec<Option<T>>>::deserialize(deserializer)?.unwrap_or_default())
}

#[derive(Debug, Deserialize)]
struct GeocodingResponse {
    #[serde(default)]
    results: Vec<GeocodingResult>,
}

#[derive(Debug, Deserialize)]
struct GeocodingResult {
    id: Option<u64>,
    name: Option<String>,
    admin1: Option<String>,
    country: Option<String>,
    country_code: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    timezone: Option<String>,
}

// ---------------------------------------------------------------------------
// Validação de valores
// ---------------------------------------------------------------------------

fn number_in(value: Option<f64>, min: f64, max: f64) -> Option<f64> {
    value.filter(|number| number.is_finite() && *number >= min && *number <= max)
}

fn code(value: Option<i32>) -> Option<i32> {
    value.filter(|code| (0..=999).contains(code))
}

fn parse_local(value: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M")
        .or_else(|_| NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S"))
        .ok()
}

fn local_string(value: Option<&String>) -> Option<String> {
    let value = value?;
    parse_local(value)?;
    Some(value.chars().take(40).collect())
}

/// Lê o índice `index` de um vetor opcional, tolerando vetores mais curtos.
fn at<T: Copy>(values: &[Option<T>], index: usize) -> Option<T> {
    values.get(index).copied().flatten()
}

// ---------------------------------------------------------------------------
// Alertas derivados
// ---------------------------------------------------------------------------

fn alert(
    kind: RadarWeatherAlertKind,
    severity: RadarSeverity,
    measured_value: String,
    window_local: Option<String>,
) -> RadarWeatherAlert {
    RadarWeatherAlert {
        id: format!("{kind:?}").to_lowercase(),
        kind,
        severity,
        measured_value,
        window_local,
        // Invariante do domínio: o Radar não emite alerta oficial.
        is_estimate: true,
    }
}

/// Deriva sinalizações determinísticas da própria previsão.
///
/// Nunca são alertas oficiais: `is_estimate` é sempre verdadeiro e a UI precisa
/// rotulá-los como estimativa meteorológica.
pub fn derive_alerts(
    current: &RadarWeatherCurrent,
    hourly: &[RadarWeatherHour],
    daily: &[RadarWeatherDay],
) -> Vec<RadarWeatherAlert> {
    let mut alerts = Vec::new();

    // Chuva intensa acumulada nas próximas 24 h.
    let today = daily.first();
    if let Some(sum) = today.and_then(|day| day.precipitation_sum_mm) {
        if sum >= config::ALERT_HEAVY_RAIN_MM {
            alerts.push(alert(
                RadarWeatherAlertKind::HeavyRain,
                if sum >= config::ALERT_HEAVY_RAIN_MM * 2.0 {
                    RadarSeverity::Critical
                } else {
                    RadarSeverity::Warning
                },
                format!("{sum:.0} mm"),
                today.map(|day| day.date.clone()),
            ));
        }
    }

    // Alta probabilidade de tempestade em alguma hora da janela.
    if let Some(peak) = hourly
        .iter()
        .filter(|hour| hour.precipitation_probability_percent.is_some())
        .max_by(|left, right| {
            left.precipitation_probability_percent
                .unwrap_or(0.0)
                .total_cmp(&right.precipitation_probability_percent.unwrap_or(0.0))
        })
    {
        let probability = peak.precipitation_probability_percent.unwrap_or(0.0);
        if probability >= config::ALERT_STORM_PROBABILITY {
            alerts.push(alert(
                RadarWeatherAlertKind::Storm,
                RadarSeverity::Warning,
                format!("{probability:.0}%"),
                Some(peak.local_time.clone()),
            ));
        }
    }

    // Rajada forte: considera tanto a condição atual quanto o pico diário.
    let gust = current
        .wind_gusts_kmh
        .into_iter()
        .chain(today.and_then(|day| day.wind_speed_max_kmh))
        .fold(f64::MIN, f64::max);
    if gust >= config::ALERT_STRONG_GUST_KMH {
        alerts.push(alert(
            RadarWeatherAlertKind::StrongWind,
            RadarSeverity::Warning,
            format!("{gust:.0} km/h"),
            None,
        ));
    }

    if current.temperature_celsius >= config::ALERT_HIGH_HEAT_CELSIUS {
        alerts.push(alert(
            RadarWeatherAlertKind::HighHeat,
            RadarSeverity::Warning,
            format!("{:.0} °C", current.temperature_celsius),
            None,
        ));
    }
    if current.temperature_celsius <= config::ALERT_LOW_COLD_CELSIUS {
        alerts.push(alert(
            RadarWeatherAlertKind::IntenseCold,
            RadarSeverity::Info,
            format!("{:.0} °C", current.temperature_celsius),
            None,
        ));
    }
    if current.humidity_percent <= config::ALERT_LOW_HUMIDITY_PERCENT {
        alerts.push(alert(
            RadarWeatherAlertKind::LowHumidity,
            RadarSeverity::Info,
            format!("{:.0}%", current.humidity_percent),
            None,
        ));
    }
    if let Some(uv) = today.and_then(|day| day.uv_index_max) {
        if uv >= config::ALERT_VERY_HIGH_UV {
            alerts.push(alert(
                RadarWeatherAlertKind::VeryHighUv,
                RadarSeverity::Warning,
                format!("UV {uv:.0}"),
                today.map(|day| day.date.clone()),
            ));
        }
    }

    alerts
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

pub fn parse_forecast(
    bytes: &[u8],
    location: &RadarLocation,
) -> Result<RadarWeather, ProviderError> {
    let invalid = || ProviderError::new(ProviderErrorKind::Validation);
    let response: ForecastResponse =
        serde_json::from_slice(bytes).map_err(|_| ProviderError::new(ProviderErrorKind::Parse))?;

    let location = normalize_location(location.clone()).ok_or_else(invalid)?;
    let timezone = clean_text(
        response.timezone.as_deref().unwrap_or(&location.timezone),
        80,
    );
    if !valid_timezone(&timezone) {
        return Err(invalid());
    }

    let current = response.current.ok_or_else(invalid)?;
    let hourly = response.hourly.ok_or_else(invalid)?;
    let daily = response.daily.ok_or_else(invalid)?;

    let observed_at_local = local_string(current.time.as_ref()).ok_or_else(invalid)?;
    let observed_naive = parse_local(&observed_at_local).ok_or_else(invalid)?;

    let current = RadarWeatherCurrent {
        observed_at_local,
        temperature_celsius: number_in(current.temperature_2m, -100.0, 70.0).ok_or_else(invalid)?,
        apparent_temperature_celsius: number_in(current.apparent_temperature, -100.0, 80.0)
            .ok_or_else(invalid)?,
        humidity_percent: number_in(current.relative_humidity_2m, 0.0, 100.0)
            .ok_or_else(invalid)?,
        // Preenchida abaixo a partir da hora mais próxima.
        precipitation_probability_percent: None,
        precipitation_mm: number_in(current.precipitation, 0.0, 1000.0),
        rain_mm: number_in(current.rain, 0.0, 1000.0),
        wind_speed_kmh: number_in(current.wind_speed_10m, 0.0, 500.0).ok_or_else(invalid)?,
        wind_gusts_kmh: number_in(current.wind_gusts_10m, 0.0, 700.0),
        surface_pressure_hpa: number_in(current.surface_pressure, 500.0, 1200.0),
        weather_code: code(current.weather_code).ok_or_else(invalid)?,
        is_day: match current.is_day {
            Some(0) => false,
            Some(1) => true,
            _ => return Err(invalid()),
        },
    };

    // --- Horário -----------------------------------------------------------
    let hourly_len = hourly.time.len();
    if hourly_len == 0 {
        return Err(invalid());
    }
    // Arrays desalinhados são fatais: parear índices de tamanhos diferentes
    // atribuiria a temperatura de um horário a outro.
    for length in [
        hourly.temperature_2m.len(),
        hourly.precipitation_probability.len(),
        hourly.weather_code.len(),
    ] {
        if length != hourly_len {
            return Err(invalid());
        }
    }

    let mut closest_probability = None;
    let mut closest_distance = i64::MAX;
    let mut points: Vec<RadarWeatherHour> = Vec::new();
    for index in 0..hourly_len {
        let Some(local_time) = local_string(hourly.time.get(index)) else {
            continue;
        };
        let Some(parsed) = parse_local(&local_time) else {
            continue;
        };
        let probability = number_in(at(&hourly.precipitation_probability, index), 0.0, 100.0);
        let distance = (parsed - observed_naive).num_seconds().abs();
        if distance < closest_distance {
            closest_distance = distance;
            closest_probability = probability;
        }
        // Só horas a partir de agora entram na previsão exibida.
        if parsed < observed_naive {
            continue;
        }
        let Some(temperature) = number_in(at(&hourly.temperature_2m, index), -100.0, 70.0) else {
            continue;
        };
        let Some(weather_code) = code(at(&hourly.weather_code, index)) else {
            continue;
        };
        points.push(RadarWeatherHour {
            // Definido depois da ordenação: aqui a ordem do provider ainda não
            // é confiável, e marcar durante a coleta poderia sinalizar dois
            // pontos como "agora".
            is_current_hour: false,
            local_time,
            temperature_celsius: temperature,
            apparent_temperature_celsius: number_in(
                at(&hourly.apparent_temperature, index),
                -100.0,
                80.0,
            ),
            humidity_percent: number_in(at(&hourly.relative_humidity_2m, index), 0.0, 100.0),
            precipitation_probability_percent: probability,
            precipitation_mm: number_in(at(&hourly.precipitation, index), 0.0, 1000.0),
            wind_speed_kmh: number_in(at(&hourly.wind_speed_10m, index), 0.0, 500.0),
            weather_code,
        });
    }
    points.sort_by(|left, right| left.local_time.cmp(&right.local_time));
    points.dedup_by(|left, right| left.local_time == right.local_time);
    points.truncate(HOURLY_POINTS);
    if points.len() < MIN_HOURLY_POINTS {
        return Err(invalid());
    }
    // Exatamente um ponto é "agora": o mais próximo do horário observado.
    // Sobre a lista já ordenada, isso é sempre o primeiro elemento, porque
    // pontos anteriores ao horário observado foram descartados acima.
    if let Some(current_point) = points.first_mut() {
        current_point.is_current_hour = true;
    }
    // A probabilidade "atual" só vale se houver hora próxima o bastante.
    if closest_distance > 90 * 60 {
        closest_probability = None;
    }
    let current = RadarWeatherCurrent {
        precipitation_probability_percent: closest_probability,
        ..current
    };

    // --- Diário ------------------------------------------------------------
    let daily_len = daily.time.len();
    if daily_len == 0 {
        return Err(invalid());
    }
    for length in [
        daily.weather_code.len(),
        daily.temperature_2m_max.len(),
        daily.temperature_2m_min.len(),
    ] {
        if length != daily_len {
            return Err(invalid());
        }
    }

    let mut days: Vec<RadarWeatherDay> = Vec::new();
    for index in 0..daily_len {
        let Some(date) = daily
            .time
            .get(index)
            .map(|value| clean_text(value, 10))
            .filter(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok())
        else {
            continue;
        };
        let (Some(minimum), Some(maximum)) = (
            number_in(at(&daily.temperature_2m_min, index), -100.0, 70.0),
            number_in(at(&daily.temperature_2m_max, index), -100.0, 70.0),
        ) else {
            continue;
        };
        if minimum > maximum {
            continue;
        }
        let Some(weather_code) = code(at(&daily.weather_code, index)) else {
            continue;
        };
        days.push(RadarWeatherDay {
            date,
            minimum_celsius: minimum,
            maximum_celsius: maximum,
            precipitation_probability_percent: number_in(
                at(&daily.precipitation_probability_max, index),
                0.0,
                100.0,
            ),
            precipitation_sum_mm: number_in(at(&daily.precipitation_sum, index), 0.0, 2000.0),
            wind_speed_max_kmh: number_in(at(&daily.wind_speed_10m_max, index), 0.0, 700.0),
            uv_index_max: number_in(at(&daily.uv_index_max, index), 0.0, 20.0),
            weather_code,
            sunrise_local: local_string(daily.sunrise.get(index).and_then(|value| value.as_ref())),
            sunset_local: local_string(daily.sunset.get(index).and_then(|value| value.as_ref())),
        });
    }
    // Datas precisam ser estritamente crescentes.
    if days.windows(2).any(|pair| pair[0].date >= pair[1].date) {
        return Err(invalid());
    }
    let today = days.first().cloned().ok_or_else(invalid)?;

    let alerts = derive_alerts(&current, &points, &days);

    Ok(RadarWeather {
        location,
        timezone,
        provider_id: PROVIDER_ID.to_string(),
        provider_name: PROVIDER_NAME.to_string(),
        current,
        today,
        hourly: points,
        daily: days,
        alerts,
    })
}

pub fn parse_geocoding(bytes: &[u8]) -> Result<Vec<RadarLocation>, ProviderError> {
    let response: GeocodingResponse =
        serde_json::from_slice(bytes).map_err(|_| ProviderError::new(ProviderErrorKind::Parse))?;
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for item in response.results.into_iter().take(20) {
        let (Some(name), Some(country), Some(latitude), Some(longitude), Some(timezone)) = (
            item.name,
            item.country,
            item.latitude,
            item.longitude,
            item.timezone,
        ) else {
            continue;
        };
        if !latitude.is_finite()
            || !longitude.is_finite()
            || !(-90.0..=90.0).contains(&latitude)
            || !(-180.0..=180.0).contains(&longitude)
        {
            continue;
        }
        let dedupe_key = format!("{latitude:.4},{longitude:.4}");
        if !seen.insert(dedupe_key.clone()) {
            continue;
        }
        let location = RadarLocation {
            id: item
                .id
                .map(|id| format!("open-meteo-{id}"))
                .unwrap_or(dedupe_key),
            name: clean_text(&name, 100),
            admin1: item
                .admin1
                .map(|value| clean_text(&value, 100))
                .filter(|value| !value.is_empty()),
            country: clean_text(&country, 100),
            country_code: clean_text(item.country_code.as_deref().unwrap_or_default(), 3)
                .to_uppercase(),
            latitude,
            longitude,
            timezone: clean_text(&timezone, 80),
        };
        let Some(location) = normalize_location(location) else {
            continue;
        };
        result.push(location);
        if result.len() == 5 {
            break;
        }
    }
    Ok(result)
}

/// Valida a consulta de cidade sem registrá-la em log algum.
pub fn prepare_location_search(
    query: &str,
    locale: &str,
) -> Result<(String, &'static str), ProviderError> {
    let invalid = || ProviderError::new(ProviderErrorKind::Validation);
    let trimmed = query.trim();
    if trimmed.chars().count() < 2
        || trimmed.chars().count() > 80
        || trimmed.chars().any(char::is_control)
    {
        return Err(invalid());
    }
    let normalized = clean_text(trimmed, 80);
    if normalized.chars().count() < 2 {
        return Err(invalid());
    }
    let language = match locale {
        "pt-BR" => "pt",
        "en-US" => "en",
        _ => return Err(invalid()),
    };
    Ok((normalized, language))
}

// ---------------------------------------------------------------------------
// Rede
// ---------------------------------------------------------------------------

fn forecast_url(
    location: &RadarLocation,
    mode: &WeatherProviderMode,
) -> Result<Url, ProviderError> {
    let base = match mode {
        WeatherProviderMode::Public => FORECAST_URL.to_string(),
        WeatherProviderMode::Commercial { host, .. } => format!("https://{host}/v1/forecast"),
    };
    let mut url =
        Url::parse(&base).map_err(|_| ProviderError::new(ProviderErrorKind::Validation))?;
    url.query_pairs_mut()
        .append_pair("latitude", &format!("{:.4}", location.latitude))
        .append_pair("longitude", &format!("{:.4}", location.longitude))
        // Timezone explícito da localização persistida, nunca "auto".
        .append_pair("timezone", &location.timezone)
        .append_pair("forecast_days", "7")
        .append_pair("temperature_unit", "celsius")
        .append_pair("wind_speed_unit", "kmh")
        .append_pair("precipitation_unit", "mm")
        .append_pair(
            "current",
            "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,\
             weather_code,wind_speed_10m,wind_gusts_10m,surface_pressure,is_day",
        )
        .append_pair(
            "hourly",
            "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,\
             precipitation,weather_code,wind_speed_10m",
        )
        .append_pair(
            "daily",
            "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,\
             precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max",
        );
    if let WeatherProviderMode::Commercial { api_key, .. } = mode {
        url.query_pairs_mut().append_pair("apikey", api_key);
    }
    Ok(url)
}

pub async fn fetch_weather(
    client: &SecureHttpClient,
    location: &RadarLocation,
    mode: &WeatherProviderMode,
) -> Result<RadarWeather, ProviderError> {
    let url = forecast_url(location, mode)?;
    let allowlist: Vec<&str> = match mode {
        WeatherProviderMode::Public => FORECAST_HOSTS.to_vec(),
        WeatherProviderMode::Commercial { host, .. } => vec![host.as_str()],
    };
    let body = client
        .fetch(FetchSpec {
            url,
            allowlist: &allowlist,
            max_bytes: config::MAX_FORECAST_BYTES,
            expected: ExpectedContent::Json,
            total_timeout: config::REQUEST_TIMEOUT,
        })
        .await?;
    parse_forecast(&body.bytes, location)
}

pub async fn search_locations(
    client: &SecureHttpClient,
    query: &str,
    locale: &str,
) -> Result<Vec<RadarLocation>, ProviderError> {
    let (query, language) = prepare_location_search(query, locale)?;
    let mut url =
        Url::parse(GEOCODING_URL).map_err(|_| ProviderError::new(ProviderErrorKind::Validation))?;
    url.query_pairs_mut()
        .append_pair("name", &query)
        .append_pair("count", "10")
        .append_pair("language", language)
        .append_pair("format", "json");
    let body = client
        .fetch(FetchSpec {
            url,
            allowlist: GEOCODING_HOSTS,
            max_bytes: config::MAX_GEOCODING_BYTES,
            expected: ExpectedContent::Json,
            total_timeout: config::REQUEST_TIMEOUT,
        })
        .await?;
    parse_geocoding(&body.bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FORECAST: &[u8] = include_bytes!("fixtures/open_meteo_forecast.json");

    fn location() -> RadarLocation {
        RadarLocation {
            id: "sp".into(),
            name: "São Paulo".into(),
            admin1: Some("São Paulo".into()),
            country: "Brasil".into(),
            country_code: "BR".into(),
            latitude: -23.5505,
            longitude: -46.6333,
            timezone: "America/Sao_Paulo".into(),
        }
    }

    fn fixture() -> serde_json::Value {
        serde_json::from_slice(FORECAST).expect("fixture json")
    }

    fn parse(value: &serde_json::Value) -> Result<RadarWeather, ProviderError> {
        parse_forecast(&serde_json::to_vec(value).expect("serialize"), &location())
    }

    #[test]
    fn parses_the_real_provider_response_with_seven_days_and_full_metrics() {
        let weather = parse_forecast(FORECAST, &location()).expect("forecast real");
        assert_eq!(weather.daily.len(), 7, "o plano exige 7 dias");
        assert!(
            weather.hourly.len() >= MIN_HOURLY_POINTS,
            "o plano exige ao menos 12 horas futuras, veio {}",
            weather.hourly.len()
        );
        assert!(weather.hourly.len() <= HOURLY_POINTS);
        assert_eq!(weather.timezone, "America/Sao_Paulo");
        assert_eq!(weather.provider_id, PROVIDER_ID);

        // Métricas exigidas na Definition of Done.
        assert!(weather.current.wind_gusts_kmh.is_some(), "rajadas");
        assert!(weather.current.surface_pressure_hpa.is_some(), "pressão");
        assert!(weather.current.precipitation_mm.is_some(), "precipitação");
        assert!(weather.today.sunrise_local.is_some(), "nascer do sol");
        assert!(weather.today.sunset_local.is_some(), "pôr do sol");
        assert!(weather.today.uv_index_max.is_some(), "UV");
        assert!(weather.today.precipitation_sum_mm.is_some(), "acumulado");
    }

    #[test]
    fn hourly_points_are_sorted_unique_and_start_at_the_current_hour() {
        let weather = parse_forecast(FORECAST, &location()).expect("forecast");
        assert!(
            weather
                .hourly
                .windows(2)
                .all(|pair| pair[0].local_time < pair[1].local_time),
            "pontos horários devem ser estritamente crescentes"
        );
        assert_eq!(
            weather
                .hourly
                .iter()
                .filter(|hour| hour.is_current_hour)
                .count(),
            1,
            "exatamente um ponto marcado como hora atual"
        );
    }

    #[test]
    fn daily_dates_are_strictly_increasing() {
        let weather = parse_forecast(FORECAST, &location()).expect("forecast");
        assert!(weather
            .daily
            .windows(2)
            .all(|pair| pair[0].date < pair[1].date));
        assert_eq!(weather.today.date, weather.daily[0].date);
    }

    #[test]
    fn misaligned_arrays_are_rejected_instead_of_pairing_wrong_hours() {
        let mut value = fixture();
        value["hourly"]["temperature_2m"] = serde_json::json!([20.0]);
        assert_eq!(
            parse(&value).expect_err("desalinhado").kind,
            ProviderErrorKind::Validation
        );

        let mut value = fixture();
        value["daily"]["temperature_2m_max"] = serde_json::json!([30.0]);
        assert_eq!(
            parse(&value).expect_err("desalinhado").kind,
            ProviderErrorKind::Validation
        );
    }

    #[test]
    fn missing_sections_and_out_of_range_values_are_rejected() {
        for field in ["current", "hourly", "daily"] {
            let mut value = fixture();
            value.as_object_mut().expect("objeto").remove(field);
            assert_eq!(
                parse(&value).expect_err("faltando").kind,
                ProviderErrorKind::Validation
            );
        }
        let mut value = fixture();
        value["current"]["temperature_2m"] = serde_json::json!(1000.0);
        assert_eq!(
            parse(&value).expect_err("fora de faixa").kind,
            ProviderErrorKind::Validation
        );

        let mut value = fixture();
        value["current"]["relative_humidity_2m"] = serde_json::json!(150.0);
        assert_eq!(
            parse(&value).expect_err("umidade inválida").kind,
            ProviderErrorKind::Validation
        );
    }

    #[test]
    fn optional_fields_may_be_missing_without_failing_the_forecast() {
        let mut value = fixture();
        for field in ["wind_gusts_10m", "surface_pressure", "rain"] {
            value["current"][field] = serde_json::Value::Null;
        }
        value["daily"]["uv_index_max"] = serde_json::Value::Null;
        let weather = parse(&value).expect("previsão parcial ainda é útil");
        assert!(weather.current.wind_gusts_kmh.is_none());
        assert!(weather.current.surface_pressure_hpa.is_none());
        assert!(weather.today.uv_index_max.is_none());
    }

    #[test]
    fn an_invalid_provider_timezone_is_rejected() {
        let mut value = fixture();
        value["timezone"] = serde_json::json!("../etc/passwd");
        assert_eq!(
            parse(&value).expect_err("timezone").kind,
            ProviderErrorKind::Validation
        );
    }

    #[test]
    fn too_few_future_hours_makes_the_forecast_unusable() {
        let mut value = fixture();
        for field in [
            "time",
            "temperature_2m",
            "apparent_temperature",
            "relative_humidity_2m",
            "precipitation_probability",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
        ] {
            let array = value["hourly"][field].as_array().expect("array").clone();
            value["hourly"][field] = serde_json::Value::Array(array.into_iter().take(3).collect());
        }
        assert_eq!(
            parse(&value).expect_err("poucas horas").kind,
            ProviderErrorKind::Validation
        );
    }

    #[test]
    fn malformed_json_never_panics() {
        assert_eq!(
            parse_forecast(b"{quebrado", &location())
                .expect_err("json")
                .kind,
            ProviderErrorKind::Parse
        );
        assert_eq!(
            parse_forecast(b"", &location()).expect_err("vazio").kind,
            ProviderErrorKind::Parse
        );
    }

    // -----------------------------------------------------------------------
    // Alertas derivados
    // -----------------------------------------------------------------------

    fn current_with(temperature: f64, humidity: f64, gust: Option<f64>) -> RadarWeatherCurrent {
        RadarWeatherCurrent {
            observed_at_local: "2026-07-29T12:00".into(),
            temperature_celsius: temperature,
            apparent_temperature_celsius: temperature,
            humidity_percent: humidity,
            precipitation_probability_percent: None,
            precipitation_mm: None,
            rain_mm: None,
            wind_speed_kmh: 10.0,
            wind_gusts_kmh: gust,
            surface_pressure_hpa: None,
            weather_code: 1,
            is_day: true,
        }
    }

    fn day_with(precipitation: Option<f64>, uv: Option<f64>) -> RadarWeatherDay {
        RadarWeatherDay {
            date: "2026-07-29".into(),
            minimum_celsius: 15.0,
            maximum_celsius: 25.0,
            precipitation_probability_percent: None,
            precipitation_sum_mm: precipitation,
            wind_speed_max_kmh: None,
            uv_index_max: uv,
            weather_code: 1,
            sunrise_local: None,
            sunset_local: None,
        }
    }

    fn hour_with(probability: Option<f64>) -> RadarWeatherHour {
        RadarWeatherHour {
            local_time: "2026-07-29T15:00".into(),
            temperature_celsius: 22.0,
            apparent_temperature_celsius: None,
            humidity_percent: None,
            precipitation_probability_percent: probability,
            precipitation_mm: None,
            wind_speed_kmh: None,
            weather_code: 80,
            is_current_hour: false,
        }
    }

    #[test]
    fn every_derived_alert_is_flagged_as_an_estimate() {
        let alerts = derive_alerts(
            &current_with(38.0, 20.0, Some(90.0)),
            &[hour_with(Some(95.0))],
            &[day_with(Some(80.0), Some(11.0))],
        );
        assert!(!alerts.is_empty());
        assert!(
            alerts.iter().all(|alert| alert.is_estimate),
            "nenhum alerta pode se apresentar como oficial"
        );
    }

    #[test]
    fn thresholds_come_from_configuration_and_calm_weather_produces_nothing() {
        let calm = derive_alerts(
            &current_with(22.0, 60.0, Some(15.0)),
            &[hour_with(Some(10.0))],
            &[day_with(Some(1.0), Some(4.0))],
        );
        assert!(
            calm.is_empty(),
            "tempo calmo não deveria gerar alerta: {calm:?}"
        );

        // Exatamente no limiar já dispara.
        let at_threshold = derive_alerts(
            &current_with(config::ALERT_HIGH_HEAT_CELSIUS, 60.0, None),
            &[],
            &[day_with(None, None)],
        );
        assert!(at_threshold
            .iter()
            .any(|alert| alert.kind == RadarWeatherAlertKind::HighHeat));

        // Logo abaixo do limiar, não.
        let below = derive_alerts(
            &current_with(config::ALERT_HIGH_HEAT_CELSIUS - 0.1, 60.0, None),
            &[],
            &[day_with(None, None)],
        );
        assert!(!below
            .iter()
            .any(|alert| alert.kind == RadarWeatherAlertKind::HighHeat));
    }

    #[test]
    fn heavy_rain_escalates_to_critical_at_double_the_threshold() {
        let warning = derive_alerts(
            &current_with(22.0, 60.0, None),
            &[],
            &[day_with(Some(config::ALERT_HEAVY_RAIN_MM), None)],
        );
        assert_eq!(
            warning
                .iter()
                .find(|alert| alert.kind == RadarWeatherAlertKind::HeavyRain)
                .map(|alert| alert.severity),
            Some(RadarSeverity::Warning)
        );

        let critical = derive_alerts(
            &current_with(22.0, 60.0, None),
            &[],
            &[day_with(Some(config::ALERT_HEAVY_RAIN_MM * 2.0), None)],
        );
        assert_eq!(
            critical
                .iter()
                .find(|alert| alert.kind == RadarWeatherAlertKind::HeavyRain)
                .map(|alert| alert.severity),
            Some(RadarSeverity::Critical)
        );
    }

    #[test]
    fn cold_and_low_humidity_are_reported_separately() {
        let alerts = derive_alerts(&current_with(2.0, 15.0, None), &[], &[day_with(None, None)]);
        let kinds: Vec<_> = alerts.iter().map(|alert| alert.kind).collect();
        assert!(kinds.contains(&RadarWeatherAlertKind::IntenseCold));
        assert!(kinds.contains(&RadarWeatherAlertKind::LowHumidity));
    }

    // -----------------------------------------------------------------------
    // Geocoding e busca
    // -----------------------------------------------------------------------

    #[test]
    fn geocoding_discards_invalid_entries_and_deduplicates_by_coordinate() {
        let payload = serde_json::json!({
            "results": [
                { "id": 1, "name": "São Paulo", "admin1": "São Paulo", "country": "Brasil",
                  "country_code": "BR", "latitude": -23.5505, "longitude": -46.6333,
                  "timezone": "America/Sao_Paulo" },
                { "id": 2, "name": "Duplicata", "country": "Brasil", "latitude": -23.5505,
                  "longitude": -46.6333, "timezone": "America/Sao_Paulo" },
                { "id": 3, "name": "Sem fuso", "country": "Brasil", "latitude": -10.0, "longitude": -50.0 },
                { "id": 4, "name": "Coordenada inválida", "country": "Brasil", "latitude": 200.0,
                  "longitude": -50.0, "timezone": "America/Sao_Paulo" },
                { "id": 5, "name": "Fuso hostil", "country": "Brasil", "latitude": -11.0,
                  "longitude": -51.0, "timezone": "../../etc" }
            ]
        });
        let locations =
            parse_geocoding(&serde_json::to_vec(&payload).expect("json")).expect("geocoding");
        assert_eq!(locations.len(), 1);
        assert_eq!(locations[0].name, "São Paulo");
        assert_eq!(locations[0].country_code, "BR");
    }

    #[test]
    fn location_queries_are_validated_without_being_mutated() {
        assert_eq!(
            prepare_location_search("  São Paulo  ", "pt-BR"),
            Ok(("São Paulo".into(), "pt"))
        );
        assert_eq!(
            prepare_location_search("New York", "en-US"),
            Ok(("New York".into(), "en"))
        );
        for (query, locale) in [
            ("a", "pt-BR"),
            ("ab\ncd", "pt-BR"),
            ("Paris", "fr-FR"),
            ("", "pt-BR"),
        ] {
            assert!(
                prepare_location_search(query, locale).is_err(),
                "aceitou consulta inválida: {query:?} / {locale}"
            );
        }
        assert!(prepare_location_search(&"x".repeat(81), "pt-BR").is_err());
    }

    #[test]
    fn the_forecast_request_pins_the_stored_timezone_and_seven_days() {
        let url = forecast_url(&location(), &WeatherProviderMode::Public).expect("url");
        let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(
            query.get("timezone").map(String::as_str),
            Some("America/Sao_Paulo")
        );
        assert_ne!(
            query.get("timezone").map(String::as_str),
            Some("auto"),
            "o fuso precisa ser explícito, não inferido pelo provider"
        );
        assert_eq!(query.get("forecast_days").map(String::as_str), Some("7"));
        assert!(query
            .get("hourly")
            .expect("hourly")
            .contains("precipitation_probability"));
        assert!(query.get("daily").expect("daily").contains("uv_index_max"));
        assert!(query
            .get("current")
            .expect("current")
            .contains("wind_gusts_10m"));
        assert!(
            !query.contains_key("apikey"),
            "modo público não envia chave"
        );
        assert_eq!(url.host_str(), Some(FORECAST_HOST));
    }

    #[test]
    fn commercial_mode_targets_its_own_host_and_carries_the_key() {
        let mode = WeatherProviderMode::Commercial {
            host: "customer-api.open-meteo.com".into(),
            api_key: "chave-de-teste".into(),
        };
        let url = forecast_url(&location(), &mode).expect("url");
        assert_eq!(url.host_str(), Some("customer-api.open-meteo.com"));
        let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(
            query.get("apikey").map(String::as_str),
            Some("chave-de-teste")
        );
        // O padrão continua sendo público: nenhuma chave é embutida no binário.
        assert_eq!(WeatherProviderMode::default(), WeatherProviderMode::Public);
    }

    #[test]
    fn coordinates_are_rounded_before_leaving_the_process() {
        let mut precise = location();
        precise.latitude = -23.550519876543;
        precise.longitude = -46.633308123456;
        let url = forecast_url(&precise, &WeatherProviderMode::Public).expect("url");
        let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(query.get("latitude").map(String::as_str), Some("-23.5505"));
        assert_eq!(query.get("longitude").map(String::as_str), Some("-46.6333"));
    }
}
