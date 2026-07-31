use super::artwork::{artwork_from_bytes, fetch_url_bytes, ArtworkBytes};
use regex::Regex;
use reqwest::blocking::Client;
use std::sync::LazyLock;

static YOUTUBE_VIDEO_ID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:youtube\.com/watch\?(?:[^&\s]+&)*v=|youtu\.be/|music\.youtube\.com/watch\?(?:[^&\s]+&)*v=)([a-zA-Z0-9_-]{11})")
        .unwrap()
});

static SPOTIFY_TRACK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)open\.spotify\.com/(?:intl-[^/]+/)?track/([a-zA-Z0-9]+)").unwrap()
});

const YOUTUBE_PLACEHOLDER_MAX_SIDE: u32 = 130;

pub fn fetch_artwork_for_page_url(client: &Client, page_url: &str) -> Option<ArtworkBytes> {
    let trimmed = page_url.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(id) = youtube_video_id(trimmed) {
        return fetch_youtube_artwork(client, &id);
    }

    if let Some(id) = spotify_track_id(trimmed) {
        return fetch_spotify_oembed_artwork(client, &id);
    }

    None
}

fn youtube_video_id(url: &str) -> Option<String> {
    YOUTUBE_VIDEO_ID
        .captures(url)
        .map(|caps| caps[1].to_string())
}

fn spotify_track_id(url: &str) -> Option<String> {
    SPOTIFY_TRACK.captures(url).and_then(|caps| {
        let id = caps[1].to_string();
        if id.len() <= 64 {
            Some(id)
        } else {
            None
        }
    })
}

fn fetch_youtube_artwork(client: &Client, video_id: &str) -> Option<ArtworkBytes> {
    // Tenta da maior para a menor resolução. Cada etapa pode falhar
    // (download, decode ou thumbnail placeholder) sem abortar as seguintes:
    // usar `?` aqui descartaria `sddefault`/`hqdefault` sempre que o
    // `maxresdefault` não existisse (caso comum em vídeos antigos).
    for size in ["maxresdefault", "sddefault", "hqdefault"] {
        let url = format!("https://i.ytimg.com/vi/{video_id}/{size}.jpg");
        let Some(bytes) = fetch_url_bytes(client, &url) else {
            continue;
        };
        let Some(artwork) = artwork_from_bytes(bytes, None, "youtube", false) else {
            continue;
        };
        if is_youtube_placeholder(&artwork) {
            continue;
        }
        return Some(artwork);
    }
    None
}

fn is_youtube_placeholder(artwork: &ArtworkBytes) -> bool {
    artwork.min_side() <= YOUTUBE_PLACEHOLDER_MAX_SIDE
}

fn fetch_spotify_oembed_artwork(client: &Client, track_id: &str) -> Option<ArtworkBytes> {
    let page_url = format!("https://open.spotify.com/track/{track_id}");
    let oembed_url = format!(
        "https://open.spotify.com/oembed?url={}",
        super::artwork::url_encode(&page_url)
    );
    let response = client.get(&oembed_url).send().ok()?;
    if !response.status().is_success() {
        return None;
    }
    if response.content_length().is_some_and(|len| len > 256_000) {
        return None;
    }
    let payload: SpotifyOembed = response.json().ok()?;
    let thumb_url = payload.thumbnail_url?;
    if !super::artwork::is_allowed_remote_image_url(&thumb_url) {
        return None;
    }
    let bytes = fetch_url_bytes(client, &thumb_url)?;
    artwork_from_bytes(bytes, None, "spotify-web", false)
}

#[derive(Debug, serde::Deserialize)]
struct SpotifyOembed {
    #[serde(rename = "thumbnail_url")]
    thumbnail_url: Option<String>,
}
