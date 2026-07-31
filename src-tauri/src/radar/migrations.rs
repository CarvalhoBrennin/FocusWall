//! Migrações do cache Radar.
//!
//! Cada passo roda dentro de uma única transação; se qualquer passo falhar, o
//! banco anterior permanece intacto. O cache é sempre reconstruível, então
//! nunca migramos dados do usuário aqui — apenas estrutura.

use rusqlite::{Connection, Transaction};

/// Versão-alvo do schema. Incrementar exige adicionar um passo em [`STEPS`].
pub const TARGET_VERSION: u32 = 1;

/// SQL de cada migração, indexado por versão de destino (`STEPS[0]` leva 0 → 1).
const STEPS: [&str; TARGET_VERSION as usize] = [r#"
CREATE TABLE radar_provider (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    domain TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    last_attempt_at TEXT,
    last_success_at TEXT,
    last_failure_at TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    cooldown_until TEXT,
    last_error_code TEXT
);

CREATE TABLE radar_image (
    id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    byte_size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL
);

CREATE INDEX idx_radar_image_accessed ON radar_image(last_accessed_at);

CREATE TABLE radar_article (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    canonical_url_hash TEXT NOT NULL UNIQUE,
    normalized_title TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    author TEXT,
    category TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    image_id TEXT,
    score REAL NOT NULL DEFAULT 0,
    cluster_id TEXT,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(provider_id) REFERENCES radar_provider(id) ON DELETE CASCADE,
    FOREIGN KEY(image_id) REFERENCES radar_image(id) ON DELETE SET NULL
);

CREATE INDEX idx_radar_article_published ON radar_article(published_at DESC);
CREATE INDEX idx_radar_article_category ON radar_article(category, published_at DESC);
CREATE INDEX idx_radar_article_cluster ON radar_article(cluster_id);
CREATE INDEX idx_radar_article_expires ON radar_article(expires_at);
CREATE INDEX idx_radar_article_normalized_title ON radar_article(normalized_title);

CREATE TABLE radar_weather_cache (
    location_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE radar_ticker_cache (
    provider_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY(provider_id, symbol)
);

CREATE TABLE radar_event_cache (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX idx_radar_event_occurred ON radar_event_cache(occurred_at DESC);
"#];

/// `rusqlite` só expõe `ModuleError` com a feature `vtab`; usamos uma falha
/// SQLITE_CORRUPT sintética para sinalizar schema incompatível ou corrompido.
pub(super) fn schema_error(message: &str) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
        Some(message.to_string()),
    )
}

fn current_version(connection: &Connection) -> rusqlite::Result<u32> {
    let table_exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'radar_schema')",
        [],
        |row| row.get::<_, i64>(0).map(|value| value == 1),
    )?;
    if !table_exists {
        return Ok(0);
    }
    connection
        .query_row("SELECT version FROM radar_schema LIMIT 1", [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|value| value.max(0) as u32)
        .or(Ok(0))
}

fn apply_step(transaction: &Transaction<'_>, sql: &str) -> rusqlite::Result<()> {
    transaction.execute_batch(sql)
}

/// Leva o banco até [`TARGET_VERSION`]. Um banco em versão futura (gerado por
/// uma build mais nova) é tratado como incompatível para que o chamador possa
/// recriar o cache em vez de corromper dados.
pub fn migrate(connection: &mut Connection) -> rusqlite::Result<u32> {
    let version = current_version(connection)?;
    if version > TARGET_VERSION {
        return Err(schema_error(&format!(
            "radar cache schema {version} is newer than supported {TARGET_VERSION}"
        )));
    }
    if version == TARGET_VERSION {
        return Ok(version);
    }

    let transaction = connection.transaction()?;
    transaction
        .execute_batch("CREATE TABLE IF NOT EXISTS radar_schema (version INTEGER NOT NULL);")?;
    for step in version..TARGET_VERSION {
        apply_step(&transaction, STEPS[step as usize])?;
    }
    transaction.execute("DELETE FROM radar_schema", [])?;
    transaction.execute(
        "INSERT INTO radar_schema (version) VALUES (?1)",
        [TARGET_VERSION],
    )?;
    transaction.commit()?;
    Ok(TARGET_VERSION)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory() -> Connection {
        Connection::open_in_memory().expect("in-memory database")
    }

    #[test]
    fn migrates_empty_database_to_target_version() {
        let mut connection = memory();
        assert_eq!(current_version(&connection).expect("version"), 0);
        assert_eq!(migrate(&mut connection).expect("migrate"), TARGET_VERSION);
        assert_eq!(
            current_version(&connection).expect("version"),
            TARGET_VERSION
        );
    }

    #[test]
    fn migration_is_idempotent_and_keeps_a_single_version_row() {
        let mut connection = memory();
        migrate(&mut connection).expect("first migrate");
        migrate(&mut connection).expect("second migrate");
        let rows: i64 = connection
            .query_row("SELECT COUNT(*) FROM radar_schema", [], |row| row.get(0))
            .expect("count");
        assert_eq!(rows, 1);
    }

    #[test]
    fn every_expected_table_and_index_exists_after_migration() {
        let mut connection = memory();
        migrate(&mut connection).expect("migrate");
        for table in [
            "radar_schema",
            "radar_provider",
            "radar_article",
            "radar_image",
            "radar_weather_cache",
            "radar_ticker_cache",
            "radar_event_cache",
        ] {
            let exists: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .expect("query table");
            assert_eq!(exists, 1, "tabela ausente: {table}");
        }
        let indexes: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_radar_%'",
                [],
                |row| row.get(0),
            )
            .expect("query indexes");
        assert_eq!(indexes, 7);
    }

    #[test]
    fn database_from_a_newer_build_is_reported_as_incompatible() {
        let mut connection = memory();
        migrate(&mut connection).expect("migrate");
        connection
            .execute("UPDATE radar_schema SET version = ?1", [TARGET_VERSION + 5])
            .expect("bump version");
        assert!(migrate(&mut connection).is_err());
    }

    #[test]
    fn a_failing_step_leaves_the_database_untouched() {
        let mut connection = memory();
        // Uma tabela pré-existente com o mesmo nome faz o passo 0 falhar.
        connection
            .execute_batch("CREATE TABLE radar_provider (wrong INTEGER);")
            .expect("conflicting table");
        assert!(migrate(&mut connection).is_err());
        // A transação foi revertida: nenhuma tabela nova sobreviveu.
        let article_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'radar_article'",
                [],
                |row| row.get(0),
            )
            .expect("query");
        assert_eq!(article_exists, 0);
    }
}
