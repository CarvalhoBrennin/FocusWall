//! Erros tipados do Radar.
//!
//! O `Display` de cada erro é deliberadamente opaco: nunca inclui URL, título,
//! consulta de cidade ou coordenada. Logs usam apenas `error_kind`.
//!
//! Algumas variantes são reservadas para falhas de enriquecimento opcional e
//! podem não aparecer em todos os ciclos.
#![allow(dead_code)]

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderErrorKind {
    /// Timeout de conexão, de leitura ou do deadline total.
    Timeout,
    /// Falha de socket/TLS.
    Connection,
    /// Resposta 4xx que não seja 429.
    Http4xx,
    Http429,
    Http5xx,
    /// Corpo excedeu o limite configurado para o tipo de conteúdo.
    ResponseTooLarge,
    /// `Content-Type` incompatível com o esperado.
    InvalidContentType,
    /// Assinatura/magic bytes divergem do MIME declarado.
    ContentSignatureMismatch,
    /// Payload sintaticamente inválido.
    Parse,
    /// Payload sintaticamente válido mas semanticamente inaceitável.
    Validation,
    /// URL rejeitada pela política (esquema, porta, credenciais, IP privado).
    BlockedUrl,
    /// Host fora da allowlist do provider.
    HostNotAllowed,
    /// Resolução DNS vazia ou apontando para faixa proibida.
    DnsBlocked,
    /// Excedeu o número máximo de redirects, ou redirect saiu da allowlist.
    RedirectRejected,
    /// Provider desabilitado ou em cooldown.
    Cooldown,
    /// Falha de leitura/escrita no repositório local.
    Storage,
    /// Imagem fora dos limites de dimensão/pixels aceitos.
    ImageRejected,
}

impl ProviderErrorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ProviderErrorKind::Timeout => "timeout",
            ProviderErrorKind::Connection => "connection",
            ProviderErrorKind::Http4xx => "http_4xx",
            ProviderErrorKind::Http429 => "http_429",
            ProviderErrorKind::Http5xx => "http_5xx",
            ProviderErrorKind::ResponseTooLarge => "response_too_large",
            ProviderErrorKind::InvalidContentType => "invalid_content_type",
            ProviderErrorKind::ContentSignatureMismatch => "mime_mismatch",
            ProviderErrorKind::Parse => "parse",
            ProviderErrorKind::Validation => "validation",
            ProviderErrorKind::BlockedUrl => "blocked_url",
            ProviderErrorKind::HostNotAllowed => "host_not_allowed",
            ProviderErrorKind::DnsBlocked => "dns_blocked",
            ProviderErrorKind::RedirectRejected => "redirect_rejected",
            ProviderErrorKind::Cooldown => "cooldown",
            ProviderErrorKind::Storage => "storage",
            ProviderErrorKind::ImageRejected => "image_rejected",
        }
    }

    /// Apenas falhas transitórias justificam nova tentativa.
    pub fn is_retryable(self) -> bool {
        matches!(
            self,
            ProviderErrorKind::Timeout
                | ProviderErrorKind::Connection
                | ProviderErrorKind::Http429
                | ProviderErrorKind::Http5xx
        )
    }

    /// Falhas de política não devem entrar na contagem de cooldown do provider:
    /// elas indicam conteúdo hostil pontual, não indisponibilidade da fonte.
    pub fn counts_toward_cooldown(self) -> bool {
        !matches!(
            self,
            ProviderErrorKind::BlockedUrl
                | ProviderErrorKind::HostNotAllowed
                | ProviderErrorKind::ImageRejected
                | ProviderErrorKind::ContentSignatureMismatch
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderError {
    pub kind: ProviderErrorKind,
}

impl ProviderError {
    pub fn new(kind: ProviderErrorKind) -> Self {
        Self { kind }
    }
}

impl fmt::Display for ProviderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Somente a categoria — jamais dados do payload.
        formatter.write_str(self.kind.as_str())
    }
}

impl std::error::Error for ProviderError {}

impl From<ProviderErrorKind> for ProviderError {
    fn from(kind: ProviderErrorKind) -> Self {
        Self::new(kind)
    }
}

/// Erro devolvido ao frontend. É sempre uma chave i18n estável, nunca uma
/// mensagem técnica ou conteúdo de provider.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RadarCommandError(pub &'static str);

impl RadarCommandError {
    pub const INVALID_REQUEST: Self = Self("radar.invalidRequest");
    pub const INVALID_LOCATION: Self = Self("radar.invalidLocation");
    pub const INVALID_LOCATION_QUERY: Self = Self("radar.invalidLocationQuery");
    pub const LOCATION_SEARCH_FAILED: Self = Self("radar.locationSearchFailed");
    pub const LOAD_FAILED: Self = Self("radar.loadFailed");
    pub const REFRESH_FAILED: Self = Self("radar.refreshFailed");
    pub const ARTICLE_NOT_FOUND: Self = Self("radar.articleNotFound");
    pub const IMAGE_NOT_FOUND: Self = Self("radar.imageNotFound");
    pub const OPEN_FAILED: Self = Self("radar.openFailed");
    pub const STORAGE_FAILED: Self = Self("radar.storageFailed");
}

impl fmt::Display for RadarCommandError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.0)
    }
}

impl serde::Serialize for RadarCommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.0)
    }
}

impl From<rusqlite::Error> for ProviderError {
    fn from(_: rusqlite::Error) -> Self {
        // A mensagem do SQLite pode conter fragmentos de dados; descartamos.
        Self::new(ProviderErrorKind::Storage)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_transient_failures_are_retryable() {
        for kind in [
            ProviderErrorKind::Timeout,
            ProviderErrorKind::Connection,
            ProviderErrorKind::Http429,
            ProviderErrorKind::Http5xx,
        ] {
            assert!(kind.is_retryable(), "{kind:?} deveria permitir retry");
        }
        for kind in [
            ProviderErrorKind::Http4xx,
            ProviderErrorKind::Parse,
            ProviderErrorKind::Validation,
            ProviderErrorKind::ResponseTooLarge,
            ProviderErrorKind::BlockedUrl,
            ProviderErrorKind::HostNotAllowed,
            ProviderErrorKind::DnsBlocked,
            ProviderErrorKind::RedirectRejected,
        ] {
            assert!(!kind.is_retryable(), "{kind:?} não deveria permitir retry");
        }
    }

    #[test]
    fn policy_failures_do_not_penalise_provider_health() {
        assert!(!ProviderErrorKind::BlockedUrl.counts_toward_cooldown());
        assert!(!ProviderErrorKind::HostNotAllowed.counts_toward_cooldown());
        assert!(!ProviderErrorKind::ImageRejected.counts_toward_cooldown());
        assert!(ProviderErrorKind::Timeout.counts_toward_cooldown());
        assert!(ProviderErrorKind::Http5xx.counts_toward_cooldown());
    }

    #[test]
    fn display_never_leaks_payload_details() {
        let error = ProviderError::new(ProviderErrorKind::BlockedUrl);
        assert_eq!(error.to_string(), "blocked_url");
        assert_eq!(
            RadarCommandError::ARTICLE_NOT_FOUND.to_string(),
            "radar.articleNotFound"
        );
    }
}
