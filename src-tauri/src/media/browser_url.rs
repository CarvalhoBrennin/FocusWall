use regex::Regex;
use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use uiautomation::types::{TreeScope, UIProperty};
use uiautomation::variants::Variant;
use uiautomation::UIAutomation;
use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
};

static YOUTUBE_VIDEO_ID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:youtube\.com/watch\?(?:[^&\s]+&)*v=|youtu\.be/|music\.youtube\.com/watch\?(?:[^&\s]+&)*v=)([a-zA-Z0-9_-]{11})")
        .unwrap()
});

static URL_IN_TEXT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(https?://[^\s<>]+|(?:www\.)?(?:youtube\.com/watch\?[^\s<>]+|youtu\.be/[a-zA-Z0-9_-]+|music\.youtube\.com/watch\?[^\s<>]+))")
        .unwrap()
});

struct UrlCacheEntry {
    key: String,
    url: Option<String>,
    cached_at: Instant,
}

static URL_CACHE: LazyLock<Mutex<Option<UrlCacheEntry>>> = LazyLock::new(|| Mutex::new(None));

const URL_CACHE_TTL: Duration = Duration::from_secs(2);
const MAX_UA_NODES: usize = 600;

pub fn is_browser_app(aumid: &str) -> bool {
    let lower = aumid.to_ascii_lowercase();
    [
        "chrome", "brave", "msedge", "edge", "firefox", "opera", "vivaldi", "chromium",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

pub fn extract_youtube_video_id(text: &str) -> Option<String> {
    YOUTUBE_VIDEO_ID
        .captures(text)
        .map(|caps| caps[1].to_string())
}

pub fn normalize_media_page_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(id) = extract_youtube_video_id(trimmed) {
        return Some(format!("https://www.youtube.com/watch?v={id}"));
    }

    let candidate = if let Some(rest) = trimmed.strip_prefix("https://") {
        format!("https://{rest}")
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        format!("https://{rest}")
    } else if trimmed.starts_with("www.") {
        format!("https://{trimmed}")
    } else {
        return None;
    };

    if extract_youtube_video_id(&candidate).is_some()
        || candidate.contains("open.spotify.com/")
        || candidate.contains("music.apple.com/")
    {
        Some(candidate)
    } else {
        None
    }
}

pub fn find_media_page_url(aumid: &str, title: &str, artist: &str, album: &str) -> Option<String> {
    let cache_key = format!("{aumid}|{title}|{artist}|{album}");
    if let Ok(guard) = URL_CACHE.lock() {
        if let Some(entry) = guard.as_ref() {
            if entry.key == cache_key && entry.cached_at.elapsed() < URL_CACHE_TTL {
                return entry.url.clone();
            }
        }
    }

    let url = find_media_page_url_impl(aumid, title, artist, album);

    if let Ok(mut guard) = URL_CACHE.lock() {
        *guard = Some(UrlCacheEntry {
            key: cache_key,
            url: url.clone(),
            cached_at: Instant::now(),
        });
    }

    url
}

fn find_media_page_url_impl(aumid: &str, title: &str, artist: &str, album: &str) -> Option<String> {
    for text in [album, title, artist] {
        if let Some(url) = first_media_url_in_text(text) {
            return Some(url);
        }
    }

    if !is_browser_app(aumid) {
        return None;
    }

    let process_names = browser_process_names(aumid);
    let hwnd = find_browser_window(&process_names, title)?;
    extract_url_from_window(hwnd)
}

fn normalize_match_text(value: &str) -> String {
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

fn media_title_matches_window(window_title: &str, media_title: &str) -> bool {
    let media = normalize_match_text(media_title);
    if media.len() < 4 {
        return true;
    }

    let window = normalize_match_text(window_title);
    if window.is_empty() {
        return false;
    }

    window.contains(&media)
        || media.contains(&window)
        || window
            .split(" youtube")
            .next()
            .is_some_and(|prefix| prefix.contains(&media) || media.contains(prefix))
}

fn browser_process_names(aumid: &str) -> Vec<String> {
    let lower = aumid.to_ascii_lowercase();
    if lower.contains("brave") {
        return vec!["brave.exe".into()];
    }
    if lower.contains("chrome") {
        return vec!["chrome.exe".into()];
    }
    if lower.contains("msedge") || lower.contains("edge") {
        return vec!["msedge.exe".into()];
    }
    if lower.contains("firefox") {
        return vec!["firefox.exe".into()];
    }
    if lower.contains("opera") {
        return vec!["opera.exe".into()];
    }
    if lower.contains("vivaldi") {
        return vec!["vivaldi.exe".into()];
    }
    vec![
        "brave.exe".into(),
        "chrome.exe".into(),
        "msedge.exe".into(),
        "firefox.exe".into(),
    ]
}

fn window_title_text(hwnd: HWND) -> String {
    let mut buffer = [0u16; 512];
    let len = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if len <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..len as usize])
}

fn first_media_url_in_text(text: &str) -> Option<String> {
    for capture in URL_IN_TEXT.captures_iter(text) {
        if let Some(matched) = capture.get(1) {
            if let Some(url) = normalize_media_page_url(matched.as_str()) {
                return Some(url);
            }
        }
    }
    None
}

/// Localiza a janela do browser que corresponde à faixa SMTC ativa.
///
/// Prioriza a janela em primeiro plano se ela bater com o processo e o título;
/// caso contrário, enumera todas as janelas visíveis do(s) processo(s) e escolhe
/// a primeira cujo título case com a faixa. Isto evita ler a URL da aba errada
/// quando há vários YouTube abertos e a janela do FocusWall está em foco.
fn find_browser_window(process_names: &[String], media_title: &str) -> Option<HWND> {
    let foreground = unsafe { GetForegroundWindow() };
    if !foreground.0.is_null()
        && window_matches_process(foreground, process_names)
        && media_title_matches_window(&window_title_text(foreground), media_title)
    {
        return Some(foreground);
    }

    let mut search = WindowSearch {
        process_names: process_names.to_vec(),
        media_title: media_title.to_string(),
        matched: None,
    };

    unsafe {
        let _ = EnumWindows(
            Some(enum_window_callback),
            LPARAM(&mut search as *mut WindowSearch as isize),
        );
    }

    search.matched.filter(|hwnd| !hwnd.0.is_null())
}

struct WindowSearch {
    process_names: Vec<String>,
    media_title: String,
    matched: Option<HWND>,
}

unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let search = &mut *(lparam.0 as *mut WindowSearch);

    if !unsafe { IsWindowVisible(hwnd).as_bool() } {
        return BOOL(1);
    }
    if !window_matches_process(hwnd, &search.process_names) {
        return BOOL(1);
    }
    if !media_title_matches_window(&window_title_text(hwnd), &search.media_title) {
        return BOOL(1);
    }

    search.matched = Some(hwnd);
    BOOL(0)
}

fn window_matches_process(hwnd: HWND, process_names: &[String]) -> bool {
    let Some(name) = process_name_for_window(hwnd) else {
        return false;
    };
    process_names
        .iter()
        .any(|target| name.eq_ignore_ascii_case(target))
}

fn process_name_for_window(hwnd: HWND) -> Option<String> {
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return None;
    }

    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = [0u16; 512];
        let mut size = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buffer.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(process);
        result.ok()?;
        let path = String::from_utf16_lossy(&buffer[..size as usize]);
        path.rsplit(['\\', '/'])
            .next()
            .map(str::to_string)
    }
}

fn variant_to_text(value: Option<Variant>) -> String {
    value
        .and_then(|variant| variant.get_string().ok())
        .unwrap_or_default()
}

fn extract_url_from_window(hwnd: HWND) -> Option<String> {
    let automation = UIAutomation::new().ok()?;
    let element = automation
        .element_from_handle((hwnd.0 as isize).into())
        .ok()?;
    let true_condition = automation.create_true_condition().ok()?;
    let nodes = element
        .find_all(TreeScope::Descendants, &true_condition)
        .ok()?;

    let mut seen = HashSet::new();
    for node in nodes.into_iter().take(MAX_UA_NODES) {
        for text in [
            node.get_name().unwrap_or_default(),
            variant_to_text(node.get_property_value(UIProperty::ValueValue).ok()),
        ] {
            let trimmed = text.trim();
            if trimmed.len() < 8 || !seen.insert(trimmed.to_string()) {
                continue;
            }
            if let Some(url) = first_media_url_in_text(trimmed) {
                return Some(url);
            }
        }
    }

    None
}
