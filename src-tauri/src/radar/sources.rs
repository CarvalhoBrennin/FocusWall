//! Definições estáticas dos providers de notícias.
//!
//! Cada provider declara três allowlists distintas: os feeds que consultamos,
//! os hosts onde as matérias podem morar e os hosts de onde aceitamos imagens.
//! Não usamos wildcard amplo (`*.cloudfront.net` e similares) — cada CDN é
//! registrado pelo host exato observado nos testes de contrato.
//!
//! `image_hosts` já está declarado e validado por teste, mas só terá consumidor
//! quando o pipeline de imagens (etapa 6) for entregue.
#![allow(dead_code)]

use super::models::RadarNewsCategory;
use std::time::Duration;

/// Formato do payload que o provider entrega.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderFormat {
    /// RSS 2.0, Atom ou RDF, tratados pelo mesmo parser streaming.
    Feed,
    /// API JSON própria (TabNews).
    Json,
}

/// Prioridade editorial. P0/P1 são fontes brasileiras; P2 é complemento
/// internacional e nunca pode dominar a primeira tela.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ProviderPriority {
    P0,
    P1,
    P2,
}

#[derive(Debug, Clone, Copy)]
pub struct NewsProviderDefinition {
    pub id: &'static str,
    pub name: &'static str,
    /// Texto de atribuição exigido ao exibir conteúdo desta fonte.
    pub attribution: &'static str,
    pub homepage_url: &'static str,
    pub format: ProviderFormat,
    pub priority: ProviderPriority,
    /// Feeds consultados. Vários por provider quando há editorias separadas.
    pub feed_urls: &'static [&'static str],
    /// Hosts onde os feeds vivem (usado como allowlist da requisição de feed).
    pub feed_hosts: &'static [&'static str],
    /// Hosts aceitos para a URL canônica de uma matéria.
    pub article_hosts: &'static [&'static str],
    /// Hosts aceitos para download de imagem.
    pub image_hosts: &'static [&'static str],
    /// Categoria atribuída quando a classificação por conteúdo não decide.
    pub default_category: RadarNewsCategory,
    /// Peso de confiabilidade editorial (0..1) usado no ranking.
    pub source_weight: f32,
    pub refresh_interval: Duration,
    pub max_items: usize,
    /// Provider habilitado nesta build. Fontes sem contrato confirmado ficam
    /// desligadas até que o teste de contrato ao vivo passe.
    pub enabled: bool,
    /// Motivo do desligamento, exigido quando `enabled` é falso.
    pub disabled_reason: Option<&'static str>,
}

const MINUTES_15: Duration = Duration::from_secs(15 * 60);
const MINUTES_30: Duration = Duration::from_secs(30 * 60);
const MINUTES_60: Duration = Duration::from_secs(60 * 60);

pub const NEWS_PROVIDERS: &[NewsProviderDefinition] = &[
    NewsProviderDefinition {
        id: "agencia-brasil",
        name: "Agência Brasil",
        attribution: "Agência Brasil — Empresa Brasil de Comunicação (EBC)",
        homepage_url: "https://agenciabrasil.ebc.com.br/",
        format: ProviderFormat::Feed,
        priority: ProviderPriority::P0,
        feed_urls: &[
            "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
            "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
            "https://agenciabrasil.ebc.com.br/rss/geral/feed.xml",
            "https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml",
        ],
        feed_hosts: &["agenciabrasil.ebc.com.br"],
        article_hosts: &["agenciabrasil.ebc.com.br"],
        image_hosts: &[
            "agenciabrasil.ebc.com.br",
            "midias.agenciabrasil.ebc.com.br",
        ],
        default_category: RadarNewsCategory::Brasil,
        source_weight: 1.0,
        refresh_interval: MINUTES_15,
        max_items: 40,
        enabled: true,
        disabled_reason: None,
    },
    NewsProviderDefinition {
        id: "infoq-br",
        name: "InfoQ Brasil",
        attribution: "InfoQ Brasil",
        homepage_url: "https://www.infoq.com/br/",
        format: ProviderFormat::Feed,
        priority: ProviderPriority::P0,
        feed_urls: &["https://feed.infoq.com/br/Brasil/"],
        feed_hosts: &["feed.infoq.com"],
        article_hosts: &["www.infoq.com", "infoq.com"],
        image_hosts: &["res.infoq.com", "cdn.infoq.com"],
        default_category: RadarNewsCategory::Development,
        source_weight: 0.9,
        refresh_interval: MINUTES_30,
        max_items: 25,
        // Verificado em 31/07/2026: o endpoint responde 200 com um canal RSS
        // válido e **zero** itens. Deixá-lo ligado só produziria falhas de
        // validação e cooldown recorrente, sem nunca render conteúdo.
        enabled: false,
        disabled_reason: Some(
            "feed oficial responde 200 sem nenhum item (verificado em 31/07/2026)",
        ),
    },
    NewsProviderDefinition {
        id: "braziljs",
        name: "BrazilJS",
        attribution: "BrazilJS",
        homepage_url: "https://www.braziljs.org/",
        format: ProviderFormat::Feed,
        priority: ProviderPriority::P0,
        feed_urls: &["https://www.braziljs.org/feed"],
        feed_hosts: &["www.braziljs.org"],
        article_hosts: &["www.braziljs.org", "braziljs.org"],
        image_hosts: &["www.braziljs.org", "braziljs.org"],
        default_category: RadarNewsCategory::Development,
        source_weight: 0.75,
        refresh_interval: MINUTES_60,
        max_items: 20,
        enabled: true,
        disabled_reason: None,
    },
    NewsProviderDefinition {
        id: "cert-br",
        name: "CERT.br",
        attribution:
            "CERT.br — Centro de Estudos, Resposta e Tratamento de Incidentes de Segurança",
        homepage_url: "https://www.cert.br/",
        format: ProviderFormat::Feed,
        priority: ProviderPriority::P0,
        feed_urls: &["https://www2.cert.br/rss/certbr-rss.xml"],
        feed_hosts: &["www2.cert.br"],
        // Hosts observados no feed real em 31/07/2026. O CERT.br distribui as
        // publicações por subdomínios temáticos; sem eles todos os artigos de
        // segurança eram descartados na normalização.
        article_hosts: &[
            "cert.br",
            "www.cert.br",
            "www2.cert.br",
            "cartilha.cert.br",
            "cursos.cert.br",
            "forum.cert.br",
        ],
        image_hosts: &["www.cert.br", "www2.cert.br"],
        default_category: RadarNewsCategory::Security,
        source_weight: 0.95,
        refresh_interval: MINUTES_60,
        max_items: 20,
        enabled: true,
        disabled_reason: None,
    },
    NewsProviderDefinition {
        id: "tabnews",
        name: "TabNews",
        attribution: "TabNews — conteúdo da comunidade",
        homepage_url: "https://www.tabnews.com.br/",
        format: ProviderFormat::Json,
        priority: ProviderPriority::P1,
        feed_urls: &[
            "https://www.tabnews.com.br/api/v1/contents?page=1&per_page=30&strategy=relevant",
            "https://www.tabnews.com.br/api/v1/contents?page=1&per_page=30&strategy=new",
        ],
        feed_hosts: &["www.tabnews.com.br"],
        // O TabNews aceita `source_url` arbitrário, então a URL canônica só é
        // usada quando aponta para o próprio TabNews; o resto vira link interno.
        article_hosts: &["www.tabnews.com.br"],
        image_hosts: &[],
        default_category: RadarNewsCategory::Development,
        // Peso menor: conteúdo comunitário não tem curadoria institucional.
        source_weight: 0.55,
        refresh_interval: MINUTES_30,
        max_items: 25,
        enabled: true,
        disabled_reason: None,
    },
    NewsProviderDefinition {
        id: "tecnoblog",
        name: "Tecnoblog",
        attribution: "Tecnoblog",
        homepage_url: "https://tecnoblog.net/",
        format: ProviderFormat::Feed,
        priority: ProviderPriority::P1,
        feed_urls: &["https://tecnoblog.net/feed/"],
        feed_hosts: &["tecnoblog.net"],
        article_hosts: &["tecnoblog.net", "www.tecnoblog.net"],
        image_hosts: &["tecnoblog.net", "www.tecnoblog.net"],
        default_category: RadarNewsCategory::Technology,
        source_weight: 0.8,
        refresh_interval: MINUTES_30,
        max_items: 30,
        enabled: true,
        disabled_reason: None,
    },
    NewsProviderDefinition {
        id: "github-blog",
        name: "GitHub Blog",
        attribution: "The GitHub Blog",
        homepage_url: "https://github.blog/",
        format: ProviderFormat::Feed,
        priority: ProviderPriority::P2,
        feed_urls: &["https://github.blog/feed/"],
        feed_hosts: &["github.blog"],
        article_hosts: &["github.blog"],
        image_hosts: &["github.blog", "images.ctfassets.net"],
        default_category: RadarNewsCategory::Development,
        source_weight: 0.7,
        refresh_interval: MINUTES_60,
        max_items: 15,
        enabled: true,
        disabled_reason: None,
    },
];

pub fn provider_by_id(id: &str) -> Option<&'static NewsProviderDefinition> {
    NEWS_PROVIDERS.iter().find(|provider| provider.id == id)
}

pub fn enabled_providers() -> impl Iterator<Item = &'static NewsProviderDefinition> {
    NEWS_PROVIDERS.iter().filter(|provider| provider.enabled)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn provider_ids_are_unique_and_resolvable() {
        let mut seen = HashSet::new();
        for provider in NEWS_PROVIDERS {
            assert!(seen.insert(provider.id), "id duplicado: {}", provider.id);
            assert_eq!(provider_by_id(provider.id).map(|p| p.id), Some(provider.id));
        }
        assert!(provider_by_id("inexistente").is_none());
    }

    #[test]
    fn every_declared_url_is_https_and_every_host_is_lowercase() {
        for provider in NEWS_PROVIDERS {
            assert!(
                provider.homepage_url.starts_with("https://"),
                "{} tem homepage insegura",
                provider.id
            );
            assert!(!provider.feed_urls.is_empty(), "{} sem feed", provider.id);
            for url in provider.feed_urls {
                assert!(url.starts_with("https://"), "{url} não é https");
            }
            for host in provider
                .feed_hosts
                .iter()
                .chain(provider.article_hosts)
                .chain(provider.image_hosts)
            {
                assert_eq!(
                    *host,
                    host.to_ascii_lowercase(),
                    "host deve estar em minúsculas: {host}"
                );
                assert!(!host.starts_with('*'), "wildcard não é permitido: {host}");
                assert!(!host.is_empty());
            }
        }
    }

    #[test]
    fn every_feed_url_host_is_present_in_its_own_feed_allowlist() {
        for provider in NEWS_PROVIDERS {
            for url in provider.feed_urls {
                let parsed = url::Url::parse(url).expect("feed url");
                let host = parsed.host_str().expect("host");
                assert!(
                    provider.feed_hosts.contains(&host),
                    "{} consulta {host} mas não o declara em feed_hosts",
                    provider.id
                );
            }
        }
    }

    #[test]
    fn a_disabled_provider_must_state_why_and_an_enabled_one_must_not() {
        for provider in NEWS_PROVIDERS {
            if provider.enabled {
                assert!(
                    provider.disabled_reason.is_none(),
                    "{} está ligado mas declara motivo de desligamento",
                    provider.id
                );
            } else {
                let reason = provider.disabled_reason.unwrap_or_else(|| {
                    panic!("{} está desligado sem motivo declarado", provider.id)
                });
                assert!(
                    reason.len() > 20,
                    "{} tem motivo vago: {reason}",
                    provider.id
                );
            }
        }
    }

    #[test]
    fn disabled_providers_are_excluded_from_the_refresh_set() {
        let enabled: Vec<_> = enabled_providers().map(|provider| provider.id).collect();
        assert!(
            !enabled.contains(&"infoq-br"),
            "provider desligado foi consultado"
        );
        assert!(enabled.contains(&"agencia-brasil"));
        assert!(!enabled.is_empty());
    }

    #[test]
    fn brazilian_sources_dominate_the_priority_zero_tier() {
        // Conta apenas providers realmente ligados: um desligado não entrega
        // conteúdo, então não satisfaz a exigência do plano.
        let brazilian: Vec<_> = enabled_providers()
            .filter(|provider| provider.priority <= ProviderPriority::P1)
            .collect();
        assert!(
            brazilian.len() >= 4,
            "o plano exige pelo menos quatro fontes brasileiras ativas, há {}",
            brazilian.len()
        );
        // A única fonte internacional é complemento (P2).
        let international: Vec<_> = NEWS_PROVIDERS
            .iter()
            .filter(|provider| provider.id == "github-blog")
            .collect();
        assert_eq!(international.len(), 1);
        assert_eq!(international[0].priority, ProviderPriority::P2);
    }

    #[test]
    fn community_sources_weigh_less_than_institutional_ones() {
        let tabnews = provider_by_id("tabnews").expect("tabnews");
        let agencia = provider_by_id("agencia-brasil").expect("agencia");
        let cert = provider_by_id("cert-br").expect("cert");
        assert!(tabnews.source_weight < agencia.source_weight);
        assert!(tabnews.source_weight < cert.source_weight);
    }

    #[test]
    fn no_single_community_provider_is_the_only_source_of_a_category() {
        for category in RadarNewsCategory::ALL {
            let providers: Vec<_> = enabled_providers()
                .filter(|provider| provider.default_category == category)
                .collect();
            if providers.len() == 1 {
                assert!(
                    providers[0].priority <= ProviderPriority::P1,
                    "categoria {:?} depende exclusivamente de fonte de baixa prioridade",
                    category
                );
            }
        }
    }

    #[test]
    fn weights_and_limits_stay_inside_sane_ranges() {
        for provider in NEWS_PROVIDERS {
            assert!(
                (0.0..=1.0).contains(&provider.source_weight),
                "{} tem peso fora de 0..1",
                provider.id
            );
            assert!(provider.max_items > 0 && provider.max_items <= 100);
            assert!(provider.refresh_interval >= Duration::from_secs(60));
            assert!(!provider.attribution.is_empty());
        }
    }
}
