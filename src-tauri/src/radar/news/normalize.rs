//! Normalização de [`RawArticle`] para [`StoredArticle`].
//!
//! Aqui nasce o ID opaco do artigo, a categoria efetiva e as tags. Tudo é
//! determinístico: os mesmos bytes de feed produzem sempre o mesmo registro.

use super::{
    super::{
        config,
        models::{clean_text, plausible_timestamp, RadarNewsCategory, StoredArticle},
        security,
        sources::NewsProviderDefinition,
    },
    text, RawArticle,
};
use chrono::{DateTime, Utc};
use unicode_normalization::UnicodeNormalization;

/// Stopwords mínimas de PT-BR e EN, usadas apenas na chave de similaridade.
const STOPWORDS: &[&str] = &[
    "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no",
    "na", "nos", "nas", "por", "para", "com", "sem", "sob", "sobre", "e", "ou", "que", "se", "ao",
    "aos", "à", "às", "pelo", "pela", "the", "of", "in", "on", "at", "to", "for", "and", "or",
    "is", "are", "was", "were", "be", "with", "from", "by", "as", "it", "its", "this", "that",
];

/// Remove diacríticos via decomposição NFKD, descartando marcas combinantes.
fn strip_diacritics(value: &str) -> String {
    value
        .nfkd()
        .filter(|character| !unicode_normalization::char::is_combining_mark(*character))
        .collect()
}

/// Tokens canônicos de um título: sem acento, sem pontuação, sem stopwords.
pub fn title_tokens(title: &str) -> Vec<String> {
    strip_diacritics(&title.to_lowercase())
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .filter(|token| !STOPWORDS.contains(token))
        .map(str::to_string)
        .collect()
}

/// Chave determinística usada para deduplicação por título exato.
pub fn normalized_title(title: &str) -> String {
    title_tokens(title).join(" ")
}

// ---------------------------------------------------------------------------
// Classificação de categoria
// ---------------------------------------------------------------------------

/// Palavras-chave por categoria. A classificação só sobrepõe a categoria
/// padrão do provider quando há sinal claro no título ou nas tags do feed.
const CATEGORY_KEYWORDS: &[(RadarNewsCategory, &[&str])] = &[
    (
        RadarNewsCategory::Security,
        &[
            "seguranca",
            "vulnerabilidade",
            "ransomware",
            "phishing",
            "malware",
            "invasao",
            "vazamento",
            "cve",
            "ciberseguranca",
            "ataque",
            "golpe",
            "fraude",
            "security",
            "breach",
            "exploit",
        ],
    ),
    (
        RadarNewsCategory::Business,
        &[
            "economia",
            "mercado",
            "negocios",
            "inflacao",
            "pib",
            "juros",
            "bolsa",
            "dolar",
            "investimento",
            "empresa",
            "startup",
            "imposto",
            "orcamento",
            "emprego",
            "business",
        ],
    ),
    (
        RadarNewsCategory::Science,
        &[
            "ciencia",
            "pesquisa",
            "estudo",
            "cientistas",
            "saude",
            "vacina",
            "espaco",
            "astronomia",
            "clima",
            "meio ambiente",
            "biologia",
            "fisica",
            "science",
            "research",
        ],
    ),
    (
        RadarNewsCategory::Development,
        &[
            "desenvolvimento",
            "programacao",
            "desenvolvedor",
            "codigo",
            "framework",
            "api",
            "javascript",
            "typescript",
            "python",
            "rust",
            "java",
            "devops",
            "kubernetes",
            "arquitetura",
            "software",
            "engineering",
            "developer",
        ],
    ),
    (
        RadarNewsCategory::Technology,
        &[
            "tecnologia",
            "inteligencia artificial",
            "ia",
            "smartphone",
            "aplicativo",
            "hardware",
            "chip",
            "internet",
            "rede",
            "nuvem",
            "technology",
            "gadget",
        ],
    ),
    (
        RadarNewsCategory::World,
        &[
            "internacional",
            "mundo",
            "eua",
            "china",
            "europa",
            "guerra",
            "onu",
            "world",
            "global",
        ],
    ),
    (
        RadarNewsCategory::Brasil,
        &[
            "brasil",
            "brasilia",
            "governo",
            "congresso",
            "stf",
            "senado",
            "camara",
            "ministerio",
            "presidente",
            "eleicao",
        ],
    ),
];

/// Decide a categoria efetiva. Prioridade: tags explícitas do feed, depois o
/// título, e por fim a categoria padrão do provider.
pub fn classify_category(
    provider: &NewsProviderDefinition,
    title: &str,
    feed_categories: &[String],
) -> RadarNewsCategory {
    let haystack_tags = strip_diacritics(&feed_categories.join(" ").to_lowercase());
    for (category, keywords) in CATEGORY_KEYWORDS {
        if keywords
            .iter()
            .any(|keyword| contains_word(&haystack_tags, keyword))
        {
            return *category;
        }
    }

    let haystack_title = strip_diacritics(&title.to_lowercase());
    for (category, keywords) in CATEGORY_KEYWORDS {
        if keywords
            .iter()
            .any(|keyword| contains_word(&haystack_title, keyword))
        {
            return *category;
        }
    }

    provider.default_category
}

/// Casamento por palavra inteira, evitando que "ia" case dentro de "familia".
fn contains_word(haystack: &str, needle: &str) -> bool {
    if needle.contains(' ') {
        return haystack.contains(needle);
    }
    haystack
        .split(|character: char| !character.is_alphanumeric())
        .any(|word| word == needle)
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

pub fn extract_tags(feed_categories: &[String]) -> Vec<String> {
    let mut tags = Vec::new();
    for candidate in feed_categories {
        let cleaned = clean_text(candidate, config::MAX_TAG_CHARS).to_lowercase();
        if cleaned.is_empty() || cleaned.chars().count() < 2 {
            continue;
        }
        if !tags.contains(&cleaned) {
            tags.push(cleaned);
        }
        if tags.len() >= config::MAX_TAGS {
            break;
        }
    }
    tags
}

// ---------------------------------------------------------------------------
// Conversão
// ---------------------------------------------------------------------------

/// Converte um artigo cru em registro persistível. Devolve `None` quando o
/// artigo não atende aos requisitos mínimos (título, URL canônica válida,
/// data plausível).
pub fn to_stored(
    raw: &RawArticle,
    provider: &NewsProviderDefinition,
    now: DateTime<Utc>,
) -> Option<StoredArticle> {
    let title = text::html_to_text(&raw.title, config::MAX_TITLE_CHARS);
    if title.trim().is_empty() {
        return None;
    }

    let canonical_url = security::canonicalize_article_url(&raw.canonical_url)?;
    // O host precisa pertencer ao provider: um feed comprometido não consegue
    // injetar artigos que abram domínios de terceiros.
    let host = url::Url::parse(&canonical_url)
        .ok()?
        .host_str()?
        .to_string();
    if !security::host_matches_allowlist(&host, provider.article_hosts) {
        return None;
    }

    let normalized = normalized_title(&title);
    if normalized.is_empty() {
        return None;
    }

    // Datas no futuro ou anteriores a 2000 são descartadas em vez de aceitas:
    // elas envenenariam a ordenação e o cálculo de recência.
    let published_at = raw
        .published_at
        .filter(|value| plausible_timestamp(*value, now));

    let summary = raw
        .summary_html_or_text
        .as_deref()
        .and_then(text::summary_for_storage);

    let author = raw
        .author
        .as_deref()
        .map(|value| text::html_to_text(value, config::MAX_AUTHOR_CHARS))
        .filter(|value| !value.is_empty());

    Some(StoredArticle {
        id: security::stable_article_id(provider.id, &canonical_url),
        provider_id: provider.id.to_string(),
        canonical_url_hash: security::sha256_hex(&canonical_url),
        canonical_url,
        normalized_title: normalized,
        title,
        summary,
        author,
        category: classify_category(provider, &raw.title, &raw.categories),
        tags: extract_tags(&raw.categories),
        published_at,
        fetched_at: now,
        image_id: None,
        score: 0.0,
        cluster_id: None,
        expires_at: now + chrono::Duration::days(config::ARTICLE_RETENTION_DAYS),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::radar::sources::provider_by_id;

    fn provider(id: &str) -> &'static NewsProviderDefinition {
        provider_by_id(id).expect("provider")
    }

    fn raw(title: &str, url: &str) -> RawArticle {
        RawArticle {
            source_id: "agencia-brasil".into(),
            title: title.into(),
            canonical_url: url.into(),
            ..Default::default()
        }
    }

    #[test]
    fn title_normalization_removes_accents_punctuation_and_stopwords() {
        assert_eq!(
            normalized_title("A Economia do Brasil cresce, diz o IBGE!"),
            "economia brasil cresce diz ibge"
        );
        assert_eq!(
            normalized_title("Ação e Reação: São Paulo"),
            "acao reacao sao paulo"
        );
        // Títulos equivalentes com grafias diferentes colapsam na mesma chave.
        assert_eq!(
            normalized_title("Inflação sobe em julho"),
            normalized_title("INFLACAO SOBE EM JULHO")
        );
        assert_eq!(normalized_title("   "), "");
    }

    #[test]
    fn keyword_matching_respects_word_boundaries() {
        // "ia" não pode casar dentro de "família".
        assert_eq!(
            classify_category(
                provider("agencia-brasil"),
                "Família brasileira em foco",
                &[]
            ),
            RadarNewsCategory::Brasil
        );
        assert_eq!(
            classify_category(provider("agencia-brasil"), "Avanços em IA generativa", &[]),
            RadarNewsCategory::Technology
        );
    }

    #[test]
    fn feed_categories_take_precedence_over_the_title() {
        assert_eq!(
            classify_category(
                provider("agencia-brasil"),
                "Novo estudo sobre vacinas",
                &["Economia".to_string()]
            ),
            RadarNewsCategory::Business,
            "tag explícita do feed vence"
        );
        assert_eq!(
            classify_category(provider("agencia-brasil"), "Novo estudo sobre vacinas", &[]),
            RadarNewsCategory::Science
        );
    }

    #[test]
    fn provider_default_category_is_the_final_fallback() {
        assert_eq!(
            classify_category(provider("cert-br"), "Boletim semanal", &[]),
            RadarNewsCategory::Security
        );
        assert_eq!(
            classify_category(provider("github-blog"), "Boletim semanal", &[]),
            RadarNewsCategory::Development
        );
    }

    #[test]
    fn security_signals_outrank_the_generic_provider_category() {
        assert_eq!(
            classify_category(
                provider("agencia-brasil"),
                "Vazamento de dados atinge órgão federal",
                &[]
            ),
            RadarNewsCategory::Security
        );
    }

    #[test]
    fn tags_are_lowercased_deduplicated_and_capped() {
        let tags = extract_tags(&[
            "Economia".into(),
            "economia".into(),
            "Brasil".into(),
            "A".into(),
            "".into(),
            "T1".into(),
            "T2".into(),
            "T3".into(),
            "T4".into(),
            "T5".into(),
        ]);
        assert_eq!(tags.len(), config::MAX_TAGS);
        assert_eq!(tags[0], "economia");
        assert_eq!(tags[1], "brasil");
        assert!(
            !tags.contains(&"a".to_string()),
            "tag de 1 caractere é ruído"
        );
    }

    #[test]
    fn stored_article_gets_a_stable_opaque_id_derived_from_source_and_url() {
        let now = Utc::now();
        let article = to_stored(
            &raw(
                "Economia cresce",
                "https://agenciabrasil.ebc.com.br/a?utm_source=x",
            ),
            provider("agencia-brasil"),
            now,
        )
        .expect("stored");

        assert_eq!(article.canonical_url, "https://agenciabrasil.ebc.com.br/a");
        assert!(security::is_valid_opaque_id(&article.id));
        assert!(!article.id.contains("agenciabrasil"));
        // Determinístico entre execuções.
        let again = to_stored(
            &raw("Economia cresce", "https://agenciabrasil.ebc.com.br/a"),
            provider("agencia-brasil"),
            now,
        )
        .expect("stored");
        assert_eq!(article.id, again.id);
        assert_eq!(article.canonical_url_hash, again.canonical_url_hash);
    }

    #[test]
    fn an_article_whose_host_is_not_the_providers_is_rejected() {
        // Feed da Agência Brasil tentando injetar link de outro domínio.
        assert!(to_stored(
            &raw("Notícia falsa", "https://exemplo-malicioso.com/a"),
            provider("agencia-brasil"),
            Utc::now()
        )
        .is_none());

        // O mesmo link é aceito pelo provider que realmente possui o host.
        assert!(to_stored(
            &raw("Post legítimo", "https://github.blog/a"),
            provider("github-blog"),
            Utc::now()
        )
        .is_some());
    }

    #[test]
    fn articles_without_a_usable_title_or_url_are_rejected() {
        let now = Utc::now();
        assert!(to_stored(
            &raw("", "https://agenciabrasil.ebc.com.br/a"),
            provider("agencia-brasil"),
            now
        )
        .is_none());
        assert!(to_stored(
            &raw("<b></b>", "https://agenciabrasil.ebc.com.br/a"),
            provider("agencia-brasil"),
            now
        )
        .is_none());
        assert!(to_stored(
            &raw("Título", "http://agenciabrasil.ebc.com.br/a"),
            provider("agencia-brasil"),
            now
        )
        .is_none());
        assert!(to_stored(&raw("Título", "não é url"), provider("agencia-brasil"), now).is_none());
        // Um título só de stopwords não gera chave de deduplicação utilizável.
        assert!(to_stored(
            &raw("de a o", "https://agenciabrasil.ebc.com.br/a"),
            provider("agencia-brasil"),
            now
        )
        .is_none());
    }

    #[test]
    fn implausible_publication_dates_are_dropped_but_the_article_survives() {
        let now = Utc::now();
        let mut future = raw("Do futuro", "https://agenciabrasil.ebc.com.br/a");
        future.published_at = Some(now + chrono::Duration::days(3));
        let stored = to_stored(&future, provider("agencia-brasil"), now).expect("stored");
        assert!(stored.published_at.is_none());

        let mut valid = raw("Recente", "https://agenciabrasil.ebc.com.br/b");
        valid.published_at = Some(now - chrono::Duration::hours(2));
        let stored = to_stored(&valid, provider("agencia-brasil"), now).expect("stored");
        assert!(stored.published_at.is_some());
    }

    #[test]
    fn expiry_follows_the_configured_retention_window() {
        let now = Utc::now();
        let stored = to_stored(
            &raw("Título válido", "https://agenciabrasil.ebc.com.br/a"),
            provider("agencia-brasil"),
            now,
        )
        .expect("stored");
        assert_eq!(
            (stored.expires_at - now).num_days(),
            config::ARTICLE_RETENTION_DAYS
        );
    }
}
