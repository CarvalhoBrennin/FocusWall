//! Orquestração do Radar.
//!
//! Reúne repositório, cliente HTTP e providers. Regras invioláveis:
//!
//! * nenhuma transação de banco fica aberta enquanto a rede é aguardada;
//! * a falha de um provider nunca derruba os demais;
//! * o cache anterior continua servindo quando um refresh falha;
//! * logs registram apenas `provider_id` e `error_kind`.

use super::{
    config,
    error::{ProviderError, ProviderErrorKind},
    http::SecureHttpClient,
    market,
    models::*,
    news::{self, dedupe, normalize, ranking, rss_atom, tabnews},
    repository::RadarRepository,
    security,
    sources::{self, NewsProviderDefinition, ProviderFormat},
    weather::{self, WeatherProviderMode},
};
use chrono::{DateTime, Utc};
use futures_util::future::join_all;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{codecs::jpeg::JpegEncoder, ImageReader, Limits};
use log::{info, warn};
use regex::Regex;
use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
    path::Path,
    sync::{Arc, OnceLock},
};
use tokio::sync::Mutex;

/// Contadores locais de observabilidade. Nenhuma telemetria remota.
///
/// Alguns contadores ainda não têm incremento porque pertencem ao caminho de
/// leitura instrumentado ou a métricas que não são expostas na UI.
#[allow(dead_code)]
#[derive(Debug, Default, Clone, Copy)]
pub struct RadarMetrics {
    pub provider_fetch_started: u32,
    pub provider_fetch_succeeded: u32,
    pub provider_fetch_failed: u32,
    pub provider_items_received: u32,
    pub provider_items_accepted: u32,
    pub provider_items_rejected: u32,
    pub articles_deduplicated: u32,
    pub articles_clustered: u32,
    pub snapshot_cache_hit: u32,
    pub snapshot_stale_hit: u32,
}

struct PendingArticle {
    article: StoredArticle,
    media_url: Option<String>,
    article_hosts: &'static [&'static str],
    image_hosts: &'static [&'static str],
}

struct PreparedImage {
    bytes: Vec<u8>,
    content_hash: String,
    width: u32,
    height: u32,
}

fn category_image_tone(category: RadarNewsCategory) -> RadarImageTone {
    match category {
        RadarNewsCategory::Brasil | RadarNewsCategory::Business => RadarImageTone::Olive,
        RadarNewsCategory::Technology | RadarNewsCategory::Science => RadarImageTone::Cool,
        RadarNewsCategory::Security | RadarNewsCategory::World => RadarImageTone::Warm,
        RadarNewsCategory::Development => RadarImageTone::Neutral,
    }
}

fn prepare_image(bytes: &[u8]) -> Option<PreparedImage> {
    if bytes.is_empty() || bytes.len() > config::MAX_IMAGE_BYTES {
        return None;
    }

    let mut reader = ImageReader::new(Cursor::new(bytes));
    let mut limits = Limits::default();
    limits.max_image_width = Some(config::IMAGE_MAX_INPUT_DIMENSION);
    limits.max_image_height = Some(config::IMAGE_MAX_INPUT_DIMENSION);
    limits.max_alloc = Some(192 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.with_guessed_format().ok()?.decode().ok()?;
    let (input_width, input_height) = image::GenericImageView::dimensions(&image);
    let pixels = u64::from(input_width).saturating_mul(u64::from(input_height));
    if input_width < config::IMAGE_MIN_WIDTH
        || input_height < config::IMAGE_MIN_HEIGHT
        || pixels > config::IMAGE_MAX_PIXELS
    {
        return None;
    }

    let thumbnail = image
        .thumbnail(config::IMAGE_VARIANT_WIDTH, config::IMAGE_VARIANT_HEIGHT)
        .to_rgb8();
    let mut encoded = Vec::new();
    {
        let mut encoder = JpegEncoder::new_with_quality(&mut encoded, config::IMAGE_JPEG_QUALITY);
        encoder
            .encode(
                thumbnail.as_raw(),
                thumbnail.width(),
                thumbnail.height(),
                image::ExtendedColorType::Rgb8,
            )
            .ok()?;
    }
    if encoded.is_empty() {
        return None;
    }

    Some(PreparedImage {
        content_hash: security::sha256_hex_bytes(&encoded),
        width: thumbnail.width(),
        height: thumbnail.height(),
        bytes: encoded,
    })
}

fn extract_open_graph_image(bytes: &[u8]) -> Option<String> {
    static META_IMAGE_RE: OnceLock<Regex> = OnceLock::new();
    let pattern = META_IMAGE_RE.get_or_init(|| {
        Regex::new(
            r#"(?is)<meta\b[^>]*(?:property|name)\s*=\s*[\"']og:image[\"'][^>]*content\s*=\s*[\"']([^\"']+)[\"'][^>]*>|<meta\b[^>]*content\s*=\s*[\"']([^\"']+)[\"'][^>]*(?:property|name)\s*=\s*[\"']og:image[\"'][^>]*>"#,
        )
        .expect("valid Open Graph meta regex")
    });

    let html = String::from_utf8_lossy(bytes);
    pattern
        .captures(&html)
        .and_then(|capture| capture.get(1).or_else(|| capture.get(2)))
        .map(|value| value.as_str().trim().replace("&amp;", "&"))
        .filter(|value| !value.is_empty() && value.chars().count() <= config::MAX_URL_CHARS)
}

fn persist_prepared_image(
    repository: &RadarRepository,
    prepared: PreparedImage,
    now: DateTime<Utc>,
) -> Option<String> {
    if let Ok(Some(existing)) = repository.image_by_content_hash(&prepared.content_hash) {
        let existing_path = repository.image_directory().join(&existing.file_name);
        if existing_path.is_file() {
            return Some(existing.id);
        }
    }

    let image_id = prepared.content_hash.clone();
    let file_name = format!("{image_id}.jpg");
    let image_path = repository.image_directory().join(&file_name);
    if !image_path.is_file() {
        let temporary_path = repository
            .image_directory()
            .join(format!(".{image_id}.tmp"));
        if std::fs::write(&temporary_path, &prepared.bytes).is_err() {
            return None;
        }
        if std::fs::rename(&temporary_path, &image_path).is_err() {
            let _ = std::fs::remove_file(&temporary_path);
            if !image_path.is_file() {
                return None;
            }
        }
    }

    let stored = StoredImage {
        id: image_id.clone(),
        content_hash: prepared.content_hash,
        file_name,
        mime_type: "image/jpeg".to_string(),
        width: prepared.width,
        height: prepared.height,
        byte_size: prepared.bytes.len() as u64,
        created_at: now,
        last_accessed_at: now,
    };
    if repository.insert_image(&stored).is_err() {
        return None;
    }
    Some(image_id)
}

pub struct RadarService {
    repository: Arc<RadarRepository>,
    client: Option<Arc<SecureHttpClient>>,
    weather_mode: WeatherProviderMode,
    /// Serializa refreshes; a rede acontece fora de qualquer lock de banco.
    refresh_lock: Mutex<()>,
    metrics: Mutex<RadarMetrics>,
}

impl RadarService {
    pub fn new(cache_directory: &Path) -> Result<Self, ProviderError> {
        let repository = Arc::new(RadarRepository::open_or_rebuild(cache_directory)?);

        let mut registrations: Vec<(&str, &str, RadarProviderDomain, bool)> =
            sources::NEWS_PROVIDERS
                .iter()
                .map(|provider| {
                    (
                        provider.id,
                        provider.name,
                        RadarProviderDomain::News,
                        provider.enabled,
                    )
                })
                .collect();
        registrations.push((
            weather::PROVIDER_ID,
            weather::PROVIDER_NAME,
            RadarProviderDomain::Weather,
            true,
        ));
        registrations.push((
            market::PTAX_PROVIDER_ID,
            market::PTAX_PROVIDER_NAME,
            RadarProviderDomain::Market,
            true,
        ));
        registrations.push((
            market::USGS_PROVIDER_ID,
            market::USGS_PROVIDER_NAME,
            RadarProviderDomain::Events,
            true,
        ));
        repository.register_providers(&registrations)?;

        // Falhar ao construir o cliente desabilita apenas a rede do Radar; o
        // cache continua servindo e o FocusWall inicia normalmente.
        let client = match SecureHttpClient::new() {
            Ok(client) => Some(Arc::new(client)),
            Err(_) => {
                warn!("radar http client initialization failed");
                None
            }
        };

        Ok(Self {
            repository,
            client,
            weather_mode: WeatherProviderMode::default(),
            refresh_lock: Mutex::new(()),
            metrics: Mutex::new(RadarMetrics::default()),
        })
    }

    /// Resumo de contadores para inspeção local (relatório de execução).
    #[allow(dead_code)]
    pub fn metrics_snapshot(&self) -> RadarMetrics {
        self.metrics
            .try_lock()
            .map(|guard| *guard)
            .unwrap_or_default()
    }

    // -----------------------------------------------------------------------
    // Montagem do snapshot a partir do cache
    // -----------------------------------------------------------------------

    fn ranking_preferences(
        &self,
        request: &RadarSnapshotRequest,
        health: &[ProviderHealth],
        now: DateTime<Utc>,
    ) -> ranking::RankingPreferences {
        ranking::RankingPreferences {
            followed_topics: request.followed_topics.clone(),
            blocked_topics: request.blocked_topics.clone(),
            preferred_sources: request.preferred_sources.clone(),
            degraded_sources: health
                .iter()
                .filter(|entry| entry.in_cooldown(now) || entry.consecutive_failures > 0)
                .map(|entry| entry.id.clone())
                .collect(),
        }
    }

    fn to_summary(
        &self,
        article: &StoredArticle,
        now: DateTime<Utc>,
        related_count: usize,
        include_image: bool,
    ) -> RadarArticleSummary {
        RadarArticleSummary {
            id: article.id.clone(),
            source_id: article.provider_id.clone(),
            source_name: sources::provider_by_id(&article.provider_id)
                .map(|provider| provider.name.to_string())
                .unwrap_or_else(|| article.provider_id.clone()),
            category: article.category,
            title: article.title.clone(),
            summary: article
                .summary
                .as_deref()
                .map(|value| news::text::truncate_summary(value, config::MAX_CARD_SUMMARY_CHARS)),
            author: article.author.clone(),
            published_at: article.published_at.map(|value| value.to_rfc3339()),
            fetched_at: article.fetched_at.to_rfc3339(),
            image: include_image.then(|| self.image_ref(article)).flatten(),
            tags: article.tags.clone(),
            score: article.score,
            related_count,
            cache_state: news_state(article.fetched_at, now),
        }
    }

    fn image_ref(&self, article: &StoredArticle) -> Option<RadarImageRef> {
        let image_id = article.image_id.as_deref()?;
        if !security::is_valid_opaque_id(image_id) {
            return None;
        }
        let image = self.repository.image_by_id(image_id).ok()??;
        let file_name = image.file_name.as_str();
        if file_name.contains(['/', '\\']) || file_name.contains("..") {
            return None;
        }
        let bytes = std::fs::read(self.repository.image_directory().join(file_name)).ok()?;
        if bytes.is_empty() || bytes.len() > config::MAX_IMAGE_BYTES {
            return None;
        }
        let mime_type = match image.mime_type.as_str() {
            "image/jpeg" | "image/png" | "image/webp" => image.mime_type.as_str(),
            _ => return None,
        };
        Some(RadarImageRef {
            id: image.id,
            width: image.width,
            height: image.height,
            aspect_ratio: image.width as f64 / image.height.max(1) as f64,
            dominant_tone: category_image_tone(article.category),
            alt: article.title.clone(),
            data_url: format!("data:{mime_type};base64,{}", BASE64.encode(bytes)),
        })
    }

    fn build_news_section(
        &self,
        request: &RadarSnapshotRequest,
        health: &[ProviderHealth],
        now: DateTime<Utc>,
        warnings: &mut Vec<RadarWarningCode>,
    ) -> RadarSection<RadarNewsCollection> {
        let categories = normalize_categories(&request.categories);
        let selected: Vec<RadarNewsCategory> = match request.selected_category {
            Some(category) if categories.contains(&category) => vec![category],
            _ => categories.clone(),
        };

        let page_size = request
            .page_size
            .unwrap_or(config::INITIAL_PAGE_SIZE)
            .clamp(config::PAGE_SIZE, 200);

        // Buscamos uma folga para saber se há mais páginas sem contar tudo.
        let stored = match self.repository.articles(
            &selected,
            &request.muted_sources,
            now,
            page_size + config::PAGE_SIZE,
        ) {
            Ok(rows) => rows,
            Err(_) => {
                warn!("radar cache read failed: error_kind=storage");
                append_warning(warnings, RadarWarningCode::CacheReadFailed);
                return RadarSection::unavailable();
            }
        };

        if stored.is_empty() {
            return RadarSection::unavailable();
        }

        let preferences = self.ranking_preferences(request, health, now);
        let ranked: Vec<StoredArticle> = ranking::rank(stored, &preferences, now)
            .into_iter()
            // Um assunto bloqueado tem score zerado; removê-lo aqui evita
            // exibi-lo no fim da lista.
            .filter(|article| !ranking::is_blocked(article, &preferences.blocked_topics))
            .collect();

        if ranked.is_empty() {
            return RadarSection::unavailable();
        }

        // `ranked` está limitado pela página buscada, então serve para decidir
        // se há mais itens, mas não para anunciar o total. O total real vem de
        // uma contagem com os mesmos filtros.
        let has_more = ranked.len() > page_size;
        // Sem bloqueios, a contagem em SQL é exata e independe da paginação.
        // Com bloqueios ativos o filtro é aplicado em Rust, então usamos o que
        // sobrou da janela buscada: um limite inferior. Sub-relatar é melhor do
        // que anunciar matérias que o usuário nunca vai alcançar.
        let total_available = if request.blocked_topics.is_empty() {
            self.repository
                .count_articles_matching(&selected, &request.muted_sources, now)
                .unwrap_or(ranked.len())
        } else {
            ranked.len()
        };
        let oldest = ranked.iter().map(|article| article.fetched_at).min();
        let any_stale = ranked
            .iter()
            .any(|article| news_state(article.fetched_at, now) == RadarCacheState::Stale);
        if any_stale {
            append_warning(warnings, RadarWarningCode::NewsUsingStaleCache);
        }

        let related_for = |article: &StoredArticle| -> usize {
            article
                .cluster_id
                .as_deref()
                .and_then(|cluster| {
                    self.repository
                        .articles_in_cluster(cluster, &article.id, 8)
                        .ok()
                })
                .map(|rows| rows.len())
                .unwrap_or(0)
        };

        let mut page: Vec<&StoredArticle> = ranked.iter().take(page_size).collect();
        let lead = if page.is_empty() {
            None
        } else {
            let article = page.remove(0);
            Some(self.to_summary(article, now, related_for(article), true))
        };
        let featured: Vec<RadarArticleSummary> = page
            .iter()
            .take(config::FEATURED_COUNT)
            .map(|article| self.to_summary(article, now, related_for(article), true))
            .collect();
        let list: Vec<RadarArticleSummary> = page
            .iter()
            .skip(config::FEATURED_COUNT)
            .map(|article| self.to_summary(article, now, related_for(article), false))
            .collect();

        let categories_available: Vec<RadarNewsCategory> = {
            let present: HashSet<RadarNewsCategory> =
                ranked.iter().map(|article| article.category).collect();
            RadarNewsCategory::ALL
                .into_iter()
                .filter(|category| present.contains(category))
                .collect()
        };

        RadarSection::new(
            if any_stale {
                RadarCacheState::Stale
            } else {
                RadarCacheState::Fresh
            },
            RadarNewsCollection {
                lead,
                featured,
                list,
                total_available,
                has_more,
                categories_available,
            },
            oldest.map(|value| value.to_rfc3339()),
        )
    }

    fn build_weather_section(
        &self,
        location: Option<&RadarLocation>,
        now: DateTime<Utc>,
        warnings: &mut Vec<RadarWarningCode>,
    ) -> RadarSection<RadarWeather> {
        let Some(location) = location else {
            // Nenhuma cidade é presumida: sem localização explícita o clima
            // permanece indisponível e configurável.
            append_warning(warnings, RadarWarningCode::LocationRequired);
            return RadarSection::unavailable();
        };
        let key = location_cache_key(location);
        let Ok(Some((payload, fetched_at))) = self.repository.weather(&key) else {
            return RadarSection::unavailable();
        };
        let Ok(data) = serde_json::from_str::<RadarWeather>(&payload) else {
            return RadarSection::unavailable();
        };

        let age = now.signed_duration_since(fetched_at);
        let state = weather_state(fetched_at, now);
        match state {
            RadarCacheState::Stale => {
                append_warning(warnings, RadarWarningCode::WeatherUsingStaleCache)
            }
            RadarCacheState::Unavailable
                if age <= chrono::Duration::hours(config::WEATHER_EMERGENCY_HOURS) =>
            {
                // Cache de emergência: exibido, porém com aviso forte.
                append_warning(warnings, RadarWarningCode::WeatherUsingEmergencyCache);
                return RadarSection::new(
                    RadarCacheState::Stale,
                    data,
                    Some(fetched_at.to_rfc3339()),
                );
            }
            RadarCacheState::Unavailable => return RadarSection::unavailable(),
            RadarCacheState::Fresh => {}
        }
        RadarSection::new(state, data, Some(fetched_at.to_rfc3339()))
    }

    /// Recalcula a frescura a partir de `observed_at`.
    ///
    /// O `cache_state` gravado reflete o instante da escrita; sem este recálculo
    /// uma cotação de dias atrás continuaria se apresentando como recente.
    fn refresh_ticker_freshness(item: RadarTickerItem, now: DateTime<Utc>) -> RadarTickerItem {
        let Some(observed_at) = DateTime::parse_from_rfc3339(&item.observed_at)
            .ok()
            .map(|value| value.with_timezone(&Utc))
        else {
            return RadarTickerItem {
                cache_state: RadarCacheState::Unavailable,
                ..item
            };
        };
        let (fresh, stale) = match item.kind {
            RadarTickerKind::Currency => (
                chrono::Duration::minutes(config::PTAX_FRESH_MINUTES),
                chrono::Duration::days(config::PTAX_STALE_DAYS),
            ),
            RadarTickerKind::Crypto => (
                chrono::Duration::seconds(config::CRYPTO_FRESH_SECONDS),
                chrono::Duration::minutes(config::CRYPTO_STALE_MINUTES),
            ),
            _ => (
                chrono::Duration::minutes(config::EVENT_FRESH_MINUTES),
                chrono::Duration::hours(config::EVENT_STALE_HOURS),
            ),
        };
        RadarTickerItem {
            cache_state: age_state(observed_at, now, fresh, stale),
            ..item
        }
    }

    fn build_ticker_section(
        &self,
        now: DateTime<Utc>,
        warnings: &mut Vec<RadarWarningCode>,
    ) -> RadarSection<Vec<RadarTickerItem>> {
        let Ok(entries) = self.repository.ticker_entries() else {
            return RadarSection::unavailable();
        };
        let mut items: Vec<RadarTickerItem> = entries
            .into_iter()
            .filter_map(|(_, _, payload, _)| serde_json::from_str::<RadarTickerItem>(&payload).ok())
            .map(|item| Self::refresh_ticker_freshness(item, now))
            // Um item sem dado confiável some do ticker em vez de mentir.
            .filter(|item| item.cache_state != RadarCacheState::Unavailable)
            .collect();

        if let Ok(events) = self.repository.recent_events(config::MAX_TICKER_EVENTS) {
            for (payload, _) in events {
                if let Ok(item) = serde_json::from_str::<RadarTickerItem>(&payload) {
                    let item = Self::refresh_ticker_freshness(item, now);
                    if item.cache_state != RadarCacheState::Unavailable {
                        items.push(item);
                    }
                }
            }
        }

        if items.is_empty() {
            append_warning(warnings, RadarWarningCode::TickerUnavailable);
            return RadarSection::unavailable();
        }
        let any_stale = items
            .iter()
            .any(|item| item.cache_state == RadarCacheState::Stale);
        if any_stale {
            append_warning(warnings, RadarWarningCode::TickerPartiallyUnavailable);
        }
        items.sort_by(|left, right| left.id.cmp(&right.id));

        let oldest = items.iter().map(|item| item.observed_at.clone()).min();
        RadarSection::new(
            if any_stale {
                RadarCacheState::Stale
            } else {
                RadarCacheState::Fresh
            },
            items,
            oldest,
        )
    }

    /// Monta o snapshot exclusivamente a partir do cache local.
    pub fn build_snapshot(
        &self,
        request: &RadarSnapshotRequest,
        now: DateTime<Utc>,
    ) -> RadarSnapshot {
        let mut warnings = Vec::new();
        if self.repository.recovered_from_corruption() {
            append_warning(&mut warnings, RadarWarningCode::CacheRecovered);
        }
        let health = self.repository.all_provider_health().unwrap_or_default();

        let weather = self.build_weather_section(request.location.as_ref(), now, &mut warnings);
        let news = self.build_news_section(request, &health, now, &mut warnings);
        let ticker = self.build_ticker_section(now, &mut warnings);

        if news.state == RadarCacheState::Unavailable {
            append_warning(&mut warnings, RadarWarningCode::NewsAllSourcesUnavailable);
        }
        if health
            .iter()
            .any(|entry| entry.domain == RadarProviderDomain::News && entry.in_cooldown(now))
        {
            append_warning(&mut warnings, RadarWarningCode::ProviderCooldown);
        }

        let snapshot = RadarSnapshot {
            schema_version: RADAR_SCHEMA_VERSION,
            generated_at: now.to_rfc3339(),
            weather,
            news,
            ticker,
            providers: health
                .iter()
                .map(|entry| entry.to_status(now, false))
                .collect(),
            warnings,
        };

        let image_ids: Vec<String> = snapshot
            .news
            .data
            .as_ref()
            .into_iter()
            .flat_map(|collection| {
                collection
                    .lead
                    .iter()
                    .chain(collection.featured.iter())
                    .filter_map(|article| article.image.as_ref().map(|image| image.id.clone()))
            })
            .collect();
        let _ = self.repository.touch_images(&image_ids, now);
        snapshot
    }

    // -----------------------------------------------------------------------
    // Refresh
    // -----------------------------------------------------------------------

    fn should_refresh(
        &self,
        provider: &NewsProviderDefinition,
        health: &[ProviderHealth],
        now: DateTime<Utc>,
        force: bool,
    ) -> bool {
        if !provider.enabled {
            return false;
        }
        let entry = health.iter().find(|entry| entry.id == provider.id);
        // Cooldown é respeitado inclusive no refresh manual: é o mecanismo que
        // protege a fonte de um usuário insistente.
        if entry.map(|entry| entry.in_cooldown(now)).unwrap_or(false) {
            return false;
        }
        if force {
            return true;
        }
        match entry.and_then(|entry| entry.last_success_at) {
            Some(last) => {
                now.signed_duration_since(last)
                    >= chrono::Duration::from_std(provider.refresh_interval)
                        .unwrap_or_else(|_| chrono::Duration::minutes(15))
            }
            None => true,
        }
    }

    async fn fetch_provider(
        client: &SecureHttpClient,
        provider: &'static NewsProviderDefinition,
    ) -> Result<Vec<news::RawArticle>, ProviderError> {
        use super::http::{ExpectedContent, FetchSpec};

        let mut collected: Vec<news::RawArticle> = Vec::new();
        let mut last_error = None;

        for feed_url in provider.feed_urls {
            let url = match reqwest::Url::parse(feed_url) {
                Ok(url) => url,
                Err(_) => continue,
            };
            let expected = match provider.format {
                ProviderFormat::Feed => ExpectedContent::Feed,
                ProviderFormat::Json => ExpectedContent::Json,
            };
            let max_bytes = match provider.format {
                ProviderFormat::Feed => config::MAX_FEED_BYTES,
                ProviderFormat::Json => config::MAX_TABNEWS_BYTES,
            };

            let result = client
                .fetch(FetchSpec {
                    url,
                    allowlist: provider.feed_hosts,
                    max_bytes,
                    expected,
                    total_timeout: config::REQUEST_TIMEOUT,
                })
                .await
                .and_then(|body| match provider.format {
                    ProviderFormat::Feed => rss_atom::parse_feed(&body.bytes, provider),
                    ProviderFormat::Json => tabnews::parse_contents(&body.bytes, provider),
                });

            match result {
                // Uma editoria com problema não invalida as demais do provider.
                Ok(articles) => collected.extend(articles),
                Err(error) => last_error = Some(error),
            }
        }

        if collected.is_empty() {
            return Err(
                last_error.unwrap_or_else(|| ProviderError::new(ProviderErrorKind::Validation))
            );
        }
        if provider.format == ProviderFormat::Json {
            collected = tabnews::merge_strategies(collected, Vec::new());
        }
        collected.truncate(provider.max_items);
        Ok(collected)
    }

    /// Atualiza os domínios necessários e devolve o snapshot resultante.
    pub async fn refresh(&self, request: &RadarRefreshRequest) -> RadarSnapshot {
        let _guard = self.refresh_lock.lock().await;
        let now = Utc::now();
        let force = request.force_refresh;

        let Some(client) = self.client.clone() else {
            warn!("radar refresh skipped: error_kind=connection");
            return self.build_snapshot(&request.snapshot, now);
        };
        let health = self.repository.all_provider_health().unwrap_or_default();

        // --- Notícias, em lotes concorrentes limitados --------------------
        let due: Vec<&'static NewsProviderDefinition> = sources::NEWS_PROVIDERS
            .iter()
            .filter(|provider| self.should_refresh(provider, &health, now, force))
            .collect();

        let mut fetched: Vec<news::RawArticle> = Vec::new();
        for chunk in due.chunks(config::MAX_CONCURRENT_NEWS_PROVIDERS) {
            let results = join_all(chunk.iter().map(|provider| {
                let client = Arc::clone(&client);
                async move {
                    let _ = self.repository.record_attempt(provider.id, now);
                    (*provider, Self::fetch_provider(&client, provider).await)
                }
            }))
            .await;

            for (provider, result) in results {
                let mut metrics = self.metrics.lock().await;
                metrics.provider_fetch_started += 1;
                match result {
                    Ok(articles) => {
                        metrics.provider_fetch_succeeded += 1;
                        metrics.provider_items_received += articles.len() as u32;
                        drop(metrics);
                        let _ = self.repository.record_success(provider.id, now);
                        fetched.extend(articles);
                    }
                    Err(error) => {
                        metrics.provider_fetch_failed += 1;
                        drop(metrics);
                        // Log sem título, URL ou conteúdo do feed.
                        warn!(
                            "radar provider refresh failed provider={} error_kind={}",
                            provider.id,
                            error.kind.as_str()
                        );
                        let _ = self.repository.record_failure(provider.id, now, error.kind);
                    }
                }
            }
        }

        let images_failed = if fetched.is_empty() {
            false
        } else {
            self.persist_articles(fetched, now).await
        };

        // --- Clima ---------------------------------------------------------
        if let Some(location) = request.snapshot.location.as_ref() {
            let key = location_cache_key(location);
            let cached = self.repository.weather(&key).ok().flatten();
            let due = force
                || cached
                    .as_ref()
                    .map(|(_, fetched_at)| {
                        weather_state(*fetched_at, now) != RadarCacheState::Fresh
                    })
                    .unwrap_or(true);
            if due {
                let _ = self.repository.record_attempt(weather::PROVIDER_ID, now);
                match weather::fetch_weather(&client, location, &self.weather_mode).await {
                    Ok(data) => {
                        if let Ok(payload) = serde_json::to_string(&data) {
                            let _ = self.repository.put_weather(
                                &key,
                                &payload,
                                now,
                                now + chrono::Duration::minutes(config::WEATHER_FRESH_MINUTES),
                            );
                        }
                        let _ = self.repository.record_success(weather::PROVIDER_ID, now);
                    }
                    Err(error) => {
                        warn!(
                            "radar provider refresh failed provider={} error_kind={}",
                            weather::PROVIDER_ID,
                            error.kind.as_str()
                        );
                        let _ =
                            self.repository
                                .record_failure(weather::PROVIDER_ID, now, error.kind);
                    }
                }
            }
        }

        let ticker_symbols = if request.snapshot.ticker_symbols.is_empty() {
            vec!["usd-brl".to_string(), "eur-brl".to_string()]
        } else {
            request.snapshot.ticker_symbols.clone()
        };
        self.refresh_market(&client, now, &ticker_symbols).await;

        // Limpeza fora do caminho crítico e fora de qualquer transação de rede.
        if let Ok(orphans) = self.repository.prune(now) {
            self.remove_image_files(&orphans);
        }
        if let Ok(removed) = self
            .repository
            .evict_images_until((config::IMAGE_CACHE_QUOTA_BYTES as f64 * 0.9) as u64)
        {
            self.remove_image_files(&removed);
        }

        let mut snapshot = self.build_snapshot(&request.snapshot, now);
        if images_failed {
            append_warning(&mut snapshot.warnings, RadarWarningCode::ImagesUnavailable);
        }
        if snapshot.news.state == RadarCacheState::Unavailable {
            append_warning(&mut snapshot.warnings, RadarWarningCode::NewsRefreshFailed);
        }
        if request.snapshot.location.is_some()
            && snapshot.weather.state == RadarCacheState::Unavailable
        {
            append_warning(
                &mut snapshot.warnings,
                RadarWarningCode::WeatherRefreshFailed,
            );
        }
        snapshot
    }

    async fn download_and_store_image(
        &self,
        url: String,
        image_hosts: &'static [&'static str],
        now: DateTime<Utc>,
    ) -> Option<String> {
        let client = self.client.as_ref()?.clone();
        let image_url = security::validate_url_against_allowlist(&url, image_hosts).ok()?;
        let fetched = client
            .fetch(super::http::FetchSpec {
                url: image_url,
                allowlist: image_hosts,
                max_bytes: config::MAX_IMAGE_BYTES,
                expected: super::http::ExpectedContent::Image,
                total_timeout: config::IMAGE_TIMEOUT,
            })
            .await
            .ok()?;
        let prepared = tokio::task::spawn_blocking(move || prepare_image(&fetched.bytes))
            .await
            .ok()??;
        let repository = Arc::clone(&self.repository);
        tokio::task::spawn_blocking(move || persist_prepared_image(&repository, prepared, now))
            .await
            .ok()?
    }

    async fn discover_open_graph_image(
        &self,
        article_url: String,
        article_hosts: &'static [&'static str],
        image_hosts: &'static [&'static str],
        now: DateTime<Utc>,
    ) -> Option<String> {
        let client = self.client.as_ref()?.clone();
        let article_url = security::validate_url_against_allowlist(&article_url, article_hosts).ok()?;
        let fetched = client
            .fetch(super::http::FetchSpec {
                url: article_url,
                allowlist: article_hosts,
                max_bytes: config::MAX_OPEN_GRAPH_BYTES,
                expected: super::http::ExpectedContent::Html,
                total_timeout: config::REQUEST_TIMEOUT,
            })
            .await
            .ok()?;
        let image_url = extract_open_graph_image(&fetched.bytes)?;
        let image_url = fetched.final_url.join(&image_url).ok()?;
        let image_url = security::validate_url_against_allowlist(image_url.as_str(), image_hosts).ok()?;
        self.download_and_store_image(image_url.to_string(), image_hosts, now)
            .await
    }

    /// Normalizes, deduplicates, ranks, and persists one news batch.
    async fn persist_articles(&self, raw: Vec<news::RawArticle>, now: DateTime<Utc>) -> bool {
        let mut pending: Vec<PendingArticle> = Vec::with_capacity(raw.len());
        let mut rejected = 0u32;
        for article in &raw {
            let Some(provider) = sources::provider_by_id(&article.source_id) else {
                rejected += 1;
                continue;
            };
            match normalize::to_stored(article, provider, now) {
                Some(value) => pending.push(PendingArticle {
                    article: value,
                    media_url: article.best_media().map(|media| media.url.clone()),
                    article_hosts: provider.article_hosts,
                    image_hosts: provider.image_hosts,
                }),
                None => rejected += 1,
            }
        }

        // Reuse a local image before trying the feed URL again. A missing blob
        // is treated as a cache miss so it can be repaired by the next cycle.
        let existing_candidates: Vec<String> = pending
            .iter()
            .map(|entry| entry.article.id.clone())
            .collect();
        let repository = Arc::clone(&self.repository);
        let existing_images = tokio::task::spawn_blocking(move || {
            existing_candidates
                .into_iter()
                .filter_map(|article_id| {
                    let image_id = repository
                        .article_by_id(&article_id)
                        .ok()
                        .flatten()?
                        .image_id?;
                    let image = repository.image_by_id(&image_id).ok().flatten()?;
                    let path = repository.image_directory().join(&image.file_name);
                    path.is_file().then(|| (article_id, image.id))
                })
                .collect::<HashMap<_, _>>()
        })
        .await
        .unwrap_or_default();
        for entry in &mut pending {
            if let Some(image_id) = existing_images.get(&entry.article.id) {
                entry.article.image_id = Some(image_id.clone());
            } else {
                entry.article.image_id = None;
            }
        }

        // Images are optional enrichment. A failed image must never hide a
        // valid article or put its news provider into cooldown.
        let mut images_failed = false;
        let image_jobs: Vec<(usize, String, &'static [&'static str])> = pending
            .iter()
            .enumerate()
            .filter_map(|(index, entry)| {
                if entry.article.image_id.is_some() {
                    return None;
                }
                Some((index, entry.media_url.clone()?, entry.image_hosts))
            })
            .collect();
        for chunk in image_jobs.chunks(config::MAX_CONCURRENT_IMAGE_DOWNLOADS) {
            let results = join_all(chunk.iter().map(|(index, url, image_hosts)| {
                let url = url.clone();
                async move {
                    (
                        *index,
                        self.download_and_store_image(url, *image_hosts, now).await,
                    )
                }
            }))
            .await;
            for (index, image_id) in results {
                if image_id.is_none() {
                    images_failed = true;
                }
                pending[index].article.image_id = image_id;
            }
        }

        let open_graph_jobs: Vec<(
            usize,
            String,
            &'static [&'static str],
            &'static [&'static str],
        )> = pending
            .iter()
            .enumerate()
            .filter(|(_, entry)| {
                entry.article.image_id.is_none()
                    && !entry.article_hosts.is_empty()
                    && !entry.image_hosts.is_empty()
            })
            .take(config::MAX_OPEN_GRAPH_LOOKUPS_PER_CYCLE)
            .map(|(index, entry)| {
                (
                    index,
                    entry.article.canonical_url.clone(),
                    entry.article_hosts,
                    entry.image_hosts,
                )
            })
            .collect();
        for chunk in open_graph_jobs.chunks(config::MAX_CONCURRENT_IMAGE_DOWNLOADS) {
            let results = join_all(chunk.iter().map(|(index, article_url, article_hosts, image_hosts)| {
                let article_url = article_url.clone();
                async move {
                    (
                        *index,
                        self.discover_open_graph_image(
                            article_url,
                            *article_hosts,
                            *image_hosts,
                            now,
                        )
                        .await,
                    )
                }
            }))
            .await;
            for (index, image_id) in results {
                if image_id.is_none() {
                    images_failed = true;
                }
                pending[index].article.image_id = image_id;
            }
        }
        let mut stored: Vec<StoredArticle> = pending
            .into_iter()
            .map(|entry| entry.article)
            .collect();

        // A partir daqui é tudo CPU e SQLite: leitura da janela de dedupe,
        // comparação de bigramas e uma transação que pode escrever centenas de
        // linhas. Rodar isso direto no executor async travaria o IPC do Tauri,
        // então o bloco inteiro vai para `spawn_blocking`.
        let repository = Arc::clone(&self.repository);
        let joined = tokio::task::spawn_blocking(move || {
            // Artigos recentes já persistidos participam da deduplicação para
            // que um refresh não recrie duplicatas do ciclo anterior.
            if let Ok(existing) = repository
                .articles_since(now - chrono::Duration::hours(config::CLUSTER_WINDOW_HOURS))
            {
                let known: HashSet<String> =
                    stored.iter().map(|article| article.id.clone()).collect();
                stored.extend(
                    existing
                        .into_iter()
                        .filter(|article| !known.contains(&article.id)),
                );
            }

            let preferences = ranking::RankingPreferences::default();
            let outcome = dedupe::deduplicate_and_cluster(ranking::rank(stored, &preferences, now));
            let written = repository.upsert_articles(&outcome.articles).ok();
            (outcome, written)
        })
        .await;

        let Ok((outcome, written)) = joined else {
            warn!("radar article persistence task failed: error_kind=storage");
            return images_failed;
        };

        {
            let mut metrics = self.metrics.lock().await;
            metrics.provider_items_accepted += outcome.articles.len() as u32;
            metrics.provider_items_rejected += rejected;
            metrics.articles_deduplicated += outcome.duplicates_removed as u32;
            metrics.articles_clustered += outcome.clusters_formed as u32;
        }

        match written {
            Some(written) => info!(
                "radar articles persisted: written={written} deduplicated={} clustered={}",
                outcome.duplicates_removed, outcome.clusters_formed
            ),
            None => warn!("radar cache write failed: error_kind=storage"),
        }
        images_failed
    }

    async fn refresh_market(
        &self,
        client: &SecureHttpClient,
        now: DateTime<Utc>,
        ticker_symbols: &[String],
    ) {
        // PTAX: apenas as moedas efetivamente suportadas.
        for symbol in ticker_symbols {
            let symbol = symbol.as_str();
            let Some((currency, label)) = market::ptax_currency_for(symbol) else {
                continue;
            };
            let _ = self
                .repository
                .record_attempt(market::PTAX_PROVIDER_ID, now);
            match market::fetch_ptax(client, currency, now).await {
                Ok((rate, observed_at)) => {
                    let item = market::ptax_ticker_item(symbol, label, rate, observed_at, now);
                    if let Ok(payload) = serde_json::to_string(&item) {
                        let _ = self.repository.put_ticker(
                            market::PTAX_PROVIDER_ID,
                            symbol,
                            &payload,
                            now,
                            now + chrono::Duration::minutes(config::PTAX_FRESH_MINUTES),
                        );
                    }
                    let _ = self
                        .repository
                        .record_success(market::PTAX_PROVIDER_ID, now);
                }
                Err(error) => {
                    warn!(
                        "radar provider refresh failed provider={} error_kind={}",
                        market::PTAX_PROVIDER_ID,
                        error.kind.as_str()
                    );
                    let _ =
                        self.repository
                            .record_failure(market::PTAX_PROVIDER_ID, now, error.kind);
                }
            }
        }

        // Eventos USGS.
        let _ = self
            .repository
            .record_attempt(market::USGS_PROVIDER_ID, now);
        match market::fetch_events(client, now).await {
            Ok(events) => {
                let rows: Vec<(String, String, DateTime<Utc>)> = events
                    .iter()
                    .filter_map(|event| {
                        serde_json::to_string(&market::event_ticker_item(event, now))
                            .ok()
                            .map(|payload| {
                                (format!("usgs-{}", event.id), payload, event.occurred_at)
                            })
                    })
                    .collect();
                let _ = self.repository.put_events(
                    market::USGS_PROVIDER_ID,
                    &rows,
                    now,
                    now + chrono::Duration::minutes(config::EVENT_FRESH_MINUTES),
                );
                let _ = self
                    .repository
                    .record_success(market::USGS_PROVIDER_ID, now);
            }
            Err(error) => {
                warn!(
                    "radar provider refresh failed provider={} error_kind={}",
                    market::USGS_PROVIDER_ID,
                    error.kind.as_str()
                );
                let _ = self
                    .repository
                    .record_failure(market::USGS_PROVIDER_ID, now, error.kind);
            }
        }
    }

    fn remove_image_files(&self, file_names: &[String]) {
        for name in file_names {
            // Nome opaco gerado por nós; ainda assim recusamos separadores.
            if name.contains(['/', '\\']) || name.contains("..") {
                continue;
            }
            let _ = std::fs::remove_file(self.repository.image_directory().join(name));
        }
    }

    // -----------------------------------------------------------------------
    // Consultas por ID
    // -----------------------------------------------------------------------

    pub fn article_preview(&self, article_id: &str) -> Result<RadarArticlePreview, ProviderError> {
        if !security::is_valid_opaque_id(article_id) {
            return Err(ProviderError::new(ProviderErrorKind::Validation));
        }
        let now = Utc::now();
        let article = self
            .repository
            .article_by_id(article_id)?
            .ok_or_else(|| ProviderError::new(ProviderErrorKind::Validation))?;
        let provider = sources::provider_by_id(&article.provider_id);

        let related: Vec<RadarArticleSummary> = article
            .cluster_id
            .as_deref()
            .and_then(|cluster| {
                self.repository
                    .articles_in_cluster(cluster, &article.id, 4)
                    .ok()
            })
            .unwrap_or_default()
            .iter()
            .map(|related| self.to_summary(related, now, 0, false))
            .collect();

        // A abertura externa só é oferecida quando o host armazenado ainda
        // pertence à allowlist do provider.
        let can_open_externally = provider
            .map(|provider| Self::article_host_is_allowed(&article, provider))
            .unwrap_or(false);

        let image = self.image_ref(&article);
        if let Some(image) = image.as_ref() {
            let _ = self.repository.touch_images(&[image.id.clone()], now);
        }

        Ok(RadarArticlePreview {
            id: article.id.clone(),
            source_id: article.provider_id.clone(),
            source_name: provider
                .map(|provider| provider.name.to_string())
                .unwrap_or_else(|| article.provider_id.clone()),
            source_attribution: provider
                .map(|provider| provider.attribution.to_string())
                .unwrap_or_default(),
            category: article.category,
            title: article.title.clone(),
            summary: article.summary.as_deref().map(|value| {
                news::text::truncate_summary(value, config::MAX_PREVIEW_SUMMARY_CHARS)
            }),
            author: article.author.clone(),
            published_at: article.published_at.map(|value| value.to_rfc3339()),
            image,
            tags: article.tags.clone(),
            related,
            can_open_externally,
            cache_state: news_state(article.fetched_at, now),
        })
    }

    fn article_host_is_allowed(article: &StoredArticle, provider: &NewsProviderDefinition) -> bool {
        url::Url::parse(&article.canonical_url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_string))
            .map(|host| security::host_matches_allowlist(&host, provider.article_hosts))
            .unwrap_or(false)
    }

    /// Resolve o ID opaco para `(url, provider_id)`, revalidando a política.
    ///
    /// O `provider_id` volta junto para que o log de abertura registre a fonte
    /// em vez de um fragmento do identificador do artigo, que seria um
    /// correlacionador de leitura.
    pub fn resolve_article_url(&self, article_id: &str) -> Result<(String, String), ProviderError> {
        if !security::is_valid_opaque_id(article_id) {
            return Err(ProviderError::new(ProviderErrorKind::Validation));
        }
        let article = self
            .repository
            .article_by_id(article_id)?
            .ok_or_else(|| ProviderError::new(ProviderErrorKind::Validation))?;
        let provider = sources::provider_by_id(&article.provider_id)
            .ok_or_else(|| ProviderError::new(ProviderErrorKind::HostNotAllowed))?;

        // Revalida do zero: o banco pode ter sido adulterado desde a gravação.
        let url = security::validate_url_against_allowlist(
            &article.canonical_url,
            provider.article_hosts,
        )?;
        Ok((url.to_string(), provider.id.to_string()))
    }

    pub fn attribution_url(&self, provider_id: &str) -> Result<String, ProviderError> {
        if let Some(provider) = sources::provider_by_id(provider_id) {
            let url = security::validate_url_against_allowlist(
                provider.homepage_url,
                provider.article_hosts,
            )
            .or_else(|_| security::validate_https_url(provider.homepage_url))?;
            return Ok(url.to_string());
        }
        if provider_id == weather::PROVIDER_ID {
            return Ok(security::validate_https_url(weather::ATTRIBUTION_URL)?.to_string());
        }
        Err(ProviderError::new(ProviderErrorKind::HostNotAllowed))
    }

    pub async fn search_locations(
        &self,
        query: &str,
        locale: &str,
    ) -> Result<Vec<RadarLocation>, ProviderError> {
        let client = self
            .client
            .as_ref()
            .ok_or_else(|| ProviderError::new(ProviderErrorKind::Connection))?;
        weather::search_locations(client, query, locale).await
    }

    pub fn clear_cache(&self, scope: RadarCacheScope) -> Result<(), ProviderError> {
        let removed = self.repository.clear(scope)?;
        self.remove_image_files(&removed);
        info!("radar cache cleared: scope={scope:?}");
        Ok(())
    }
}

fn append_warning(warnings: &mut Vec<RadarWarningCode>, warning: RadarWarningCode) {
    if !warnings.contains(&warning) {
        warnings.push(warning);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_open_graph_images_from_both_attribute_orders() {
        let first = br#"<meta property="og:image" content="https://img.example/a.jpg">"#;
        let second = br#"<meta content="https://img.example/b.jpg" property="og:image">"#;
        assert_eq!(extract_open_graph_image(first).as_deref(), Some("https://img.example/a.jpg"));
        assert_eq!(extract_open_graph_image(second).as_deref(), Some("https://img.example/b.jpg"));
        assert!(extract_open_graph_image(br#"<meta property="og:image" content="">"#).is_none());
    }

    fn service() -> RadarService {
        let directory = std::env::temp_dir().join(format!(
            "focuswall-radar-service-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        RadarService::new(&directory).expect("service")
    }

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

    fn stored_with_tags(
        id: &str,
        provider: &str,
        title: &str,
        category: RadarNewsCategory,
        tags: Vec<String>,
    ) -> StoredArticle {
        StoredArticle {
            tags,
            ..stored(id, provider, title, category)
        }
    }

    fn stored(id: &str, provider: &str, title: &str, category: RadarNewsCategory) -> StoredArticle {
        let now = Utc::now();
        let url = format!("https://agenciabrasil.ebc.com.br/{id}");
        StoredArticle {
            id: security::stable_article_id(provider, &url),
            provider_id: provider.to_string(),
            canonical_url_hash: security::sha256_hex(&url),
            canonical_url: url,
            normalized_title: normalize::normalized_title(title),
            title: title.to_string(),
            summary: Some("Um resumo com tamanho suficiente para o card.".into()),
            author: None,
            category,
            tags: vec!["economia".into()],
            published_at: Some(now),
            fetched_at: now,
            image_id: None,
            score: 0.5,
            cluster_id: None,
            expires_at: now + chrono::Duration::days(30),
        }
    }

    #[test]
    fn a_fresh_install_reports_every_section_as_unavailable_without_inventing_data() {
        let service = service();
        let snapshot = service.build_snapshot(&RadarSnapshotRequest::default(), Utc::now());

        assert_eq!(snapshot.schema_version, RADAR_SCHEMA_VERSION);
        assert_eq!(snapshot.weather.state, RadarCacheState::Unavailable);
        assert_eq!(snapshot.news.state, RadarCacheState::Unavailable);
        assert_eq!(snapshot.ticker.state, RadarCacheState::Unavailable);
        assert!(snapshot.weather.data.is_none());
        assert!(snapshot.news.data.is_none());
        assert!(snapshot
            .warnings
            .contains(&RadarWarningCode::LocationRequired));
        // Todos os providers são anunciados mesmo sem dados, para a UI de status.
        assert!(snapshot.providers.len() >= sources::NEWS_PROVIDERS.len());
    }

    #[test]
    fn no_city_is_ever_assumed() {
        let service = service();
        let snapshot = service.build_snapshot(&RadarSnapshotRequest::default(), Utc::now());
        assert!(snapshot.weather.data.is_none());
        let serialized = serde_json::to_string(&snapshot).expect("json");
        for city in ["São Paulo", "Sao Paulo", "Brasília", "Rio de Janeiro"] {
            assert!(
                !serialized.contains(city),
                "cidade presumida no snapshot: {city}"
            );
        }
    }

    #[test]
    fn the_news_collection_splits_into_lead_featured_and_list() {
        let service = service();
        let now = Utc::now();
        let articles: Vec<StoredArticle> = (0..10)
            .map(|index| {
                stored(
                    &format!("a{index}"),
                    "agencia-brasil",
                    &format!("Notícia nacional número {index} do dia"),
                    RadarNewsCategory::Brasil,
                )
            })
            .collect();
        service
            .repository
            .upsert_articles(&articles)
            .expect("insert");

        let snapshot = service.build_snapshot(&RadarSnapshotRequest::default(), now);
        let collection = snapshot.news.data.expect("coleção");
        assert!(collection.lead.is_some(), "manchete principal");
        assert_eq!(collection.featured.len(), config::FEATURED_COUNT);
        assert_eq!(
            1 + collection.featured.len() + collection.list.len(),
            10.min(config::INITIAL_PAGE_SIZE)
        );
        assert_eq!(collection.total_available, 10);
        assert_eq!(
            collection.categories_available,
            vec![RadarNewsCategory::Brasil]
        );
    }

    #[test]
    fn no_summary_dto_leaks_a_canonical_url() {
        let service = service();
        service
            .repository
            .upsert_articles(&[stored(
                "a1",
                "agencia-brasil",
                "Uma notícia com título suficiente",
                RadarNewsCategory::Brasil,
            )])
            .expect("insert");

        let snapshot = service.build_snapshot(&RadarSnapshotRequest::default(), Utc::now());
        let serialized = serde_json::to_string(&snapshot).expect("json");
        assert!(!serialized.contains("agenciabrasil.ebc.com.br"));
        assert!(!serialized.contains("canonicalUrl"));
        assert!(!serialized.contains("https://"));
    }

    #[test]
    fn selecting_a_category_filters_the_collection() {
        let service = service();
        service
            .repository
            .upsert_articles(&[
                stored(
                    "a1",
                    "agencia-brasil",
                    "Notícia do Brasil de hoje",
                    RadarNewsCategory::Brasil,
                ),
                stored(
                    "a2",
                    "cert-br",
                    "Alerta de segurança divulgado hoje",
                    RadarNewsCategory::Security,
                ),
            ])
            .expect("insert");

        let request = RadarSnapshotRequest {
            selected_category: Some(RadarNewsCategory::Security),
            ..Default::default()
        };
        let snapshot = service.build_snapshot(&request, Utc::now());
        let collection = snapshot.news.data.expect("coleção");
        assert_eq!(collection.total_available, 1);
        assert_eq!(
            collection.lead.expect("lead").category,
            RadarNewsCategory::Security
        );
    }

    #[test]
    fn muted_sources_and_blocked_topics_remove_articles_from_the_collection() {
        let service = service();
        service
            .repository
            .upsert_articles(&[
                stored_with_tags(
                    "a1",
                    "agencia-brasil",
                    "Economia brasileira em alta hoje",
                    RadarNewsCategory::Brasil,
                    vec!["economia".into()],
                ),
                stored_with_tags(
                    "a2",
                    "cert-br",
                    "Vulnerabilidade crítica no sistema",
                    RadarNewsCategory::Security,
                    vec!["seguranca".into()],
                ),
            ])
            .expect("insert");

        let muted = service.build_snapshot(
            &RadarSnapshotRequest {
                muted_sources: vec!["cert-br".into()],
                ..Default::default()
            },
            Utc::now(),
        );
        assert_eq!(muted.news.data.expect("coleção").total_available, 1);

        let blocked = service.build_snapshot(
            &RadarSnapshotRequest {
                blocked_topics: vec!["economia".into()],
                ..Default::default()
            },
            Utc::now(),
        );
        let collection = blocked.news.data.expect("coleção");
        assert_eq!(collection.total_available, 1);
        assert_eq!(
            1 + collection.featured.len() + collection.list.len(),
            1,
            "o total anunciado não pode exceder o que é realmente entregue"
        );
    }

    #[test]
    fn the_announced_total_never_exceeds_what_the_user_can_reach() {
        let service = service();
        let now = Utc::now();
        let articles: Vec<StoredArticle> = (0..30)
            .map(|index| {
                stored_with_tags(
                    &format!("a{index}"),
                    "agencia-brasil",
                    &format!("Notícia nacional de número {index} publicada"),
                    RadarNewsCategory::Brasil,
                    // Metade carrega a tag que será bloqueada.
                    if index % 2 == 0 {
                        vec!["futebol".into()]
                    } else {
                        vec!["economia".into()]
                    },
                )
            })
            .collect();
        service
            .repository
            .upsert_articles(&articles)
            .expect("insert");

        let snapshot = service.build_snapshot(
            &RadarSnapshotRequest {
                blocked_topics: vec!["futebol".into()],
                page_size: Some(100),
                ..Default::default()
            },
            now,
        );
        let collection = snapshot.news.data.expect("coleção");
        let delivered = 1 + collection.featured.len() + collection.list.len();
        assert_eq!(delivered, 15, "só as 15 não bloqueadas são entregues");
        assert!(
            collection.total_available <= delivered,
            "total {} maior do que os {delivered} entregues",
            collection.total_available
        );
    }

    #[test]
    fn stale_articles_are_served_with_an_explicit_warning() {
        let service = service();
        let now = Utc::now();
        let mut old = stored(
            "a1",
            "agencia-brasil",
            "Notícia antiga porém válida",
            RadarNewsCategory::Brasil,
        );
        old.fetched_at = now - chrono::Duration::hours(2);
        service.repository.upsert_articles(&[old]).expect("insert");

        let snapshot = service.build_snapshot(&RadarSnapshotRequest::default(), now);
        assert_eq!(snapshot.news.state, RadarCacheState::Stale);
        assert!(snapshot
            .warnings
            .contains(&RadarWarningCode::NewsUsingStaleCache));
        assert!(snapshot.news.data.is_some(), "stale ainda é exibido");
    }

    #[test]
    fn weather_falls_back_to_the_emergency_cache_with_a_strong_warning() {
        let service = service();
        let now = Utc::now();
        let weather = RadarWeather {
            location: location(),
            timezone: "America/Sao_Paulo".into(),
            provider_id: weather::PROVIDER_ID.into(),
            provider_name: weather::PROVIDER_NAME.into(),
            current: RadarWeatherCurrent {
                observed_at_local: "2026-07-29T12:00".into(),
                temperature_celsius: 22.0,
                apparent_temperature_celsius: 22.0,
                humidity_percent: 60.0,
                precipitation_probability_percent: None,
                precipitation_mm: None,
                rain_mm: None,
                wind_speed_kmh: 10.0,
                wind_gusts_kmh: None,
                surface_pressure_hpa: None,
                weather_code: 1,
                is_day: true,
            },
            today: RadarWeatherDay {
                date: "2026-07-29".into(),
                minimum_celsius: 15.0,
                maximum_celsius: 25.0,
                precipitation_probability_percent: None,
                precipitation_sum_mm: None,
                wind_speed_max_kmh: None,
                uv_index_max: None,
                weather_code: 1,
                sunrise_local: None,
                sunset_local: None,
            },
            hourly: Vec::new(),
            daily: Vec::new(),
            alerts: Vec::new(),
        };
        let payload = serde_json::to_string(&weather).expect("json");
        let key = location_cache_key(&location());

        // 10 horas: além do stale (6 h) mas dentro da emergência (24 h).
        let fetched = now - chrono::Duration::hours(10);
        service
            .repository
            .put_weather(&key, &payload, fetched, fetched)
            .expect("put");

        let request = RadarSnapshotRequest {
            location: Some(location()),
            ..Default::default()
        };
        let snapshot = service.build_snapshot(&request, now);
        assert!(snapshot.weather.data.is_some());
        assert!(snapshot
            .warnings
            .contains(&RadarWarningCode::WeatherUsingEmergencyCache));
    }

    #[test]
    fn weather_older_than_the_emergency_window_disappears() {
        let service = service();
        let now = Utc::now();
        let key = location_cache_key(&location());
        let fetched = now - chrono::Duration::hours(config::WEATHER_EMERGENCY_HOURS + 2);
        service
            .repository
            .put_weather(&key, "{}", fetched, fetched)
            .expect("put");

        let snapshot = service.build_snapshot(
            &RadarSnapshotRequest {
                location: Some(location()),
                ..Default::default()
            },
            now,
        );
        assert_eq!(snapshot.weather.state, RadarCacheState::Unavailable);
    }

    #[test]
    fn opening_an_article_requires_a_valid_opaque_id_that_exists() {
        let service = service();
        for invalid in ["", "../../etc/passwd", "https://evil.com", &"z".repeat(64)] {
            assert!(
                service.resolve_article_url(invalid).is_err(),
                "aceitou id inválido: {invalid}"
            );
        }
        // ID bem formado porém inexistente.
        assert!(service.resolve_article_url(&"a".repeat(64)).is_err());
    }

    #[test]
    fn a_stored_article_resolves_to_its_canonical_url_after_revalidation() {
        let service = service();
        let article = stored(
            "a1",
            "agencia-brasil",
            "Notícia com título válido",
            RadarNewsCategory::Brasil,
        );
        let id = article.id.clone();
        let expected = article.canonical_url.clone();
        service
            .repository
            .upsert_articles(&[article])
            .expect("insert");

        assert_eq!(
            service.resolve_article_url(&id).expect("url"),
            (expected, "agencia-brasil".to_string()),
            "a resolução devolve a fonte junto para que o log não use o id do artigo"
        );
    }

    #[test]
    fn a_tampered_host_in_the_database_is_refused_at_open_time() {
        let service = service();
        let mut article = stored(
            "a1",
            "agencia-brasil",
            "Notícia adulterada no banco",
            RadarNewsCategory::Brasil,
        );
        // Simula banco adulterado: host que não pertence ao provider.
        article.canonical_url = "https://exemplo-malicioso.com/a".into();
        let id = article.id.clone();
        service
            .repository
            .upsert_articles(&[article])
            .expect("insert");

        let error = service
            .resolve_article_url(&id)
            .expect_err("host divergente");
        assert_eq!(error.kind, ProviderErrorKind::HostNotAllowed);

        // O preview também não oferece o botão de abertura externa.
        let preview = service.article_preview(&id).expect("preview");
        assert!(!preview.can_open_externally);
    }

    #[test]
    fn the_preview_carries_attribution_and_never_the_url() {
        let service = service();
        let article = stored(
            "a1",
            "agencia-brasil",
            "Notícia com título válido",
            RadarNewsCategory::Brasil,
        );
        let id = article.id.clone();
        service
            .repository
            .upsert_articles(&[article])
            .expect("insert");

        let preview = service.article_preview(&id).expect("preview");
        assert_eq!(preview.source_name, "Agência Brasil");
        assert!(preview.source_attribution.contains("EBC"));
        assert!(preview.can_open_externally);
        let serialized = serde_json::to_string(&preview).expect("json");
        assert!(!serialized.contains("https://"));
        assert!(!serialized.contains("canonicalUrl"));
    }

    #[test]
    fn preview_of_an_unknown_article_fails_cleanly() {
        let service = service();
        assert!(service.article_preview(&"b".repeat(64)).is_err());
        assert!(service.article_preview("id-curto").is_err());
    }

    #[test]
    fn attribution_urls_resolve_only_for_known_providers() {
        let service = service();
        assert!(service.attribution_url("agencia-brasil").is_ok());
        assert!(service.attribution_url(weather::PROVIDER_ID).is_ok());
        assert!(service.attribution_url("provider-inexistente").is_err());
        assert!(service.attribution_url("../../etc").is_err());
    }

    #[test]
    fn every_provider_has_a_resolvable_attribution_link() {
        // A atribuição é obrigatória ao exibir conteúdo de terceiros. Um
        // provider novo cuja homepage não bata com `article_hosts` quebraria o
        // link silenciosamente, então travamos todos aqui.
        let service = service();
        for provider in sources::NEWS_PROVIDERS {
            let url = service
                .attribution_url(provider.id)
                .unwrap_or_else(|_| panic!("atribuição não resolvida para {}", provider.id));
            assert!(
                url.starts_with("https://"),
                "{} devolveu {url}",
                provider.id
            );
            assert!(
                !provider.attribution.trim().is_empty(),
                "{} não declara texto de atribuição",
                provider.id
            );
        }
    }

    #[test]
    fn a_provider_in_cooldown_is_skipped_even_on_a_forced_refresh() {
        let service = service();
        let now = Utc::now();
        // Duas falhas colocam o provider em cooldown.
        for _ in 0..2 {
            service
                .repository
                .record_failure("agencia-brasil", now, ProviderErrorKind::Http5xx)
                .expect("failure");
        }
        let health = service.repository.all_provider_health().expect("health");
        let provider = sources::provider_by_id("agencia-brasil").expect("provider");

        assert!(!service.should_refresh(provider, &health, now, false));
        assert!(
            !service.should_refresh(provider, &health, now, true),
            "o refresh manual não pode furar o cooldown da fonte"
        );

        // Depois do cooldown, volta a ser elegível.
        let later = now + chrono::Duration::minutes(config::COOLDOWN_MAX_MINUTES + 1);
        assert!(service.should_refresh(provider, &health, later, false));
    }

    #[test]
    fn a_provider_respects_its_own_refresh_interval() {
        let service = service();
        let now = Utc::now();
        service
            .repository
            .record_success("agencia-brasil", now)
            .expect("success");
        let health = service.repository.all_provider_health().expect("health");
        let provider = sources::provider_by_id("agencia-brasil").expect("provider");

        assert!(!service.should_refresh(provider, &health, now, false));
        assert!(
            service.should_refresh(provider, &health, now, true),
            "refresh manual ignora o TTL, mas não o cooldown"
        );
        let later = now + chrono::Duration::from_std(provider.refresh_interval).expect("duração");
        assert!(service.should_refresh(provider, &health, later, false));
    }

    #[test]
    fn provider_cooldown_surfaces_as_a_snapshot_warning_and_status() {
        let service = service();
        let now = Utc::now();
        for _ in 0..2 {
            service
                .repository
                .record_failure("tecnoblog", now, ProviderErrorKind::Timeout)
                .expect("failure");
        }
        let snapshot = service.build_snapshot(&RadarSnapshotRequest::default(), now);
        assert!(snapshot
            .warnings
            .contains(&RadarWarningCode::ProviderCooldown));
        let status = snapshot
            .providers
            .iter()
            .find(|provider| provider.provider_id == "tecnoblog")
            .expect("status");
        assert_eq!(status.state, RadarProviderState::Cooldown);
        assert_eq!(status.error_code.as_deref(), Some("timeout"));
        assert!(status.next_attempt_at.is_some());
    }

    #[test]
    fn one_failing_provider_does_not_hide_the_others_articles() {
        let service = service();
        let now = Utc::now();
        service
            .repository
            .record_failure("tecnoblog", now, ProviderErrorKind::Timeout)
            .expect("failure");
        service
            .repository
            .upsert_articles(&[stored(
                "a1",
                "agencia-brasil",
                "Notícia que continua disponível",
                RadarNewsCategory::Brasil,
            )])
            .expect("insert");

        let snapshot = service.build_snapshot(&RadarSnapshotRequest::default(), now);
        assert!(
            snapshot.news.data.is_some(),
            "falha parcial não zera a seção"
        );
        assert_eq!(
            snapshot
                .providers
                .iter()
                .filter(|provider| provider.state == RadarProviderState::Failed)
                .count(),
            1
        );
    }

    #[test]
    fn clearing_the_news_scope_keeps_provider_health() {
        let service = service();
        let now = Utc::now();
        service
            .repository
            .record_success("agencia-brasil", now)
            .expect("success");
        service
            .repository
            .upsert_articles(&[stored(
                "a1",
                "agencia-brasil",
                "Notícia qualquer nacional",
                RadarNewsCategory::Brasil,
            )])
            .expect("insert");

        service.clear_cache(RadarCacheScope::News).expect("clear");
        assert_eq!(service.repository.count_articles().expect("count"), 0);
        let health = service
            .repository
            .provider_health("agencia-brasil")
            .expect("health")
            .expect("presente");
        assert!(health.last_success_at.is_some());
    }

    #[test]
    fn image_file_removal_refuses_path_traversal() {
        let service = service();
        // Não deve entrar em pânico nem tocar em nada fora do diretório.
        service.remove_image_files(&[
            "../../../windows/system32/config".to_string(),
            "sub/dir.jpg".to_string(),
            "ok.jpg".to_string(),
        ]);
    }

    #[test]
    fn pagination_reports_more_pages_without_returning_everything() {
        let service = service();
        let articles: Vec<StoredArticle> = (0..40)
            .map(|index| {
                stored(
                    &format!("a{index}"),
                    "agencia-brasil",
                    &format!("Notícia nacional de número {index} publicada"),
                    RadarNewsCategory::Brasil,
                )
            })
            .collect();
        service
            .repository
            .upsert_articles(&articles)
            .expect("insert");

        let snapshot = service.build_snapshot(&RadarSnapshotRequest::default(), Utc::now());
        let collection = snapshot.news.data.expect("coleção");
        assert!(collection.has_more);
        let returned = 1 + collection.featured.len() + collection.list.len();
        assert_eq!(returned, config::INITIAL_PAGE_SIZE);
        assert_eq!(
            collection.total_available, 40,
            "o total precisa refletir o acervo, não o tamanho da página"
        );

        // Página maior devolve mais itens.
        let bigger = service.build_snapshot(
            &RadarSnapshotRequest {
                page_size: Some(30),
                ..Default::default()
            },
            Utc::now(),
        );
        let collection = bigger.news.data.expect("coleção");
        assert_eq!(1 + collection.featured.len() + collection.list.len(), 30);
    }
}
