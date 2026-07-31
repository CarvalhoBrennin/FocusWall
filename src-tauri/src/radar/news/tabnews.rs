//! Adapter da API pública do TabNews.
//!
//! Decisão de segurança (plano §27, "segurança primeiro"): o campo `source_url`
//! do TabNews é preenchido livremente pelo autor e pode apontar para qualquer
//! host. Como a abertura externa exige host em allowlist estática do provider,
//! a URL canônica é **sempre** a da publicação no TabNews. O link original
//! continua acessível a partir da própria página, e a atribuição é preservada.

use super::{
    super::{
        config,
        error::{ProviderError, ProviderErrorKind},
        models::clean_text,
        security,
        sources::NewsProviderDefinition,
    },
    text, RawArticle,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct TabNewsContent {
    #[serde(default)]
    parent_id: Option<String>,
    #[serde(default)]
    slug: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    owner_username: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    deleted_at: Option<String>,
    #[serde(rename = "type", default)]
    content_type: Option<String>,
}

/// Um slug só é aceitável se puder compor uma URL sem escapes — isso descarta
/// tentativas de path traversal e injeção de query.
fn valid_path_segment(value: &str) -> bool {
    !value.is_empty()
        && value.chars().count() <= 200
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

pub fn parse_contents(
    bytes: &[u8],
    provider: &NewsProviderDefinition,
) -> Result<Vec<RawArticle>, ProviderError> {
    if bytes.len() > config::MAX_TABNEWS_BYTES {
        return Err(ProviderError::new(ProviderErrorKind::ResponseTooLarge));
    }
    let contents: Vec<TabNewsContent> =
        serde_json::from_slice(bytes).map_err(|_| ProviderError::new(ProviderErrorKind::Parse))?;

    let mut articles = Vec::new();
    for content in contents {
        // Somente conteúdo raiz publicado: comentários têm `parent_id`.
        if content.parent_id.is_some() || content.deleted_at.is_some() {
            continue;
        }
        if content.content_type.as_deref() != Some("content") {
            continue;
        }
        if content.status.as_deref() != Some("published") {
            continue;
        }

        let (Some(slug), Some(username)) =
            (content.slug.as_deref(), content.owner_username.as_deref())
        else {
            continue;
        };
        if !valid_path_segment(slug) || !valid_path_segment(username) {
            continue;
        }

        let title = text::html_to_text(
            content.title.as_deref().unwrap_or_default(),
            config::MAX_TITLE_CHARS,
        );
        if title.is_empty() {
            continue;
        }

        let canonical_url = match security::canonicalize_article_url(&format!(
            "https://www.tabnews.com.br/{username}/{slug}"
        )) {
            Some(url) => url,
            None => continue,
        };

        let published_at = content
            .published_at
            .as_deref()
            .or(content.updated_at.as_deref())
            .and_then(parse_timestamp);

        articles.push(RawArticle {
            source_id: provider.id.to_string(),
            title,
            canonical_url,
            origin_guid: Some(clean_text(slug, 200)),
            // A listagem não traz corpo, e não buscamos o conteúdo integral.
            summary_html_or_text: None,
            author: Some(clean_text(username, config::MAX_AUTHOR_CHARS)),
            published_at,
            categories: vec!["comunidade".to_string()],
            media_candidates: Vec::new(),
        });

        if articles.len() >= provider.max_items {
            break;
        }
    }

    if articles.is_empty() {
        return Err(ProviderError::new(ProviderErrorKind::Validation));
    }
    Ok(articles)
}

fn parse_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|parsed| parsed.with_timezone(&Utc))
}

/// Une os lotes `relevant` e `new` preservando a ordem de relevância e
/// completando com os mais recentes, sem repetir URLs.
pub fn merge_strategies(relevant: Vec<RawArticle>, recent: Vec<RawArticle>) -> Vec<RawArticle> {
    let mut merged = Vec::with_capacity(relevant.len() + recent.len());
    let mut seen = std::collections::HashSet::new();
    for article in relevant.into_iter().chain(recent) {
        if seen.insert(article.canonical_url.clone()) {
            merged.push(article);
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::radar::sources::provider_by_id;

    fn provider() -> &'static NewsProviderDefinition {
        provider_by_id("tabnews").expect("tabnews")
    }

    /// Amostra real da API, capturada em 29/07/2026 e sanitizada.
    const FIXTURE: &[u8] = include_bytes!("../fixtures/tabnews_contents.json");

    #[test]
    fn parses_the_real_payload_shape() {
        let articles = parse_contents(FIXTURE, provider()).expect("tabnews");
        assert_eq!(articles.len(), 2);
        assert_eq!(articles[0].title, "[Day 5] - 100 days of code em C");
        assert_eq!(
            articles[0].canonical_url,
            "https://www.tabnews.com.br/figureight/day-5-100-days-of-code-em-c"
        );
        assert_eq!(articles[0].author.as_deref(), Some("figureight"));
        assert!(articles[0].summary_html_or_text.is_none());
        assert!(articles[0].media_candidates.is_empty());
    }

    #[test]
    fn an_external_source_url_never_becomes_the_canonical_url() {
        // O segundo item da fixture traz `source_url` externo.
        let articles = parse_contents(FIXTURE, provider()).expect("tabnews");
        let external = &articles[1];
        assert!(
            external
                .canonical_url
                .starts_with("https://www.tabnews.com.br/"),
            "source_url externo não pode virar canônica: {}",
            external.canonical_url
        );
        assert!(!external.canonical_url.contains("vivodecodigo"));
    }

    #[test]
    fn comments_drafts_and_deleted_content_are_skipped() {
        let payload = serde_json::json!([
            {
                "parent_id": "abc", "slug": "um-comentario", "title": "Comentário",
                "status": "published", "owner_username": "u", "type": "content",
                "published_at": "2026-07-29T12:00:00.000Z"
            },
            {
                "parent_id": null, "slug": "rascunho", "title": "Rascunho",
                "status": "draft", "owner_username": "u", "type": "content",
                "published_at": "2026-07-29T12:00:00.000Z"
            },
            {
                "parent_id": null, "slug": "apagado", "title": "Apagado",
                "status": "published", "owner_username": "u", "type": "content",
                "deleted_at": "2026-07-29T13:00:00.000Z",
                "published_at": "2026-07-29T12:00:00.000Z"
            },
            {
                "parent_id": null, "slug": "valido", "title": "Publicação válida",
                "status": "published", "owner_username": "autor", "type": "content",
                "published_at": "2026-07-29T12:00:00.000Z"
            }
        ]);
        let articles = parse_contents(&serde_json::to_vec(&payload).expect("json"), provider())
            .expect("parse");
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Publicação válida");
    }

    #[test]
    fn slugs_and_usernames_that_could_escape_the_path_are_rejected() {
        for (slug, username) in [
            ("../../admin", "autor"),
            ("valido", "../outro"),
            ("com espaco", "autor"),
            ("valido", "autor?x=1"),
            ("", "autor"),
        ] {
            let payload = serde_json::json!([{
                "parent_id": null, "slug": slug, "title": "T",
                "status": "published", "owner_username": username, "type": "content",
                "published_at": "2026-07-29T12:00:00.000Z"
            }]);
            let result = parse_contents(&serde_json::to_vec(&payload).expect("json"), provider());
            assert!(
                result.is_err(),
                "aceitou slug/usuário perigoso: {slug} / {username}"
            );
        }
    }

    #[test]
    fn malformed_and_oversized_payloads_are_rejected() {
        assert_eq!(
            parse_contents(b"{nao e json", provider())
                .expect_err("parse")
                .kind,
            ProviderErrorKind::Parse
        );
        assert_eq!(
            parse_contents(b"[]", provider()).expect_err("vazio").kind,
            ProviderErrorKind::Validation
        );
        let oversized = vec![b'x'; config::MAX_TABNEWS_BYTES + 1];
        assert_eq!(
            parse_contents(&oversized, provider())
                .expect_err("grande")
                .kind,
            ProviderErrorKind::ResponseTooLarge
        );
    }

    #[test]
    fn merging_strategies_keeps_relevance_order_without_duplicates() {
        let make = |slug: &str| RawArticle {
            canonical_url: format!("https://www.tabnews.com.br/a/{slug}"),
            title: slug.to_string(),
            ..Default::default()
        };
        let merged = merge_strategies(
            vec![make("relevante-1"), make("comum")],
            vec![make("comum"), make("novo-1")],
        );
        assert_eq!(
            merged.iter().map(|a| a.title.as_str()).collect::<Vec<_>>(),
            vec!["relevante-1", "comum", "novo-1"]
        );
    }
}
