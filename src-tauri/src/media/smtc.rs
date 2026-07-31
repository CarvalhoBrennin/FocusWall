use super::MediaSnapshot;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::GenericImageView;
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::sync::mpsc::{self, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::{LazyLock, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionMediaProperties,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Storage::Streams::DataReader;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

/// Evento Tauri emitido quando o SMTC sinaliza mudança de sessão/faixa.
pub const MEDIA_CHANGED_EVENT: &str = "media://changed";

// ---------------------------------------------------------------------------
// COM worker
//
// SMTC (WinRT) exige que as chamadas síncronas (`.get()` em IAsyncOperation)
// rodem numa thread com apartamento COM MTA. Os comandos do Tauri executam na
// thread principal (STA do WebView2) ou em threads sem COM inicializado, o que
// faz `.get()` travar (deadlock no STA) ou falhar. Para evitar isso, todo o
// trabalho de mídia é despachado para uma única thread dedicada que inicializa
// o MTA uma vez e permanece viva (mantendo o MTA e o manager em cache válidos).
// ---------------------------------------------------------------------------

type Job = Box<dyn FnOnce() + Send + 'static>;

static WORKER: OnceLock<SyncSender<Job>> = OnceLock::new();

/// Última capa enviada ao frontend: (trackKey, hash dos bytes).
///
/// A deduplicação só omite o base64 quando a faixa ativa é a MESMA e os bytes
/// são idênticos. Ao trocar de faixa (ex.: alternar entre dois YouTube), a
/// chave muda e o base64 é sempre reenviado — evitando capa em branco.
static LAST_SENT_COVER: LazyLock<Mutex<Option<(String, u64)>>> = LazyLock::new(|| Mutex::new(None));

fn cover_should_omit(track_key: &str, hash: u64) -> bool {
    LAST_SENT_COVER
        .lock()
        .ok()
        .and_then(|guard| {
            guard
                .as_ref()
                .map(|(key, cached)| key == track_key && *cached == hash)
        })
        .unwrap_or(false)
}

fn remember_sent_cover(track_key: &str, hash: u64) {
    if let Ok(mut guard) = LAST_SENT_COVER.lock() {
        *guard = Some((track_key.to_string(), hash));
    }
}

fn forget_sent_cover() {
    if let Ok(mut guard) = LAST_SENT_COVER.lock() {
        *guard = None;
    }
}

fn hash_cover_bytes(bytes: &[u8]) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

fn worker_sender() -> &'static SyncSender<Job> {
    WORKER.get_or_init(|| {
        let (tx, rx) = mpsc::sync_channel::<Job>(16);
        let spawned = std::thread::Builder::new()
            .name("smtc-media".into())
            .spawn(move || {
                // Falha de init não é fatal: chamadas seguintes apenas retornarão erro.
                unsafe {
                    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                }
                while let Ok(job) = rx.recv() {
                    job();
                }
            });

        if spawned.is_err() {
            log::error!("Falha ao iniciar a thread de mídia (SMTC).");
        }

        tx
    })
}

/// Executa `f` na thread de mídia (MTA) e devolve o resultado, isolando panics.
/// Usa timeout para garantir que o comando do Tauri nunca bloqueie indefinidamente
/// caso uma chamada WinRT trave.
fn run_on_worker<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    const WORKER_TIMEOUT: Duration = Duration::from_secs(5);

    let (tx, rx) = mpsc::channel::<Result<T, String>>();

    let job: Job = Box::new(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f))
            .unwrap_or_else(|_| Err("Erro interno ao ler a mídia.".to_string()));
        let _ = tx.send(result);
    });

    match worker_sender().try_send(job) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
            return Err("Serviço de mídia ocupado.".to_string());
        }
        Err(TrySendError::Disconnected(_)) => {
            return Err("Serviço de mídia indisponível.".to_string());
        }
    }

    match rx.recv_timeout(WORKER_TIMEOUT) {
        Ok(result) => result,
        Err(RecvTimeoutError::Timeout) => Err("Tempo esgotado ao ler a mídia.".to_string()),
        Err(RecvTimeoutError::Disconnected) => Err("Sem resposta do serviço de mídia.".to_string()),
    }
}

// ---------------------------------------------------------------------------
// Public API (dispatcha para o worker)
// ---------------------------------------------------------------------------

pub fn read_media_snapshot() -> Result<MediaSnapshot, String> {
    run_on_worker(read_media_snapshot_impl)
}

pub fn toggle_playback() -> Result<bool, String> {
    run_on_worker(|| {
        let session = require_session()?;
        toggle_playback_impl(&session)
    })
}

pub fn skip_next() -> Result<(), String> {
    run_on_worker(|| {
        let session = require_session()?;
        skip_next_impl(&session)
    })
}

pub fn skip_previous() -> Result<(), String> {
    run_on_worker(|| {
        let session = require_session()?;
        skip_previous_impl(&session)
    })
}

/// Capa lida da sessão ativa: `(base64, mime, largura, altura)`.
pub type CoverArtPayload = (Option<String>, Option<String>, Option<u32>, Option<u32>);

/// Lê a capa da sessão ativa para resolução de artwork (sempre com base64).
pub fn read_cover_art_for_artwork() -> Result<CoverArtPayload, String> {
    run_on_worker(read_cover_art_for_artwork_impl)
}

// ---------------------------------------------------------------------------
// Implementação (sempre executada na thread de mídia / MTA)
// ---------------------------------------------------------------------------

static MANAGER: LazyLock<Mutex<Option<GlobalSystemMediaTransportControlsSessionManager>>> =
    LazyLock::new(|| Mutex::new(None));

#[derive(Clone, Debug, PartialEq, Eq)]
struct SessionIdentity {
    title: String,
    artist: String,
    album: String,
    app_id: String,
}

static PINNED_SESSION: LazyLock<Mutex<Option<SessionIdentity>>> =
    LazyLock::new(|| Mutex::new(None));

fn normalize_session_text(value: &str) -> String {
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

fn identity_from_props(
    props: &GlobalSystemMediaTransportControlsSessionMediaProperties,
    app_id: &str,
) -> SessionIdentity {
    SessionIdentity {
        title: props.Title().map(|s| s.to_string()).unwrap_or_default(),
        artist: props.Artist().map(|s| s.to_string()).unwrap_or_default(),
        album: props
            .AlbumTitle()
            .map(|s| s.to_string())
            .unwrap_or_default(),
        app_id: app_id.to_string(),
    }
}

fn identities_match(a: &SessionIdentity, b: &SessionIdentity) -> bool {
    normalize_session_text(&a.title) == normalize_session_text(&b.title)
        && normalize_session_text(&a.artist) == normalize_session_text(&b.artist)
        && normalize_session_text(&a.album) == normalize_session_text(&b.album)
        && a.app_id == b.app_id
}

/// Dados de uma sessão lidos UMA vez por ciclo (props são a única chamada
/// assíncrona cara; reutilizamos o mesmo objeto para construir o snapshot).
struct SessionData {
    session: GlobalSystemMediaTransportControlsSession,
    props: GlobalSystemMediaTransportControlsSessionMediaProperties,
    identity: SessionIdentity,
    is_playing: bool,
    position_ms: u64,
}

fn current_pin() -> Option<SessionIdentity> {
    PINNED_SESSION.lock().ok().and_then(|guard| guard.clone())
}

fn pin_session(identity: &SessionIdentity) {
    if let Ok(mut guard) = PINNED_SESSION.lock() {
        *guard = Some(identity.clone());
    }
}

fn clear_pin() {
    if let Ok(mut guard) = PINNED_SESSION.lock() {
        *guard = None;
    }
}

// ---------------------------------------------------------------------------
// Ponte de eventos (event-driven)
//
// Em vez de depender só de polling, subscrevemos os eventos do SMTC na thread
// MTA. Quando uma sessão aparece/desaparece ou a sessão atual muda, emitimos um
// evento Tauri para o frontend reagir imediatamente; o polling fica como
// fallback de baixa frequência.
// ---------------------------------------------------------------------------

static EVENT_APP: OnceLock<AppHandle> = OnceLock::new();
static LAST_EMIT: LazyLock<Mutex<Option<Instant>>> = LazyLock::new(|| Mutex::new(None));
static SUBSCRIBED_SESSIONS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
const EMIT_THROTTLE: Duration = Duration::from_millis(250);

fn emit_media_changed() {
    let Some(app) = EVENT_APP.get() else {
        return;
    };
    if let Ok(mut last) = LAST_EMIT.lock() {
        let now = Instant::now();
        if last.is_some_and(|prev| now.duration_since(prev) < EMIT_THROTTLE) {
            return;
        }
        *last = Some(now);
    }
    let _ = app.emit(MEDIA_CHANGED_EVENT, ());
}

pub fn start_event_bridge(app: AppHandle) {
    if EVENT_APP.set(app).is_err() {
        return;
    }
    let job: Job = Box::new(|| {
        if let Err(err) = register_session_events() {
            log::warn!("Falha ao subscrever eventos SMTC: {err}");
        }
    });
    match worker_sender().try_send(job) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
            log::warn!("Fila do worker SMTC cheia; eventos de mídia podem atrasar.");
        }
        Err(TrySendError::Disconnected(_)) => {
            log::error!("Worker SMTC indisponível; eventos de mídia não serão subscritos.");
        }
    }
}

fn session_subscription_key(session: &GlobalSystemMediaTransportControlsSession) -> String {
    let app_id = session
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_default();
    format!("{app_id}:{:?}", std::ptr::from_ref(session))
}

fn subscribe_session_events(
    session: &GlobalSystemMediaTransportControlsSession,
) -> Result<(), String> {
    let key = session_subscription_key(session);
    if let Ok(mut subscribed) = SUBSCRIBED_SESSIONS.lock() {
        if !subscribed.insert(key) {
            return Ok(());
        }
    }

    session
        .MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
            emit_media_changed();
            Ok(())
        }))
        .map_err(|e| e.to_string())?;
    session
        .PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
            emit_media_changed();
            Ok(())
        }))
        .map_err(|e| e.to_string())?;
    session
        .TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
            emit_media_changed();
            Ok(())
        }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_session_subscriptions() -> Result<(), String> {
    let manager = get_manager()?;
    let sessions = manager.GetSessions().map_err(|e| e.to_string())?;
    let count = sessions.Size().map_err(|e| e.to_string())?;
    for index in 0..count {
        let Ok(session) = sessions.GetAt(index) else {
            continue;
        };
        if let Err(err) = subscribe_session_events(&session) {
            log::debug!("Falha ao subscrever eventos da sessão SMTC: {err}");
        }
    }
    Ok(())
}

fn register_session_events() -> Result<(), String> {
    let manager = get_manager()?;
    manager
        .CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
            emit_media_changed();
            let _ = ensure_session_subscriptions();
            Ok(())
        }))
        .map_err(|e| e.to_string())?;
    manager
        .SessionsChanged(&TypedEventHandler::new(move |_, _| {
            emit_media_changed();
            let _ = ensure_session_subscriptions();
            Ok(())
        }))
        .map_err(|e| e.to_string())?;
    ensure_session_subscriptions()
}

fn get_manager() -> Result<GlobalSystemMediaTransportControlsSessionManager, String> {
    let mut guard = MANAGER
        .lock()
        .map_err(|_| "Estado de mídia indisponível.".to_string())?;

    if let Some(manager) = guard.as_ref() {
        return Ok(manager.clone());
    }

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    *guard = Some(manager.clone());
    Ok(manager)
}

fn session_is_playing(session: &GlobalSystemMediaTransportControlsSession) -> bool {
    session
        .GetPlaybackInfo()
        .ok()
        .and_then(|info| info.PlaybackStatus().ok())
        .map(|status| status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(false)
}

fn collect_sessions(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
) -> Vec<SessionData> {
    let mut out = Vec::new();
    let Ok(sessions) = manager.GetSessions() else {
        return out;
    };
    let Ok(count) = sessions.Size() else {
        return out;
    };

    for index in 0..count {
        let Ok(session) = sessions.GetAt(index) else {
            continue;
        };
        let Some(props) = read_properties(&session) else {
            continue;
        };
        let app_id = session
            .SourceAppUserModelId()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let identity = identity_from_props(&props, &app_id);
        let is_playing = session_is_playing(&session);
        let (position_ms, _) = read_timeline(&session).unwrap_or((0, 0));

        out.push(SessionData {
            session,
            props,
            identity,
            is_playing,
            position_ms,
        });
    }

    out
}

/// Seleção *sticky*: mantém a faixa fixada enquanto nada novo começa a tocar.
///
/// Regras (desempate determinístico, sem depender da janela em foco):
/// 1. Se algo está a tocar: preferir a sessão a tocar. Prioridade: fixada exata
///    → mesma *app* da fixada (ex.: trocou de faixa no mesmo player) → "current"
///    → primeira a tocar.
/// 2. Se nada toca: fixada exata → mesma app da fixada → "current" → maior
///    posição (a usada por último).
///
/// A prioridade por *app_id* é o que evita o painel "pular sozinho" para outro
/// reprodutor no instante em que os metadados mudam ao trocar de faixa: a
/// identidade exata deixa de casar por uma leitura, mas a app continua a mesma.
fn select_active(
    sessions: &[SessionData],
    pinned: Option<&SessionIdentity>,
    current: Option<&SessionIdentity>,
) -> Option<usize> {
    if sessions.is_empty() {
        return None;
    }

    let pinned_idx = pinned.and_then(|pin| {
        sessions
            .iter()
            .position(|d| identities_match(&d.identity, pin))
    });
    let current_idx = current.and_then(|cur| {
        sessions
            .iter()
            .position(|d| identities_match(&d.identity, cur))
    });

    // Índice de uma sessão da mesma app que a fixada, opcionalmente exigindo que
    // esteja a tocar. `app_id` vazio nunca casa (evita agrupar tudo sob "").
    let pinned_app = pinned
        .map(|p| p.app_id.as_str())
        .filter(|id| !id.is_empty());
    let same_app_idx = |require_playing: bool| -> Option<usize> {
        let app = pinned_app?;
        sessions
            .iter()
            .position(|d| d.identity.app_id == app && (!require_playing || d.is_playing))
    };

    let any_playing = sessions.iter().any(|d| d.is_playing);

    if any_playing {
        if let Some(idx) = pinned_idx {
            if sessions[idx].is_playing {
                return Some(idx);
            }
        }
        if let Some(idx) = same_app_idx(true) {
            return Some(idx);
        }
        if let Some(idx) = current_idx {
            if sessions[idx].is_playing {
                return Some(idx);
            }
        }
        return sessions.iter().position(|d| d.is_playing);
    }

    if pinned_idx.is_some() {
        return pinned_idx;
    }
    if let Some(idx) = same_app_idx(false) {
        return Some(idx);
    }
    if current_idx.is_some() {
        return current_idx;
    }

    sessions
        .iter()
        .enumerate()
        .max_by_key(|(_, d)| d.position_ms)
        .map(|(idx, _)| idx)
}

fn current_session_identity(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
) -> Option<SessionIdentity> {
    let session = manager.GetCurrentSession().ok()?;
    let app_id = session
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_default();
    let props = read_properties(&session)?;
    Some(identity_from_props(&props, &app_id))
}

/// Constrói a lista, escolhe a sessão ativa e fixa-a. Devolve os dados já lidos
/// para evitar uma segunda leitura de propriedades.
fn active_session_data() -> Option<SessionData> {
    let manager = get_manager().ok()?;
    let current_identity = current_session_identity(&manager);
    let mut sessions = collect_sessions(&manager);

    if sessions.is_empty() {
        clear_pin();
        forget_sent_cover();
        return None;
    }

    let pinned = current_pin();
    let idx = select_active(&sessions, pinned.as_ref(), current_identity.as_ref())?;
    pin_session(&sessions[idx].identity);
    Some(sessions.swap_remove(idx))
}

fn require_session() -> Result<GlobalSystemMediaTransportControlsSession, String> {
    active_session_data()
        .map(|data| data.session)
        .ok_or_else(|| "Nenhuma sessão de mídia ativa encontrada.".to_string())
}

fn ms_from_timespan(ticks: i64) -> u64 {
    if ticks <= 0 {
        return 0;
    }
    (ticks as u64) / 10_000
}

fn friendly_app_name(aumid: &str) -> String {
    let lower = aumid.to_ascii_lowercase();
    if lower.contains("spotify") {
        return "Spotify".into();
    }
    if lower.contains("chrome") {
        return "Google Chrome".into();
    }
    if lower.contains("msedge") || lower.contains("edge") {
        return "Microsoft Edge".into();
    }
    if lower.contains("firefox") {
        return "Firefox".into();
    }
    if lower.contains("brave") {
        return "Brave".into();
    }
    if lower.contains("vlc") {
        return "VLC".into();
    }
    if lower.contains("groove") {
        return "Groove".into();
    }
    if lower.contains("itunes") || lower.contains("apple") {
        return "Apple Music".into();
    }
    if lower.contains("youtube") {
        return "YouTube".into();
    }
    if lower.contains("deezer") {
        return "Deezer".into();
    }
    if lower.contains("tidal") {
        return "Tidal".into();
    }

    aumid.split('.').next().unwrap_or(aumid).replace('_', " ")
}

fn read_properties(
    session: &GlobalSystemMediaTransportControlsSession,
) -> Option<GlobalSystemMediaTransportControlsSessionMediaProperties> {
    session.TryGetMediaPropertiesAsync().ok()?.get().ok()
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

fn read_cover_art_for_artwork_impl() -> Result<CoverArtPayload, String> {
    let Some(data) = active_session_data() else {
        return Ok((None, None, None, None));
    };
    let track_key = super::artwork::track_key(
        &data.identity.artist,
        &data.identity.album,
        &data.identity.title,
        &data.identity.app_id,
    );
    Ok(read_cover_art_inner(&data.props, &track_key, false))
}

fn read_cover_art(
    props: &GlobalSystemMediaTransportControlsSessionMediaProperties,
    track_key: &str,
) -> (Option<String>, Option<String>, Option<u32>, Option<u32>) {
    read_cover_art_inner(props, track_key, true)
}

fn read_cover_art_inner(
    props: &GlobalSystemMediaTransportControlsSessionMediaProperties,
    track_key: &str,
    allow_omit: bool,
) -> (Option<String>, Option<String>, Option<u32>, Option<u32>) {
    let thumb = match props.Thumbnail() {
        Ok(thumb) => thumb,
        Err(_) => {
            forget_sent_cover();
            return (None, None, None, None);
        }
    };
    let stream = match thumb.OpenReadAsync() {
        Ok(op) => match op.get() {
            Ok(stream) => stream,
            Err(_) => return (None, None, None, None),
        },
        Err(_) => return (None, None, None, None),
    };
    let size = match stream.Size() {
        Ok(size) => size,
        Err(_) => return (None, None, None, None),
    };
    // Não descartar capas grandes: thumbnails do Spotify/SMTC podem chegar a
    // alguns MB em alta resolução. Mantemos um teto generoso só para evitar
    // estourar memória com streams inesperadamente enormes.
    if size == 0 || size > 12_000_000 {
        forget_sent_cover();
        return (None, None, None, None);
    }

    let reader = match DataReader::CreateDataReader(&stream) {
        Ok(reader) => reader,
        Err(_) => return (None, None, None, None),
    };
    if reader
        .LoadAsync(size as u32)
        .ok()
        .and_then(|op| op.get().ok())
        .is_none()
    {
        return (None, None, None, None);
    }

    let mut bytes = vec![0u8; size as usize];
    if reader.ReadBytes(&mut bytes).is_err() || bytes.is_empty() {
        forget_sent_cover();
        return (None, None, None, None);
    }

    let mime = detect_image_mime(&bytes).to_string();
    let (width, height) = image::load_from_memory(&bytes)
        .ok()
        .map(|img| img.dimensions())
        .unwrap_or((0, 0));
    let cover_width = if width > 0 { Some(width) } else { None };
    let cover_height = if height > 0 { Some(height) } else { None };
    let hash = hash_cover_bytes(&bytes);
    let omit_base64 = allow_omit && cover_should_omit(track_key, hash);
    if allow_omit {
        remember_sent_cover(track_key, hash);
    }

    (
        if omit_base64 {
            None
        } else {
            Some(STANDARD.encode(&bytes))
        },
        Some(mime),
        cover_width,
        cover_height,
    )
}

fn read_timeline(
    session: &GlobalSystemMediaTransportControlsSession,
) -> Result<(u64, u64), String> {
    let timeline = session.GetTimelineProperties().map_err(|e| e.to_string())?;
    let start_ms = timeline
        .StartTime()
        .map(|ts| ms_from_timespan(ts.Duration))
        .unwrap_or(0);
    let end_ms = timeline
        .EndTime()
        .map(|ts| ms_from_timespan(ts.Duration))
        .unwrap_or(0);
    let position_ms = timeline
        .Position()
        .map(|ts| ms_from_timespan(ts.Duration))
        .unwrap_or(0)
        .saturating_sub(start_ms);

    let duration_ms = end_ms.saturating_sub(start_ms);
    Ok((position_ms, duration_ms))
}

fn snapshot_from_data(data: SessionData) -> Result<MediaSnapshot, String> {
    let SessionData {
        session,
        props,
        identity,
        is_playing,
        position_ms: _,
    } = data;

    let title = identity.title;
    let artist = identity.artist;
    let album = identity.album;
    let app_id = identity.app_id;

    let track_key = super::artwork::track_key(&artist, &album, &title, &app_id);
    let (cover_art_base64, cover_art_mime, cover_art_width, cover_art_height) =
        read_cover_art(&props, &track_key);

    let playback = session.GetPlaybackInfo().map_err(|e| e.to_string())?;
    let controls = playback.Controls().map_err(|e| e.to_string())?;
    let can_play = controls.IsPlayEnabled().unwrap_or(false);
    let can_pause = controls.IsPauseEnabled().unwrap_or(false);
    let can_next = controls.IsNextEnabled().unwrap_or(false);
    let can_previous = controls.IsPreviousEnabled().unwrap_or(false);

    let (position_ms, duration_ms) = read_timeline(&session)?;

    let app_name = if app_id.is_empty() {
        "Reprodutor".into()
    } else {
        friendly_app_name(&app_id)
    };

    Ok(MediaSnapshot {
        available: true,
        source: "smtc".into(),
        title,
        artist,
        album,
        app_name,
        source_app_id: app_id,
        is_playing,
        can_play,
        can_pause,
        can_next,
        can_previous,
        position_ms,
        duration_ms,
        cover_art_base64,
        cover_art_mime,
        cover_art_width,
        cover_art_height,
    })
}

fn read_media_snapshot_impl() -> Result<MediaSnapshot, String> {
    let Some(data) = active_session_data() else {
        return Ok(MediaSnapshot::empty());
    };

    snapshot_from_data(data)
}

fn toggle_playback_impl(
    session: &GlobalSystemMediaTransportControlsSession,
) -> Result<bool, String> {
    let result = if session
        .TryTogglePlayPauseAsync()
        .map_err(|e| e.to_string())?
        .get()
        .is_ok()
    {
        let info = session.GetPlaybackInfo().map_err(|e| e.to_string())?;
        let status = info.PlaybackStatus().map_err(|e| e.to_string())?;
        Ok(status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
    } else {
        let info = session.GetPlaybackInfo().map_err(|e| e.to_string())?;
        let status = info.PlaybackStatus().map_err(|e| e.to_string())?;
        if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
            session
                .TryPauseAsync()
                .map_err(|e| e.to_string())?
                .get()
                .map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            session
                .TryPlayAsync()
                .map_err(|e| e.to_string())?
                .get()
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
    };

    emit_media_changed();
    result
}

fn skip_next_impl(session: &GlobalSystemMediaTransportControlsSession) -> Result<(), String> {
    session
        .TrySkipNextAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    emit_media_changed();
    Ok(())
}

fn skip_previous_impl(session: &GlobalSystemMediaTransportControlsSession) -> Result<(), String> {
    session
        .TrySkipPreviousAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    emit_media_changed();
    Ok(())
}
