//! Contratos de domínio do Radar (schema 2).
//!
//! Nenhum DTO entregue ao frontend carrega URL externa: o Svelte referencia
//! artigos por `id` opaco e imagens por `image.id`.

use super::config;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const RADAR_SCHEMA_VERSION: u32 = 2;

// ---------------------------------------------------------------------------
// Enumerações
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "camelCase")]
pub enum RadarNewsCategory {
    Brasil,
    Technology,
    Development,
    Security,
    Business,
    Science,
    World,
}

impl RadarNewsCategory {
    pub const ALL: [RadarNewsCategory; 7] = [
        RadarNewsCategory::Brasil,
        RadarNewsCategory::Technology,
        RadarNewsCategory::Development,
        RadarNewsCategory::Security,
        RadarNewsCategory::Business,
        RadarNewsCategory::Science,
        RadarNewsCategory::World,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            RadarNewsCategory::Brasil => "brasil",
            RadarNewsCategory::Technology => "technology",
            RadarNewsCategory::Development => "development",
            RadarNewsCategory::Security => "security",
            RadarNewsCategory::Business => "business",
            RadarNewsCategory::Science => "science",
            RadarNewsCategory::World => "world",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        RadarNewsCategory::ALL
            .into_iter()
            .find(|category| category.as_str() == value)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarCacheState {
    Fresh,
    Stale,
    Unavailable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarProviderDomain {
    Weather,
    News,
    Market,
    Events,
}

impl RadarProviderDomain {
    pub fn as_str(self) -> &'static str {
        match self {
            RadarProviderDomain::Weather => "weather",
            RadarProviderDomain::News => "news",
            RadarProviderDomain::Market => "market",
            RadarProviderDomain::Events => "events",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "weather" => Some(RadarProviderDomain::Weather),
            "news" => Some(RadarProviderDomain::News),
            "market" => Some(RadarProviderDomain::Market),
            "events" => Some(RadarProviderDomain::Events),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarProviderState {
    Idle,
    Refreshing,
    Available,
    Stale,
    Cooldown,
    Failed,
    Disabled,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarWarningCode {
    LocationRequired,
    WeatherRefreshFailed,
    WeatherUsingStaleCache,
    WeatherUsingEmergencyCache,
    NewsRefreshFailed,
    NewsUsingStaleCache,
    NewsSourceUnavailable,
    NewsAllSourcesUnavailable,
    TickerPartiallyUnavailable,
    TickerUnavailable,
    ImagesUnavailable,
    CacheReadFailed,
    CacheWriteFailed,
    CacheRecovered,
    ProviderCooldown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarImageTone {
    Neutral,
    Warm,
    Cool,
    Olive,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarTickerKind {
    Currency,
    Crypto,
    WeatherAlert,
    Event,
    BreakingNews,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarSeverity {
    Neutral,
    Info,
    Warning,
    Critical,
}

/// Tipo do dado de mercado. `Ptax` nunca deve ser rotulado como cotação ao vivo.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarQuoteKind {
    Ptax,
    Spot,
    Estimate,
    Event,
}

// ---------------------------------------------------------------------------
// Localização
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarLocation {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub admin1: Option<String>,
    pub country: String,
    pub country_code: String,
    pub latitude: f64,
    pub longitude: f64,
    pub timezone: String,
}

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarPreferences {
    pub location: Option<RadarLocation>,
    pub enabled_categories: Vec<RadarNewsCategory>,
    pub followed_topics: Vec<String>,
    pub blocked_topics: Vec<String>,
    pub preferred_sources: Vec<String>,
    pub muted_sources: Vec<String>,
    pub ticker_symbols: Vec<String>,
}

impl Default for RadarPreferences {
    fn default() -> Self {
        Self {
            location: None,
            enabled_categories: default_radar_categories(),
            followed_topics: Vec::new(),
            blocked_topics: Vec::new(),
            preferred_sources: Vec::new(),
            muted_sources: Vec::new(),
            ticker_symbols: default_ticker_symbols(),
        }
    }
}

impl<'de> Deserialize<'de> for RadarPreferences {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        let Some(object) = value.as_object() else {
            return Ok(Self::default());
        };

        let location = object
            .get("location")
            .cloned()
            .and_then(|value| serde_json::from_value::<RadarLocation>(value).ok())
            .and_then(normalize_location);

        let categories = object
            .get("enabledCategories")
            .and_then(serde_json::Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .filter_map(RadarNewsCategory::parse)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let string_list = |key: &str, max: usize| -> Vec<String> {
            object
                .get(key)
                .and_then(serde_json::Value::as_array)
                .map(|values| {
                    let mut result = Vec::new();
                    for entry in values.iter().filter_map(serde_json::Value::as_str) {
                        let cleaned = clean_text(entry, config::MAX_TAG_CHARS).to_lowercase();
                        if !cleaned.is_empty() && !result.contains(&cleaned) {
                            result.push(cleaned);
                        }
                        if result.len() >= max {
                            break;
                        }
                    }
                    result
                })
                .unwrap_or_default()
        };

        let ticker_symbols = string_list("tickerSymbols", 12);
        Ok(Self {
            location,
            enabled_categories: normalize_categories(&categories),
            followed_topics: string_list("followedTopics", 24),
            blocked_topics: string_list("blockedTopics", 24),
            preferred_sources: string_list("preferredSources", 16),
            muted_sources: string_list("mutedSources", 16),
            ticker_symbols: if ticker_symbols.is_empty() {
                default_ticker_symbols()
            } else {
                ticker_symbols
            },
        })
    }
}

pub fn default_radar_categories() -> Vec<RadarNewsCategory> {
    RadarNewsCategory::ALL.to_vec()
}

pub fn default_ticker_symbols() -> Vec<String> {
    vec![
        "usd-brl".to_string(),
        "eur-brl".to_string(),
        "btc-brl".to_string(),
        "eth-brl".to_string(),
    ]
}

pub fn normalize_categories(categories: &[RadarNewsCategory]) -> Vec<RadarNewsCategory> {
    let mut normalized = Vec::new();
    for category in categories {
        if !normalized.contains(category) {
            normalized.push(*category);
        }
    }
    if normalized.is_empty() {
        default_radar_categories()
    } else {
        normalized.sort();
        normalized
    }
}

// ---------------------------------------------------------------------------
// Clima
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarWeatherCurrent {
    pub observed_at_local: String,
    pub temperature_celsius: f64,
    pub apparent_temperature_celsius: f64,
    pub humidity_percent: f64,
    pub precipitation_probability_percent: Option<f64>,
    pub precipitation_mm: Option<f64>,
    pub rain_mm: Option<f64>,
    pub wind_speed_kmh: f64,
    pub wind_gusts_kmh: Option<f64>,
    pub surface_pressure_hpa: Option<f64>,
    pub weather_code: i32,
    pub is_day: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarWeatherDay {
    pub date: String,
    pub minimum_celsius: f64,
    pub maximum_celsius: f64,
    pub precipitation_probability_percent: Option<f64>,
    pub precipitation_sum_mm: Option<f64>,
    pub wind_speed_max_kmh: Option<f64>,
    pub uv_index_max: Option<f64>,
    pub weather_code: i32,
    pub sunrise_local: Option<String>,
    pub sunset_local: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarWeatherHour {
    pub local_time: String,
    pub temperature_celsius: f64,
    pub apparent_temperature_celsius: Option<f64>,
    pub humidity_percent: Option<f64>,
    pub precipitation_probability_percent: Option<f64>,
    pub precipitation_mm: Option<f64>,
    pub wind_speed_kmh: Option<f64>,
    pub weather_code: i32,
    pub is_current_hour: bool,
}

/// Sinalização derivada da própria previsão. Nunca é alerta oficial: o campo
/// `is_estimate` é sempre verdadeiro e a UI precisa rotulá-lo como estimativa.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarWeatherAlert {
    pub id: String,
    pub kind: RadarWeatherAlertKind,
    pub severity: RadarSeverity,
    /// Valor observado que disparou a estimativa, já formatado pelo backend.
    pub measured_value: String,
    pub window_local: Option<String>,
    pub is_estimate: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarWeatherAlertKind {
    HeavyRain,
    Storm,
    StrongWind,
    HighHeat,
    IntenseCold,
    LowHumidity,
    VeryHighUv,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarWeather {
    pub location: RadarLocation,
    pub timezone: String,
    pub provider_id: String,
    pub provider_name: String,
    pub current: RadarWeatherCurrent,
    pub today: RadarWeatherDay,
    pub hourly: Vec<RadarWeatherHour>,
    pub daily: Vec<RadarWeatherDay>,
    pub alerts: Vec<RadarWeatherAlert>,
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarImageRef {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: f64,
    pub dominant_tone: RadarImageTone,
    pub alt: String,
    /// Local cache payload. It is a data URL, never a provider URL.
    pub data_url: String,
}

// ---------------------------------------------------------------------------
// Notícias
// ---------------------------------------------------------------------------

/// DTO de listagem. **Não contém `canonicalUrl`** — abertura externa é feita
/// exclusivamente por `id` através de `open_radar_article`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarArticleSummary {
    pub id: String,
    pub source_id: String,
    pub source_name: String,
    pub category: RadarNewsCategory,
    pub title: String,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub fetched_at: String,
    pub image: Option<RadarImageRef>,
    pub tags: Vec<String>,
    pub score: f64,
    pub related_count: usize,
    pub cache_state: RadarCacheState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarArticlePreview {
    pub id: String,
    pub source_id: String,
    pub source_name: String,
    pub source_attribution: String,
    pub category: RadarNewsCategory,
    pub title: String,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub image: Option<RadarImageRef>,
    pub tags: Vec<String>,
    pub related: Vec<RadarArticleSummary>,
    pub can_open_externally: bool,
    pub cache_state: RadarCacheState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarNewsCollection {
    pub lead: Option<RadarArticleSummary>,
    pub featured: Vec<RadarArticleSummary>,
    pub list: Vec<RadarArticleSummary>,
    /// Total de artigos alcançáveis com os filtros atuais.
    ///
    /// Exato quando não há assuntos bloqueados. Com bloqueios ativos o filtro
    /// roda fora do SQL, e o valor passa a ser um limite **inferior** — nunca
    /// anunciamos matérias que o usuário não conseguiria abrir.
    pub total_available: usize,
    pub has_more: bool,
    pub categories_available: Vec<RadarNewsCategory>,
}

// ---------------------------------------------------------------------------
// Ticker
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarTickerItem {
    pub id: String,
    pub kind: RadarTickerKind,
    pub quote_kind: RadarQuoteKind,
    pub label: String,
    pub value: String,
    pub variation: Option<f64>,
    pub observed_at: String,
    pub provider_name: String,
    pub cache_state: RadarCacheState,
    pub severity: RadarSeverity,
    /// Detalhe curto já formatado (região do sismo, data da PTAX, etc.).
    pub detail: Option<String>,
}

// ---------------------------------------------------------------------------
// Provider status
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarProviderStatus {
    pub provider_id: String,
    pub display_name: String,
    pub domain: RadarProviderDomain,
    pub state: RadarProviderState,
    pub last_success_at: Option<String>,
    pub last_attempt_at: Option<String>,
    pub next_attempt_at: Option<String>,
    pub error_code: Option<String>,
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarSection<T> {
    pub state: RadarCacheState,
    pub data: Option<T>,
    pub fetched_at: Option<String>,
}

impl<T> RadarSection<T> {
    pub fn unavailable() -> Self {
        Self {
            state: RadarCacheState::Unavailable,
            data: None,
            fetched_at: None,
        }
    }

    pub fn new(state: RadarCacheState, data: T, fetched_at: Option<String>) -> Self {
        Self {
            state,
            data: Some(data),
            fetched_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadarSnapshot {
    pub schema_version: u32,
    pub generated_at: String,
    pub weather: RadarSection<RadarWeather>,
    pub news: RadarSection<RadarNewsCollection>,
    pub ticker: RadarSection<Vec<RadarTickerItem>>,
    pub providers: Vec<RadarProviderStatus>,
    pub warnings: Vec<RadarWarningCode>,
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RadarSnapshotRequest {
    #[serde(default)]
    pub location: Option<RadarLocation>,
    #[serde(default)]
    pub categories: Vec<RadarNewsCategory>,
    /// Categoria em foco na UI; `None` significa "todas".
    #[serde(default)]
    pub selected_category: Option<RadarNewsCategory>,
    #[serde(default)]
    pub muted_sources: Vec<String>,
    #[serde(default)]
    pub blocked_topics: Vec<String>,
    #[serde(default)]
    pub followed_topics: Vec<String>,
    #[serde(default)]
    pub preferred_sources: Vec<String>,
    #[serde(default)]
    pub ticker_symbols: Vec<String>,
    /// Quantos artigos a UI já solicitou (paginação incremental).
    #[serde(default)]
    pub page_size: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RadarRefreshRequest {
    #[serde(flatten)]
    pub snapshot: RadarSnapshotRequest,
    #[serde(default)]
    pub force_refresh: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RadarCacheScope {
    All,
    News,
    Weather,
    Images,
    Market,
}

// ---------------------------------------------------------------------------
// Registros internos (nunca atravessam o IPC)
// ---------------------------------------------------------------------------

/// Artigo como persistido no SQLite. Contém `canonical_url`, por isso jamais é
/// serializado para o frontend.
#[derive(Debug, Clone, PartialEq)]
pub struct StoredArticle {
    pub id: String,
    pub provider_id: String,
    pub canonical_url: String,
    pub canonical_url_hash: String,
    pub normalized_title: String,
    pub title: String,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub category: RadarNewsCategory,
    pub tags: Vec<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub fetched_at: DateTime<Utc>,
    pub image_id: Option<String>,
    pub score: f64,
    pub cluster_id: Option<String>,
    pub expires_at: DateTime<Utc>,
}

/// Metadados de uma imagem processada no cache local.
///
/// Metadados da imagem processada e persistida no cache local. O blob nunca
/// atravessa o banco; o serviço lê o arquivo e monta uma data URL no DTO.
#[derive(Debug, Clone, PartialEq)]
pub struct StoredImage {
    pub id: String,
    pub content_hash: String,
    pub file_name: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub byte_size: u64,
    pub created_at: DateTime<Utc>,
    pub last_accessed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderHealth {
    pub id: String,
    pub display_name: String,
    pub domain: RadarProviderDomain,
    pub enabled: bool,
    pub last_attempt_at: Option<DateTime<Utc>>,
    pub last_success_at: Option<DateTime<Utc>>,
    pub last_failure_at: Option<DateTime<Utc>>,
    pub consecutive_failures: u32,
    pub cooldown_until: Option<DateTime<Utc>>,
    pub last_error_code: Option<String>,
}

impl ProviderHealth {
    #[cfg(test)]
    pub fn new(id: &str, display_name: &str, domain: RadarProviderDomain) -> Self {
        Self {
            id: id.to_string(),
            display_name: display_name.to_string(),
            domain,
            enabled: true,
            last_attempt_at: None,
            last_success_at: None,
            last_failure_at: None,
            consecutive_failures: 0,
            cooldown_until: None,
            last_error_code: None,
        }
    }

    pub fn in_cooldown(&self, now: DateTime<Utc>) -> bool {
        self.cooldown_until
            .map(|until| until > now)
            .unwrap_or(false)
    }

    pub fn to_status(&self, now: DateTime<Utc>, refreshing: bool) -> RadarProviderStatus {
        let state = if !self.enabled {
            RadarProviderState::Disabled
        } else if refreshing {
            RadarProviderState::Refreshing
        } else if self.in_cooldown(now) {
            RadarProviderState::Cooldown
        } else if self.consecutive_failures > 0 && self.last_success_at.is_none() {
            RadarProviderState::Failed
        } else if let Some(success) = self.last_success_at {
            let age = now.signed_duration_since(success);
            if self.consecutive_failures > 0 || age > chrono::Duration::hours(1) {
                RadarProviderState::Stale
            } else {
                RadarProviderState::Available
            }
        } else {
            RadarProviderState::Idle
        };

        RadarProviderStatus {
            provider_id: self.id.clone(),
            display_name: self.display_name.clone(),
            domain: self.domain,
            state,
            last_success_at: self.last_success_at.map(|value| value.to_rfc3339()),
            last_attempt_at: self.last_attempt_at.map(|value| value.to_rfc3339()),
            next_attempt_at: self
                .cooldown_until
                .filter(|until| *until > now)
                .map(|value| value.to_rfc3339()),
            error_code: self.last_error_code.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// Utilidades de texto e validação
// ---------------------------------------------------------------------------

/// Colapsa controles e whitespace e trunca em `max` **caracteres** (não bytes),
/// preservando limites de grafema simples do Unicode.
pub fn clean_text(value: &str, max: usize) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

pub fn valid_timezone(value: &str) -> bool {
    if value.is_empty() || value.starts_with('/') || value.ends_with('/') || value.contains("..") {
        return false;
    }
    value.split('/').all(|segment| {
        !segment.is_empty()
            && segment.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '_' | '+' | '-')
            })
    })
}

pub fn normalize_location(mut location: RadarLocation) -> Option<RadarLocation> {
    location.id = clean_text(&location.id, 120);
    location.name = clean_text(&location.name, 100);
    location.admin1 = location
        .admin1
        .as_deref()
        .map(|value| clean_text(value, 100))
        .filter(|value| !value.is_empty());
    location.country = clean_text(&location.country, 100);
    location.country_code = clean_text(&location.country_code, 3).to_uppercase();
    location.timezone = clean_text(&location.timezone, 80);
    if location.id.is_empty() {
        location.id = location_cache_key(&location);
    }
    validate_location(&location).ok()?;
    Some(location)
}

pub fn validate_location(location: &RadarLocation) -> Result<(), String> {
    if !location.latitude.is_finite()
        || !location.longitude.is_finite()
        || !(-90.0..=90.0).contains(&location.latitude)
        || !(-180.0..=180.0).contains(&location.longitude)
    {
        return Err("radar.invalidLocation".to_string());
    }
    let invalid_text = location.id.trim().is_empty()
        || location.name.trim().is_empty()
        || location.country.trim().is_empty()
        || location.timezone.trim().is_empty()
        || location.id.chars().count() > 120
        || location.name.chars().count() > 100
        || location
            .admin1
            .as_ref()
            .map(|value| value.chars().count() > 100)
            .unwrap_or(false)
        || location.country.chars().count() > 100
        || location.timezone.chars().count() > 80
        || !valid_timezone(&location.timezone)
        || location.country_code.chars().count() > 3
        || location.id.chars().any(char::is_control)
        || location.name.chars().any(char::is_control)
        || location
            .admin1
            .as_ref()
            .map(|value| value.chars().any(char::is_control))
            .unwrap_or(false)
        || location.country.chars().any(char::is_control)
        || location.country_code.chars().any(char::is_control)
        || location.timezone.chars().any(char::is_control);
    if invalid_text {
        return Err("radar.invalidLocation".to_string());
    }
    Ok(())
}

pub fn location_cache_key(location: &RadarLocation) -> String {
    format!("{:.4},{:.4}", location.latitude, location.longitude)
}

/// Rejeita timestamps implausíveis (muito no futuro ou anteriores a 2000).
pub fn plausible_timestamp(value: DateTime<Utc>, now: DateTime<Utc>) -> bool {
    let skew = chrono::Duration::minutes(config::MAX_CLOCK_SKEW_MINUTES);
    value <= now + skew && value.timestamp() > 946_684_800
}

/// Classifica a idade de um dado em fresh / stale / unavailable.
pub fn age_state(
    fetched_at: DateTime<Utc>,
    now: DateTime<Utc>,
    fresh: chrono::Duration,
    stale: chrono::Duration,
) -> RadarCacheState {
    let age = now.signed_duration_since(fetched_at);
    if age < -chrono::Duration::minutes(config::MAX_CLOCK_SKEW_MINUTES) {
        RadarCacheState::Unavailable
    } else if age <= fresh {
        RadarCacheState::Fresh
    } else if age <= stale {
        RadarCacheState::Stale
    } else {
        RadarCacheState::Unavailable
    }
}

pub fn weather_state(fetched_at: DateTime<Utc>, now: DateTime<Utc>) -> RadarCacheState {
    age_state(
        fetched_at,
        now,
        chrono::Duration::minutes(config::WEATHER_FRESH_MINUTES),
        chrono::Duration::hours(config::WEATHER_STALE_HOURS),
    )
}

pub fn news_state(fetched_at: DateTime<Utc>, now: DateTime<Utc>) -> RadarCacheState {
    age_state(
        fetched_at,
        now,
        chrono::Duration::minutes(config::NEWS_FRESH_MINUTES),
        chrono::Duration::hours(config::NEWS_STALE_HOURS),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn category_round_trips_through_its_wire_representation() {
        for category in RadarNewsCategory::ALL {
            assert_eq!(RadarNewsCategory::parse(category.as_str()), Some(category));
        }
        assert_eq!(RadarNewsCategory::parse("unknown"), None);
        // A categoria removida do schema 1 não pode ressuscitar silenciosamente.
        assert_eq!(RadarNewsCategory::parse("Technology"), None);
    }

    #[test]
    fn normalize_categories_deduplicates_and_falls_back_to_every_category() {
        assert_eq!(
            normalize_categories(&[
                RadarNewsCategory::Brasil,
                RadarNewsCategory::Brasil,
                RadarNewsCategory::World
            ]),
            vec![RadarNewsCategory::Brasil, RadarNewsCategory::World]
        );
        assert_eq!(normalize_categories(&[]), default_radar_categories());
    }

    #[test]
    fn clean_text_truncates_by_character_not_byte() {
        let value = "ação ".repeat(10);
        let cleaned = clean_text(&value, 5);
        assert_eq!(cleaned.chars().count(), 5);
        assert_eq!(cleaned, "ação ");
        assert_eq!(clean_text("a\u{0}\tb   c", 40), "a b c");
    }

    #[test]
    fn preferences_deserialize_ignores_unknown_categories_and_lowercases_topics() {
        let value = serde_json::json!({
            "enabledCategories": ["brasil", "nonsense", "brasil", "security"],
            "followedTopics": ["  Inteligência Artificial  ", "IA", "IA"],
            "mutedSources": ["Hacker-News"],
            "tickerSymbols": []
        });
        let preferences: RadarPreferences = serde_json::from_value(value).expect("preferences");
        assert_eq!(
            preferences.enabled_categories,
            vec![RadarNewsCategory::Brasil, RadarNewsCategory::Security]
        );
        assert_eq!(
            preferences.followed_topics,
            vec!["inteligência artificial".to_string(), "ia".to_string()]
        );
        assert_eq!(preferences.muted_sources, vec!["hacker-news".to_string()]);
        // Lista vazia cai no padrão em vez de esconder o ticker inteiro.
        assert_eq!(preferences.ticker_symbols, default_ticker_symbols());
        assert!(preferences.location.is_none());
    }

    #[test]
    fn age_state_classifies_fresh_stale_and_future_timestamps() {
        let now = Utc::now();
        let fresh = chrono::Duration::minutes(20);
        let stale = chrono::Duration::hours(6);
        assert_eq!(age_state(now, now, fresh, stale), RadarCacheState::Fresh);
        assert_eq!(
            age_state(now - chrono::Duration::hours(1), now, fresh, stale),
            RadarCacheState::Stale
        );
        assert_eq!(
            age_state(now - chrono::Duration::hours(7), now, fresh, stale),
            RadarCacheState::Unavailable
        );
        assert_eq!(
            age_state(now + chrono::Duration::minutes(30), now, fresh, stale),
            RadarCacheState::Unavailable
        );
    }

    #[test]
    fn provider_health_reports_cooldown_before_failure() {
        let now = Utc::now();
        let mut health = ProviderHealth::new(
            "agencia-brasil",
            "Agência Brasil",
            RadarProviderDomain::News,
        );
        assert_eq!(health.to_status(now, false).state, RadarProviderState::Idle);

        health.last_success_at = Some(now);
        assert_eq!(
            health.to_status(now, false).state,
            RadarProviderState::Available
        );

        health.consecutive_failures = 3;
        health.cooldown_until = Some(now + chrono::Duration::minutes(20));
        let status = health.to_status(now, false);
        assert_eq!(status.state, RadarProviderState::Cooldown);
        assert!(status.next_attempt_at.is_some());

        // Refreshing tem precedência visual sobre cooldown enquanto a tentativa corre.
        assert_eq!(
            health.to_status(now, true).state,
            RadarProviderState::Refreshing
        );

        health.enabled = false;
        assert_eq!(
            health.to_status(now, true).state,
            RadarProviderState::Disabled
        );
    }

    #[test]
    fn plausible_timestamp_rejects_far_future_and_prehistoric_values() {
        let now = Utc::now();
        assert!(plausible_timestamp(now, now));
        assert!(plausible_timestamp(now - chrono::Duration::days(365), now));
        assert!(!plausible_timestamp(now + chrono::Duration::hours(2), now));
        assert!(!plausible_timestamp(
            DateTime::from_timestamp(0, 0).expect("epoch"),
            now
        ));
    }

    // -----------------------------------------------------------------------
    // Contrato IPC
    //
    // O Svelte monta estes objetos à mão; se um nome de campo divergir, o
    // comando falha só em runtime. Estes testes fixam a forma do wire.
    // -----------------------------------------------------------------------

    #[test]
    fn snapshot_request_accepts_the_camel_case_payload_the_frontend_sends() {
        let payload = serde_json::json!({
            "location": null,
            "categories": ["brasil", "security"],
            "selectedCategory": "security",
            "mutedSources": ["tabnews"],
            "blockedTopics": ["futebol"],
            "followedTopics": ["inteligência artificial"],
            "preferredSources": ["agencia-brasil"],
            "tickerSymbols": ["usd-brl", "eur-brl"],
            "pageSize": 24
        });
        let request: RadarSnapshotRequest = serde_json::from_value(payload).expect("request");
        assert_eq!(
            request.categories,
            vec![RadarNewsCategory::Brasil, RadarNewsCategory::Security]
        );
        assert_eq!(request.selected_category, Some(RadarNewsCategory::Security));
        assert_eq!(request.muted_sources, vec!["tabnews".to_string()]);
        assert_eq!(request.ticker_symbols, vec!["usd-brl", "eur-brl"]);
        assert_eq!(request.page_size, Some(24));
    }

    #[test]
    fn snapshot_request_tolerates_an_empty_payload() {
        let request: RadarSnapshotRequest =
            serde_json::from_value(serde_json::json!({})).expect("request vazio");
        assert_eq!(request, RadarSnapshotRequest::default());
        assert!(request.location.is_none());
        assert!(request.categories.is_empty());
    }

    #[test]
    fn refresh_request_flattens_the_snapshot_fields_at_the_top_level() {
        // `#[serde(flatten)]` significa que o frontend NÃO envia um objeto
        // aninhado: os campos do snapshot ficam lado a lado com `forceRefresh`.
        let payload = serde_json::json!({
            "categories": ["brasil"],
            "selectedCategory": "brasil",
            "pageSize": 16,
            "forceRefresh": true
        });
        let request: RadarRefreshRequest = serde_json::from_value(payload).expect("refresh");
        assert!(request.force_refresh);
        assert_eq!(request.snapshot.categories, vec![RadarNewsCategory::Brasil]);
        assert_eq!(request.snapshot.page_size, Some(16));

        // Sem `forceRefresh` o padrão é falso, não um erro de desserialização.
        let minimal: RadarRefreshRequest =
            serde_json::from_value(serde_json::json!({})).expect("refresh mínimo");
        assert!(!minimal.force_refresh);
    }

    #[test]
    fn cache_scope_round_trips_through_its_wire_representation() {
        for (wire, scope) in [
            ("all", RadarCacheScope::All),
            ("news", RadarCacheScope::News),
            ("weather", RadarCacheScope::Weather),
            ("images", RadarCacheScope::Images),
            ("market", RadarCacheScope::Market),
        ] {
            assert_eq!(
                serde_json::from_value::<RadarCacheScope>(serde_json::json!(wire)).expect(wire),
                scope
            );
            assert_eq!(
                serde_json::to_value(scope).expect("json"),
                serde_json::json!(wire)
            );
        }
        assert!(serde_json::from_value::<RadarCacheScope>(serde_json::json!("tudo")).is_err());
    }

    #[test]
    fn an_invalid_category_in_the_request_is_a_hard_error_not_a_silent_default() {
        // Diferente das preferências persistidas (onde ignoramos lixo antigo),
        // um payload de comando malformado precisa falhar visivelmente.
        let payload = serde_json::json!({ "categories": ["categoria-inexistente"] });
        assert!(serde_json::from_value::<RadarSnapshotRequest>(payload).is_err());
    }

    #[test]
    fn snapshot_serializes_with_camel_case_and_no_canonical_url() {
        let summary = RadarArticleSummary {
            id: "abc".into(),
            source_id: "agencia-brasil".into(),
            source_name: "Agência Brasil".into(),
            category: RadarNewsCategory::Brasil,
            title: "Título".into(),
            summary: Some("Resumo".into()),
            author: None,
            published_at: None,
            fetched_at: "2026-07-29T12:00:00+00:00".into(),
            image: None,
            tags: vec!["economia".into()],
            score: 0.5,
            related_count: 2,
            cache_state: RadarCacheState::Fresh,
        };
        let json = serde_json::to_string(&summary).expect("serialize");
        assert!(json.contains("\"sourceName\""));
        assert!(json.contains("\"relatedCount\""));
        assert!(!json.contains("canonicalUrl"));
        assert!(!json.contains("canonical_url"));
    }
}
