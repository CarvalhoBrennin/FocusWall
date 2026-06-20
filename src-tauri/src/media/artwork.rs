use image::GenericImageView;
use super::browser_url;
use super::web_artwork;
use super::MediaArtwork;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MIN_HD_SIDE: u32 = 600;
const MEMORY_CACHE_MAX: usize = 128;
const HTTP_TIMEOUT_MS: u64 = 800;
const MAX_DOWNLOAD_BYTES: usize = 12_000_000;
const MAX_SMTC_BASE64_LEN: usize = 16_000_000;
const USER_AGENT: &str = "FocusWall/0.1 (desktop-media-player; +https://github.com/focuswall)";

#[derive(Debug, Clone)]
pub(super) struct ArtworkBytes {
    bytes: Vec<u8>,
    mime: String,
    width: u32,
    height: u32,
    source: String,
    low_res: bool,
}

impl ArtworkBytes {
    pub(super) fn min_side(&self) -> u32 {
        self.width.min(self.height)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskCacheMeta {
    width: u32,
    height: u32,
    mime: String,
    source: String,
    low_res: bool,
    cached_at: u64,
}

static MEMORY_CACHE: LazyLock<Mutex<HashMap<String, ArtworkBytes>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static MEMORY_ORDER: LazyLock<Mutex<Vec<String>>> = LazyLock::new(|| Mutex::new(Vec::new()));

pub struct ArtworkRequest<'a> {
    pub artist: &'a str,
    pub album: &'a str,
    pub title: &'a str,
    pub source_app_id: &'a str,
    pub media_page_url: Option<&'a str>,
    pub smtc_base64: Option<&'a str>,
    pub smtc_mime: Option<&'a str>,
    pub smtc_width: Option<u32>,
    pub smtc_height: Option<u32>,
}

pub fn track_key(artist: &str, album: &str, title: &str, source_app_id: &str) -> String {
    format!(
        "{}|{}|{}|{}",
        normalize_key_part(artist),
        normalize_key_part(album),
        normalize_key_part(title),
        normalize_key_part(source_app_id)
    )
}

fn normalize_key_part(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || ch.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn url_encode(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            b' ' => encoded.push('+'),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn cache_file_stem(key: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    key.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(HTTP_TIMEOUT_MS))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())
}

fn image_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    image::load_from_memory(bytes)
        .ok()
        .map(|img| img.dimensions())
}

fn is_valid_image_bytes(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47])
        || bytes.starts_with(&[0xFF, 0xD8])
        || bytes.starts_with(b"GIF")
        || (bytes.starts_with(b"RIFF") && bytes.len() >= 12 && &bytes[8..12] == b"WEBP")
}

fn detect_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF") {
        "image/gif"
    } else if bytes.starts_with(b"RIFF") && bytes.len() >= 12 && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "image/jpeg"
    }
}

fn is_hd(width: u32, height: u32) -> bool {
    width.min(height) >= MIN_HD_SIDE
}

fn remember_memory_cache(key: &str, artwork: ArtworkBytes) {
    if artwork.low_res {
        return;
    }

    let mut cache = MEMORY_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let mut order = MEMORY_ORDER.lock().unwrap_or_else(|e| e.into_inner());

    if cache.contains_key(key) {
        if let Some(index) = order.iter().position(|entry| entry == key) {
            order.remove(index);
        }
    }

    cache.insert(key.to_string(), artwork);
    order.push(key.to_string());

    while order.len() > MEMORY_CACHE_MAX {
        if let Some(oldest) = order.first().cloned() {
            order.remove(0);
            cache.remove(&oldest);
        } else {
            break;
        }
    }
}

fn read_disk_cache(cache_dir: &Path, key: &str) -> Option<ArtworkBytes> {
    let stem = cache_file_stem(key);
    let image_path = cache_dir.join(format!("{stem}.jpg"));
    let meta_path = cache_dir.join(format!("{stem}.json"));
    let bytes = fs::read(&image_path).ok()?;
    let meta: DiskCacheMeta = serde_json::from_str(&fs::read_to_string(&meta_path).ok()?).ok()?;
    if meta.low_res {
        return None;
    }
    Some(ArtworkBytes {
        bytes,
        mime: meta.mime,
        width: meta.width,
        height: meta.height,
        source: meta.source,
        low_res: meta.low_res,
    })
}

fn write_disk_cache(cache_dir: &Path, key: &str, artwork: &ArtworkBytes) {
    if artwork.low_res {
        return;
    }

    let stem = cache_file_stem(key);
    let image_path = cache_dir.join(format!("{stem}.jpg"));
    let meta_path = cache_dir.join(format!("{stem}.json"));
    let _ = fs::create_dir_all(cache_dir);
    let _ = fs::write(&image_path, &artwork.bytes);
    let meta = DiskCacheMeta {
        width: artwork.width,
        height: artwork.height,
        mime: artwork.mime.clone(),
        source: artwork.source.clone(),
        low_res: artwork.low_res,
        cached_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    };
    if let Ok(payload) = serde_json::to_string_pretty(&meta) {
        let _ = fs::write(&meta_path, payload);
    }
}

pub(super) fn artwork_from_bytes(
    bytes: Vec<u8>,
    mime: Option<String>,
    source: &str,
    force_low_res: bool,
) -> Option<ArtworkBytes> {
    let (width, height) = image_dimensions(&bytes)?;
    let mime = mime.unwrap_or_else(|| detect_image_mime(&bytes).to_string());
    let low_res = force_low_res || !is_hd(width, height);
    Some(ArtworkBytes {
        bytes,
        mime,
        width,
        height,
        source: source.to_string(),
        low_res,
    })
}

fn artwork_from_smtc(
    base64: &str,
    mime: Option<&str>,
    width: Option<u32>,
    height: Option<u32>,
) -> Option<ArtworkBytes> {
    if base64.len() > MAX_SMTC_BASE64_LEN {
        return None;
    }
    let bytes = STANDARD.decode(base64).ok()?;
    if bytes.len() > MAX_DOWNLOAD_BYTES || !is_valid_image_bytes(&bytes) {
        return None;
    }
    let (w, h) = match (width, height) {
        (Some(w), Some(h)) if w > 0 && h > 0 => (w, h),
        _ => image_dimensions(&bytes)?,
    };
    let mime = mime
        .map(str::to_string)
        .unwrap_or_else(|| detect_image_mime(&bytes).to_string());
    let low_res = !is_hd(w, h);
    Some(ArtworkBytes {
        bytes,
        mime,
        width: w,
        height: h,
        source: "smtc".into(),
        low_res,
    })
}

fn to_media_artwork(artwork: ArtworkBytes) -> MediaArtwork {
    MediaArtwork {
        base64: Some(STANDARD.encode(&artwork.bytes)),
        mime: Some(artwork.mime),
        width: artwork.width,
        height: artwork.height,
        source: artwork.source,
        low_res: artwork.low_res,
    }
}

fn https_host(url: &str) -> Option<String> {
    let trimmed = url.trim();
    let rest = trimmed.strip_prefix("https://")?;
    let host = rest.split(&['/', '?', '#'][..]).next()?;
    if host.is_empty() || host.contains('@') || host.contains(':') {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

pub(super) fn is_allowed_remote_image_url(url: &str) -> bool {
    let host = match https_host(url) {
        Some(host) => host,
        None => return false,
    };
    host == "i.ytimg.com"
        || host.ends_with(".scdn.co")
        || host.ends_with(".spotifycdn.com")
}

pub(super) fn fetch_url_bytes(client: &reqwest::blocking::Client, url: &str) -> Option<Vec<u8>> {
    if !is_allowed_remote_image_url(url) {
        return None;
    }
    let response = client.get(url).send().ok()?;
    if !response.status().is_success() {
        return None;
    }
    if response
        .content_length()
        .is_some_and(|len| len as usize > MAX_DOWNLOAD_BYTES)
    {
        return None;
    }
    let bytes = response.bytes().ok()?;
    if bytes.len() > MAX_DOWNLOAD_BYTES || !is_valid_image_bytes(&bytes) {
        return None;
    }
    Some(bytes.to_vec())
}

fn cache_and_return(
    key: &str,
    cache_dir: &Path,
    artwork: ArtworkBytes,
) -> Result<MediaArtwork, String> {
    remember_memory_cache(key, artwork.clone());
    write_disk_cache(cache_dir, key, &artwork);
    Ok(to_media_artwork(artwork))
}

fn fetch_browser_artwork(
    client: &reqwest::blocking::Client,
    request: &ArtworkRequest<'_>,
) -> Option<ArtworkBytes> {
    if let Some(url) = request
        .media_page_url
        .and_then(browser_url::normalize_media_page_url)
    {
        if let Some(artwork) = web_artwork::fetch_artwork_for_page_url(client, &url) {
            return Some(artwork);
        }
    }

    if !browser_url::is_browser_app(request.source_app_id) {
        return None;
    }

    let page_url = browser_url::find_media_page_url(
        request.source_app_id,
        request.title,
        request.artist,
        request.album,
    )?;
    web_artwork::fetch_artwork_for_page_url(client, &page_url)
}

pub fn resolve_artwork(request: ArtworkRequest<'_>, cache_dir: &Path) -> Result<MediaArtwork, String> {
    let key = track_key(
        request.artist,
        request.album,
        request.title,
        request.source_app_id,
    );

    if let Ok(cache) = MEMORY_CACHE.lock() {
        if let Some(cached) = cache.get(&key) {
            if !cached.low_res {
                return Ok(to_media_artwork(cached.clone()));
            }
        }
    }

    if let Some(cached) = read_disk_cache(cache_dir, &key) {
        remember_memory_cache(&key, cached.clone());
        return Ok(to_media_artwork(cached));
    }

    let smtc_artwork = request
        .smtc_base64
        .and_then(|b64| artwork_from_smtc(b64, request.smtc_mime, request.smtc_width, request.smtc_height));

    if let Some(ref smtc) = smtc_artwork {
        if !smtc.low_res {
            return cache_and_return(&key, cache_dir, smtc.clone());
        }
    }

    let client = http_client()?;

    if let Some(artwork) = fetch_browser_artwork(&client, &request) {
        return cache_and_return(&key, cache_dir, artwork);
    }

    if let Some(smtc) = smtc_artwork {
        return Ok(to_media_artwork(smtc));
    }

    Ok(MediaArtwork {
        base64: None,
        mime: None,
        width: 0,
        height: 0,
        source: "none".into(),
        low_res: true,
    })
}
