//! Repositório SQLite do cache Radar.
//!
//! O banco vive em `$APP_CACHE/focuswall/radar/` e é totalmente descartável: o
//! estado funcional do FocusWall (`dashboard-state.json`) nunca passa por aqui.
//! Nenhuma consulta SQL é exposta ao frontend.
//!
//! A API de imagens mantém inserção, busca por hash, LRU, quota e limpeza de
//! órfãos em um único repositório.
#![allow(dead_code)]

use super::{
    config,
    error::{ProviderError, ProviderErrorKind},
    migrations,
    models::{
        ProviderHealth, RadarCacheScope, RadarNewsCategory, RadarProviderDomain, StoredArticle,
        StoredImage,
    },
};
use chrono::{DateTime, SecondsFormat, Utc};
use log::{info, warn};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

/// `(provider_id, symbol, payload_json, fetched_at)`.
pub type TickerRow = (String, String, String, DateTime<Utc>);

pub const DATABASE_FILE_NAME: &str = "radar-cache-v2.sqlite";
pub const IMAGE_DIRECTORY_NAME: &str = "images-v2";

// ---------------------------------------------------------------------------
// Conversão de timestamps
// ---------------------------------------------------------------------------

/// Formato fixo em UTC com milissegundos, de modo que a ordenação
/// lexicográfica do SQLite coincida com a ordenação cronológica.
pub fn to_sql_time(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn from_sql_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|parsed| parsed.with_timezone(&Utc))
}

/// Colunas `NOT NULL` de timestamp: um valor ilegível indica banco adulterado,
/// então caímos em "agora" em vez de descartar a linha inteira.
fn required_sql_time(value: String) -> DateTime<Utc> {
    from_sql_time(&value).unwrap_or_else(Utc::now)
}

// ---------------------------------------------------------------------------
// Repositório
// ---------------------------------------------------------------------------

pub struct RadarRepository {
    connection: Mutex<Connection>,
    image_directory: PathBuf,
    /// Verdadeiro quando o banco anterior estava corrompido e foi reconstruído.
    recovered_from_corruption: bool,
}

fn configure(connection: &Connection) -> rusqlite::Result<()> {
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

fn open_and_migrate(path: &Path) -> rusqlite::Result<Connection> {
    let mut connection = Connection::open(path)?;
    configure(&connection)?;
    // `integrity_check` barato: detecta corrupção estrutural antes de migrar.
    let integrity: String = connection.query_row("PRAGMA quick_check(1)", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(migrations::schema_error("radar cache failed quick_check"));
    }
    migrations::migrate(&mut connection)?;
    Ok(connection)
}

/// Move o banco corrompido para `.corrupt-<timestamp>` junto com os sidecars
/// WAL/SHM, para que o próximo `open` comece limpo sem apagar evidência.
fn quarantine(path: &Path) {
    let stamp = Utc::now().format("%Y%m%d%H%M%S");
    for suffix in ["", "-wal", "-shm"] {
        let source = if suffix.is_empty() {
            path.to_path_buf()
        } else {
            PathBuf::from(format!("{}{suffix}", path.display()))
        };
        if !source.exists() {
            continue;
        }
        let target = PathBuf::from(format!("{}.corrupt-{stamp}{suffix}", path.display()));
        if std::fs::rename(&source, &target).is_err() {
            let _ = std::fs::remove_file(&source);
        }
    }
}

impl RadarRepository {
    /// Abre o banco; em caso de corrupção, coloca o arquivo em quarentena e
    /// reconstrói do zero. O estado funcional nunca é afetado.
    pub fn open_or_rebuild(directory: &Path) -> Result<Self, ProviderError> {
        std::fs::create_dir_all(directory)
            .map_err(|_| ProviderError::new(ProviderErrorKind::Storage))?;
        let image_directory = directory.join(IMAGE_DIRECTORY_NAME);
        std::fs::create_dir_all(&image_directory)
            .map_err(|_| ProviderError::new(ProviderErrorKind::Storage))?;
        let path = directory.join(DATABASE_FILE_NAME);

        match open_and_migrate(&path) {
            Ok(connection) => Ok(Self {
                connection: Mutex::new(connection),
                image_directory,
                recovered_from_corruption: false,
            }),
            Err(_) => {
                warn!("radar cache corruption detected; rebuilding cache");
                quarantine(&path);
                let connection = open_and_migrate(&path).map_err(|_| {
                    warn!("radar cache rebuild failed: error_kind=storage");
                    ProviderError::new(ProviderErrorKind::Storage)
                })?;
                info!("radar cache_corruption_recovered");
                Ok(Self {
                    connection: Mutex::new(connection),
                    image_directory,
                    recovered_from_corruption: true,
                })
            }
        }
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, ProviderError> {
        let mut connection = Connection::open_in_memory()
            .map_err(|_| ProviderError::new(ProviderErrorKind::Storage))?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|_| ProviderError::new(ProviderErrorKind::Storage))?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(|_| ProviderError::new(ProviderErrorKind::Storage))?;
        migrations::migrate(&mut connection)
            .map_err(|_| ProviderError::new(ProviderErrorKind::Storage))?;
        Ok(Self {
            connection: Mutex::new(connection),
            image_directory: std::env::temp_dir().join("focuswall-radar-test-images"),
            recovered_from_corruption: false,
        })
    }

    pub fn recovered_from_corruption(&self) -> bool {
        self.recovered_from_corruption
    }

    pub fn image_directory(&self) -> &Path {
        &self.image_directory
    }

    fn with<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> rusqlite::Result<T>,
    ) -> Result<T, ProviderError> {
        let mut guard = self
            .connection
            .lock()
            .map_err(|_| ProviderError::new(ProviderErrorKind::Storage))?;
        operation(&mut guard).map_err(ProviderError::from)
    }

    // -----------------------------------------------------------------------
    // Provider health
    // -----------------------------------------------------------------------

    /// Registra os providers conhecidos preservando a saúde já acumulada.
    ///
    /// O flag `enabled` vem da definição estática e é reaplicado a cada boot:
    /// desligar um provider na build precisa refletir no status exibido, mesmo
    /// que ele já estivesse registrado como ativo.
    pub fn register_providers(
        &self,
        providers: &[(&str, &str, RadarProviderDomain, bool)],
    ) -> Result<(), ProviderError> {
        self.with(|connection| {
            let transaction = connection.transaction()?;
            for (id, name, domain, enabled) in providers {
                transaction.execute(
                    "INSERT INTO radar_provider (id, display_name, domain, enabled)
                     VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(id) DO UPDATE SET display_name = ?2, domain = ?3, enabled = ?4",
                    params![id, name, domain.as_str(), i64::from(*enabled)],
                )?;
            }
            transaction.commit()
        })
    }

    pub fn all_provider_health(&self) -> Result<Vec<ProviderHealth>, ProviderError> {
        self.with(|connection| {
            let mut statement = connection.prepare(
                "SELECT id, display_name, domain, enabled, last_attempt_at, last_success_at,
                        last_failure_at, consecutive_failures, cooldown_until, last_error_code
                 FROM radar_provider ORDER BY id",
            )?;
            let rows = statement.query_map([], |row| {
                let domain: String = row.get(2)?;
                Ok(ProviderHealth {
                    id: row.get(0)?,
                    display_name: row.get(1)?,
                    domain: RadarProviderDomain::parse(&domain)
                        .unwrap_or(RadarProviderDomain::News),
                    enabled: row.get::<_, i64>(3)? == 1,
                    last_attempt_at: row
                        .get::<_, Option<String>>(4)?
                        .as_deref()
                        .and_then(from_sql_time),
                    last_success_at: row
                        .get::<_, Option<String>>(5)?
                        .as_deref()
                        .and_then(from_sql_time),
                    last_failure_at: row
                        .get::<_, Option<String>>(6)?
                        .as_deref()
                        .and_then(from_sql_time),
                    consecutive_failures: row.get::<_, i64>(7)?.max(0) as u32,
                    cooldown_until: row
                        .get::<_, Option<String>>(8)?
                        .as_deref()
                        .and_then(from_sql_time),
                    last_error_code: row.get(9)?,
                })
            })?;
            rows.collect()
        })
    }

    pub fn provider_health(&self, id: &str) -> Result<Option<ProviderHealth>, ProviderError> {
        Ok(self
            .all_provider_health()?
            .into_iter()
            .find(|health| health.id == id))
    }

    pub fn record_attempt(&self, id: &str, now: DateTime<Utc>) -> Result<(), ProviderError> {
        self.with(|connection| {
            connection
                .execute(
                    "UPDATE radar_provider SET last_attempt_at = ?2 WHERE id = ?1",
                    params![id, to_sql_time(now)],
                )
                .map(|_| ())
        })
    }

    pub fn record_success(&self, id: &str, now: DateTime<Utc>) -> Result<(), ProviderError> {
        self.with(|connection| {
            connection
                .execute(
                    "UPDATE radar_provider
                     SET last_success_at = ?2, last_attempt_at = ?2, consecutive_failures = 0,
                         cooldown_until = NULL, last_error_code = NULL
                     WHERE id = ?1",
                    params![id, to_sql_time(now)],
                )
                .map(|_| ())
        })
    }

    /// Contabiliza a falha e aplica cooldown exponencial com teto.
    pub fn record_failure(
        &self,
        id: &str,
        now: DateTime<Utc>,
        kind: ProviderErrorKind,
    ) -> Result<(), ProviderError> {
        let counts = kind.counts_toward_cooldown();
        self.with(move |connection| {
            let failures: i64 = connection
                .query_row(
                    "SELECT consecutive_failures FROM radar_provider WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .optional()?
                .unwrap_or(0);
            let next_failures = if counts { failures + 1 } else { failures };
            let cooldown_until = if counts
                && next_failures >= i64::from(config::FAILURES_BEFORE_COOLDOWN)
            {
                let exponent = (next_failures - i64::from(config::FAILURES_BEFORE_COOLDOWN)).min(6);
                let minutes = (config::COOLDOWN_BASE_MINUTES * (1 << exponent))
                    .min(config::COOLDOWN_MAX_MINUTES);
                Some(to_sql_time(now + chrono::Duration::minutes(minutes)))
            } else {
                None
            };
            connection
                .execute(
                    "UPDATE radar_provider
                     SET last_failure_at = ?2, last_attempt_at = ?2, consecutive_failures = ?3,
                         cooldown_until = ?4, last_error_code = ?5
                     WHERE id = ?1",
                    params![
                        id,
                        to_sql_time(now),
                        next_failures,
                        cooldown_until,
                        kind.as_str()
                    ],
                )
                .map(|_| ())
        })
    }

    // -----------------------------------------------------------------------
    // Artigos
    // -----------------------------------------------------------------------

    /// Grava um lote inteiro em uma única transação. Artigos já conhecidos
    /// preservam `fetched_at` original, para que a idade exibida não seja
    /// reiniciada a cada refresh.
    pub fn upsert_articles(&self, articles: &[StoredArticle]) -> Result<usize, ProviderError> {
        if articles.is_empty() {
            return Ok(0);
        }
        self.with(|connection| {
            let transaction = connection.transaction()?;
            let mut written = 0usize;
            {
                let mut statement = transaction.prepare(
                    "INSERT INTO radar_article (
                        id, provider_id, canonical_url, canonical_url_hash, normalized_title,
                        title, summary, author, category, tags_json, published_at, fetched_at,
                        image_id, score, cluster_id, expires_at
                     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
                     ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        summary = COALESCE(excluded.summary, radar_article.summary),
                        author = COALESCE(excluded.author, radar_article.author),
                        category = excluded.category,
                        tags_json = excluded.tags_json,
                        published_at = COALESCE(excluded.published_at, radar_article.published_at),
                        image_id = COALESCE(excluded.image_id, radar_article.image_id),
                        score = excluded.score,
                        cluster_id = excluded.cluster_id,
                        expires_at = excluded.expires_at",
                )?;
                for article in articles {
                    let tags = serde_json::to_string(&article.tags).unwrap_or_else(|_| "[]".into());
                    written += statement.execute(params![
                        article.id,
                        article.provider_id,
                        article.canonical_url,
                        article.canonical_url_hash,
                        article.normalized_title,
                        article.title,
                        article.summary,
                        article.author,
                        article.category.as_str(),
                        tags,
                        article.published_at.map(to_sql_time),
                        to_sql_time(article.fetched_at),
                        article.image_id,
                        article.score,
                        article.cluster_id,
                        to_sql_time(article.expires_at),
                    ])?;
                }
            }
            transaction.commit()?;
            Ok(written)
        })
    }

    fn row_to_article(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredArticle> {
        let category: String = row.get(8)?;
        let tags: String = row.get(9)?;
        Ok(StoredArticle {
            id: row.get(0)?,
            provider_id: row.get(1)?,
            canonical_url: row.get(2)?,
            canonical_url_hash: row.get(3)?,
            normalized_title: row.get(4)?,
            title: row.get(5)?,
            summary: row.get(6)?,
            author: row.get(7)?,
            category: RadarNewsCategory::parse(&category).unwrap_or(RadarNewsCategory::World),
            tags: serde_json::from_str(&tags).unwrap_or_default(),
            published_at: row
                .get::<_, Option<String>>(10)?
                .as_deref()
                .and_then(from_sql_time),
            fetched_at: required_sql_time(row.get(11)?),
            image_id: row.get(12)?,
            score: row.get(13)?,
            cluster_id: row.get(14)?,
            expires_at: required_sql_time(row.get(15)?),
        })
    }

    const ARTICLE_COLUMNS: &'static str = "id, provider_id, canonical_url, canonical_url_hash,
         normalized_title, title, summary, author, category, tags_json, published_at, fetched_at,
         image_id, score, cluster_id, expires_at";

    /// Artigos ainda válidos, ordenados por score decrescente. Filtros de
    /// categoria e de fonte silenciada são aplicados no SQL para não trazer
    /// linhas desnecessárias à memória.
    pub fn articles(
        &self,
        categories: &[RadarNewsCategory],
        muted_sources: &[String],
        now: DateTime<Utc>,
        limit: usize,
    ) -> Result<Vec<StoredArticle>, ProviderError> {
        if categories.is_empty() {
            return Ok(Vec::new());
        }
        let category_placeholders = (0..categories.len())
            .map(|index| format!("?{}", index + 2))
            .collect::<Vec<_>>()
            .join(",");
        let muted_offset = categories.len() + 2;
        let muted_placeholders = (0..muted_sources.len())
            .map(|index| format!("?{}", index + muted_offset))
            .collect::<Vec<_>>()
            .join(",");
        let muted_clause = if muted_sources.is_empty() {
            String::new()
        } else {
            format!(" AND provider_id NOT IN ({muted_placeholders})")
        };
        let sql = format!(
            "SELECT {columns} FROM radar_article
             WHERE expires_at > ?1 AND category IN ({category_placeholders}){muted_clause}
             ORDER BY score DESC, published_at DESC, id ASC
             LIMIT {limit}",
            columns = Self::ARTICLE_COLUMNS,
            limit = limit.clamp(1, 500)
        );

        self.with(move |connection| {
            let mut statement = connection.prepare(&sql)?;
            let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            values.push(Box::new(to_sql_time(now)));
            for category in categories {
                values.push(Box::new(category.as_str().to_string()));
            }
            for source in muted_sources {
                values.push(Box::new(source.clone()));
            }
            let references: Vec<&dyn rusqlite::ToSql> =
                values.iter().map(|value| value.as_ref()).collect();
            let rows = statement.query_map(references.as_slice(), Self::row_to_article)?;
            rows.collect()
        })
    }

    pub fn article_by_id(&self, id: &str) -> Result<Option<StoredArticle>, ProviderError> {
        let sql = format!(
            "SELECT {} FROM radar_article WHERE id = ?1",
            Self::ARTICLE_COLUMNS
        );
        self.with(move |connection| {
            connection
                .query_row(&sql, params![id], Self::row_to_article)
                .optional()
        })
    }

    pub fn articles_in_cluster(
        &self,
        cluster_id: &str,
        exclude_id: &str,
        limit: usize,
    ) -> Result<Vec<StoredArticle>, ProviderError> {
        let sql = format!(
            "SELECT {} FROM radar_article
             WHERE cluster_id = ?1 AND id <> ?2
             ORDER BY score DESC, published_at DESC LIMIT ?3",
            Self::ARTICLE_COLUMNS
        );
        self.with(move |connection| {
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map(
                params![cluster_id, exclude_id, limit as i64],
                Self::row_to_article,
            )?;
            rows.collect()
        })
    }

    /// Artigos recentes usados como base para deduplicação por similaridade.
    pub fn articles_since(
        &self,
        since: DateTime<Utc>,
    ) -> Result<Vec<StoredArticle>, ProviderError> {
        let sql = format!(
            "SELECT {} FROM radar_article WHERE fetched_at >= ?1 ORDER BY fetched_at DESC LIMIT 2000",
            Self::ARTICLE_COLUMNS
        );
        self.with(move |connection| {
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map(params![to_sql_time(since)], Self::row_to_article)?;
            rows.collect()
        })
    }

    /// Conta artigos válidos para os mesmos filtros usados em [`Self::articles`].
    ///
    /// Existe porque `articles` aplica `LIMIT`: usar o tamanho da página como
    /// total faria a UI anunciar menos matérias do que realmente existem.
    pub fn count_articles_matching(
        &self,
        categories: &[RadarNewsCategory],
        muted_sources: &[String],
        now: DateTime<Utc>,
    ) -> Result<usize, ProviderError> {
        if categories.is_empty() {
            return Ok(0);
        }
        let category_placeholders = (0..categories.len())
            .map(|index| format!("?{}", index + 2))
            .collect::<Vec<_>>()
            .join(",");
        let muted_offset = categories.len() + 2;
        let muted_clause = if muted_sources.is_empty() {
            String::new()
        } else {
            let placeholders = (0..muted_sources.len())
                .map(|index| format!("?{}", index + muted_offset))
                .collect::<Vec<_>>()
                .join(",");
            format!(" AND provider_id NOT IN ({placeholders})")
        };
        let sql = format!(
            "SELECT COUNT(*) FROM radar_article
             WHERE expires_at > ?1 AND category IN ({category_placeholders}){muted_clause}"
        );

        self.with(move |connection| {
            let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            values.push(Box::new(to_sql_time(now)));
            for category in categories {
                values.push(Box::new(category.as_str().to_string()));
            }
            for source in muted_sources {
                values.push(Box::new(source.clone()));
            }
            let references: Vec<&dyn rusqlite::ToSql> =
                values.iter().map(|value| value.as_ref()).collect();
            connection
                .query_row(&sql, references.as_slice(), |row| row.get::<_, i64>(0))
                .map(|value| value.max(0) as usize)
        })
    }

    pub fn count_articles(&self) -> Result<usize, ProviderError> {
        self.with(|connection| {
            connection
                .query_row("SELECT COUNT(*) FROM radar_article", [], |row| {
                    row.get::<_, i64>(0)
                })
                .map(|value| value.max(0) as usize)
        })
    }

    // -----------------------------------------------------------------------
    // Imagens
    // -----------------------------------------------------------------------

    pub fn insert_image(&self, image: &StoredImage) -> Result<(), ProviderError> {
        self.with(|connection| {
            connection
                .execute(
                    "INSERT INTO radar_image (id, content_hash, file_name, mime_type, width,
                        height, byte_size, created_at, last_accessed_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
                     ON CONFLICT(content_hash) DO UPDATE SET last_accessed_at = ?9",
                    params![
                        image.id,
                        image.content_hash,
                        image.file_name,
                        image.mime_type,
                        image.width,
                        image.height,
                        image.byte_size as i64,
                        to_sql_time(image.created_at),
                        to_sql_time(image.last_accessed_at),
                    ],
                )
                .map(|_| ())
        })
    }

    fn row_to_image(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredImage> {
        Ok(StoredImage {
            id: row.get(0)?,
            content_hash: row.get(1)?,
            file_name: row.get(2)?,
            mime_type: row.get(3)?,
            width: row.get::<_, i64>(4)?.max(0) as u32,
            height: row.get::<_, i64>(5)?.max(0) as u32,
            byte_size: row.get::<_, i64>(6)?.max(0) as u64,
            created_at: required_sql_time(row.get(7)?),
            last_accessed_at: required_sql_time(row.get(8)?),
        })
    }

    const IMAGE_COLUMNS: &'static str =
        "id, content_hash, file_name, mime_type, width, height, byte_size, created_at, last_accessed_at";

    pub fn image_by_id(&self, id: &str) -> Result<Option<StoredImage>, ProviderError> {
        let sql = format!(
            "SELECT {} FROM radar_image WHERE id = ?1",
            Self::IMAGE_COLUMNS
        );
        self.with(move |connection| {
            connection
                .query_row(&sql, params![id], Self::row_to_image)
                .optional()
        })
    }

    pub fn image_by_content_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<StoredImage>, ProviderError> {
        let sql = format!(
            "SELECT {} FROM radar_image WHERE content_hash = ?1",
            Self::IMAGE_COLUMNS
        );
        self.with(move |connection| {
            connection
                .query_row(&sql, params![content_hash], Self::row_to_image)
                .optional()
        })
    }

    /// Atualiza o acesso em lote — nunca a cada paint.
    pub fn touch_images(&self, ids: &[String], now: DateTime<Utc>) -> Result<(), ProviderError> {
        if ids.is_empty() {
            return Ok(());
        }
        self.with(|connection| {
            let transaction = connection.transaction()?;
            {
                let mut statement = transaction
                    .prepare("UPDATE radar_image SET last_accessed_at = ?2 WHERE id = ?1")?;
                for id in ids {
                    statement.execute(params![id, to_sql_time(now)])?;
                }
            }
            transaction.commit()
        })
    }

    pub fn total_image_bytes(&self) -> Result<u64, ProviderError> {
        self.with(|connection| {
            connection
                .query_row(
                    "SELECT COALESCE(SUM(byte_size), 0) FROM radar_image",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .map(|value| value.max(0) as u64)
        })
    }

    /// Remove por LRU até que o uso caia abaixo de `target_bytes`. Devolve os
    /// nomes de arquivo removidos para que o chamador apague os blobs.
    pub fn evict_images_until(&self, target_bytes: u64) -> Result<Vec<String>, ProviderError> {
        let mut total = self.total_image_bytes()?;
        if total <= target_bytes {
            return Ok(Vec::new());
        }
        self.with(move |connection| {
            let transaction = connection.transaction()?;
            let mut removed = Vec::new();
            {
                let mut select = transaction.prepare(
                    "SELECT id, file_name, byte_size FROM radar_image
                     ORDER BY last_accessed_at ASC, id ASC",
                )?;
                let candidates = select
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, i64>(2)?.max(0) as u64,
                        ))
                    })?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                let mut delete = transaction.prepare("DELETE FROM radar_image WHERE id = ?1")?;
                for (id, file_name, size) in candidates {
                    if total <= target_bytes {
                        break;
                    }
                    delete.execute(params![id])?;
                    total = total.saturating_sub(size);
                    removed.push(file_name);
                }
            }
            transaction.commit()?;
            Ok(removed)
        })
    }

    // -----------------------------------------------------------------------
    // Caches por domínio
    // -----------------------------------------------------------------------

    pub fn put_weather(
        &self,
        location_key: &str,
        payload_json: &str,
        fetched_at: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> Result<(), ProviderError> {
        self.with(|connection| {
            connection
                .execute(
                    "INSERT INTO radar_weather_cache (location_key, payload_json, fetched_at, expires_at)
                     VALUES (?1,?2,?3,?4)
                     ON CONFLICT(location_key) DO UPDATE SET
                        payload_json = ?2, fetched_at = ?3, expires_at = ?4",
                    params![
                        location_key,
                        payload_json,
                        to_sql_time(fetched_at),
                        to_sql_time(expires_at)
                    ],
                )
                .map(|_| ())
        })
    }

    /// Devolve `(payload, fetched_at)` mesmo quando expirado — a decisão sobre
    /// usar cache stale ou de emergência pertence ao serviço, não ao repositório.
    pub fn weather(
        &self,
        location_key: &str,
    ) -> Result<Option<(String, DateTime<Utc>)>, ProviderError> {
        self.with(|connection| {
            connection
                .query_row(
                    "SELECT payload_json, fetched_at FROM radar_weather_cache WHERE location_key = ?1",
                    params![location_key],
                    |row| {
                        let payload: String = row.get(0)?;
                        let fetched: String = row.get(1)?;
                        Ok((payload, fetched))
                    },
                )
                .optional()
                .map(|entry| {
                    entry.and_then(|(payload, fetched)| {
                        from_sql_time(&fetched).map(|parsed| (payload, parsed))
                    })
                })
        })
    }

    pub fn put_ticker(
        &self,
        provider_id: &str,
        symbol: &str,
        payload_json: &str,
        fetched_at: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> Result<(), ProviderError> {
        self.with(|connection| {
            connection
                .execute(
                    "INSERT INTO radar_ticker_cache (provider_id, symbol, payload_json, fetched_at, expires_at)
                     VALUES (?1,?2,?3,?4,?5)
                     ON CONFLICT(provider_id, symbol) DO UPDATE SET
                        payload_json = ?3, fetched_at = ?4, expires_at = ?5",
                    params![
                        provider_id,
                        symbol,
                        payload_json,
                        to_sql_time(fetched_at),
                        to_sql_time(expires_at)
                    ],
                )
                .map(|_| ())
        })
    }

    pub fn ticker_entries(&self) -> Result<Vec<TickerRow>, ProviderError> {
        self.with(|connection| {
            let mut statement = connection.prepare(
                "SELECT provider_id, symbol, payload_json, fetched_at FROM radar_ticker_cache",
            )?;
            let rows = statement.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?;
            let mut result = Vec::new();
            for row in rows {
                let (provider, symbol, payload, fetched) = row?;
                if let Some(parsed) = from_sql_time(&fetched) {
                    result.push((provider, symbol, payload, parsed));
                }
            }
            Ok(result)
        })
    }

    pub fn put_events(
        &self,
        provider_id: &str,
        events: &[(String, String, DateTime<Utc>)],
        fetched_at: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> Result<(), ProviderError> {
        self.with(|connection| {
            let transaction = connection.transaction()?;
            {
                let mut statement = transaction.prepare(
                    "INSERT INTO radar_event_cache (id, provider_id, payload_json, occurred_at, fetched_at, expires_at)
                     VALUES (?1,?2,?3,?4,?5,?6)
                     ON CONFLICT(id) DO UPDATE SET
                        payload_json = ?3, occurred_at = ?4, fetched_at = ?5, expires_at = ?6",
                )?;
                for (id, payload, occurred_at) in events {
                    statement.execute(params![
                        id,
                        provider_id,
                        payload,
                        to_sql_time(*occurred_at),
                        to_sql_time(fetched_at),
                        to_sql_time(expires_at),
                    ])?;
                }
            }
            transaction.commit()
        })
    }

    pub fn recent_events(
        &self,
        limit: usize,
    ) -> Result<Vec<(String, DateTime<Utc>)>, ProviderError> {
        self.with(move |connection| {
            let mut statement = connection.prepare(
                "SELECT payload_json, fetched_at FROM radar_event_cache
                 ORDER BY occurred_at DESC LIMIT ?1",
            )?;
            let rows = statement.query_map(params![limit as i64], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            let mut result = Vec::new();
            for row in rows {
                let (payload, fetched) = row?;
                if let Some(parsed) = from_sql_time(&fetched) {
                    result.push((payload, parsed));
                }
            }
            Ok(result)
        })
    }

    // -----------------------------------------------------------------------
    // Retenção
    // -----------------------------------------------------------------------

    /// Remove dados vencidos. Devolve os arquivos de imagem órfãos para que o
    /// chamador os apague fora do lock do banco.
    pub fn prune(&self, now: DateTime<Utc>) -> Result<Vec<String>, ProviderError> {
        let article_cutoff = now - chrono::Duration::days(config::ARTICLE_RETENTION_DAYS);
        let event_cutoff = now - chrono::Duration::days(config::EVENT_RETENTION_DAYS);
        self.with(move |connection| {
            let transaction = connection.transaction()?;
            transaction.execute(
                "DELETE FROM radar_article WHERE expires_at <= ?1 OR fetched_at < ?2",
                params![to_sql_time(now), to_sql_time(article_cutoff)],
            )?;
            transaction.execute(
                "DELETE FROM radar_event_cache WHERE expires_at <= ?1 OR occurred_at < ?2",
                params![to_sql_time(now), to_sql_time(event_cutoff)],
            )?;
            transaction.execute(
                "DELETE FROM radar_weather_cache WHERE fetched_at < ?1",
                params![to_sql_time(now - chrono::Duration::hours(config::WEATHER_EMERGENCY_HOURS))],
            )?;

            // Imagens que nenhum artigo referencia mais.
            let orphans: Vec<(String, String)> = {
                let mut statement = transaction.prepare(
                    "SELECT id, file_name FROM radar_image
                     WHERE id NOT IN (SELECT image_id FROM radar_article WHERE image_id IS NOT NULL)",
                )?;
                let collected = statement
                    .query_map([], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                    })?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                collected
            };
            {
                let mut delete = transaction.prepare("DELETE FROM radar_image WHERE id = ?1")?;
                for (id, _) in &orphans {
                    delete.execute(params![id])?;
                }
            }
            transaction.commit()?;
            Ok(orphans.into_iter().map(|(_, file_name)| file_name).collect())
        })
    }

    pub fn clear(&self, scope: RadarCacheScope) -> Result<Vec<String>, ProviderError> {
        self.with(move |connection| {
            let transaction = connection.transaction()?;
            let mut removed_files = Vec::new();
            let clears_images = matches!(scope, RadarCacheScope::All | RadarCacheScope::Images);
            if matches!(scope, RadarCacheScope::All | RadarCacheScope::News) {
                transaction.execute("DELETE FROM radar_article", [])?;
            }
            if matches!(scope, RadarCacheScope::All | RadarCacheScope::Weather) {
                transaction.execute("DELETE FROM radar_weather_cache", [])?;
            }
            if matches!(scope, RadarCacheScope::All | RadarCacheScope::Market) {
                transaction.execute("DELETE FROM radar_ticker_cache", [])?;
                transaction.execute("DELETE FROM radar_event_cache", [])?;
            }
            if clears_images {
                {
                    let mut statement = transaction.prepare("SELECT file_name FROM radar_image")?;
                    removed_files = statement
                        .query_map([], |row| row.get::<_, String>(0))?
                        .collect::<rusqlite::Result<Vec<_>>>()?;
                }
                transaction.execute("UPDATE radar_article SET image_id = NULL", [])?;
                transaction.execute("DELETE FROM radar_image", [])?;
            }
            transaction.commit()?;
            Ok(removed_files)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn article(id: &str, provider: &str, category: RadarNewsCategory) -> StoredArticle {
        let now = Utc::now();
        StoredArticle {
            id: id.to_string(),
            provider_id: provider.to_string(),
            canonical_url: format!("https://example.com/{id}"),
            canonical_url_hash: format!("hash-{id}"),
            normalized_title: format!("titulo {id}"),
            title: format!("Título {id}"),
            summary: Some("Resumo".into()),
            author: None,
            category,
            tags: vec!["economia".into()],
            published_at: Some(now),
            fetched_at: now,
            image_id: None,
            score: 0.5,
            cluster_id: None,
            expires_at: now + chrono::Duration::days(1),
        }
    }

    fn repository() -> RadarRepository {
        let repository = RadarRepository::open_in_memory().expect("repository");
        repository
            .register_providers(&[
                (
                    "agencia-brasil",
                    "Agência Brasil",
                    RadarProviderDomain::News,
                    true,
                ),
                ("infoq-br", "InfoQ Brasil", RadarProviderDomain::News, true),
                (
                    "open-meteo",
                    "Open-Meteo",
                    RadarProviderDomain::Weather,
                    true,
                ),
            ])
            .expect("register");
        repository
    }

    #[test]
    fn sql_timestamps_round_trip_and_sort_chronologically() {
        let earlier = Utc::now() - chrono::Duration::hours(3);
        let later = Utc::now();
        assert_eq!(
            from_sql_time(&to_sql_time(earlier))
                .expect("parse")
                .timestamp_millis(),
            earlier.timestamp_millis()
        );
        assert!(to_sql_time(earlier) < to_sql_time(later));
        assert!(from_sql_time("not-a-date").is_none());
    }

    #[test]
    fn registering_providers_twice_preserves_accumulated_health() {
        let repository = repository();
        let now = Utc::now();
        repository
            .record_success("agencia-brasil", now)
            .expect("success");

        repository
            .register_providers(&[(
                "agencia-brasil",
                "Agência Brasil",
                RadarProviderDomain::News,
                true,
            )])
            .expect("re-register");

        let health = repository
            .provider_health("agencia-brasil")
            .expect("health")
            .expect("present");
        assert!(health.last_success_at.is_some());
        assert_eq!(health.consecutive_failures, 0);
    }

    #[test]
    fn repeated_failures_trigger_exponential_cooldown_and_success_clears_it() {
        let repository = repository();
        let now = Utc::now();

        repository
            .record_failure("infoq-br", now, ProviderErrorKind::Timeout)
            .expect("first failure");
        let health = repository
            .provider_health("infoq-br")
            .expect("h")
            .expect("p");
        assert_eq!(health.consecutive_failures, 1);
        assert!(health.cooldown_until.is_none(), "primeira falha não pune");

        repository
            .record_failure("infoq-br", now, ProviderErrorKind::Timeout)
            .expect("second failure");
        let health = repository
            .provider_health("infoq-br")
            .expect("h")
            .expect("p");
        assert_eq!(health.consecutive_failures, 2);
        let first_cooldown = health.cooldown_until.expect("cooldown");
        assert!(first_cooldown > now);

        repository
            .record_failure("infoq-br", now, ProviderErrorKind::Timeout)
            .expect("third failure");
        let health = repository
            .provider_health("infoq-br")
            .expect("h")
            .expect("p");
        assert!(
            health.cooldown_until.expect("cooldown") > first_cooldown,
            "cooldown deve crescer"
        );
        assert_eq!(health.last_error_code.as_deref(), Some("timeout"));

        repository.record_success("infoq-br", now).expect("success");
        let health = repository
            .provider_health("infoq-br")
            .expect("h")
            .expect("p");
        assert_eq!(health.consecutive_failures, 0);
        assert!(health.cooldown_until.is_none());
        assert!(health.last_error_code.is_none());
    }

    #[test]
    fn policy_failures_never_put_a_provider_into_cooldown() {
        let repository = repository();
        let now = Utc::now();
        for _ in 0..5 {
            repository
                .record_failure("infoq-br", now, ProviderErrorKind::HostNotAllowed)
                .expect("failure");
        }
        let health = repository
            .provider_health("infoq-br")
            .expect("h")
            .expect("p");
        assert_eq!(health.consecutive_failures, 0);
        assert!(health.cooldown_until.is_none());
    }

    #[test]
    fn cooldown_is_capped_at_the_configured_maximum() {
        let repository = repository();
        let now = Utc::now();
        for _ in 0..20 {
            repository
                .record_failure("infoq-br", now, ProviderErrorKind::Http5xx)
                .expect("failure");
        }
        let health = repository
            .provider_health("infoq-br")
            .expect("h")
            .expect("p");
        let cooldown = health.cooldown_until.expect("cooldown");
        assert!(
            cooldown <= now + chrono::Duration::minutes(config::COOLDOWN_MAX_MINUTES),
            "cooldown ultrapassou o teto configurado"
        );
    }

    #[test]
    fn upsert_preserves_original_fetched_at_and_fills_missing_fields() {
        let repository = repository();
        let mut first = article("a1", "agencia-brasil", RadarNewsCategory::Brasil);
        first.fetched_at = Utc::now() - chrono::Duration::hours(2);
        repository
            .upsert_articles(&[first.clone()])
            .expect("insert");

        let mut second = first.clone();
        second.fetched_at = Utc::now();
        second.summary = None; // provider passou a não enviar resumo
        second.title = "Título atualizado".into();
        second.score = 0.9;
        repository.upsert_articles(&[second]).expect("update");

        let stored = repository.article_by_id("a1").expect("query").expect("row");
        assert_eq!(stored.title, "Título atualizado");
        assert_eq!(stored.score, 0.9);
        assert_eq!(
            stored.fetched_at.timestamp(),
            first.fetched_at.timestamp(),
            "fetched_at original deve ser preservado"
        );
        assert_eq!(
            stored.summary.as_deref(),
            Some("Resumo"),
            "resumo anterior não pode ser apagado por um refresh incompleto"
        );
        assert_eq!(repository.count_articles().expect("count"), 1);
    }

    #[test]
    fn article_listing_filters_by_category_and_muted_source_and_orders_by_score() {
        let repository = repository();
        let mut brasil = article("a1", "agencia-brasil", RadarNewsCategory::Brasil);
        brasil.score = 0.2;
        let mut development = article("a2", "infoq-br", RadarNewsCategory::Development);
        development.score = 0.9;
        let mut muted = article("a3", "infoq-br", RadarNewsCategory::Brasil);
        muted.score = 1.0;
        repository
            .upsert_articles(&[brasil, development, muted])
            .expect("insert");

        let now = Utc::now();
        let all = repository
            .articles(&RadarNewsCategory::ALL, &[], now, 50)
            .expect("list");
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].id, "a3", "maior score primeiro");

        let only_brasil = repository
            .articles(&[RadarNewsCategory::Brasil], &[], now, 50)
            .expect("list");
        assert_eq!(only_brasil.len(), 2);

        let without_infoq = repository
            .articles(&RadarNewsCategory::ALL, &["infoq-br".to_string()], now, 50)
            .expect("list");
        assert_eq!(without_infoq.len(), 1);
        assert_eq!(without_infoq[0].id, "a1");

        assert!(repository
            .articles(&[], &[], now, 50)
            .expect("list")
            .is_empty());
    }

    #[test]
    fn expired_articles_are_excluded_from_listing_and_removed_by_prune() {
        let repository = repository();
        let now = Utc::now();
        let mut expired = article("old", "agencia-brasil", RadarNewsCategory::Brasil);
        expired.expires_at = now - chrono::Duration::hours(1);
        let fresh = article("new", "agencia-brasil", RadarNewsCategory::Brasil);
        repository
            .upsert_articles(&[expired, fresh])
            .expect("insert");

        let listed = repository
            .articles(&RadarNewsCategory::ALL, &[], now, 50)
            .expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "new");

        repository.prune(now).expect("prune");
        assert_eq!(repository.count_articles().expect("count"), 1);
    }

    #[test]
    fn cluster_lookup_excludes_the_primary_article() {
        let repository = repository();
        let mut primary = article("p", "agencia-brasil", RadarNewsCategory::Brasil);
        primary.cluster_id = Some("c1".into());
        let mut related = article("r", "infoq-br", RadarNewsCategory::Brasil);
        related.cluster_id = Some("c1".into());
        let mut other = article("o", "infoq-br", RadarNewsCategory::Brasil);
        other.cluster_id = Some("c2".into());
        repository
            .upsert_articles(&[primary, related, other])
            .expect("insert");

        let found = repository
            .articles_in_cluster("c1", "p", 10)
            .expect("cluster");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "r");
    }

    #[test]
    fn image_eviction_removes_least_recently_used_until_under_quota() {
        let repository = repository();
        let now = Utc::now();
        for index in 0..4 {
            repository
                .insert_image(&StoredImage {
                    id: format!("img{index}"),
                    content_hash: format!("hash{index}"),
                    file_name: format!("img{index}.jpg"),
                    mime_type: "image/jpeg".into(),
                    width: 640,
                    height: 360,
                    byte_size: 100,
                    created_at: now,
                    // img0 é o mais antigo, img3 o mais recente.
                    last_accessed_at: now - chrono::Duration::minutes(10 - index),
                })
                .expect("insert image");
        }
        assert_eq!(repository.total_image_bytes().expect("bytes"), 400);

        let removed = repository.evict_images_until(250).expect("evict");
        assert_eq!(
            removed,
            vec!["img0.jpg".to_string(), "img1.jpg".to_string()]
        );
        assert_eq!(repository.total_image_bytes().expect("bytes"), 200);
        assert!(repository.image_by_id("img0").expect("query").is_none());
        assert!(repository.image_by_id("img2").expect("query").is_some());

        // Já abaixo da quota: nada é removido.
        assert!(repository
            .evict_images_until(250)
            .expect("evict")
            .is_empty());
    }

    #[test]
    fn touching_images_updates_the_lru_order() {
        let repository = repository();
        let now = Utc::now();
        for index in 0..2 {
            repository
                .insert_image(&StoredImage {
                    id: format!("img{index}"),
                    content_hash: format!("hash{index}"),
                    file_name: format!("img{index}.jpg"),
                    mime_type: "image/jpeg".into(),
                    width: 640,
                    height: 360,
                    byte_size: 100,
                    created_at: now,
                    last_accessed_at: now - chrono::Duration::minutes(10 - index),
                })
                .expect("insert image");
        }
        repository
            .touch_images(&["img0".to_string()], now)
            .expect("touch");
        let removed = repository.evict_images_until(100).expect("evict");
        assert_eq!(
            removed,
            vec!["img1.jpg".to_string()],
            "img0 foi tocado e deve sobreviver"
        );
    }

    #[test]
    fn deleting_an_image_detaches_it_from_articles_without_deleting_them() {
        let repository = repository();
        let now = Utc::now();
        repository
            .insert_image(&StoredImage {
                id: "img".into(),
                content_hash: "hash".into(),
                file_name: "img.jpg".into(),
                mime_type: "image/jpeg".into(),
                width: 640,
                height: 360,
                byte_size: 100,
                created_at: now,
                last_accessed_at: now,
            })
            .expect("insert image");
        let mut with_image = article("a1", "agencia-brasil", RadarNewsCategory::Brasil);
        with_image.image_id = Some("img".into());
        repository.upsert_articles(&[with_image]).expect("insert");

        repository
            .clear(RadarCacheScope::Images)
            .expect("clear images");
        let stored = repository.article_by_id("a1").expect("query").expect("row");
        assert!(stored.image_id.is_none());
        assert_eq!(repository.count_articles().expect("count"), 1);
    }

    #[test]
    fn prune_removes_images_no_article_references_anymore() {
        let repository = repository();
        let now = Utc::now();
        repository
            .insert_image(&StoredImage {
                id: "orphan".into(),
                content_hash: "hash".into(),
                file_name: "orphan.jpg".into(),
                mime_type: "image/jpeg".into(),
                width: 640,
                height: 360,
                byte_size: 100,
                created_at: now,
                last_accessed_at: now,
            })
            .expect("insert image");

        let orphans = repository.prune(now).expect("prune");
        assert_eq!(orphans, vec!["orphan.jpg".to_string()]);
        assert!(repository.image_by_id("orphan").expect("query").is_none());
    }

    #[test]
    fn weather_cache_returns_stale_payloads_so_the_service_can_decide() {
        let repository = repository();
        let fetched = Utc::now() - chrono::Duration::hours(3);
        repository
            .put_weather("-23.5505,-46.6333", "{\"a\":1}", fetched, fetched)
            .expect("put");
        let (payload, stored_at) = repository
            .weather("-23.5505,-46.6333")
            .expect("query")
            .expect("row");
        assert_eq!(payload, "{\"a\":1}");
        assert_eq!(stored_at.timestamp(), fetched.timestamp());
        assert!(repository.weather("outra").expect("query").is_none());
    }

    #[test]
    fn clearing_a_scope_leaves_other_domains_intact() {
        let repository = repository();
        let now = Utc::now();
        repository
            .upsert_articles(&[article("a1", "agencia-brasil", RadarNewsCategory::Brasil)])
            .expect("insert");
        repository
            .put_weather("key", "{}", now, now + chrono::Duration::hours(1))
            .expect("weather");
        repository
            .put_ticker(
                "bcb-ptax",
                "usd-brl",
                "{}",
                now,
                now + chrono::Duration::hours(1),
            )
            .expect("ticker");

        repository.clear(RadarCacheScope::News).expect("clear news");
        assert_eq!(repository.count_articles().expect("count"), 0);
        assert!(repository.weather("key").expect("query").is_some());
        assert_eq!(repository.ticker_entries().expect("ticker").len(), 1);

        repository.clear(RadarCacheScope::All).expect("clear all");
        assert!(repository.weather("key").expect("query").is_none());
        assert!(repository.ticker_entries().expect("ticker").is_empty());
        // Provider health sobrevive à limpeza de cache.
        assert!(!repository.all_provider_health().expect("health").is_empty());
    }

    #[test]
    fn corrupted_database_is_quarantined_and_rebuilt_without_losing_the_evidence() {
        let directory = std::env::temp_dir().join(format!(
            "focuswall-radar-corrupt-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&directory).expect("directory");
        let path = directory.join(DATABASE_FILE_NAME);
        std::fs::write(&path, b"this is definitely not a sqlite database").expect("write garbage");

        let repository = RadarRepository::open_or_rebuild(&directory).expect("rebuild");
        assert!(repository.recovered_from_corruption());
        // O banco reconstruído é utilizável.
        repository
            .register_providers(&[(
                "agencia-brasil",
                "Agência Brasil",
                RadarProviderDomain::News,
                true,
            )])
            .expect("register");
        assert_eq!(repository.count_articles().expect("count"), 0);
        // O arquivo original foi preservado em quarentena.
        let quarantined = std::fs::read_dir(&directory)
            .expect("read dir")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().contains(".corrupt-"));
        assert!(quarantined, "banco corrompido deveria ter sido preservado");

        drop(repository);
        let _ = std::fs::remove_dir_all(&directory);
    }
}
