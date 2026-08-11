//! Política de rede deny-by-default do Radar.
//!
//! Nenhuma URL chega aqui vinda do frontend: todas nascem de definições
//! estáticas de provider ou de feeds já validados. Ainda assim tratamos
//! qualquer URL dinâmica (link de artigo, imagem, redirect) como hostil.

use super::{
    config,
    error::{ProviderError, ProviderErrorKind},
};
use sha2::{Digest, Sha256};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use url::{Host, Url};

/// Parâmetros de rastreamento removidos na canonicalização.
const TRACKING_PREFIXES: [&str; 2] = ["utm_", "pk_"];
const TRACKING_EXACT: [&str; 10] = [
    "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "twclid", "ref_src",
    "ref_url",
];

// ---------------------------------------------------------------------------
// Validação de IP
// ---------------------------------------------------------------------------

fn is_forbidden_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_multicast()
        || ip.is_broadcast()
        || ip.is_unspecified()
        || ip.is_documentation()
        // 0.0.0.0/8 "this network"
        || octets[0] == 0
        // 100.64.0.0/10 CGNAT
        || (octets[0] == 100 && (64..128).contains(&octets[1]))
        // 192.0.0.0/24 IETF protocol assignments
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
        // 198.18.0.0/15 benchmarking
        || (octets[0] == 198 && (18..20).contains(&octets[1]))
        // 240.0.0.0/4 reserved
        || octets[0] >= 240
}

fn is_forbidden_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_forbidden_ipv4(mapped);
    }
    // Endereços IPv4-compatible (::a.b.c.d) também precisam ser reavaliados.
    let segments = ip.segments();
    if segments[..6] == [0, 0, 0, 0, 0, 0] && !ip.is_unspecified() && !ip.is_loopback() {
        let raw = ip.octets();
        let mapped = Ipv4Addr::new(raw[12], raw[13], raw[14], raw[15]);
        if is_forbidden_ipv4(mapped) {
            return true;
        }
    }
    ip.is_loopback()
        || ip.is_multicast()
        || ip.is_unspecified()
        || ip.is_unicast_link_local()
        || ip.is_unique_local()
        // 2001:db8::/32 documentation
        || (segments[0] == 0x2001 && segments[1] == 0x0db8)
        // 100::/64 discard-only
        || (segments[0] == 0x0100 && segments[1..4] == [0, 0, 0])
}

pub fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_forbidden_ipv4(ip),
        IpAddr::V6(ip) => is_forbidden_ipv6(ip),
    }
}

// ---------------------------------------------------------------------------
// Validação de URL
// ---------------------------------------------------------------------------

fn host_is_suspicious_name(host: &str) -> bool {
    let lower = host.to_ascii_lowercase();
    lower.is_empty()
        || lower == "localhost"
        || lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
        || lower.ends_with(".home.arpa")
        || lower.ends_with(".in-addr.arpa")
        || lower.ends_with(".ip6.arpa")
}

/// Valida a *forma* da URL: HTTPS, porta 443, sem credenciais, host presente.
/// Não avalia se o host aponta para rede interna — isso é responsabilidade de
/// [`validate_https_url`]. Separado para que o caminho de teste possa relaxar
/// apenas a checagem de IP privado, nunca a de esquema ou porta.
pub fn validate_https_shape(raw: &str) -> Result<Url, ProviderError> {
    let reject = || ProviderError::new(ProviderErrorKind::BlockedUrl);
    if raw.len() > config::MAX_URL_CHARS {
        return Err(reject());
    }
    let url = Url::parse(raw).map_err(|_| reject())?;
    if url.scheme() != "https" {
        return Err(reject());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(reject());
    }
    if url.port_or_known_default() != Some(443) {
        return Err(reject());
    }
    if url.host().is_none() {
        return Err(reject());
    }
    Ok(url)
}

/// Aceita apenas HTTPS na porta 443, sem credenciais, com host nomeado que não
/// pareça interno. Endereços IP literais são validados contra a lista de faixas
/// proibidas. Não faz resolução DNS — isso acontece em [`validate_resolved_addrs`].
pub fn validate_https_url(raw: &str) -> Result<Url, ProviderError> {
    let reject = || ProviderError::new(ProviderErrorKind::BlockedUrl);
    let url = validate_https_shape(raw)?;
    match url.host() {
        Some(Host::Domain(host)) => {
            if host_is_suspicious_name(host) {
                return Err(reject());
            }
        }
        Some(Host::Ipv4(ip)) => {
            if is_forbidden_ip(IpAddr::V4(ip)) {
                return Err(reject());
            }
        }
        Some(Host::Ipv6(ip)) => {
            if is_forbidden_ip(IpAddr::V6(ip)) {
                return Err(reject());
            }
        }
        None => return Err(reject()),
    }
    Ok(url)
}

pub fn host_matches_allowlist(host: &str, allowlist: &[&str]) -> bool {
    let lower = host.to_ascii_lowercase();
    allowlist
        .iter()
        .any(|allowed| lower == allowed.to_ascii_lowercase())
}

/// Valida a URL e exige que o host esteja explicitamente na allowlist recebida.
/// Wildcards amplos não são suportados de propósito.
pub fn validate_url_against_allowlist(raw: &str, allowlist: &[&str]) -> Result<Url, ProviderError> {
    let url = validate_https_url(raw)?;
    let host = url
        .host_str()
        .ok_or_else(|| ProviderError::new(ProviderErrorKind::BlockedUrl))?;
    if !host_matches_allowlist(host, allowlist) {
        return Err(ProviderError::new(ProviderErrorKind::HostNotAllowed));
    }
    Ok(url)
}

/// Filtra endereços resolvidos, mantendo apenas os públicos. Retorna erro se
/// **algum** endereço resolvido for privado — uma resposta DNS mista é sinal de
/// rebinding, não de multi-homing legítimo.
pub fn validate_resolved_addrs(addrs: Vec<SocketAddr>) -> Result<Vec<SocketAddr>, ProviderError> {
    if addrs.is_empty() {
        return Err(ProviderError::new(ProviderErrorKind::DnsBlocked));
    }
    if addrs.iter().any(|addr| is_forbidden_ip(addr.ip())) {
        return Err(ProviderError::new(ProviderErrorKind::DnsBlocked));
    }
    Ok(addrs)
}

// ---------------------------------------------------------------------------
// Canonicalização de URL de artigo
// ---------------------------------------------------------------------------

fn is_tracking_parameter(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    TRACKING_PREFIXES
        .iter()
        .any(|prefix| lower.starts_with(prefix))
        || TRACKING_EXACT.contains(&lower.as_str())
}

/// Remove fragmento e parâmetros de rastreamento preservando os que realmente
/// identificam o conteúdo (`?id=`, `?p=`, paginação, etc.).
pub fn canonicalize_article_url(raw: &str) -> Option<String> {
    let mut url = validate_https_url(raw).ok()?;
    url.set_fragment(None);

    let kept: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| !is_tracking_parameter(key))
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    if kept.is_empty() {
        url.set_query(None);
    } else {
        let mut serializer = url.query_pairs_mut();
        serializer.clear();
        for (key, value) in &kept {
            serializer.append_pair(key, value);
        }
        drop(serializer);
    }

    // `url` mantém a barra final normalizada; remover a de caminho raiz evita
    // que "https://x.com" e "https://x.com/" gerem IDs distintos.
    let mut result = url.to_string();
    if url.path() == "/" && url.query().is_none() {
        result = result.trim_end_matches('/').to_string();
    }
    if result.len() > config::MAX_URL_CHARS {
        return None;
    }
    Some(result)
}

// ---------------------------------------------------------------------------
// Identificadores estáveis
// ---------------------------------------------------------------------------

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn sha256_hex(value: &str) -> String {
    sha256_hex_bytes(value.as_bytes())
}

pub fn sha256_hex_bytes(value: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value);
    hex(&hasher.finalize())
}

/// ID de artigo estável e opaco: SHA-256 de `sourceId + '\0' + canonicalUrl`.
/// O separador nulo impede colisão entre `("ab", "c")` e `("a", "bc")`.
pub fn stable_article_id(source_id: &str, canonical_url: &str) -> String {
    sha256_hex(&format!("{source_id}\u{0}{canonical_url}"))
}

/// Aceita apenas IDs no formato produzido por [`stable_article_id`].
pub fn is_valid_opaque_id(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_https_schemes_credentials_and_ports() {
        for invalid in [
            "http://example.com",
            "file:///C:/Windows/System32",
            "javascript:alert(1)",
            "data:text/html,test",
            "ftp://example.com/a",
            "gopher://example.com",
            "blob:https://example.com/x",
            "https://user:pass@example.com/test",
            "https://user@example.com/test",
            "https://example.com:8443/test",
            "https://example.com:80/test",
        ] {
            assert!(
                validate_https_url(invalid).is_err(),
                "aceitou indevidamente {invalid}"
            );
        }
        assert!(validate_https_url("https://example.com:443/test").is_ok());
        assert!(validate_https_url("https://example.com/test").is_ok());
    }

    #[test]
    fn rejects_internal_hostnames_and_private_literals() {
        for invalid in [
            "https://localhost/test",
            "https://service.localhost/test",
            "https://service.local/test",
            "https://api.internal/test",
            "https://x.home.arpa/test",
            "https://127.0.0.1/test",
            "https://10.0.0.1/test",
            "https://172.16.0.1/test",
            "https://192.168.1.1/test",
            "https://169.254.169.254/test",
            "https://0.0.0.0/test",
            "https://100.64.0.1/test",
            "https://198.18.0.1/test",
            "https://255.255.255.255/test",
            "https://[::1]/test",
            "https://[fc00::1]/test",
            "https://[fe80::1]/test",
            "https://[ff02::1]/test",
            "https://[2001:db8::1]/test",
            "https://[::ffff:127.0.0.1]/test",
            "https://[::ffff:10.0.0.1]/test",
            "https://[::ffff:169.254.169.254]/test",
        ] {
            assert!(
                validate_https_url(invalid).is_err(),
                "aceitou indevidamente {invalid}"
            );
        }
    }

    #[test]
    fn allowlist_matching_is_exact_and_case_insensitive() {
        let allowlist = ["agenciabrasil.ebc.com.br", "github.blog"];
        assert!(validate_url_against_allowlist("https://GitHub.Blog/x", &allowlist).is_ok());
        assert!(validate_url_against_allowlist("https://github.blog/x", &allowlist).is_ok());
        // Subdomínio não herda permissão do domínio pai.
        assert!(validate_url_against_allowlist("https://evil.github.blog/x", &allowlist).is_err());
        // Sufixo colado não pode passar por igualdade parcial.
        assert!(validate_url_against_allowlist("https://notgithub.blog/x", &allowlist).is_err());
        assert!(validate_url_against_allowlist("https://example.com/x", &allowlist).is_err());
    }

    #[test]
    fn mixed_dns_answers_are_rejected_entirely() {
        let public: SocketAddr = "93.184.216.34:443".parse().expect("addr");
        let private: SocketAddr = "192.168.0.5:443".parse().expect("addr");
        let mapped: SocketAddr = "[::ffff:10.0.0.1]:443".parse().expect("addr");

        assert!(validate_resolved_addrs(vec![public]).is_ok());
        assert!(validate_resolved_addrs(vec![]).is_err());
        assert!(validate_resolved_addrs(vec![public, private]).is_err());
        assert!(validate_resolved_addrs(vec![public, mapped]).is_err());
    }

    #[test]
    fn canonicalization_strips_tracking_and_fragment_but_keeps_content_parameters() {
        assert_eq!(
            canonicalize_article_url(
                "https://example.com/noticia?utm_source=x&utm_medium=y&id=42&fbclid=abc#topo"
            )
            .expect("canonical"),
            "https://example.com/noticia?id=42"
        );
        assert_eq!(
            canonicalize_article_url("https://example.com/a?gclid=1&mc_cid=2&mc_eid=3")
                .expect("canonical"),
            "https://example.com/a"
        );
        assert_eq!(
            canonicalize_article_url("https://example.com/?page=2&utm_campaign=z")
                .expect("canonical"),
            "https://example.com/?page=2"
        );
        assert_eq!(
            canonicalize_article_url("https://example.com/").expect("canonical"),
            "https://example.com"
        );
        assert!(canonicalize_article_url("http://example.com/a").is_none());
    }

    #[test]
    fn canonicalization_is_idempotent() {
        let once = canonicalize_article_url("https://example.com/a?utm_source=x&b=1#f")
            .expect("canonical");
        let twice = canonicalize_article_url(&once).expect("canonical");
        assert_eq!(once, twice);
    }

    #[test]
    fn article_ids_are_stable_opaque_and_collision_resistant() {
        let first = stable_article_id("agencia-brasil", "https://example.com/a");
        assert_eq!(
            first,
            stable_article_id("agencia-brasil", "https://example.com/a")
        );
        assert_ne!(
            first,
            stable_article_id("infoq-br", "https://example.com/a")
        );
        assert_ne!(
            stable_article_id("ab", "c"),
            stable_article_id("a", "bc"),
            "separador nulo deve impedir colisão por concatenação"
        );
        assert!(is_valid_opaque_id(&first));
        assert!(!first.contains("example.com"));

        assert!(!is_valid_opaque_id(""));
        assert!(!is_valid_opaque_id("zz"));
        assert!(!is_valid_opaque_id(&"g".repeat(64)));
        assert!(!is_valid_opaque_id(&"a".repeat(63)));
        assert!(!is_valid_opaque_id("../../etc/passwd"));
    }
}
