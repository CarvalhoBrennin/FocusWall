#[cfg(windows)]
mod artwork;
#[cfg(windows)]
mod browser_url;
#[cfg(windows)]
mod smtc;
#[cfg(windows)]
mod web_artwork;

#[cfg(not(windows))]
mod stub;

use serde::Serialize;
use std::fs;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSnapshot {
    pub available: bool,
    pub source: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub app_name: String,
    pub source_app_id: String,
    pub is_playing: bool,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_next: bool,
    pub can_previous: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub cover_art_base64: Option<String>,
    pub cover_art_mime: Option<String>,
    pub cover_art_width: Option<u32>,
    pub cover_art_height: Option<u32>,
}

impl MediaSnapshot {
    pub(super) fn empty() -> Self {
        Self {
            available: false,
            source: "none".into(),
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            app_name: String::new(),
            source_app_id: String::new(),
            is_playing: false,
            can_play: false,
            can_pause: false,
            can_next: false,
            can_previous: false,
            position_ms: 0,
            duration_ms: 0,
            cover_art_base64: None,
            cover_art_mime: None,
            cover_art_width: None,
            cover_art_height: None,
        }
    }

    #[cfg(not(windows))]
    pub(super) fn unsupported() -> Self {
        Self {
            source: "unsupported".into(),
            ..Self::empty()
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaArtwork {
    pub base64: Option<String>,
    pub mime: Option<String>,
    pub width: u32,
    pub height: u32,
    pub source: String,
    pub low_res: bool,
}

/// Inicia a ponte de eventos do SMTC (event-driven). No-op fora do Windows.
pub fn start_media_events(app: tauri::AppHandle) {
    #[cfg(windows)]
    {
        smtc::start_event_bridge(app);
    }
    #[cfg(not(windows))]
    {
        let _ = app;
    }
}

pub fn build_media_snapshot() -> Result<MediaSnapshot, String> {
    #[cfg(windows)]
    {
        return smtc::read_media_snapshot();
    }
    #[cfg(not(windows))]
    {
        return stub::read_media_snapshot();
    }
}

#[tauri::command]
pub fn get_media_snapshot() -> Result<MediaSnapshot, String> {
    build_media_snapshot()
}

fn truncate_media_field(value: String, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value;
    }
    value.chars().take(max_chars).collect()
}

#[tauri::command(async)]
pub async fn get_media_artwork(
    app: tauri::AppHandle,
    artist: String,
    album: String,
    title: String,
    source_app_id: String,
    smtc_base64: Option<String>,
    smtc_mime: Option<String>,
    smtc_width: Option<u32>,
    smtc_height: Option<u32>,
) -> Result<MediaArtwork, String> {
    let artist = truncate_media_field(artist, 512);
    let album = truncate_media_field(album, 512);
    let title = truncate_media_field(title, 512);
    let source_app_id = truncate_media_field(source_app_id, 256);
    let smtc_base64 = smtc_base64.filter(|value| value.len() <= 16_000_000);
    let smtc_mime = smtc_mime.filter(|value| value.len() <= 128);

    #[cfg(windows)]
    let (smtc_base64, smtc_mime, smtc_width, smtc_height) = if smtc_base64.is_none() {
        match smtc::read_cover_art_for_artwork() {
            Ok((base64, mime, width, height)) if base64.is_some() => (base64, mime, width, height),
            _ => (smtc_base64, smtc_mime, smtc_width, smtc_height),
        }
    } else {
        (smtc_base64, smtc_mime, smtc_width, smtc_height)
    };

    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("covers");
    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            artwork::resolve_artwork(
                artwork::ArtworkRequest {
                    artist: &artist,
                    album: &album,
                    title: &title,
                    source_app_id: &source_app_id,
                    media_page_url: None,
                    smtc_base64: smtc_base64.as_deref(),
                    smtc_mime: smtc_mime.as_deref(),
                    smtc_width,
                    smtc_height,
                },
                &cache_dir,
            )
        }
        #[cfg(not(windows))]
        {
            let _ = cache_dir;
            stub::resolve_media_artwork(smtc_base64, smtc_mime, smtc_width, smtc_height)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn media_toggle_playback() -> Result<bool, String> {
    #[cfg(windows)]
    {
        return smtc::toggle_playback();
    }
    #[cfg(not(windows))]
    {
        Err("Controles de mídia disponíveis apenas no app desktop Windows.".into())
    }
}

#[tauri::command]
pub fn media_skip_next() -> Result<(), String> {
    #[cfg(windows)]
    {
        return smtc::skip_next();
    }
    #[cfg(not(windows))]
    {
        Err("Controles de mídia disponíveis apenas no app desktop Windows.".into())
    }
}

#[tauri::command]
pub fn media_skip_previous() -> Result<(), String> {
    #[cfg(windows)]
    {
        return smtc::skip_previous();
    }
    #[cfg(not(windows))]
    {
        Err("Controles de mídia disponíveis apenas no app desktop Windows.".into())
    }
}
