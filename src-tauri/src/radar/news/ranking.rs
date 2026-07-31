//! Ranking editorial determinístico.
//!
//! Sem IA: o score é uma soma ponderada de sinais mensuráveis, menos
//! penalidades. Os mesmos artigos produzem sempre a mesma ordem, o que torna a
//! feature testável e auditável.
//!
//! ```text
//! score = recencia      * 0,30
//!       + qualidadeFonte* 0,20
//!       + afinidade     * 0,20
//!       + relevanciaBR  * 0,10
//!       + completude    * 0,10
//!       + diversidade   * 0,10
//!       - penalidades
//! ```

use super::{
    super::{
        models::{RadarNewsCategory, StoredArticle},
        sources::{provider_by_id, ProviderPriority},
    },
    normalize,
};
use chrono::{DateTime, Utc};
use std::collections::HashSet;

const WEIGHT_RECENCY: f64 = 0.30;
const WEIGHT_SOURCE: f64 = 0.20;
const WEIGHT_AFFINITY: f64 = 0.20;
const WEIGHT_BRAZIL: f64 = 0.10;
const WEIGHT_COMPLETENESS: f64 = 0.10;
const WEIGHT_DIVERSITY: f64 = 0.10;

const PENALTY_NO_CONTENT: f64 = 0.12;
const PENALTY_NO_DATE: f64 = 0.08;
const PENALTY_BLOCKED_TOPIC: f64 = 1.0;
const PENALTY_DEGRADED_SOURCE: f64 = 0.10;

/// Preferências que influenciam o score. Nunca saem da máquina do usuário.
#[derive(Debug, Default, Clone)]
pub struct RankingPreferences {
    pub followed_topics: Vec<String>,
    pub blocked_topics: Vec<String>,
    pub preferred_sources: Vec<String>,
    pub degraded_sources: HashSet<String>,
}

/// Decaimento suave: 1,0 no instante da publicação, ~0,5 em 12 h, ~0,1 em 48 h.
fn recency_score(
    published_at: Option<DateTime<Utc>>,
    fetched_at: DateTime<Utc>,
    now: DateTime<Utc>,
) -> f64 {
    let reference = published_at.unwrap_or(fetched_at);
    let hours = (now - reference).num_minutes() as f64 / 60.0;
    if hours < 0.0 {
        return 1.0;
    }
    // Meia-vida de 12 horas.
    0.5_f64.powf(hours / 12.0)
}

fn source_quality(article: &StoredArticle, preferences: &RankingPreferences) -> f64 {
    let base = provider_by_id(&article.provider_id)
        .map(|provider| f64::from(provider.source_weight))
        .unwrap_or(0.5);
    if preferences.preferred_sources.contains(&article.provider_id) {
        (base + 0.25).min(1.0)
    } else {
        base
    }
}

/// Afinidade com os assuntos que o usuário escolheu seguir.
fn topic_affinity(article: &StoredArticle, preferences: &RankingPreferences) -> f64 {
    if preferences.followed_topics.is_empty() {
        // Sem preferência declarada, o sinal é neutro em vez de zero, para não
        // penalizar todo mundo igualmente e achatar o ranking.
        return 0.5;
    }
    let haystack = format!(
        "{} {}",
        article.title.to_lowercase(),
        article.tags.join(" ")
    );
    let tokens: HashSet<String> = normalize::title_tokens(&haystack).into_iter().collect();
    let matches = preferences
        .followed_topics
        .iter()
        .filter(|topic| {
            normalize::title_tokens(topic)
                .iter()
                .all(|token| tokens.contains(token))
        })
        .count();
    if matches == 0 {
        0.25
    } else {
        (0.6 + 0.2 * matches as f64).min(1.0)
    }
}

/// Fontes nacionais e categoria Brasil pontuam mais — o Radar é brasileiro.
fn brazil_relevance(article: &StoredArticle) -> f64 {
    let priority = provider_by_id(&article.provider_id).map(|provider| provider.priority);
    let national_source = matches!(priority, Some(ProviderPriority::P0 | ProviderPriority::P1));
    match (article.category, national_source) {
        (RadarNewsCategory::Brasil, _) => 1.0,
        (_, true) => 0.7,
        (_, false) => 0.2,
    }
}

fn content_completeness(article: &StoredArticle) -> f64 {
    let mut score: f64 = 0.0;
    if article.summary.is_some() {
        score += 0.5;
    }
    if article.image_id.is_some() {
        score += 0.3;
    }
    if article.author.is_some() {
        score += 0.1;
    }
    if !article.tags.is_empty() {
        score += 0.1;
    }
    score.min(1.0)
}

fn penalties(article: &StoredArticle, preferences: &RankingPreferences) -> f64 {
    let mut penalty = 0.0;
    if article.summary.is_none() && article.image_id.is_none() {
        penalty += PENALTY_NO_CONTENT;
    }
    if article.published_at.is_none() {
        penalty += PENALTY_NO_DATE;
    }
    if preferences.degraded_sources.contains(&article.provider_id) {
        penalty += PENALTY_DEGRADED_SOURCE;
    }
    if is_blocked(article, &preferences.blocked_topics) {
        penalty += PENALTY_BLOCKED_TOPIC;
    }
    penalty
}

/// Um assunto bloqueado zera efetivamente o artigo em vez de escondê-lo por
/// filtro — assim ele ainda pode reaparecer se o usuário desbloquear.
pub fn is_blocked(article: &StoredArticle, blocked_topics: &[String]) -> bool {
    if blocked_topics.is_empty() {
        return false;
    }
    let tokens: HashSet<String> =
        normalize::title_tokens(&format!("{} {}", article.title, article.tags.join(" ")))
            .into_iter()
            .collect();
    blocked_topics.iter().any(|topic| {
        let topic_tokens = normalize::title_tokens(topic);
        !topic_tokens.is_empty() && topic_tokens.iter().all(|token| tokens.contains(token))
    })
}

/// Score de um artigo isolado, sem o componente de diversidade (que só existe
/// em relação ao conjunto).
pub fn base_score(
    article: &StoredArticle,
    preferences: &RankingPreferences,
    now: DateTime<Utc>,
) -> f64 {
    let score = recency_score(article.published_at, article.fetched_at, now) * WEIGHT_RECENCY
        + source_quality(article, preferences) * WEIGHT_SOURCE
        + topic_affinity(article, preferences) * WEIGHT_AFFINITY
        + brazil_relevance(article) * WEIGHT_BRAZIL
        + content_completeness(article) * WEIGHT_COMPLETENESS;
    (score - penalties(article, preferences)).max(0.0)
}

/// Calcula o score de todos os artigos e aplica o passe de diversidade.
///
/// O passe de diversidade reordena de forma gulosa: a cada posição escolhe o
/// artigo de maior score já descontada a repetição de fonte e de cluster
/// acumulada até ali. Isso evita que uma única fonte ocupe a primeira tela.
pub fn rank(
    mut articles: Vec<StoredArticle>,
    preferences: &RankingPreferences,
    now: DateTime<Utc>,
) -> Vec<StoredArticle> {
    for article in &mut articles {
        article.score = base_score(article, preferences, now);
    }
    // Ordem base determinística antes do passe guloso.
    articles.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.published_at.cmp(&left.published_at))
            .then_with(|| left.id.cmp(&right.id))
    });

    let mut remaining: Vec<StoredArticle> = articles;
    let mut ordered: Vec<StoredArticle> = Vec::with_capacity(remaining.len());
    let mut source_counts: std::collections::HashMap<String, usize> = Default::default();
    let mut cluster_counts: std::collections::HashMap<String, usize> = Default::default();

    while !remaining.is_empty() {
        let mut best_index = 0usize;
        let mut best_value = f64::MIN;
        for (index, article) in remaining.iter().enumerate() {
            let source_repeats = *source_counts.get(&article.provider_id).unwrap_or(&0);
            let cluster_repeats = article
                .cluster_id
                .as_ref()
                .and_then(|cluster| cluster_counts.get(cluster))
                .copied()
                .unwrap_or(0);
            // A penalidade por repetição ultrapassa o peso do sinal de propósito:
            // limitada a `WEIGHT_DIVERSITY`, uma fonte com vantagem de qualidade
            // ocuparia as primeiras posições inteiras. Com esta curva, no máximo
            // duas entradas consecutivas vêm da mesma fonte.
            let diversity = (WEIGHT_DIVERSITY - source_repeats as f64 * 0.06).max(-0.30)
                - (cluster_repeats as f64 * 0.15).min(0.45);
            let value = article.score + diversity;
            if value > best_value {
                best_value = value;
                best_index = index;
            }
        }
        let chosen = remaining.remove(best_index);
        *source_counts.entry(chosen.provider_id.clone()).or_insert(0) += 1;
        if let Some(cluster) = chosen.cluster_id.clone() {
            *cluster_counts.entry(cluster).or_insert(0) += 1;
        }
        ordered.push(chosen);
    }

    ordered
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::radar::security;

    fn article(
        id: &str,
        provider: &str,
        title: &str,
        category: RadarNewsCategory,
    ) -> StoredArticle {
        let now = Utc::now();
        let url = format!("https://example.com/{id}");
        StoredArticle {
            id: id.to_string(),
            provider_id: provider.to_string(),
            canonical_url_hash: security::sha256_hex(&url),
            canonical_url: url,
            normalized_title: normalize::normalized_title(title),
            title: title.to_string(),
            summary: Some("resumo".into()),
            author: Some("autor".into()),
            category,
            tags: vec!["economia".into()],
            published_at: Some(now),
            fetched_at: now,
            image_id: Some("img".into()),
            score: 0.0,
            cluster_id: None,
            expires_at: now + chrono::Duration::days(30),
        }
    }

    #[test]
    fn recency_decays_monotonically_and_stays_bounded() {
        let now = Utc::now();
        let at = |hours: i64| recency_score(Some(now - chrono::Duration::hours(hours)), now, now);
        assert!((at(0) - 1.0).abs() < 1e-9);
        assert!(at(0) > at(6) && at(6) > at(12) && at(12) > at(48));
        assert!((at(12) - 0.5).abs() < 0.01, "meia-vida de 12 horas");
        assert!(at(240) > 0.0, "nunca fica negativo");
        // Data no futuro não gera score acima de 1.
        assert!(recency_score(Some(now + chrono::Duration::hours(5)), now, now) <= 1.0);
    }

    #[test]
    fn recency_falls_back_to_fetched_at_when_the_feed_omits_a_date() {
        let now = Utc::now();
        let old_fetch = now - chrono::Duration::hours(24);
        assert!(recency_score(None, old_fetch, now) < recency_score(None, now, now));
    }

    #[test]
    fn scores_stay_within_zero_and_one() {
        let now = Utc::now();
        let preferences = RankingPreferences::default();
        let best = article(
            "a",
            "agencia-brasil",
            "Governo anuncia pacote",
            RadarNewsCategory::Brasil,
        );
        let mut worst = article("b", "tabnews", "Post qualquer", RadarNewsCategory::World);
        worst.summary = None;
        worst.image_id = None;
        worst.author = None;
        worst.tags = Vec::new();
        worst.published_at = None;
        worst.fetched_at = now - chrono::Duration::days(20);

        let high = base_score(&best, &preferences, now);
        let low = base_score(&worst, &preferences, now);
        assert!((0.0..=1.0).contains(&high), "score fora de faixa: {high}");
        assert!((0.0..=1.0).contains(&low), "score fora de faixa: {low}");
        assert!(high > low);
    }

    #[test]
    fn institutional_brazilian_sources_outrank_international_complements() {
        let now = Utc::now();
        let preferences = RankingPreferences::default();
        let national = article(
            "a",
            "agencia-brasil",
            "Notícia nacional relevante",
            RadarNewsCategory::Brasil,
        );
        let international = article(
            "b",
            "github-blog",
            "Notícia internacional relevante",
            RadarNewsCategory::Development,
        );
        assert!(
            base_score(&national, &preferences, now)
                > base_score(&international, &preferences, now)
        );
    }

    #[test]
    fn followed_topics_raise_and_blocked_topics_annihilate_the_score() {
        let now = Utc::now();
        let subject = article(
            "a",
            "agencia-brasil",
            "Inteligência artificial avança na saúde pública",
            RadarNewsCategory::Technology,
        );

        let neutral = base_score(&subject, &RankingPreferences::default(), now);
        let followed = base_score(
            &subject,
            &RankingPreferences {
                followed_topics: vec!["inteligência artificial".into()],
                ..Default::default()
            },
            now,
        );
        assert!(followed > neutral, "assunto seguido deve subir");

        let blocked = base_score(
            &subject,
            &RankingPreferences {
                blocked_topics: vec!["inteligência artificial".into()],
                ..Default::default()
            },
            now,
        );
        assert_eq!(blocked, 0.0, "assunto bloqueado é zerado");
        assert!(is_blocked(
            &subject,
            &["inteligência artificial".to_string()]
        ));
        assert!(!is_blocked(&subject, &["futebol".to_string()]));
        assert!(!is_blocked(&subject, &[]));
    }

    #[test]
    fn a_degraded_source_is_penalised_but_not_removed() {
        let now = Utc::now();
        let subject = article(
            "a",
            "infoq-br",
            "Arquitetura de sistemas distribuídos",
            RadarNewsCategory::Development,
        );
        let healthy = base_score(&subject, &RankingPreferences::default(), now);
        let degraded = base_score(
            &subject,
            &RankingPreferences {
                degraded_sources: HashSet::from(["infoq-br".to_string()]),
                ..Default::default()
            },
            now,
        );
        assert!(degraded < healthy);
        assert!(degraded > 0.0, "degradado ainda aparece");
    }

    #[test]
    fn articles_without_summary_and_image_are_penalised() {
        let now = Utc::now();
        let preferences = RankingPreferences::default();
        let complete = article("a", "agencia-brasil", "Título", RadarNewsCategory::Brasil);
        let mut empty = complete.clone();
        empty.id = "b".into();
        empty.summary = None;
        empty.image_id = None;
        assert!(base_score(&complete, &preferences, now) > base_score(&empty, &preferences, now));
    }

    #[test]
    fn diversity_pass_breaks_up_runs_from_a_single_source() {
        let now = Utc::now();
        let mut articles = Vec::new();
        for index in 0..4 {
            articles.push(article(
                &format!("ab{index}"),
                "agencia-brasil",
                &format!("Notícia nacional número {index}"),
                RadarNewsCategory::Brasil,
            ));
        }
        for index in 0..2 {
            articles.push(article(
                &format!("tb{index}"),
                "tecnoblog",
                &format!("Notícia de tecnologia número {index}"),
                RadarNewsCategory::Technology,
            ));
        }

        let ranked = rank(articles, &RankingPreferences::default(), now);
        let first_three: Vec<&str> = ranked
            .iter()
            .take(3)
            .map(|article| article.provider_id.as_str())
            .collect();
        assert!(
            first_three.iter().collect::<HashSet<_>>().len() > 1,
            "as três primeiras posições vieram todas da mesma fonte: {first_three:?}"
        );
    }

    #[test]
    fn ranking_is_deterministic_across_input_orders() {
        let now = Utc::now();
        let build = || {
            vec![
                article(
                    "a",
                    "agencia-brasil",
                    "Economia brasileira em foco hoje",
                    RadarNewsCategory::Brasil,
                ),
                article(
                    "b",
                    "infoq-br",
                    "Arquitetura moderna de microsserviços",
                    RadarNewsCategory::Development,
                ),
                article(
                    "c",
                    "cert-br",
                    "Alerta de vulnerabilidade crítica divulgado",
                    RadarNewsCategory::Security,
                ),
                article(
                    "d",
                    "tecnoblog",
                    "Novo aparelho chega ao mercado nacional",
                    RadarNewsCategory::Technology,
                ),
            ]
        };
        let forward = rank(build(), &RankingPreferences::default(), now);
        let mut reversed = build();
        reversed.reverse();
        let backward = rank(reversed, &RankingPreferences::default(), now);

        assert_eq!(
            forward.iter().map(|a| a.id.clone()).collect::<Vec<_>>(),
            backward.iter().map(|a| a.id.clone()).collect::<Vec<_>>(),
            "a ordem de entrada não pode alterar o resultado"
        );
    }

    #[test]
    fn ranking_preserves_every_article() {
        let now = Utc::now();
        let articles = vec![
            article(
                "a",
                "agencia-brasil",
                "Uma notícia qualquer nacional",
                RadarNewsCategory::Brasil,
            ),
            article(
                "b",
                "tabnews",
                "Publicação da comunidade sobre Rust",
                RadarNewsCategory::Development,
            ),
        ];
        let ranked = rank(articles, &RankingPreferences::default(), now);
        assert_eq!(ranked.len(), 2);
        let ids: HashSet<&str> = ranked.iter().map(|a| a.id.as_str()).collect();
        assert!(ids.contains("a") && ids.contains("b"));
    }

    #[test]
    fn repeated_clusters_are_pushed_down_the_list() {
        let now = Utc::now();
        let mut articles = Vec::new();
        for index in 0..3 {
            let mut item = article(
                &format!("c{index}"),
                "agencia-brasil",
                &format!("Assunto repetido variação {index}"),
                RadarNewsCategory::Brasil,
            );
            item.cluster_id = Some("mesmo-cluster".into());
            articles.push(item);
        }
        articles.push(article(
            "outro",
            "cert-br",
            "Assunto totalmente distinto aqui",
            RadarNewsCategory::Security,
        ));

        let ranked = rank(articles, &RankingPreferences::default(), now);
        let last_cluster_position = ranked
            .iter()
            .rposition(|a| a.cluster_id.as_deref() == Some("mesmo-cluster"))
            .expect("cluster presente");
        let other_position = ranked
            .iter()
            .position(|a| a.id == "outro")
            .expect("outro presente");
        assert!(
            other_position < last_cluster_position,
            "o artigo de outro assunto deveria vir antes do terceiro do mesmo cluster"
        );
    }

    #[test]
    fn ranking_an_empty_list_is_a_no_op() {
        assert!(rank(Vec::new(), &RankingPreferences::default(), Utc::now()).is_empty());
    }
}
