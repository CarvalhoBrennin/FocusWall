//! Limites operacionais, TTLs e limiares do Radar.
//!
//! Tudo o que é ajustável fica aqui para que os testes possam depender de um
//! único ponto de verdade e para que nenhum número mágico apareça espalhado
//! pelos providers.
//!
//! As constantes de imagem e de mercado ficam aqui mesmo quando algum
//! provider opcional não estiver habilitado, para que limites e TTLs tenham
//! uma única fonte de verdade.
#![allow(dead_code)]

use std::time::Duration;

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
pub const IMAGE_TIMEOUT: Duration = Duration::from_secs(12);
pub const MAX_REDIRECTS: usize = 3;
pub const MAX_ATTEMPTS: usize = 2;
pub const RETRY_BASE_BACKOFF: Duration = Duration::from_millis(400);
pub const MAX_RETRY_AFTER: Duration = Duration::from_secs(5);

/// Limites de resposta por tipo de conteúdo (seção 8.2 do plano).
pub const MAX_GEOCODING_BYTES: usize = 512 * 1024;
pub const MAX_FORECAST_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_FEED_BYTES: usize = 3 * 1024 * 1024;
pub const MAX_TABNEWS_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_OPEN_GRAPH_BYTES: usize = 512 * 1024;
pub const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_USGS_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_MARKET_BYTES: usize = 512 * 1024;

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

pub const MAX_TITLE_CHARS: usize = 240;
/// Resumo persistido no banco.
pub const MAX_SUMMARY_CHARS: usize = 1_200;
/// Resumo exibido no drawer.
pub const MAX_PREVIEW_SUMMARY_CHARS: usize = 700;
/// Resumo exibido nos cards.
pub const MAX_CARD_SUMMARY_CHARS: usize = 220;
pub const MAX_AUTHOR_CHARS: usize = 120;
pub const MAX_TAG_CHARS: usize = 40;
pub const MAX_TAGS: usize = 6;
pub const MAX_URL_CHARS: usize = 2_048;

// ---------------------------------------------------------------------------
// Parser XML
// ---------------------------------------------------------------------------

pub const MAX_XML_EVENTS: usize = 200_000;
pub const MAX_XML_DEPTH: usize = 64;
pub const MAX_RAW_ENTRIES: usize = 200;
pub const MAX_FIELD_CHARS: usize = 8_192;

// ---------------------------------------------------------------------------
// Cache / TTL
// ---------------------------------------------------------------------------

pub const WEATHER_FRESH_MINUTES: i64 = 20;
pub const WEATHER_STALE_HOURS: i64 = 6;
pub const WEATHER_EMERGENCY_HOURS: i64 = 24;

pub const NEWS_FRESH_MINUTES: i64 = 15;
pub const NEWS_STALE_HOURS: i64 = 24;

pub const PTAX_FRESH_MINUTES: i64 = 60;
pub const PTAX_STALE_DAYS: i64 = 5;
pub const CRYPTO_FRESH_SECONDS: i64 = 90;
pub const CRYPTO_STALE_MINUTES: i64 = 30;
pub const EVENT_FRESH_MINUTES: i64 = 10;
pub const EVENT_STALE_HOURS: i64 = 3;

/// Retenção de artigos no banco.
pub const ARTICLE_RETENTION_DAYS: i64 = 30;
pub const EVENT_RETENTION_DAYS: i64 = 7;

/// Timestamps mais de cinco minutos no futuro são considerados inválidos.
pub const MAX_CLOCK_SKEW_MINUTES: i64 = 5;

// ---------------------------------------------------------------------------
// Provider health
// ---------------------------------------------------------------------------

pub const COOLDOWN_BASE_MINUTES: i64 = 5;
pub const COOLDOWN_MAX_MINUTES: i64 = 120;
pub const FAILURES_BEFORE_COOLDOWN: u32 = 2;

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

pub const IMAGE_CACHE_QUOTA_BYTES: u64 = 150 * 1024 * 1024;
pub const IMAGE_MIN_WIDTH: u32 = 240;
pub const IMAGE_MIN_HEIGHT: u32 = 135;
pub const IMAGE_MAX_INPUT_DIMENSION: u32 = 8_000;
pub const IMAGE_MAX_PIXELS: u64 = 40_000_000;
pub const IMAGE_VARIANT_WIDTH: u32 = 1_280;
pub const IMAGE_VARIANT_HEIGHT: u32 = 720;
pub const IMAGE_JPEG_QUALITY: u8 = 82;
pub const MAX_CONCURRENT_IMAGE_DOWNLOADS: usize = 3;
pub const MAX_OPEN_GRAPH_LOOKUPS_PER_CYCLE: usize = 12;

// ---------------------------------------------------------------------------
// Notícias / paginação
// ---------------------------------------------------------------------------

pub const MAX_CONCURRENT_NEWS_PROVIDERS: usize = 4;
pub const INITIAL_PAGE_SIZE: usize = 16;
pub const PAGE_SIZE: usize = 12;
pub const FEATURED_COUNT: usize = 3;
pub const MAX_ITEMS_PER_PROVIDER: usize = 40;

/// Janela em que dois artigos ainda são candidatos ao mesmo cluster.
pub const CLUSTER_WINDOW_HOURS: i64 = 72;
/// Similaridade de bigramas exigida entre fontes distintas.
pub const JACCARD_CROSS_SOURCE: f32 = 0.82;
/// Similaridade exigida dentro da mesma fonte.
pub const JACCARD_SAME_SOURCE: f32 = 0.90;
/// Títulos com menos tokens do que isto não são agrupados só por similaridade.
pub const MIN_TOKENS_FOR_SIMILARITY: usize = 5;

// ---------------------------------------------------------------------------
// Alertas meteorológicos derivados (estimativas, nunca alerta oficial)
// ---------------------------------------------------------------------------

pub const ALERT_HEAVY_RAIN_MM: f64 = 25.0;
pub const ALERT_STORM_PROBABILITY: f64 = 70.0;
pub const ALERT_STRONG_GUST_KMH: f64 = 60.0;
pub const ALERT_HIGH_HEAT_CELSIUS: f64 = 35.0;
pub const ALERT_LOW_COLD_CELSIUS: f64 = 5.0;
pub const ALERT_LOW_HUMIDITY_PERCENT: f64 = 30.0;
pub const ALERT_VERY_HIGH_UV: f64 = 8.0;

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

/// Magnitude mínima para um terremoto entrar no ticker global.
pub const EVENT_MIN_MAGNITUDE: f64 = 5.5;
/// Magnitude mínima quando o evento ocorre próximo à América do Sul.
pub const EVENT_MIN_MAGNITUDE_REGIONAL: f64 = 4.5;
pub const MAX_TICKER_EVENTS: usize = 3;
