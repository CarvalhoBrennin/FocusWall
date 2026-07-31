//! Deduplicação em camadas e clustering por assunto.
//!
//! Camadas, na ordem: URL canônica exata, GUID da origem, título normalizado
//! exato e, por fim, similaridade de bigramas dentro da janela de 72 horas.

use super::{
    super::{config, models::StoredArticle, security},
    normalize,
};
use std::collections::{HashMap, HashSet};

/// Bigramas de tokens do título. Títulos de um único token viram um bigrama
/// degenerado para que ainda possam ser comparados.
fn bigrams(tokens: &[String]) -> HashSet<String> {
    if tokens.is_empty() {
        return HashSet::new();
    }
    if tokens.len() == 1 {
        return HashSet::from([tokens[0].clone()]);
    }
    tokens
        .windows(2)
        .map(|pair| format!("{} {}", pair[0], pair[1]))
        .collect()
}

/// Índice de Jaccard entre dois conjuntos de bigramas.
pub fn jaccard(left: &HashSet<String>, right: &HashSet<String>) -> f32 {
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let intersection = left.intersection(right).count() as f32;
    let union = left.union(right).count() as f32;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

/// Decide se dois artigos tratam do mesmo assunto.
///
/// Títulos curtos (menos de [`config::MIN_TOKENS_FOR_SIMILARITY`] tokens) nunca
/// são agrupados apenas por similaridade: "Bolsa fecha em alta" e "Bolsa fecha
/// em baixa" são quase idênticos como bigramas mas dizem o oposto.
pub fn same_topic(
    left: &StoredArticle,
    right: &StoredArticle,
    left_tokens: &[String],
    right_tokens: &[String],
    left_bigrams: &HashSet<String>,
    right_bigrams: &HashSet<String>,
) -> bool {
    if left.category != right.category {
        return false;
    }
    let within_window = match (left.published_at, right.published_at) {
        (Some(a), Some(b)) => (a - b).num_hours().abs() <= config::CLUSTER_WINDOW_HOURS,
        _ => (left.fetched_at - right.fetched_at).num_hours().abs() <= config::CLUSTER_WINDOW_HOURS,
    };
    if !within_window {
        return false;
    }
    if left_tokens.len() < config::MIN_TOKENS_FOR_SIMILARITY
        || right_tokens.len() < config::MIN_TOKENS_FOR_SIMILARITY
    {
        return false;
    }

    let threshold = if left.provider_id == right.provider_id {
        config::JACCARD_SAME_SOURCE
    } else {
        config::JACCARD_CROSS_SOURCE
    };
    jaccard(left_bigrams, right_bigrams) >= threshold
}

/// Resultado da deduplicação.
pub struct DedupeOutcome {
    pub articles: Vec<StoredArticle>,
    pub duplicates_removed: usize,
    pub clusters_formed: usize,
}

/// Remove duplicatas exatas e agrupa o restante em clusters por assunto.
///
/// A ordem de entrada define a precedência: o primeiro artigo de cada grupo é
/// mantido, então o chamador deve entregar a lista já ordenada por qualidade.
pub fn deduplicate_and_cluster(mut articles: Vec<StoredArticle>) -> DedupeOutcome {
    let before = articles.len();

    // Camada 1 e 2: URL canônica e GUID/ID já são únicos por construção do ID,
    // mas dois providers podem publicar a mesma URL. O hash resolve ambos.
    let mut seen_urls = HashSet::new();
    articles.retain(|article| seen_urls.insert(article.canonical_url_hash.clone()));

    // Camada 3: título normalizado exato dentro da mesma categoria.
    let mut seen_titles = HashSet::new();
    articles
        .retain(|article| seen_titles.insert((article.category, article.normalized_title.clone())));

    // Camada 4: similaridade por bigramas.
    let tokens: Vec<Vec<String>> = articles
        .iter()
        .map(|article| normalize::title_tokens(&article.title))
        .collect();
    let grams: Vec<HashSet<String>> = tokens.iter().map(|token| bigrams(token)).collect();

    // União por conjuntos disjuntos simples: cada artigo aponta para o líder.
    //
    // A comparação é restrita aos líderes já vistos **da mesma categoria**.
    // `same_topic` exige categoria igual, então o balde não altera o resultado
    // — só evita o O(n²) global, que ficaria caro no lote de reprocessamento
    // (centenas de artigos já persistidos entram junto com os novos).
    let mut leader: Vec<usize> = (0..articles.len()).collect();
    let mut leaders_by_category: HashMap<_, Vec<usize>> = HashMap::new();
    for index in 0..articles.len() {
        let bucket = leaders_by_category
            .entry(articles[index].category)
            .or_default();
        let mut joined = false;
        for candidate in bucket.iter().copied() {
            if same_topic(
                &articles[candidate],
                &articles[index],
                &tokens[candidate],
                &tokens[index],
                &grams[candidate],
                &grams[index],
            ) {
                leader[index] = candidate;
                joined = true;
                break;
            }
        }
        if !joined {
            // Só líderes entram no balde, preservando a semântica anterior de
            // ignorar artigos que já pertencem a outro cluster.
            bucket.push(index);
        }
    }

    // Atribui `cluster_id` apenas a grupos com mais de um artigo; artigos
    // isolados permanecem sem cluster para não inflar o banco.
    let mut members: HashMap<usize, Vec<usize>> = HashMap::new();
    for (index, owner) in leader.iter().enumerate() {
        members.entry(*owner).or_default().push(index);
    }
    let mut clusters_formed = 0usize;
    for (owner, group) in &members {
        if group.len() < 2 {
            continue;
        }
        clusters_formed += 1;
        // ID do cluster derivado do artigo primário: estável entre refreshes.
        let cluster_id = security::sha256_hex(&format!("cluster\u{0}{}", articles[*owner].id));
        for index in group {
            articles[*index].cluster_id = Some(cluster_id.clone());
        }
    }

    DedupeOutcome {
        duplicates_removed: before - articles.len(),
        clusters_formed,
        articles,
    }
}

/// Escolhe o artigo primário de um cluster: fonte mais confiável, depois
/// completude, depois recência.
pub fn choose_primary<'a>(
    cluster: &'a [StoredArticle],
    source_weight: &dyn Fn(&str) -> f32,
) -> Option<&'a StoredArticle> {
    cluster.iter().max_by(|left, right| {
        let completeness = |article: &StoredArticle| {
            usize::from(article.summary.is_some()) + usize::from(article.image_id.is_some())
        };
        source_weight(&left.provider_id)
            .partial_cmp(&source_weight(&right.provider_id))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| completeness(left).cmp(&completeness(right)))
            .then_with(|| left.published_at.cmp(&right.published_at))
            .then_with(|| {
                left.score
                    .partial_cmp(&right.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            // Desempate final determinístico.
            .then_with(|| right.id.cmp(&left.id))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::radar::models::RadarNewsCategory;
    use chrono::{DateTime, Utc};

    fn article(
        id: &str,
        provider: &str,
        title: &str,
        category: RadarNewsCategory,
        published: DateTime<Utc>,
    ) -> StoredArticle {
        let url = format!("https://example.com/{id}");
        StoredArticle {
            id: id.to_string(),
            provider_id: provider.to_string(),
            canonical_url_hash: security::sha256_hex(&url),
            canonical_url: url,
            normalized_title: normalize::normalized_title(title),
            title: title.to_string(),
            summary: None,
            author: None,
            category,
            tags: Vec::new(),
            published_at: Some(published),
            fetched_at: published,
            image_id: None,
            score: 0.0,
            cluster_id: None,
            expires_at: published + chrono::Duration::days(30),
        }
    }

    #[test]
    fn jaccard_is_symmetric_and_bounded() {
        let left = bigrams(&normalize::title_tokens(
            "economia brasileira cresce no trimestre",
        ));
        let right = bigrams(&normalize::title_tokens(
            "economia brasileira cresce no semestre",
        ));
        let score = jaccard(&left, &right);
        assert_eq!(score, jaccard(&right, &left));
        assert!((0.0..=1.0).contains(&score));
        assert_eq!(jaccard(&left, &left), 1.0);
        assert_eq!(jaccard(&left, &HashSet::new()), 0.0);
    }

    #[test]
    fn identical_urls_from_different_providers_collapse_to_one() {
        let now = Utc::now();
        let mut first = article(
            "a",
            "agencia-brasil",
            "Título um distinto aqui",
            RadarNewsCategory::Brasil,
            now,
        );
        let mut second = article(
            "b",
            "infoq-br",
            "Outro título completamente diferente",
            RadarNewsCategory::Brasil,
            now,
        );
        // Mesmo destino final.
        first.canonical_url_hash = "mesmo-hash".into();
        second.canonical_url_hash = "mesmo-hash".into();

        let outcome = deduplicate_and_cluster(vec![first, second]);
        assert_eq!(outcome.articles.len(), 1);
        assert_eq!(outcome.duplicates_removed, 1);
        assert_eq!(outcome.articles[0].id, "a", "o primeiro da lista prevalece");
    }

    #[test]
    fn identical_normalized_titles_collapse_even_with_different_urls() {
        let now = Utc::now();
        let outcome = deduplicate_and_cluster(vec![
            article(
                "a",
                "agencia-brasil",
                "Inflação sobe em julho no país",
                RadarNewsCategory::Brasil,
                now,
            ),
            article(
                "b",
                "infoq-br",
                "INFLAÇÃO SOBE EM JULHO NO PAÍS!",
                RadarNewsCategory::Brasil,
                now,
            ),
        ]);
        assert_eq!(outcome.articles.len(), 1);
        assert_eq!(outcome.duplicates_removed, 1);
    }

    /// Duas coberturas do mesmo fato, com uma única palavra diferente no fim.
    /// Jaccard de bigramas ≈ 0,83, acima do limiar cross-source de 0,82.
    const COVERAGE_A: &str =
        "Governo federal anuncia novo pacote de investimento em infraestrutura de portos, ferrovias, rodovias e aeroportos do país";
    const COVERAGE_B: &str =
        "Governo federal anuncia novo pacote de investimento em infraestrutura de portos, ferrovias, rodovias e aeroportos do Brasil";

    #[test]
    fn the_similarity_threshold_matches_the_documented_value() {
        let left = bigrams(&normalize::title_tokens(COVERAGE_A));
        let right = bigrams(&normalize::title_tokens(COVERAGE_B));
        let score = jaccard(&left, &right);
        assert!(
            score >= config::JACCARD_CROSS_SOURCE,
            "similaridade {score} abaixo do limiar cross-source"
        );
        assert!(
            score < config::JACCARD_SAME_SOURCE,
            "similaridade {score} não deveria bastar dentro da mesma fonte"
        );
    }

    #[test]
    fn near_duplicate_titles_from_different_sources_form_a_cluster_without_being_deleted() {
        let now = Utc::now();
        let outcome = deduplicate_and_cluster(vec![
            article(
                "a",
                "agencia-brasil",
                COVERAGE_A,
                RadarNewsCategory::Brasil,
                now,
            ),
            article("b", "tecnoblog", COVERAGE_B, RadarNewsCategory::Brasil, now),
        ]);
        assert_eq!(outcome.articles.len(), 2, "cluster não apaga o artigo");
        assert_eq!(outcome.clusters_formed, 1);
        let cluster = outcome.articles[0].cluster_id.clone().expect("cluster");
        assert_eq!(
            outcome.articles[1].cluster_id.as_deref(),
            Some(cluster.as_str())
        );
    }

    #[test]
    fn the_same_source_needs_a_higher_similarity_to_cluster() {
        let now = Utc::now();
        let outcome = deduplicate_and_cluster(vec![
            article(
                "a",
                "agencia-brasil",
                COVERAGE_A,
                RadarNewsCategory::Brasil,
                now,
            ),
            article(
                "b",
                "agencia-brasil",
                COVERAGE_B,
                RadarNewsCategory::Brasil,
                now,
            ),
        ]);
        assert_eq!(
            outcome.clusters_formed, 0,
            "0,83 fica abaixo do limiar de 0,90 exigido na mesma fonte"
        );
    }

    #[test]
    fn unrelated_articles_are_never_clustered() {
        let now = Utc::now();
        let outcome = deduplicate_and_cluster(vec![
            article(
                "a",
                "agencia-brasil",
                "Governo anuncia pacote de infraestrutura nacional",
                RadarNewsCategory::Brasil,
                now,
            ),
            article(
                "b",
                "agencia-brasil",
                "Time brasileiro vence campeonato continental de robótica",
                RadarNewsCategory::Brasil,
                now,
            ),
        ]);
        assert_eq!(outcome.articles.len(), 2);
        assert_eq!(outcome.clusters_formed, 0);
        assert!(outcome.articles.iter().all(|a| a.cluster_id.is_none()));
    }

    #[test]
    fn short_titles_are_never_clustered_by_similarity_alone() {
        let now = Utc::now();
        // "Bolsa fecha em alta" vs "Bolsa fecha em baixa": bigramas quase iguais,
        // significado oposto. Menos tokens que o mínimo exigido.
        let outcome = deduplicate_and_cluster(vec![
            article(
                "a",
                "agencia-brasil",
                "Bolsa fecha em alta",
                RadarNewsCategory::Business,
                now,
            ),
            article(
                "b",
                "tecnoblog",
                "Bolsa fecha em baixa",
                RadarNewsCategory::Business,
                now,
            ),
        ]);
        assert_eq!(outcome.articles.len(), 2);
        assert_eq!(outcome.clusters_formed, 0);
    }

    #[test]
    fn articles_outside_the_time_window_are_not_clustered() {
        let now = Utc::now();
        let old = now - chrono::Duration::hours(config::CLUSTER_WINDOW_HOURS + 5);
        let outcome = deduplicate_and_cluster(vec![
            article(
                "a",
                "agencia-brasil",
                COVERAGE_A,
                RadarNewsCategory::Brasil,
                now,
            ),
            article("b", "tecnoblog", COVERAGE_B, RadarNewsCategory::Brasil, old),
        ]);
        assert_eq!(
            outcome.clusters_formed, 0,
            "os mesmos títulos agrupariam dentro da janela; só a data os separa"
        );
    }

    #[test]
    fn articles_in_different_categories_are_not_clustered() {
        let now = Utc::now();
        let outcome = deduplicate_and_cluster(vec![
            article(
                "a",
                "agencia-brasil",
                COVERAGE_A,
                RadarNewsCategory::Brasil,
                now,
            ),
            article(
                "b",
                "tecnoblog",
                COVERAGE_B,
                RadarNewsCategory::Technology,
                now,
            ),
        ]);
        assert_eq!(outcome.articles.len(), 2);
        assert_eq!(outcome.clusters_formed, 0);
    }

    #[test]
    fn a_large_batch_is_processed_without_quadratic_blowup() {
        // Regressão de performance: antes do agrupamento por categoria este
        // lote fazia ~1,4 milhão de comparações de conjuntos de bigramas.
        let now = Utc::now();
        let categories = RadarNewsCategory::ALL;
        let articles: Vec<StoredArticle> = (0..1_200)
            .map(|index| {
                article(
                    &format!("a{index}"),
                    "agencia-brasil",
                    &format!("Notícia distinta de número {index} publicada hoje no país"),
                    categories[index % categories.len()],
                    now,
                )
            })
            .collect();

        let started = std::time::Instant::now();
        let outcome = deduplicate_and_cluster(articles);
        let elapsed = started.elapsed();

        assert_eq!(outcome.articles.len(), 1_200);
        assert_eq!(outcome.duplicates_removed, 0);
        assert!(
            elapsed < std::time::Duration::from_secs(5),
            "deduplicação levou {elapsed:?}, sinal de regressão de complexidade"
        );
    }

    #[test]
    fn bucketing_by_category_does_not_change_clustering_results() {
        let now = Utc::now();
        // Artigos de categorias diferentes intercalados com um par agrupável:
        // o balde não pode fazer o par deixar de se encontrar.
        let outcome = deduplicate_and_cluster(vec![
            article(
                "a",
                "agencia-brasil",
                COVERAGE_A,
                RadarNewsCategory::Brasil,
                now,
            ),
            article(
                "ruido1",
                "cert-br",
                "Alerta de vulnerabilidade em servidores",
                RadarNewsCategory::Security,
                now,
            ),
            article(
                "ruido2",
                "tecnoblog",
                "Novo aparelho chega ao mercado nacional",
                RadarNewsCategory::Technology,
                now,
            ),
            article("b", "tecnoblog", COVERAGE_B, RadarNewsCategory::Brasil, now),
        ]);
        assert_eq!(outcome.clusters_formed, 1);
        let cluster = outcome
            .articles
            .iter()
            .find(|item| item.id == "a")
            .and_then(|item| item.cluster_id.clone())
            .expect("cluster do primeiro artigo");
        assert_eq!(
            outcome
                .articles
                .iter()
                .find(|item| item.id == "b")
                .and_then(|item| item.cluster_id.clone()),
            Some(cluster)
        );
    }

    #[test]
    fn running_the_pipeline_twice_is_idempotent() {
        let now = Utc::now();
        let input = vec![
            article(
                "a",
                "agencia-brasil",
                "Inflação sobe em julho no país inteiro",
                RadarNewsCategory::Brasil,
                now,
            ),
            article(
                "b",
                "infoq-br",
                "Inflação sobe em julho no país inteiro",
                RadarNewsCategory::Brasil,
                now,
            ),
            article(
                "c",
                "tecnoblog",
                "Novo processador chega ao mercado brasileiro",
                RadarNewsCategory::Technology,
                now,
            ),
        ];
        let first = deduplicate_and_cluster(input);
        let ids: Vec<_> = first.articles.iter().map(|a| a.id.clone()).collect();
        let second = deduplicate_and_cluster(first.articles);
        assert_eq!(
            second
                .articles
                .iter()
                .map(|a| a.id.clone())
                .collect::<Vec<_>>(),
            ids
        );
        assert_eq!(second.duplicates_removed, 0);
    }

    #[test]
    fn primary_selection_prefers_trusted_sources_then_completeness() {
        let now = Utc::now();
        let weights = |provider: &str| match provider {
            "agencia-brasil" => 1.0,
            "tecnoblog" => 0.8,
            _ => 0.5,
        };

        let mut community = article("a", "tabnews", "Título", RadarNewsCategory::Brasil, now);
        community.summary = Some("resumo".into());
        community.image_id = Some("img".into());
        let institutional = article(
            "b",
            "agencia-brasil",
            "Título",
            RadarNewsCategory::Brasil,
            now,
        );

        let cluster = vec![community, institutional];
        assert_eq!(
            choose_primary(&cluster, &weights).map(|a| a.id.as_str()),
            Some("b"),
            "confiabilidade da fonte vem antes de completude"
        );

        // Empatando a fonte, completude decide.
        let mut poor = article("c", "agencia-brasil", "T", RadarNewsCategory::Brasil, now);
        poor.summary = None;
        let mut rich = article("d", "agencia-brasil", "T", RadarNewsCategory::Brasil, now);
        rich.summary = Some("resumo".into());
        assert_eq!(
            choose_primary(&[poor, rich], &weights).map(|a| a.id.as_str()),
            Some("d")
        );

        assert!(choose_primary(&[], &weights).is_none());
    }
}
