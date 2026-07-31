//! Testes de contrato ao vivo (etapa 21.3 do plano).
//!
//! Ficam atrás da feature `live-provider-tests` para que a suíte padrão
//! permaneça determinística e sem rede:
//!
//! ```bash
//! cargo test --manifest-path src-tauri/Cargo.toml \
//!     --features live-provider-tests provider_contract
//! ```
//!
//! Eles exercitam o caminho real — `SecureHttpClient` com resolver próprio,
//! redirects manuais, allowlists e parsers — contra os endpoints de produção.

#![cfg(feature = "live-provider-tests")]

use super::{
    http::SecureHttpClient,
    market,
    models::{RadarLocation, RadarQuoteKind},
    news::{rss_atom, tabnews},
    sources::{self, ProviderFormat},
    weather::{self, WeatherProviderMode},
};
use chrono::Utc;

fn client() -> SecureHttpClient {
    SecureHttpClient::new().expect("cliente HTTP")
}

fn sao_paulo() -> RadarLocation {
    RadarLocation {
        id: "live-sp".into(),
        name: "São Paulo".into(),
        admin1: Some("São Paulo".into()),
        country: "Brasil".into(),
        country_code: "BR".into(),
        latitude: -23.5505,
        longitude: -46.6333,
        timezone: "America/Sao_Paulo".into(),
    }
}

#[tokio::test]
async fn provider_contract_news_sources_return_parseable_articles() {
    let client = client();
    let mut working = 0usize;
    let mut report = Vec::new();

    for provider in sources::enabled_providers() {
        let mut articles = Vec::new();
        let mut last_error = None;

        for feed_url in provider.feed_urls {
            let url = reqwest::Url::parse(feed_url).expect("url do feed");
            let (expected, max_bytes) = match provider.format {
                ProviderFormat::Feed => (
                    super::http::ExpectedContent::Feed,
                    super::config::MAX_FEED_BYTES,
                ),
                ProviderFormat::Json => (
                    super::http::ExpectedContent::Json,
                    super::config::MAX_TABNEWS_BYTES,
                ),
            };
            let result = client
                .fetch(super::http::FetchSpec {
                    url,
                    allowlist: provider.feed_hosts,
                    max_bytes,
                    expected,
                    total_timeout: super::config::REQUEST_TIMEOUT,
                })
                .await
                .and_then(|body| match provider.format {
                    ProviderFormat::Feed => rss_atom::parse_feed(&body.bytes, provider),
                    ProviderFormat::Json => tabnews::parse_contents(&body.bytes, provider),
                });
            match result {
                Ok(mut parsed) => articles.append(&mut parsed),
                Err(error) => last_error = Some(error.kind),
            }
        }

        if articles.is_empty() {
            report.push(format!("{}: FALHOU ({last_error:?})", provider.id));
            continue;
        }

        working += 1;
        // Todo artigo precisa ter título, URL canônica no host do provider e
        // data plausível — é o mínimo para virar `StoredArticle`.
        for article in articles.iter().take(5) {
            assert!(
                !article.title.trim().is_empty(),
                "{} sem título",
                provider.id
            );
            let host = reqwest::Url::parse(&article.canonical_url)
                .ok()
                .and_then(|url| url.host_str().map(str::to_string))
                .unwrap_or_default();
            assert!(
                provider.article_hosts.contains(&host.as_str()),
                "{} devolveu host fora da allowlist: {host}",
                provider.id
            );
        }
        report.push(format!("{}: {} artigos", provider.id, articles.len()));
    }

    println!("contrato de notícias:\n  {}", report.join("\n  "));
    assert!(
        working >= 4,
        "o plano exige pelo menos quatro fontes funcionando; funcionaram {working}\n{}",
        report.join("\n")
    );
}

#[tokio::test]
async fn provider_contract_weather_returns_seven_days_and_twelve_hours() {
    let weather = weather::fetch_weather(&client(), &sao_paulo(), &WeatherProviderMode::Public)
        .await
        .expect("previsão real");

    assert_eq!(weather.daily.len(), 7, "o plano exige 7 dias");
    assert!(
        weather.hourly.len() >= 12,
        "o plano exige ao menos 12 horas, veio {}",
        weather.hourly.len()
    );
    assert_eq!(weather.timezone, "America/Sao_Paulo");
    assert!(weather.current.wind_gusts_kmh.is_some(), "rajadas ausentes");
    assert!(weather.alerts.iter().all(|alert| alert.is_estimate));
    println!(
        "clima: {} °C, {} horas, {} dias, {} sinalizações",
        weather.current.temperature_celsius,
        weather.hourly.len(),
        weather.daily.len(),
        weather.alerts.len()
    );
}

#[tokio::test]
async fn provider_contract_ptax_returns_a_recent_quote() {
    let now = Utc::now();
    let client = client();

    for (symbol, currency) in [("usd-brl", "USD"), ("eur-brl", "EUR")] {
        let (rate, observed_at) = market::fetch_ptax(&client, currency, now)
            .await
            .unwrap_or_else(|error| panic!("PTAX {currency} falhou: {:?}", error.kind));

        assert!(rate > 0.0 && rate < 100.0, "cotação implausível: {rate}");
        // A janela consultada é de dez dias; nada mais antigo deveria voltar.
        let age_days = (now - observed_at).num_days();
        assert!(age_days <= 10, "cotação de {age_days} dias atrás");

        let item = market::ptax_ticker_item(symbol, currency, rate, observed_at, now);
        assert_eq!(
            item.quote_kind,
            RadarQuoteKind::Ptax,
            "precisa ser rotulado PTAX"
        );
        assert!(item.variation.is_none(), "variação não pode ser inventada");
        println!("PTAX {currency}: {} em {observed_at}", item.value);
    }
}

#[tokio::test]
async fn provider_contract_usgs_returns_wellformed_events() {
    let now = Utc::now();
    let events = market::fetch_events(&client(), now)
        .await
        .expect("eventos USGS");
    for event in &events {
        assert!(event.magnitude >= super::config::EVENT_MIN_MAGNITUDE_REGIONAL);
        assert!(event.occurred_at <= now);
        assert!(!event.id.is_empty());
    }
    println!("USGS: {} eventos relevantes", events.len());
}

#[tokio::test]
async fn provider_contract_location_search_finds_a_brazilian_city() {
    let locations = weather::search_locations(&client(), "Campinas", "pt-BR")
        .await
        .expect("busca de cidade");
    assert!(!locations.is_empty(), "nenhuma cidade encontrada");
    assert!(
        locations
            .iter()
            .any(|location| location.country_code == "BR"),
        "nenhum resultado brasileiro"
    );
    println!("geocoding: {} resultados", locations.len());
}
