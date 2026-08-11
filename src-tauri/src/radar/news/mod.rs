//! Pipeline de notícias: parsing, normalização, deduplicação, clustering e
//! ranking.
//!
//! [`RawArticle`] nunca atravessa o IPC — ele carrega URL canônica e candidatos
//! de mídia. O que chega ao frontend é sempre [`super::models::RadarArticleSummary`].

// A descoberta de mídia é feita pelo parser; o serviço faz o download e o
// processamento opcional depois da normalização do artigo.
#![allow(dead_code)]

pub mod dedupe;
pub mod normalize;
pub mod ranking;
pub mod rss_atom;
pub mod tabnews;
pub mod text;

use chrono::{DateTime, Utc};

/// Candidato de imagem descoberto no feed, em ordem de preferência.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaCandidate {
    pub url: String,
    pub origin: MediaOrigin,
    /// Largura declarada pelo feed, quando informada.
    pub declared_width: Option<u32>,
}

/// De onde veio o candidato. A ordem do enum é a ordem de preferência.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum MediaOrigin {
    MediaContent,
    MediaThumbnail,
    Enclosure,
    /// `<img>` encontrado dentro do resumo/conteúdo do próprio feed.
    InlineContent,
    /// `og:image` obtido da página (fallback caro, limitado por ciclo).
    OpenGraph,
}

/// Artigo cru, antes da normalização. Interno ao backend.
#[derive(Debug, Clone, Default)]
pub struct RawArticle {
    pub source_id: String,
    pub title: String,
    pub canonical_url: String,
    /// Identificador da própria origem (`guid`, `id`), usado na deduplicação.
    pub origin_guid: Option<String>,
    pub summary_html_or_text: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub categories: Vec<String>,
    pub media_candidates: Vec<MediaCandidate>,
}

impl RawArticle {
    /// Melhor candidato de imagem segundo a ordem de descoberta do plano.
    pub fn best_media(&self) -> Option<&MediaCandidate> {
        self.media_candidates.iter().min_by(|left, right| {
            left.origin.cmp(&right.origin).then_with(|| {
                right
                    .declared_width
                    .unwrap_or(0)
                    .cmp(&left.declared_width.unwrap_or(0))
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(origin: MediaOrigin, width: Option<u32>) -> MediaCandidate {
        MediaCandidate {
            url: format!("https://example.com/{origin:?}-{width:?}.jpg"),
            origin,
            declared_width: width,
        }
    }

    #[test]
    fn media_discovery_follows_the_documented_preference_order() {
        let article = RawArticle {
            media_candidates: vec![
                candidate(MediaOrigin::OpenGraph, Some(2000)),
                candidate(MediaOrigin::Enclosure, None),
                candidate(MediaOrigin::MediaThumbnail, None),
                candidate(MediaOrigin::MediaContent, Some(800)),
            ],
            ..Default::default()
        };
        assert_eq!(
            article.best_media().map(|media| media.origin),
            Some(MediaOrigin::MediaContent)
        );
    }

    #[test]
    fn wider_declared_images_win_within_the_same_origin() {
        let article = RawArticle {
            media_candidates: vec![
                candidate(MediaOrigin::MediaContent, Some(400)),
                candidate(MediaOrigin::MediaContent, Some(1200)),
            ],
            ..Default::default()
        };
        assert_eq!(
            article.best_media().and_then(|media| media.declared_width),
            Some(1200)
        );
    }

    #[test]
    fn an_article_without_media_has_no_candidate() {
        assert!(RawArticle::default().best_media().is_none());
    }
}
