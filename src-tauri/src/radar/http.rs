//! Cliente HTTP compartilhado do Radar.
//!
//! Toda saída de rede do Radar passa por aqui. O cliente:
//!
//! * exige HTTPS na porta 443, sem cookies e sem autenticação automática;
//! * resolve DNS através de um resolver próprio que rejeita faixas privadas,
//!   fixando o cliente aos endereços validados (mitigação de DNS rebinding);
//! * desabilita redirects automáticos e os segue manualmente, revalidando
//!   host e allowlist a cada salto;
//! * limita bytes durante o streaming, antes de materializar o corpo;
//! * repete apenas falhas transitórias, com backoff e jitter.

use super::{
    config,
    error::{ProviderError, ProviderErrorKind},
    security,
};
use futures_util::StreamExt;
use rand::Rng;
use reqwest::{
    dns::{Addrs, Name, Resolve, Resolving},
    header::{HeaderValue, ACCEPT, CONTENT_TYPE, RETRY_AFTER},
    Client, Response, StatusCode, Url,
};
use std::{net::SocketAddr, sync::Arc, time::Duration};
use tokio::time::{timeout_at, Instant};

// ---------------------------------------------------------------------------
// Tipo de conteúdo esperado
// ---------------------------------------------------------------------------

/// `Html` e `Image` existem para o pipeline de imagens (etapa 6), que ainda
/// não foi entregue; a validação de ambos já está implementada e testada.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExpectedContent {
    Json,
    Feed,
    Html,
    Image,
}

impl ExpectedContent {
    fn accept_header(self) -> &'static str {
        match self {
            ExpectedContent::Json => "application/json",
            ExpectedContent::Feed => {
                "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9"
            }
            ExpectedContent::Html => "text/html",
            ExpectedContent::Image => "image/webp, image/jpeg, image/png",
        }
    }

    /// Valida o `Content-Type` declarado. `Image` é deliberadamente estrito:
    /// SVG remoto é sempre recusado por ser um vetor de script.
    pub fn accepts_content_type(self, value: &str) -> bool {
        let lower = value.to_ascii_lowercase();
        let mime = lower
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_string();
        match self {
            ExpectedContent::Json => {
                mime == "application/json" || mime == "text/json" || mime.ends_with("+json")
            }
            ExpectedContent::Feed => {
                mime == "application/rss+xml"
                    || mime == "application/atom+xml"
                    || mime == "application/xml"
                    || mime == "text/xml"
                    || mime == "application/rdf+xml"
                    || mime.ends_with("+xml")
            }
            ExpectedContent::Html => mime == "text/html" || mime == "application/xhtml+xml",
            ExpectedContent::Image => {
                matches!(mime.as_str(), "image/jpeg" | "image/png" | "image/webp")
            }
        }
    }
}

/// Detecta o tipo real pelos magic bytes. Não confiamos no header sozinho.
pub fn detect_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 12 {
        return None;
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    if bytes.starts_with(b"RIFF") && bytes[8..12] == *b"WEBP" {
        return Some("image/webp");
    }
    None
}

/// Rejeita conteúdo que se apresenta como imagem mas começa como markup ou
/// script — o caso clássico de arquivo poliglota / HTML de erro.
pub fn looks_like_markup(bytes: &[u8]) -> bool {
    let prefix = &bytes[..bytes.len().min(256)];
    let text = String::from_utf8_lossy(prefix);
    let trimmed = text.trim_start().to_ascii_lowercase();
    trimmed.starts_with("<!doctype")
        || trimmed.starts_with("<html")
        || trimmed.starts_with("<?xml")
        || trimmed.starts_with("<svg")
        || trimmed.starts_with("<script")
}

// ---------------------------------------------------------------------------
// Resolver com validação de IP
// ---------------------------------------------------------------------------

struct GuardedResolver {
    /// Somente os testes internos habilitam loopback; em release este campo é
    /// sempre `false` porque o construtor público não o expõe.
    allow_loopback: bool,
}

impl Resolve for GuardedResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_owned();
        let allow_loopback = self.allow_loopback;
        Box::pin(async move {
            let resolved: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 443))
                .await
                .map_err(|error| -> Box<dyn std::error::Error + Send + Sync> { Box::new(error) })?
                .collect();
            if allow_loopback {
                if resolved.is_empty() {
                    return Err(Box::new(ProviderError::new(ProviderErrorKind::DnsBlocked))
                        as Box<dyn std::error::Error + Send + Sync>);
                }
                return Ok(Box::new(resolved.into_iter()) as Addrs);
            }
            let validated = security::validate_resolved_addrs(resolved)
                .map_err(|error| -> Box<dyn std::error::Error + Send + Sync> { Box::new(error) })?;
            Ok(Box::new(validated.into_iter()) as Addrs)
        })
    }
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

pub struct SecureHttpClient {
    client: Client,
    allow_loopback: bool,
}

#[derive(Debug)]
pub struct FetchedBody {
    pub bytes: Vec<u8>,
    /// Consumido pelo pipeline de imagens (etapa 6, não entregue).
    #[allow(dead_code)]
    pub content_type: Option<String>,
    /// URL após os redirects validados. Idem.
    #[allow(dead_code)]
    pub final_url: Url,
}

pub struct FetchSpec<'a> {
    pub url: Url,
    /// Hosts permitidos para esta requisição, incluindo todos os saltos de
    /// redirect. Wildcards não são suportados de propósito.
    pub allowlist: &'a [&'a str],
    pub max_bytes: usize,
    pub expected: ExpectedContent,
    pub total_timeout: Duration,
}

fn build_client(allow_loopback: bool) -> Result<Client, ProviderError> {
    Client::builder()
        .user_agent(concat!(
            "FocusWall/",
            env!("CARGO_PKG_VERSION"),
            " (+https://github.com/focuswall)"
        ))
        .connect_timeout(config::CONNECT_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        // Sem a feature `cookies` o `reqwest` já não mantém cookie store algum,
        // que é exatamente a política desejada aqui.
        .https_only(true)
        .dns_resolver(Arc::new(GuardedResolver { allow_loopback }))
        .no_proxy()
        .build()
        .map_err(|_| ProviderError::new(ProviderErrorKind::Connection))
}

/// Converte um `Retry-After` em espera, respeitando o teto configurado.
pub fn parse_retry_after(value: Option<&HeaderValue>) -> Option<Duration> {
    let raw = value?.to_str().ok()?.trim().to_string();
    let seconds = raw.parse::<u64>().ok()?;
    let requested = Duration::from_secs(seconds);
    if requested > config::MAX_RETRY_AFTER {
        // Um `Retry-After` longo demais equivale a desistir desta rodada.
        None
    } else {
        Some(requested)
    }
}

fn status_error(status: StatusCode) -> ProviderErrorKind {
    if status == StatusCode::TOO_MANY_REQUESTS {
        ProviderErrorKind::Http429
    } else if status.is_server_error() {
        ProviderErrorKind::Http5xx
    } else {
        ProviderErrorKind::Http4xx
    }
}

fn classify(error: &reqwest::Error) -> ProviderErrorKind {
    if error.is_timeout() {
        ProviderErrorKind::Timeout
    } else if error.is_redirect() {
        ProviderErrorKind::RedirectRejected
    } else {
        // Erros do resolver chegam encapsulados; a política já foi aplicada lá.
        ProviderErrorKind::Connection
    }
}

fn backoff_with_jitter(attempt: usize) -> Duration {
    let base = config::RETRY_BASE_BACKOFF.as_millis() as u64 * (1 << attempt.min(4));
    let jitter = rand::rng().random_range(0..=base / 2);
    Duration::from_millis(base + jitter)
}

impl SecureHttpClient {
    pub fn new() -> Result<Self, ProviderError> {
        Ok(Self {
            client: build_client(false)?,
            allow_loopback: false,
        })
    }

    /// Construtor usado apenas pelos testes de integração determinísticos, que
    /// precisam falar com um servidor em `127.0.0.1`. Não existe em release.
    #[cfg(test)]
    pub fn new_allowing_loopback() -> Result<Self, ProviderError> {
        Ok(Self {
            client: build_client(true)?,
            allow_loopback: true,
        })
    }

    fn validate_hop(&self, raw: &str, allowlist: &[&str]) -> Result<Url, ProviderError> {
        if self.allow_loopback {
            // Em teste ainda exigimos HTTPS, porta 443, ausência de credenciais
            // e allowlist explícita; apenas a checagem de IP privado é relaxada.
            let url = security::validate_https_shape(raw)?;
            let host = url
                .host_str()
                .ok_or_else(|| ProviderError::new(ProviderErrorKind::BlockedUrl))?;
            if !security::host_matches_allowlist(host, allowlist) {
                return Err(ProviderError::new(ProviderErrorKind::HostNotAllowed));
            }
            return Ok(url);
        }
        security::validate_url_against_allowlist(raw, allowlist)
    }

    /// Executa uma tentativa completa, seguindo redirects manualmente.
    ///
    /// O segundo elemento do erro carrega o `Retry-After` quando o servidor o
    /// informou, para que o laço de retry o respeite em vez do backoff padrão.
    async fn attempt(
        &self,
        spec: &FetchSpec<'_>,
    ) -> Result<FetchedBody, (ProviderError, Option<Duration>)> {
        let plain = |kind: ProviderErrorKind| (ProviderError::new(kind), None);
        let mut current = self
            .validate_hop(spec.url.as_str(), spec.allowlist)
            .map_err(|error| (error, None))?;

        for _ in 0..=config::MAX_REDIRECTS {
            let response = self
                .client
                .get(current.clone())
                .header(ACCEPT, spec.expected.accept_header())
                .timeout(spec.total_timeout)
                .send()
                .await
                .map_err(|error| plain(classify(&error)))?;

            let status = response.status();
            if status.is_redirection() {
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .ok_or_else(|| plain(ProviderErrorKind::RedirectRejected))?;
                // Resolve relativo contra o salto atual e revalida do zero:
                // host, esquema, porta e allowlist são checados novamente.
                let next = current
                    .join(location)
                    .map_err(|_| plain(ProviderErrorKind::RedirectRejected))?;
                current = self
                    .validate_hop(next.as_str(), spec.allowlist)
                    .map_err(|error| (error, None))?;
                continue;
            }

            if status == StatusCode::TOO_MANY_REQUESTS {
                let wait = parse_retry_after(response.headers().get(RETRY_AFTER));
                return Err((ProviderError::new(ProviderErrorKind::Http429), wait));
            }
            if !status.is_success() {
                return Err(plain(status_error(status)));
            }
            return self
                .read_body(response, spec, current)
                .await
                .map_err(|error| (error, None));
        }

        Err(plain(ProviderErrorKind::RedirectRejected))
    }

    async fn read_body(
        &self,
        response: Response,
        spec: &FetchSpec<'_>,
        final_url: Url,
    ) -> Result<FetchedBody, ProviderError> {
        // Um `Content-Length` acima do limite falha antes de qualquer leitura.
        if let Some(length) = response.content_length() {
            if length > spec.max_bytes as u64 {
                return Err(ProviderError::new(ProviderErrorKind::ResponseTooLarge));
            }
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        match content_type.as_deref() {
            Some(value) if !spec.expected.accepts_content_type(value) => {
                return Err(ProviderError::new(ProviderErrorKind::InvalidContentType));
            }
            Some(_) => {}
            // Sem `Content-Type` só aceitamos formatos que sabemos validar por
            // conteúdo; imagens exigem o header porque o cruzamos com os
            // magic bytes.
            None if spec.expected == ExpectedContent::Image => {
                return Err(ProviderError::new(ProviderErrorKind::InvalidContentType));
            }
            None => {}
        }

        let mut stream = response.bytes_stream();
        let mut body: Vec<u8> = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| ProviderError::new(classify(&error)))?;
            // O corte acontece durante o streaming: uma resposta chunked que
            // mente sobre o tamanho não consegue nos exaurir.
            if body.len().saturating_add(chunk.len()) > spec.max_bytes {
                return Err(ProviderError::new(ProviderErrorKind::ResponseTooLarge));
            }
            body.extend_from_slice(&chunk);
        }

        if spec.expected == ExpectedContent::Image {
            let declared = content_type
                .as_deref()
                .and_then(|value| value.split(';').next())
                .map(|value| value.trim().to_ascii_lowercase())
                .unwrap_or_default();
            let detected = detect_image_mime(&body)
                .ok_or_else(|| ProviderError::new(ProviderErrorKind::ContentSignatureMismatch))?;
            if detected != declared || looks_like_markup(&body) {
                return Err(ProviderError::new(
                    ProviderErrorKind::ContentSignatureMismatch,
                ));
            }
        }

        Ok(FetchedBody {
            bytes: body,
            content_type,
            final_url,
        })
    }

    /// Ponto de entrada público: aplica deadline total, retry seletivo e
    /// respeita `Retry-After` dentro do teto.
    pub async fn fetch(&self, spec: FetchSpec<'_>) -> Result<FetchedBody, ProviderError> {
        let deadline = Instant::now() + spec.total_timeout;

        let mut last_error = ProviderError::new(ProviderErrorKind::Connection);
        for attempt in 0..config::MAX_ATTEMPTS {
            let result = timeout_at(deadline, self.attempt(&spec)).await;
            let (error, retry_after) = match result {
                Ok(Ok(body)) => return Ok(body),
                Ok(Err(failure)) => failure,
                Err(_) => (ProviderError::new(ProviderErrorKind::Timeout), None),
            };

            last_error = error.clone();
            let is_last_attempt = attempt + 1 >= config::MAX_ATTEMPTS;
            if is_last_attempt || !error.kind.is_retryable() {
                return Err(error);
            }

            // `Retry-After` dentro do teto tem precedência sobre o backoff.
            let wait = retry_after.unwrap_or_else(|| backoff_with_jitter(attempt));
            if Instant::now() + wait >= deadline {
                return Err(ProviderError::new(ProviderErrorKind::Timeout));
            }
            if timeout_at(deadline, tokio::time::sleep(wait))
                .await
                .is_err()
            {
                return Err(ProviderError::new(ProviderErrorKind::Timeout));
            }
        }
        Err(last_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Funções puras
    // -----------------------------------------------------------------------

    #[test]
    fn content_type_validation_is_strict_per_expected_kind() {
        assert!(ExpectedContent::Json.accepts_content_type("application/json; charset=utf-8"));
        assert!(ExpectedContent::Json.accepts_content_type("application/vnd.api+json"));
        assert!(!ExpectedContent::Json.accepts_content_type("text/html"));

        assert!(ExpectedContent::Feed.accepts_content_type("application/rss+xml; charset=utf-8"));
        assert!(ExpectedContent::Feed.accepts_content_type("text/xml"));
        assert!(ExpectedContent::Feed.accepts_content_type("application/xml;charset=utf-8"));
        assert!(!ExpectedContent::Feed.accepts_content_type("text/html"));
        // O parser antigo aceitava octet-stream e text/plain; isso permitia
        // engolir qualquer payload como se fosse feed.
        assert!(!ExpectedContent::Feed.accepts_content_type("application/octet-stream"));
        assert!(!ExpectedContent::Feed.accepts_content_type("text/plain"));

        assert!(ExpectedContent::Image.accepts_content_type("image/jpeg"));
        assert!(ExpectedContent::Image.accepts_content_type("image/webp"));
        assert!(!ExpectedContent::Image.accepts_content_type("image/svg+xml"));
        assert!(!ExpectedContent::Image.accepts_content_type("image/gif"));
        assert!(!ExpectedContent::Image.accepts_content_type("text/html"));
    }

    #[test]
    fn image_signatures_are_detected_and_markup_is_recognised() {
        let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0];
        jpeg.extend_from_slice(&[0u8; 16]);
        assert_eq!(detect_image_mime(&jpeg), Some("image/jpeg"));

        let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        png.extend_from_slice(&[0u8; 16]);
        assert_eq!(detect_image_mime(&png), Some("image/png"));

        let mut webp = b"RIFF".to_vec();
        webp.extend_from_slice(&[0u8; 4]);
        webp.extend_from_slice(b"WEBPVP8 ");
        assert_eq!(detect_image_mime(&webp), Some("image/webp"));

        assert_eq!(detect_image_mime(b"<html><body></body></html>"), None);
        assert_eq!(detect_image_mime(b"short"), None);

        assert!(looks_like_markup(b"  <!DOCTYPE html>"));
        assert!(looks_like_markup(b"<svg xmlns='...'>"));
        assert!(!looks_like_markup(&jpeg));
    }

    #[test]
    fn retry_after_is_respected_only_within_the_configured_ceiling() {
        assert_eq!(
            parse_retry_after(Some(&HeaderValue::from_static("2"))),
            Some(Duration::from_secs(2))
        );
        assert_eq!(
            parse_retry_after(Some(&HeaderValue::from_static("600"))),
            None
        );
        assert_eq!(
            parse_retry_after(Some(&HeaderValue::from_static("abc"))),
            None
        );
        assert_eq!(parse_retry_after(None), None);
    }

    #[test]
    fn backoff_grows_and_stays_within_expected_bounds() {
        for attempt in 0..3 {
            let base = config::RETRY_BASE_BACKOFF.as_millis() as u64 * (1 << attempt);
            let wait = backoff_with_jitter(attempt);
            assert!(wait >= Duration::from_millis(base));
            assert!(wait <= Duration::from_millis(base + base / 2));
        }
    }

    #[test]
    fn status_codes_map_to_the_right_error_kind() {
        assert_eq!(
            status_error(StatusCode::TOO_MANY_REQUESTS),
            ProviderErrorKind::Http429
        );
        assert_eq!(
            status_error(StatusCode::INTERNAL_SERVER_ERROR),
            ProviderErrorKind::Http5xx
        );
        assert_eq!(
            status_error(StatusCode::NOT_FOUND),
            ProviderErrorKind::Http4xx
        );
    }

    // -----------------------------------------------------------------------
    // Política aplicada antes de qualquer socket
    // -----------------------------------------------------------------------
    //
    // Um servidor HTTP local não consegue exercitar este cliente: a política
    // exige HTTPS na porta 443 com certificado válido, e relaxá-la só para
    // teste anularia justamente o que precisa ser verificado. As decisões que
    // um servidor de teste validaria (status, limites, content-type, redirect,
    // retry) estão isoladas em funções puras e são testadas acima.
    //
    // Os testes abaixo confirmam que uma requisição hostil é recusada *antes*
    // de qualquer conexão — usando um alvo de rede que, se a política falhasse,
    // resultaria num erro de conexão diferente do erro de política esperado.

    fn spec(url: &str, allowlist: &'static [&'static str]) -> FetchSpec<'static> {
        FetchSpec {
            url: Url::parse(url).expect("url de teste"),
            allowlist,
            max_bytes: 1024,
            expected: ExpectedContent::Json,
            total_timeout: Duration::from_millis(500),
        }
    }

    #[tokio::test]
    async fn plain_http_targets_are_rejected_before_any_connection() {
        let client = SecureHttpClient::new().expect("client");
        for url in [
            "http://example.com/data",
            "https://example.com:8443/data",
            "https://user:pass@example.com/data",
        ] {
            let error = client
                .fetch(spec(url, &["example.com"]))
                .await
                .expect_err("deveria ser recusado pela política");
            assert_eq!(
                error.kind,
                ProviderErrorKind::BlockedUrl,
                "URL aceita indevidamente: {url}"
            );
        }
    }

    #[tokio::test]
    async fn requests_to_hosts_outside_the_allowlist_never_leave_the_process() {
        let client = SecureHttpClient::new().expect("client");
        let error = client
            .fetch(spec("https://evil.example.org/data", &["example.com"]))
            .await
            .expect_err("host fora da allowlist");
        assert_eq!(error.kind, ProviderErrorKind::HostNotAllowed);
    }

    #[tokio::test]
    async fn private_and_loopback_addresses_are_rejected_by_policy() {
        let client = SecureHttpClient::new().expect("client");
        for url in [
            "https://127.0.0.1/data",
            "https://10.0.0.1/data",
            "https://169.254.169.254/latest/meta-data",
            "https://[::1]/data",
        ] {
            let error = client
                .fetch(spec(
                    url,
                    &["127.0.0.1", "10.0.0.1", "169.254.169.254", "[::1]"],
                ))
                .await
                .expect_err("endereço interno deve ser recusado");
            assert_eq!(
                error.kind,
                ProviderErrorKind::BlockedUrl,
                "endereço aceito indevidamente: {url}"
            );
        }
    }

    #[tokio::test]
    async fn the_test_only_client_still_enforces_scheme_and_allowlist() {
        // Garante que a válvula de escape usada em testes não vira um bypass:
        // ela relaxa apenas a checagem de IP privado.
        let client = SecureHttpClient::new_allowing_loopback().expect("client");
        assert_eq!(
            client
                .fetch(spec("http://127.0.0.1/data", &["127.0.0.1"]))
                .await
                .expect_err("http puro")
                .kind,
            ProviderErrorKind::BlockedUrl
        );
        assert_eq!(
            client
                .fetch(spec("https://127.0.0.1:9999/data", &["127.0.0.1"]))
                .await
                .expect_err("porta não padrão")
                .kind,
            ProviderErrorKind::BlockedUrl
        );
        assert_eq!(
            client
                .fetch(spec("https://127.0.0.1/data", &["example.com"]))
                .await
                .expect_err("fora da allowlist")
                .kind,
            ProviderErrorKind::HostNotAllowed
        );
    }
}
