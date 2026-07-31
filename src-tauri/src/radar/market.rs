//! Mercado (PTAX do Banco Central) e eventos contextuais (USGS).
//!
//! Nada aqui é apresentado como "cotação ao vivo": a PTAX é uma taxa de
//! fechamento oficial e o item sempre carrega [`RadarQuoteKind::Ptax`] mais a
//! data/hora real do dado. Itens sem timestamp confiável são omitidos em vez de
//! exibidos com precisão falsa.

use super::{
    config,
    error::{ProviderError, ProviderErrorKind},
    http::{ExpectedContent, FetchSpec, SecureHttpClient},
    models::{
        clean_text, RadarCacheState, RadarQuoteKind, RadarSeverity, RadarTickerItem,
        RadarTickerKind,
    },
};
use chrono::{DateTime, Duration, FixedOffset, NaiveDateTime, Utc};
use reqwest::Url;
use serde::Deserialize;

pub const PTAX_PROVIDER_ID: &str = "bcb-ptax";
pub const PTAX_PROVIDER_NAME: &str = "Banco Central — PTAX";
const PTAX_HOST: &str = "olinda.bcb.gov.br";
const PTAX_HOSTS: &[&str] = &[PTAX_HOST];

pub const USGS_PROVIDER_ID: &str = "usgs";
pub const USGS_PROVIDER_NAME: &str = "USGS";
const USGS_HOST: &str = "earthquake.usgs.gov";
const USGS_HOSTS: &[&str] = &[USGS_HOST];
const USGS_URL: &str = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";

/// Horário de Brasília. A PTAX publica sem indicação de fuso.
const BRASILIA_OFFSET_SECONDS: i32 = -3 * 3600;

// ---------------------------------------------------------------------------
// PTAX
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct PtaxResponse {
    #[serde(default)]
    value: Vec<PtaxQuote>,
}

#[derive(Debug, Deserialize, Clone)]
struct PtaxQuote {
    #[serde(rename = "cotacaoCompra")]
    buy: Option<f64>,
    #[serde(rename = "cotacaoVenda")]
    sell: Option<f64>,
    #[serde(rename = "dataHoraCotacao")]
    observed_at: Option<String>,
}

/// Moedas suportadas, mapeadas para o símbolo usado nas preferências.
pub fn ptax_currency_for(symbol: &str) -> Option<(&'static str, &'static str)> {
    match symbol {
        "usd-brl" => Some(("USD", "USD/BRL")),
        "eur-brl" => Some(("EUR", "EUR/BRL")),
        _ => None,
    }
}

fn parse_ptax_timestamp(value: &str) -> Option<DateTime<Utc>> {
    let cleaned = clean_text(value, 40);
    let offset = FixedOffset::east_opt(BRASILIA_OFFSET_SECONDS)?;
    for format in ["%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%d %H:%M:%S"] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(&cleaned, format) {
            return naive
                .and_local_timezone(offset)
                .single()
                .map(|value| value.with_timezone(&Utc));
        }
    }
    None
}

/// Extrai a cotação de fechamento mais recente da janela consultada.
///
/// A janela cobre vários dias justamente porque fins de semana e feriados não
/// têm PTAX; a resposta pode vir vazia ou desordenada.
pub fn parse_ptax(bytes: &[u8]) -> Result<(f64, DateTime<Utc>), ProviderError> {
    let response: PtaxResponse =
        serde_json::from_slice(bytes).map_err(|_| ProviderError::new(ProviderErrorKind::Parse))?;

    let mut best: Option<(f64, DateTime<Utc>)> = None;
    for quote in response.value {
        // A cotação de venda é a referência publicada; sem ela o registro é inútil.
        let Some(rate) = quote
            .sell
            .or(quote.buy)
            .filter(|value| value.is_finite() && *value > 0.0 && *value < 1000.0)
        else {
            continue;
        };
        let Some(observed_at) = quote.observed_at.as_deref().and_then(parse_ptax_timestamp) else {
            continue;
        };
        if observed_at > Utc::now() + Duration::minutes(config::MAX_CLOCK_SKEW_MINUTES) {
            continue;
        }
        if best
            .map(|(_, current)| observed_at > current)
            .unwrap_or(true)
        {
            best = Some((rate, observed_at));
        }
    }
    best.ok_or_else(|| ProviderError::new(ProviderErrorKind::Validation))
}

/// Apenas códigos ISO de três letras maiúsculas chegam aqui, o que impede que
/// o valor interpolado na query introduza parâmetros extras.
fn valid_currency_code(value: &str) -> bool {
    value.len() == 3
        && value
            .chars()
            .all(|character| character.is_ascii_uppercase())
}

fn ptax_url(currency: &str, now: DateTime<Utc>) -> Result<Url, ProviderError> {
    let invalid = || ProviderError::new(ProviderErrorKind::Validation);
    if !valid_currency_code(currency) {
        return Err(invalid());
    }
    // Dez dias cobrem qualquer emenda de feriado prolongado.
    let start = (now - Duration::days(10)).format("%m-%d-%Y").to_string();
    let end = now.format("%m-%d-%Y").to_string();
    let mut url = Url::parse(
        "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/\
         CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)",
    )
    .map_err(|_| invalid())?;

    // A query é montada à mão de propósito: `query_pairs_mut` percent-encoda
    // `$` e `@`, e o OData do Banco Central responde 500 para `%24format` e
    // `%40moeda`. `set_query` preserva esses caracteres e só escapa o espaço.
    let query = format!(
        "@moeda='{currency}'&@dataInicial='{start}'&@dataFinalCotacao='{end}'\
         &$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao\
         &$orderby=dataHoraCotacao desc&$top=5"
    );
    url.set_query(Some(&query));
    Ok(url)
}

pub async fn fetch_ptax(
    client: &SecureHttpClient,
    currency: &str,
    now: DateTime<Utc>,
) -> Result<(f64, DateTime<Utc>), ProviderError> {
    let body = client
        .fetch(FetchSpec {
            url: ptax_url(currency, now)?,
            allowlist: PTAX_HOSTS,
            max_bytes: config::MAX_MARKET_BYTES,
            expected: ExpectedContent::Json,
            total_timeout: config::REQUEST_TIMEOUT,
        })
        .await?;
    parse_ptax(&body.bytes)
}

/// Formata em pt-BR sem depender de locale do sistema.
pub fn format_brl(value: f64) -> String {
    format!("R$ {value:.4}").replace('.', ",")
}

pub fn ptax_ticker_item(
    symbol: &str,
    label: &str,
    rate: f64,
    observed_at: DateTime<Utc>,
    now: DateTime<Utc>,
) -> RadarTickerItem {
    let age = now.signed_duration_since(observed_at);
    let cache_state = if age <= Duration::minutes(config::PTAX_FRESH_MINUTES) {
        RadarCacheState::Fresh
    } else if age <= Duration::days(config::PTAX_STALE_DAYS) {
        RadarCacheState::Stale
    } else {
        RadarCacheState::Unavailable
    };
    RadarTickerItem {
        id: format!("ptax-{symbol}"),
        kind: RadarTickerKind::Currency,
        // Rotulado explicitamente: nunca "ao vivo".
        quote_kind: RadarQuoteKind::Ptax,
        label: label.to_string(),
        value: format_brl(rate),
        // A PTAX da janela não permite variação comparável; não inventamos uma.
        variation: None,
        observed_at: observed_at.to_rfc3339(),
        provider_name: PTAX_PROVIDER_NAME.to_string(),
        cache_state,
        severity: RadarSeverity::Neutral,
        detail: Some(observed_at.format("%d/%m/%Y").to_string()),
    }
}

// ---------------------------------------------------------------------------
// Eventos USGS
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct UsgsResponse {
    #[serde(default)]
    features: Vec<UsgsFeature>,
}

#[derive(Debug, Deserialize)]
struct UsgsFeature {
    id: Option<String>,
    properties: Option<UsgsProperties>,
    geometry: Option<UsgsGeometry>,
}

#[derive(Debug, Deserialize)]
struct UsgsProperties {
    mag: Option<f64>,
    place: Option<String>,
    /// Epoch em milissegundos.
    time: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct UsgsGeometry {
    #[serde(default)]
    coordinates: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SeismicEvent {
    pub id: String,
    pub magnitude: f64,
    pub place: String,
    pub occurred_at: DateTime<Utc>,
    pub near_south_america: bool,
}

/// Caixa envolvente aproximada da América do Sul e entorno.
fn is_near_south_america(longitude: f64, latitude: f64) -> bool {
    (-95.0..=-30.0).contains(&longitude) && (-60.0..=15.0).contains(&latitude)
}

/// Seleciona eventos relevantes: significativos globalmente, ou moderados
/// porém próximos da América do Sul. Evita encher o ticker de tremores menores.
pub fn parse_usgs(bytes: &[u8], now: DateTime<Utc>) -> Result<Vec<SeismicEvent>, ProviderError> {
    let response: UsgsResponse =
        serde_json::from_slice(bytes).map_err(|_| ProviderError::new(ProviderErrorKind::Parse))?;

    let mut events = Vec::new();
    for feature in response.features {
        let (Some(id), Some(properties)) = (feature.id, feature.properties) else {
            continue;
        };
        let Some(magnitude) = properties
            .mag
            .filter(|value| value.is_finite() && (0.0..=12.0).contains(value))
        else {
            continue;
        };
        let Some(occurred_at) = properties
            .time
            .and_then(DateTime::from_timestamp_millis)
            .filter(|value| *value <= now + Duration::minutes(config::MAX_CLOCK_SKEW_MINUTES))
        else {
            continue;
        };
        let coordinates = feature.geometry.map(|g| g.coordinates).unwrap_or_default();
        let near = coordinates.len() >= 2 && is_near_south_america(coordinates[0], coordinates[1]);

        let threshold = if near {
            config::EVENT_MIN_MAGNITUDE_REGIONAL
        } else {
            config::EVENT_MIN_MAGNITUDE
        };
        if magnitude < threshold {
            continue;
        }

        events.push(SeismicEvent {
            id: clean_text(&id, 64),
            magnitude,
            place: clean_text(properties.place.as_deref().unwrap_or("—"), 120),
            occurred_at,
            near_south_america: near,
        });
    }

    // Mais relevante primeiro: proximidade, magnitude e recência.
    events.sort_by(|left, right| {
        right
            .near_south_america
            .cmp(&left.near_south_america)
            .then_with(|| right.magnitude.total_cmp(&left.magnitude))
            .then_with(|| right.occurred_at.cmp(&left.occurred_at))
    });
    events.truncate(config::MAX_TICKER_EVENTS);
    Ok(events)
}

pub async fn fetch_events(
    client: &SecureHttpClient,
    now: DateTime<Utc>,
) -> Result<Vec<SeismicEvent>, ProviderError> {
    let url =
        Url::parse(USGS_URL).map_err(|_| ProviderError::new(ProviderErrorKind::Validation))?;
    let body = client
        .fetch(FetchSpec {
            url,
            allowlist: USGS_HOSTS,
            max_bytes: config::MAX_USGS_BYTES,
            expected: ExpectedContent::Json,
            total_timeout: config::REQUEST_TIMEOUT,
        })
        .await?;
    parse_usgs(&body.bytes, now)
}

pub fn event_ticker_item(event: &SeismicEvent, now: DateTime<Utc>) -> RadarTickerItem {
    let age = now.signed_duration_since(event.occurred_at);
    RadarTickerItem {
        id: format!("usgs-{}", event.id),
        kind: RadarTickerKind::Event,
        quote_kind: RadarQuoteKind::Event,
        label: format!("M {:.1}", event.magnitude),
        value: event.place.clone(),
        variation: None,
        observed_at: event.occurred_at.to_rfc3339(),
        provider_name: USGS_PROVIDER_NAME.to_string(),
        cache_state: if age <= Duration::minutes(config::EVENT_FRESH_MINUTES) {
            RadarCacheState::Fresh
        } else if age <= Duration::hours(config::EVENT_STALE_HOURS) {
            RadarCacheState::Stale
        } else {
            RadarCacheState::Unavailable
        },
        severity: if event.magnitude >= 7.0 {
            RadarSeverity::Critical
        } else if event.magnitude >= 6.0 {
            RadarSeverity::Warning
        } else {
            RadarSeverity::Info
        },
        detail: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // PTAX
    // -----------------------------------------------------------------------

    /// Resposta real do Olinda capturada em 29/07/2026.
    const PTAX_REAL: &[u8] = br#"{"@odata.context":"https://was-p.bcnet.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata$metadata#_CotacaoMoedaPeriodo(cotacaoCompra,cotacaoVenda,dataHoraCotacao)","value":[{"cotacaoCompra":5.12110,"cotacaoVenda":5.12170,"dataHoraCotacao":"2026-07-29 13:08:43.534984"},{"cotacaoCompra":5.12700,"cotacaoVenda":5.12760,"dataHoraCotacao":"2026-07-29 13:08:43.345891"}]}"#;

    #[test]
    fn parses_the_real_ptax_payload_and_picks_the_latest_quote() {
        let (rate, observed_at) = parse_ptax(PTAX_REAL).expect("ptax");
        assert!(
            (rate - 5.1217).abs() < 1e-6,
            "usa a cotação de venda mais recente"
        );
        // 13:08 em Brasília (-03:00) é 16:08 UTC.
        assert_eq!(
            observed_at.format("%Y-%m-%dT%H:%M").to_string(),
            "2026-07-29T16:08"
        );
    }

    #[test]
    fn out_of_order_quotes_still_yield_the_most_recent_one() {
        let payload = br#"{"value":[
            {"cotacaoVenda":5.00,"dataHoraCotacao":"2026-07-20 13:00:00.000"},
            {"cotacaoVenda":5.50,"dataHoraCotacao":"2026-07-24 13:00:00.000"},
            {"cotacaoVenda":5.25,"dataHoraCotacao":"2026-07-22 13:00:00.000"}
        ]}"#;
        let (rate, _) = parse_ptax(payload).expect("ptax");
        assert!((rate - 5.50).abs() < 1e-9);
    }

    #[test]
    fn a_weekend_window_without_quotes_fails_instead_of_inventing_a_value() {
        assert_eq!(
            parse_ptax(br#"{"value":[]}"#)
                .expect_err("sem cotação")
                .kind,
            ProviderErrorKind::Validation
        );
        assert_eq!(
            parse_ptax(b"nao json").expect_err("parse").kind,
            ProviderErrorKind::Parse
        );
    }

    #[test]
    fn implausible_rates_and_timestamps_are_discarded() {
        let payload = br#"{"value":[
            {"cotacaoVenda":0,"dataHoraCotacao":"2026-07-24 13:00:00.000"},
            {"cotacaoVenda":99999,"dataHoraCotacao":"2026-07-24 13:00:00.000"},
            {"cotacaoVenda":5.4,"dataHoraCotacao":"data invalida"}
        ]}"#;
        assert!(parse_ptax(payload).is_err());
    }

    #[test]
    fn the_ptax_request_covers_a_window_wide_enough_for_holidays() {
        let now = Utc::now();
        let url = ptax_url("USD", now).expect("url");
        assert_eq!(url.host_str(), Some(PTAX_HOST));
        let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(query.get("@moeda").map(String::as_str), Some("'USD'"));
        assert_eq!(
            query.get("@dataInicial").map(String::as_str),
            Some(format!("'{}'", (now - Duration::days(10)).format("%m-%d-%Y")).as_str())
        );
        assert_eq!(query.get("$format").map(String::as_str), Some("json"));
    }

    #[test]
    fn odata_operators_reach_the_wire_unescaped() {
        // Regressão: com `query_pairs_mut` o `$` virava `%24` e o Olinda
        // respondia 500 para toda requisição de PTAX.
        let url = ptax_url("USD", Utc::now()).expect("url");
        let raw = url.as_str();
        assert!(raw.contains("$format=json"), "query escapada: {raw}");
        assert!(raw.contains("$top=5"), "query escapada: {raw}");
        // Aspas como `%27` são aceitas pelo Olinda (verificado em 31/07/2026);
        // `$` e `@` percent-encoded não são.
        assert!(raw.contains("@moeda=%27USD%27"), "query escapada: {raw}");
        assert!(
            !raw.contains("%24"),
            "cifrão não pode ser percent-encoded: {raw}"
        );
        assert!(
            !raw.contains("%40"),
            "arroba não pode ser percent-encoded: {raw}"
        );
        // O espaço do `$orderby` continua escapado, como exige a URL.
        assert!(
            raw.contains("dataHoraCotacao%20desc"),
            "espaço não escapado: {raw}"
        );
    }

    #[test]
    fn only_three_letter_currency_codes_are_accepted() {
        assert!(ptax_url("USD", Utc::now()).is_ok());
        for invalid in ["", "usd", "USDX", "US", "U'D", "USD&$top=1"] {
            assert!(
                ptax_url(invalid, Utc::now()).is_err(),
                "aceitou código de moeda inválido: {invalid}"
            );
        }
    }

    #[test]
    fn a_ptax_item_is_always_labelled_as_ptax_and_carries_its_date() {
        let now = Utc::now();
        let item = ptax_ticker_item("usd-brl", "USD/BRL", 5.1217, now, now);
        assert_eq!(item.quote_kind, RadarQuoteKind::Ptax);
        assert_eq!(item.kind, RadarTickerKind::Currency);
        assert_eq!(item.value, "R$ 5,1217");
        assert!(item.variation.is_none(), "não inventamos variação");
        assert!(item.detail.is_some(), "a data da cotação é obrigatória");
        assert_eq!(item.cache_state, RadarCacheState::Fresh);
        assert!(!item.observed_at.is_empty());
    }

    #[test]
    fn ptax_freshness_degrades_over_days_and_then_disappears() {
        let now = Utc::now();
        let at = |days: i64| {
            ptax_ticker_item("usd-brl", "USD/BRL", 5.0, now - Duration::days(days), now).cache_state
        };
        assert_eq!(at(0), RadarCacheState::Fresh);
        assert_eq!(at(2), RadarCacheState::Stale);
        assert_eq!(
            at(config::PTAX_STALE_DAYS + 1),
            RadarCacheState::Unavailable
        );
    }

    #[test]
    fn only_the_documented_currencies_are_supported() {
        assert_eq!(ptax_currency_for("usd-brl"), Some(("USD", "USD/BRL")));
        assert_eq!(ptax_currency_for("eur-brl"), Some(("EUR", "EUR/BRL")));
        // Sem provider validado, cripto não vira item de PTAX.
        assert_eq!(ptax_currency_for("btc-brl"), None);
        assert_eq!(ptax_currency_for("ibovespa"), None);
    }

    #[test]
    fn brl_formatting_uses_the_brazilian_decimal_separator() {
        assert_eq!(format_brl(5.1217), "R$ 5,1217");
        assert_eq!(format_brl(10.0), "R$ 10,0000");
    }

    // -----------------------------------------------------------------------
    // USGS
    // -----------------------------------------------------------------------

    fn feature(
        id: &str,
        magnitude: f64,
        longitude: f64,
        latitude: f64,
        millis: i64,
    ) -> serde_json::Value {
        serde_json::json!({
            "type": "Feature",
            "id": id,
            "properties": { "mag": magnitude, "place": "Região de teste", "time": millis },
            "geometry": { "type": "Point", "coordinates": [longitude, latitude, 35] }
        })
    }

    fn collection(features: Vec<serde_json::Value>) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "type": "FeatureCollection",
            "features": features
        }))
        .expect("json")
    }

    #[test]
    fn parses_the_real_usgs_feature_shape() {
        let now = DateTime::from_timestamp_millis(1_785_400_000_000).expect("now");
        let payload = br#"{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"mag":6.5,"place":"72 km WSW of Aquiles Serdan, Mexico","time":1785367059950,"url":"https://earthquake.usgs.gov/earthquakes/eventpage/us6000tgup"},"geometry":{"type":"Point","coordinates":[-93.1002,14.6253,35]},"id":"us6000tgup"}]}"#;
        let events = parse_usgs(payload, now).expect("usgs");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "us6000tgup");
        assert!((events[0].magnitude - 6.5).abs() < 1e-9);
        assert!(events[0].place.starts_with("72 km"));
    }

    #[test]
    fn small_distant_quakes_are_filtered_but_moderate_regional_ones_are_kept() {
        let now = Utc::now();
        let millis = now.timestamp_millis() - 60_000;
        let events = parse_usgs(
            &collection(vec![
                // Moderado no Japão: abaixo do limiar global.
                feature("distante", 5.0, 140.0, 36.0, millis),
                // Mesmo tamanho, mas no Chile: acima do limiar regional.
                feature("regional", 5.0, -70.0, -33.0, millis),
                // Grande em qualquer lugar.
                feature("global", 7.2, 140.0, 36.0, millis),
            ]),
            now,
        )
        .expect("usgs");

        let ids: Vec<&str> = events.iter().map(|event| event.id.as_str()).collect();
        assert!(
            !ids.contains(&"distante"),
            "tremor moderado distante não entra"
        );
        assert!(ids.contains(&"regional"));
        assert!(ids.contains(&"global"));
        assert_eq!(
            ids.first(),
            Some(&"regional"),
            "proximidade da América do Sul tem precedência"
        );
    }

    #[test]
    fn the_ticker_never_holds_more_than_the_configured_number_of_events() {
        let now = Utc::now();
        let millis = now.timestamp_millis() - 60_000;
        let features: Vec<_> = (0..10)
            .map(|index| {
                feature(
                    &format!("e{index}"),
                    6.0 + index as f64 * 0.1,
                    140.0,
                    36.0,
                    millis,
                )
            })
            .collect();
        let events = parse_usgs(&collection(features), now).expect("usgs");
        assert_eq!(events.len(), config::MAX_TICKER_EVENTS);
        // Os de maior magnitude sobrevivem.
        assert!(events[0].magnitude >= events[events.len() - 1].magnitude);
    }

    #[test]
    fn events_with_missing_or_future_timestamps_are_discarded() {
        let now = Utc::now();
        let mut without_time = feature("sem-hora", 7.0, 140.0, 36.0, 0);
        without_time["properties"]["time"] = serde_json::Value::Null;
        let future = feature(
            "futuro",
            7.0,
            140.0,
            36.0,
            (now + Duration::hours(2)).timestamp_millis(),
        );
        let mut without_mag = feature("sem-mag", 7.0, 140.0, 36.0, now.timestamp_millis());
        without_mag["properties"]["mag"] = serde_json::Value::Null;

        let events =
            parse_usgs(&collection(vec![without_time, future, without_mag]), now).expect("usgs");
        assert!(events.is_empty(), "eventos inválidos vazaram: {events:?}");
    }

    #[test]
    fn event_severity_scales_with_magnitude() {
        let now = Utc::now();
        let make = |magnitude: f64| {
            event_ticker_item(
                &SeismicEvent {
                    id: "x".into(),
                    magnitude,
                    place: "Lugar".into(),
                    occurred_at: now,
                    near_south_america: false,
                },
                now,
            )
        };
        assert_eq!(make(5.0).severity, RadarSeverity::Info);
        assert_eq!(make(6.3).severity, RadarSeverity::Warning);
        assert_eq!(make(7.5).severity, RadarSeverity::Critical);
        assert_eq!(make(6.0).quote_kind, RadarQuoteKind::Event);
    }

    #[test]
    fn malformed_geojson_is_rejected_without_panicking() {
        let now = Utc::now();
        assert_eq!(
            parse_usgs(b"{quebrado", now).expect_err("parse").kind,
            ProviderErrorKind::Parse
        );
        assert!(parse_usgs(br#"{"features":[]}"#, now)
            .expect("vazio")
            .is_empty());
    }
}
