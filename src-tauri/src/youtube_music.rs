use crate::dashboard_state::app_data_directory;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use log::{info, warn};
use reqwest::{Client, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex as StdMutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::Mutex as AsyncMutex,
    time::{sleep, timeout},
};
use url::Url;

const CONFIG_FILE_NAME: &str = "youtube-music.json";
const TOKEN_FILE_NAME: &str = "youtube-music-token.bin";
const YOUTUBE_READONLY_SCOPE: &str = "https://www.googleapis.com/auth/youtube.readonly";
const OAUTH_AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_ROOT: &str = "https://www.googleapis.com/youtube/v3";
const MAX_API_PAGES: usize = 200;
const LIBRARY_CACHE_TTL: Duration = Duration::from_secs(45);
const AUTH_TIMEOUT: Duration = Duration::from_secs(180);
const AUTH_RECONNECT_REQUIRED_ERROR: &str = "FOCUSWALL_YOUTUBE_AUTH_RECONNECT_REQUIRED";

pub struct MusicRuntime {
    token: StdMutex<Option<AccessToken>>,
    auth_in_progress: AtomicBool,
    refresh_lock: AsyncMutex<()>,
    playlists_cache: AsyncMutex<Option<CachedPlaylists>>,
    tracks_cache: AsyncMutex<HashMap<String, CachedTracks>>,
}

impl Default for MusicRuntime {
    fn default() -> Self {
        Self {
            token: StdMutex::new(None),
            auth_in_progress: AtomicBool::new(false),
            refresh_lock: AsyncMutex::new(()),
            playlists_cache: AsyncMutex::new(None),
            tracks_cache: AsyncMutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone)]
struct CachedPlaylists {
    loaded_at: Instant,
    value: Vec<YouTubePlaylist>,
}

#[derive(Clone)]
struct CachedTracks {
    loaded_at: Instant,
    value: Vec<YouTubeTrack>,
}

#[derive(Debug, Clone)]
struct AccessToken {
    value: String,
    expires_at_epoch: u64,
}

#[derive(Debug, Clone, Default)]
struct MusicConfig {
    client_id: String,
    client_secret: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MusicConfigFile {
    #[serde(default)]
    client_id: String,
    // Campo legado. É aceito somente para migrar instalações anteriores.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    client_secret: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    client_secret_protected: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicAuthStatus {
    configured: bool,
    client_secret_configured: bool,
    authenticated: bool,
    client_id: String,
    auth_in_progress: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubePlaylist {
    id: String,
    title: String,
    thumbnail_url: Option<String>,
    item_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeTrack {
    playlist_item_id: String,
    video_id: String,
    title: String,
    artist: String,
    thumbnail_url: Option<String>,
    position: u64,
}

#[derive(Debug, Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    expires_in: u64,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    scope: String,
}

#[derive(Debug, Deserialize)]
struct RefreshTokenResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Debug, Deserialize, Default)]
struct OAuthErrorResponse {
    #[serde(default)]
    error: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistListResponse {
    #[serde(default)]
    next_page_token: String,
    #[serde(default)]
    items: Vec<PlaylistResource>,
}

#[derive(Debug, Deserialize)]
struct PlaylistResource {
    id: String,
    snippet: PlaylistSnippet,
    #[serde(rename = "contentDetails")]
    content_details: PlaylistContentDetails,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistSnippet {
    #[serde(default)]
    title: String,
    #[serde(default)]
    thumbnails: ThumbnailSet,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistContentDetails {
    #[serde(default)]
    item_count: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistItemsResponse {
    #[serde(default)]
    next_page_token: String,
    #[serde(default)]
    items: Vec<PlaylistItemResource>,
}

#[derive(Debug, Deserialize)]
struct PlaylistItemResource {
    id: String,
    snippet: PlaylistItemSnippet,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistItemSnippet {
    #[serde(default)]
    title: String,
    #[serde(default)]
    channel_title: String,
    #[serde(default)]
    video_owner_channel_title: String,
    #[serde(default)]
    position: u64,
    #[serde(default)]
    thumbnails: ThumbnailSet,
    resource_id: ResourceId,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ResourceId {
    #[serde(default)]
    video_id: String,
}

#[derive(Debug, Deserialize, Default)]
struct ThumbnailSet {
    #[serde(default)]
    maxres: Option<Thumbnail>,
    #[serde(default)]
    standard: Option<Thumbnail>,
    #[serde(default)]
    high: Option<Thumbnail>,
    #[serde(default)]
    medium: Option<Thumbnail>,
    #[serde(default)]
    default: Option<Thumbnail>,
}

#[derive(Debug, Deserialize)]
struct Thumbnail {
    url: String,
}

impl ThumbnailSet {
    fn best_url(&self) -> Option<String> {
        self.maxres
            .as_ref()
            .or(self.standard.as_ref())
            .or(self.high.as_ref())
            .or(self.medium.as_ref())
            .or(self.default.as_ref())
            .map(|thumbnail| thumbnail.url.clone())
            .filter(|url| url.starts_with("https://"))
    }
}

struct AuthProgressGuard<'a>(&'a AtomicBool);

impl Drop for AuthProgressGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_directory(app)?.join(CONFIG_FILE_NAME))
}

fn token_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_directory(app)?.join(TOKEN_FILE_NAME))
}

fn read_config(app: &AppHandle) -> Result<MusicConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(MusicConfig::default());
    }

    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let stored: MusicConfigFile = serde_json::from_str(&raw)
        .map_err(|error| format!("Configuração do YouTube inválida: {error}"))?;

    let client_secret = if !stored.client_secret_protected.trim().is_empty() {
        let protected = URL_SAFE_NO_PAD
            .decode(stored.client_secret_protected.trim())
            .map_err(|_| "Credencial OAuth protegida está corrompida.".to_string())?;
        let plain = unprotect_bytes(&protected)?;
        String::from_utf8(plain)
            .map_err(|_| "Credencial OAuth protegida está corrompida.".to_string())?
    } else {
        stored.client_secret.clone()
    };

    let config = MusicConfig {
        client_id: stored.client_id,
        client_secret,
    };

    // Migração transparente: versões antigas gravavam o Client Secret em texto puro.
    if !stored.client_secret.trim().is_empty() && stored.client_secret_protected.trim().is_empty() {
        write_config(app, &config)?;
        info!("YouTube Music OAuth client secret migrated to Windows DPAPI protection.");
    }

    Ok(config)
}

fn write_config(app: &AppHandle, config: &MusicConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let client_secret_protected = if config.client_secret.trim().is_empty() {
        String::new()
    } else {
        URL_SAFE_NO_PAD.encode(protect_bytes(config.client_secret.as_bytes())?)
    };
    let stored = MusicConfigFile {
        client_id: config.client_id.clone(),
        client_secret: String::new(),
        client_secret_protected,
    };
    let payload = serde_json::to_vec_pretty(&stored).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

fn validate_client_id(value: &str) -> Result<String, String> {
    let client_id = value.trim();
    if client_id.is_empty() {
        return Err("Informe o OAuth Client ID do Google.".into());
    }
    if client_id.len() > 256
        || !client_id.ends_with(".apps.googleusercontent.com")
        || !client_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '.' | '_'))
    {
        return Err("OAuth Client ID inválido. Use um Client ID do tipo Desktop app.".into());
    }
    Ok(client_id.to_string())
}

fn validate_client_secret(value: &str) -> Result<String, String> {
    let client_secret = value.trim();
    if client_secret.is_empty() {
        return Err("Informe o OAuth Client Secret gerado para esta credencial.".into());
    }
    if client_secret.len() > 512 || client_secret.chars().any(char::is_whitespace) {
        return Err(
            "OAuth Client Secret inválido. Cole o valor gerado pelo Google sem espaços.".into(),
        );
    }
    Ok(client_secret.to_string())
}

fn validate_playlist_id(value: &str) -> Result<String, String> {
    let playlist_id = value.trim();
    if playlist_id.is_empty()
        || playlist_id.len() > 256
        || !playlist_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
    {
        return Err("Identificador de playlist inválido.".into());
    }
    Ok(playlist_id.to_string())
}

fn is_valid_youtube_video_id(value: &str) -> bool {
    value.len() == 11
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
}

fn auth_status(app: &AppHandle, runtime: &MusicRuntime) -> Result<MusicAuthStatus, String> {
    let config = read_config(app)?;
    let authenticated = read_refresh_token(app).is_ok();
    Ok(MusicAuthStatus {
        configured: !config.client_id.is_empty(),
        client_secret_configured: !config.client_secret.is_empty(),
        authenticated,
        client_id: config.client_id,
        auth_in_progress: runtime.auth_in_progress.load(Ordering::SeqCst),
    })
}

fn random_urlsafe(bytes_len: usize) -> Result<String, String> {
    let mut bytes = vec![0u8; bytes_len];
    getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn pkce_pair() -> Result<(String, String), String> {
    let verifier = random_urlsafe(64)?;
    let digest = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(digest);
    Ok((verifier, challenge))
}

async fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(25))
        .user_agent("FocusWall/0.1")
        .build()
        .map_err(|error| error.to_string())
}

fn browser_response(ok: bool, message: &str) -> String {
    let title = if ok {
        "FocusWall conectado"
    } else {
        "Falha no FocusWall"
    };
    let safe_message = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;");
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n<!doctype html><html><head><meta charset=\"utf-8\"><title>{title}</title></head><body style=\"font-family:system-ui;background:#10110f;color:#f2f0e8;padding:48px\"><h1>{title}</h1><p>{safe_message}</p><p>Você pode fechar esta janela e voltar ao FocusWall.</p></body></html>"
    )
}

async fn send_browser_response(stream: &mut TcpStream, ok: bool, message: &str) {
    let _ = stream
        .write_all(browser_response(ok, message).as_bytes())
        .await;
    let _ = stream.shutdown().await;
}

async fn receive_oauth_callback(
    listener: TcpListener,
    expected_state: &str,
) -> Result<(String, TcpStream), String> {
    let accept_result = timeout(AUTH_TIMEOUT, listener.accept())
        .await
        .map_err(|_| "Tempo esgotado aguardando autorização do Google.".to_string())?;
    let (mut stream, _) = accept_result.map_err(|error| error.to_string())?;

    let mut buffer = vec![0u8; 8192];
    let size = timeout(Duration::from_secs(10), stream.read(&mut buffer))
        .await
        .map_err(|_| "Tempo esgotado lendo retorno OAuth.".to_string())?
        .map_err(|error| error.to_string())?;
    if size == 0 {
        return Err("Retorno OAuth vazio.".into());
    }

    let request = String::from_utf8_lossy(&buffer[..size]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "Retorno OAuth inválido.".to_string())?;
    let callback_url = Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| "URL de retorno OAuth inválida.".to_string())?;

    let mut code = None;
    let mut state = None;
    let mut oauth_error = None;
    for (key, value) in callback_url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => oauth_error = Some(value.into_owned()),
            _ => {}
        }
    }

    if state.as_deref() != Some(expected_state) {
        send_browser_response(
            &mut stream,
            false,
            "O retorno de segurança não corresponde à solicitação.",
        )
        .await;
        return Err("Falha na validação de segurança OAuth (state).".into());
    }
    if let Some(error) = oauth_error {
        send_browser_response(
            &mut stream,
            false,
            "A autorização foi cancelada ou recusada.",
        )
        .await;
        return Err(format!("Autorização do Google recusada: {error}"));
    }
    let code = match code {
        Some(code) => code,
        None => {
            send_browser_response(
                &mut stream,
                false,
                "O Google não retornou o código de autorização.",
            )
            .await;
            return Err("O Google não retornou o código de autorização.".into());
        }
    };

    Ok((code, stream))
}

async fn exchange_authorization_code(
    client: &Client,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    code: &str,
    verifier: &str,
) -> Result<OAuthTokenResponse, String> {
    let mut form = vec![
        ("client_id", client_id),
        ("code", code),
        ("code_verifier", verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ];
    if !client_secret.is_empty() {
        form.push(("client_secret", client_secret));
    }

    let response = client
        .post(OAUTH_TOKEN_URL)
        .form(&form)
        .send()
        .await
        .map_err(|error| format!("Falha ao trocar código OAuth: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Google OAuth retornou {status}: {}",
            truncate_error_body(&body)
        ));
    }
    response
        .json::<OAuthTokenResponse>()
        .await
        .map_err(|error| format!("Resposta OAuth inválida: {error}"))
}

fn truncate_error_body(value: &str) -> String {
    let compact = value.replace(['\r', '\n'], " ");
    compact.chars().take(400).collect()
}

fn parse_oauth_error_response(value: &str) -> Option<OAuthErrorResponse> {
    serde_json::from_str(value).ok()
}

fn requires_auth_reconnect(error: Option<&OAuthErrorResponse>) -> bool {
    error.is_some_and(|error| error.error == "invalid_grant")
}

async fn invalidate_auth_session(app: &AppHandle, runtime: &MusicRuntime) {
    if let Err(error) = clear_refresh_token(app) {
        warn!("Could not remove rejected YouTube refresh token: {error}");
    }

    if let Ok(mut token) = runtime.token.lock() {
        *token = None;
    } else {
        warn!("Could not clear in-memory YouTube access token after authorization rejection.");
    }

    let mut playlists_cache = runtime.playlists_cache.lock().await;
    *playlists_cache = None;
    drop(playlists_cache);

    runtime.tracks_cache.lock().await.clear();
}

async fn refresh_access_token(
    app: &AppHandle,
    runtime: &MusicRuntime,
    client: &Client,
) -> Result<String, String> {
    if let Ok(guard) = runtime.token.lock() {
        if let Some(token) = guard.as_ref() {
            if token.expires_at_epoch > now_epoch().saturating_add(60) {
                return Ok(token.value.clone());
            }
        }
    }

    // Serializa refreshes concorrentes. A segunda chamada revalida o cache depois
    // de adquirir o lock e reutiliza o token renovado pela primeira chamada.
    let _refresh_guard = runtime.refresh_lock.lock().await;
    if let Ok(guard) = runtime.token.lock() {
        if let Some(token) = guard.as_ref() {
            if token.expires_at_epoch > now_epoch().saturating_add(60) {
                return Ok(token.value.clone());
            }
        }
    }

    let config = read_config(app)?;
    let client_id = validate_client_id(&config.client_id)?;
    let refresh_token = read_refresh_token(app)?;
    let client_secret = config.client_secret.trim();
    let mut form = vec![
        ("client_id", client_id.as_str()),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];
    if !client_secret.is_empty() {
        form.push(("client_secret", client_secret));
    }
    let response = client
        .post(OAUTH_TOKEN_URL)
        .form(&form)
        .send()
        .await
        .map_err(|error| format!("Falha ao renovar autorização: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let oauth_error = parse_oauth_error_response(&body);

        if requires_auth_reconnect(oauth_error.as_ref()) {
            invalidate_auth_session(app, runtime).await;
            warn!(
                "YouTube OAuth refresh token was rejected with invalid_grant; local authorization was invalidated."
            );
            return Err(AUTH_RECONNECT_REQUIRED_ERROR.into());
        }

        let error_code = oauth_error
            .as_ref()
            .map(|error| error.error.as_str())
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        warn!(
            "YouTube OAuth refresh failed: status={status}, error_code={error_code}."
        );
        return Err(
            "Não foi possível renovar a autorização do YouTube. Verifique as credenciais OAuth nas configurações e tente novamente."
                .into(),
        );
    }

    let token = response
        .json::<RefreshTokenResponse>()
        .await
        .map_err(|error| format!("Resposta de renovação inválida: {error}"))?;
    let access = AccessToken {
        value: token.access_token.clone(),
        expires_at_epoch: now_epoch().saturating_add(token.expires_in),
    };
    let mut guard = runtime
        .token
        .lock()
        .map_err(|_| "Falha ao acessar estado de autenticação.".to_string())?;
    *guard = Some(access);
    Ok(token.access_token)
}

async fn youtube_get<T: DeserializeOwned>(
    client: &Client,
    access_token: &str,
    path: &str,
    query: &[(&str, String)],
) -> Result<T, String> {
    const MAX_ATTEMPTS: usize = 3;
    let url = format!("{YOUTUBE_API_ROOT}/{path}");

    for attempt in 0..MAX_ATTEMPTS {
        let response = client
            .get(&url)
            .bearer_auth(access_token)
            .query(query)
            .send()
            .await;

        match response {
            Ok(response) if response.status().is_success() => {
                return response
                    .json::<T>()
                    .await
                    .map_err(|error| format!("Resposta do YouTube inválida: {error}"));
            }
            Ok(response) => {
                let status = response.status();
                let retryable = status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error();
                let body = response.text().await.unwrap_or_default();
                if retryable && attempt + 1 < MAX_ATTEMPTS {
                    warn!("YouTube Data API transient status on {path}: {status}; retrying.");
                    sleep(Duration::from_millis(250 * (1u64 << attempt))).await;
                    continue;
                }
                return Err(format!(
                    "YouTube Data API retornou {status}: {}",
                    truncate_error_body(&body)
                ));
            }
            Err(error) => {
                let retryable = error.is_connect() || error.is_timeout();
                if retryable && attempt + 1 < MAX_ATTEMPTS {
                    warn!("YouTube Data API transport failure on {path}; retrying.");
                    sleep(Duration::from_millis(250 * (1u64 << attempt))).await;
                    continue;
                }
                return Err(format!("Falha ao consultar YouTube: {error}"));
            }
        }
    }

    Err("Falha ao consultar YouTube após tentativas de recuperação.".into())
}

#[tauri::command]
pub fn youtube_music_get_auth_status(
    app: AppHandle,
    runtime: tauri::State<'_, MusicRuntime>,
) -> Result<MusicAuthStatus, String> {
    auth_status(&app, runtime.inner())
}

#[tauri::command]
pub fn youtube_music_save_client_id(
    app: AppHandle,
    runtime: tauri::State<'_, MusicRuntime>,
    client_id: String,
    client_secret: String,
) -> Result<MusicAuthStatus, String> {
    let client_id = validate_client_id(&client_id)?;
    let current = read_config(&app)?;
    let client_secret = if client_secret.trim().is_empty() && current.client_id == client_id {
        if current.client_secret.is_empty() {
            return Err("Informe o OAuth Client Secret gerado para esta credencial.".into());
        }
        current.client_secret.clone()
    } else {
        validate_client_secret(&client_secret)?
    };
    if current.client_id != client_id || current.client_secret != client_secret {
        clear_refresh_token(&app)?;
        if let Ok(mut guard) = runtime.token.lock() {
            *guard = None;
        }
        if let Ok(mut cache) = runtime.playlists_cache.try_lock() {
            *cache = None;
        }
        if let Ok(mut cache) = runtime.tracks_cache.try_lock() {
            cache.clear();
        }
    }
    write_config(
        &app,
        &MusicConfig {
            client_id,
            client_secret,
        },
    )?;
    auth_status(&app, runtime.inner())
}

#[tauri::command(async)]
pub async fn youtube_music_connect(
    app: AppHandle,
    runtime: tauri::State<'_, MusicRuntime>,
) -> Result<MusicAuthStatus, String> {
    if runtime
        .auth_in_progress
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Já existe uma autorização do YouTube em andamento.".into());
    }
    let _auth_guard = AuthProgressGuard(&runtime.auth_in_progress);

    let config = read_config(&app)?;
    let client_id = validate_client_id(&config.client_id)?;
    let client_secret = config.client_secret.trim().to_string();
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|error| format!("Falha ao abrir retorno OAuth local: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let (verifier, challenge) = pkce_pair()?;
    let state = random_urlsafe(32)?;

    let mut auth_url = Url::parse(OAUTH_AUTHORIZE_URL).map_err(|error| error.to_string())?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", YOUTUBE_READONLY_SCOPE)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state);

    open::that(auth_url.as_str()).map_err(|error| {
        format!("Não foi possível abrir o navegador para autenticação: {error}")
    })?;

    let (code, mut stream) = receive_oauth_callback(listener, &state).await?;
    let result = async {
        let client = http_client().await?;
        let token = exchange_authorization_code(
            &client,
            &client_id,
            &client_secret,
            &redirect_uri,
            &code,
            &verifier,
        )
        .await?;
        if !token.scope.trim().is_empty()
            && !token
                .scope
                .split_whitespace()
                .any(|scope| scope == YOUTUBE_READONLY_SCOPE)
        {
            return Err("A permissão de leitura do YouTube não foi concedida.".to_string());
        }
        let refresh_token = token.refresh_token.ok_or_else(|| {
            "O Google não retornou refresh token. Revogue o acesso e tente conectar novamente."
                .to_string()
        })?;
        write_refresh_token(&app, &refresh_token)?;
        info!("YouTube Music OAuth connection established.");

        let mut guard = runtime
            .token
            .lock()
            .map_err(|_| "Falha ao acessar estado de autenticação.".to_string())?;
        *guard = Some(AccessToken {
            value: token.access_token,
            expires_at_epoch: now_epoch().saturating_add(token.expires_in),
        });
        drop(guard);

        auth_status(&app, runtime.inner())
    }
    .await;

    match result {
        Ok(status) => {
            send_browser_response(
                &mut stream,
                true,
                "Conta do YouTube autorizada com sucesso.",
            )
            .await;
            Ok(status)
        }
        Err(error) => {
            send_browser_response(
                &mut stream,
                false,
                "A autorização foi recebida, mas o FocusWall não conseguiu concluir a conexão. Volte ao aplicativo para ver o erro.",
            )
            .await;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn youtube_music_disconnect(
    app: AppHandle,
    runtime: tauri::State<'_, MusicRuntime>,
) -> Result<MusicAuthStatus, String> {
    clear_refresh_token(&app)?;
    info!("YouTube Music local OAuth credential removed.");
    let mut guard = runtime
        .token
        .lock()
        .map_err(|_| "Falha ao acessar estado de autenticação.".to_string())?;
    *guard = None;
    drop(guard);
    if let Ok(mut cache) = runtime.playlists_cache.try_lock() {
        *cache = None;
    }
    if let Ok(mut cache) = runtime.tracks_cache.try_lock() {
        cache.clear();
    }
    auth_status(&app, runtime.inner())
}

#[tauri::command(async)]
pub async fn youtube_music_list_playlists(
    app: AppHandle,
    runtime: tauri::State<'_, MusicRuntime>,
) -> Result<Vec<YouTubePlaylist>, String> {
    {
        let cache = runtime.playlists_cache.lock().await;
        if let Some(cached) = cache
            .as_ref()
            .filter(|cached| cached.loaded_at.elapsed() < LIBRARY_CACHE_TTL)
        {
            return Ok(cached.value.clone());
        }
    }

    let client = http_client().await?;
    let access_token = refresh_access_token(&app, runtime.inner(), &client).await?;
    let mut page_token = String::new();
    let mut playlists = Vec::new();

    for _ in 0..MAX_API_PAGES {
        let mut query = vec![
            ("part", "snippet,contentDetails".to_string()),
            ("mine", "true".to_string()),
            ("maxResults", "50".to_string()),
        ];
        if !page_token.is_empty() {
            query.push(("pageToken", page_token.clone()));
        }
        let response: PlaylistListResponse =
            youtube_get(&client, &access_token, "playlists", &query).await?;
        playlists.extend(response.items.into_iter().map(|playlist| YouTubePlaylist {
            id: playlist.id,
            title: playlist.snippet.title,
            thumbnail_url: playlist.snippet.thumbnails.best_url(),
            item_count: playlist.content_details.item_count,
        }));
        page_token = response.next_page_token;
        if page_token.is_empty() {
            break;
        }
    }

    if !page_token.is_empty() {
        return Err(
            "A conta excede o limite defensivo de 10.000 playlists para uma única carga.".into(),
        );
    }
    playlists.sort_by_key(|playlist| playlist.title.to_lowercase());
    info!(
        "YouTube Music library loaded: {} playlists.",
        playlists.len()
    );
    let mut cache = runtime.playlists_cache.lock().await;
    *cache = Some(CachedPlaylists {
        loaded_at: Instant::now(),
        value: playlists.clone(),
    });
    Ok(playlists)
}

#[tauri::command(async)]
pub async fn youtube_music_list_playlist_items(
    app: AppHandle,
    runtime: tauri::State<'_, MusicRuntime>,
    playlist_id: String,
) -> Result<Vec<YouTubeTrack>, String> {
    let playlist_id = validate_playlist_id(&playlist_id)?;
    {
        let cache = runtime.tracks_cache.lock().await;
        if let Some(cached) = cache
            .get(&playlist_id)
            .filter(|cached| cached.loaded_at.elapsed() < LIBRARY_CACHE_TTL)
        {
            return Ok(cached.value.clone());
        }
    }

    let client = http_client().await?;
    let access_token = refresh_access_token(&app, runtime.inner(), &client).await?;
    let mut page_token = String::new();
    let mut tracks = Vec::new();

    for _ in 0..MAX_API_PAGES {
        let mut query = vec![
            ("part", "snippet,contentDetails,status".to_string()),
            ("playlistId", playlist_id.clone()),
            ("maxResults", "50".to_string()),
        ];
        if !page_token.is_empty() {
            query.push(("pageToken", page_token.clone()));
        }
        let response: PlaylistItemsResponse =
            youtube_get(&client, &access_token, "playlistItems", &query).await?;
        tracks.extend(response.items.into_iter().filter_map(|item| {
            let video_id = item.snippet.resource_id.video_id.trim().to_string();
            if !is_valid_youtube_video_id(&video_id) {
                warn!(
                    "Skipping playlist item {} with invalid YouTube video id.",
                    item.id
                );
                return None;
            }
            let artist = if item.snippet.video_owner_channel_title.trim().is_empty() {
                item.snippet.channel_title.clone()
            } else {
                item.snippet.video_owner_channel_title.clone()
            };
            Some(YouTubeTrack {
                playlist_item_id: item.id,
                video_id,
                title: item.snippet.title,
                artist,
                thumbnail_url: item.snippet.thumbnails.best_url(),
                position: item.snippet.position,
            })
        }));
        page_token = response.next_page_token;
        if page_token.is_empty() {
            break;
        }
    }

    if !page_token.is_empty() {
        return Err(
            "A playlist excede o limite defensivo de 10.000 itens para uma única carga.".into(),
        );
    }
    tracks.sort_by_key(|track| track.position);
    info!(
        "YouTube Music playlist loaded: {} playable items.",
        tracks.len()
    );
    let mut cache = runtime.tracks_cache.lock().await;
    cache.insert(
        playlist_id,
        CachedTracks {
            loaded_at: Instant::now(),
            value: tracks.clone(),
        },
    );
    Ok(tracks)
}

#[tauri::command]
pub fn youtube_music_open_google_console() -> Result<(), String> {
    open::that("https://console.cloud.google.com/apis/credentials")
        .map_err(|error| format!("Não foi possível abrir o Google Cloud Console: {error}"))
}

#[tauri::command]
pub fn youtube_music_open_api_library() -> Result<(), String> {
    open::that("https://console.cloud.google.com/apis/library/youtube.googleapis.com").map_err(
        |error| format!("Não foi possível abrir a biblioteca da YouTube Data API: {error}"),
    )
}

#[cfg(windows)]
#[repr(C)]
struct DataBlob {
    cb_data: u32,
    pb_data: *mut u8,
}

#[cfg(windows)]
#[link(name = "Crypt32")]
extern "system" {
    fn CryptProtectData(
        data_in: *mut DataBlob,
        description: *const u16,
        optional_entropy: *mut DataBlob,
        reserved: *mut std::ffi::c_void,
        prompt: *mut std::ffi::c_void,
        flags: u32,
        data_out: *mut DataBlob,
    ) -> i32;
    fn CryptUnprotectData(
        data_in: *mut DataBlob,
        description: *mut *mut u16,
        optional_entropy: *mut DataBlob,
        reserved: *mut std::ffi::c_void,
        prompt: *mut std::ffi::c_void,
        flags: u32,
        data_out: *mut DataBlob,
    ) -> i32;
}

#[cfg(windows)]
#[link(name = "Kernel32")]
extern "system" {
    fn LocalFree(memory: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
}

#[cfg(windows)]
fn protect_bytes(bytes: &[u8]) -> Result<Vec<u8>, String> {
    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
    let mut input = bytes.to_vec();
    let mut input_blob = DataBlob {
        cb_data: input.len() as u32,
        pb_data: input.as_mut_ptr(),
    };
    let mut output_blob = DataBlob {
        cb_data: 0,
        pb_data: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &mut input_blob,
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output_blob,
        )
    };
    if ok == 0 || output_blob.pb_data.is_null() {
        return Err("Falha ao proteger credencial com Windows DPAPI.".into());
    }
    let protected = unsafe {
        std::slice::from_raw_parts(output_blob.pb_data, output_blob.cb_data as usize).to_vec()
    };
    unsafe {
        LocalFree(output_blob.pb_data as *mut std::ffi::c_void);
    }
    Ok(protected)
}

#[cfg(windows)]
fn unprotect_bytes(bytes: &[u8]) -> Result<Vec<u8>, String> {
    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
    let mut input = bytes.to_vec();
    let mut input_blob = DataBlob {
        cb_data: input.len() as u32,
        pb_data: input.as_mut_ptr(),
    };
    let mut output_blob = DataBlob {
        cb_data: 0,
        pb_data: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &mut input_blob,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output_blob,
        )
    };
    if ok == 0 || output_blob.pb_data.is_null() {
        return Err(
            "Credencial do YouTube inválida ou indisponível para este usuário do Windows.".into(),
        );
    }
    let plain = unsafe {
        std::slice::from_raw_parts(output_blob.pb_data, output_blob.cb_data as usize).to_vec()
    };
    unsafe {
        LocalFree(output_blob.pb_data as *mut std::ffi::c_void);
    }
    Ok(plain)
}

#[cfg(not(windows))]
fn protect_bytes(_bytes: &[u8]) -> Result<Vec<u8>, String> {
    Err("Armazenamento seguro do YouTube está disponível apenas no Windows.".into())
}

#[cfg(not(windows))]
fn unprotect_bytes(_bytes: &[u8]) -> Result<Vec<u8>, String> {
    Err("Armazenamento seguro do YouTube está disponível apenas no Windows.".into())
}

fn write_refresh_token(app: &AppHandle, token: &str) -> Result<(), String> {
    let protected = protect_bytes(token.as_bytes())?;
    fs::write(token_path(app)?, protected).map_err(|error| error.to_string())
}

fn read_refresh_token(app: &AppHandle) -> Result<String, String> {
    let path = token_path(app)?;
    let protected = fs::read(path).map_err(|_| "Conta do YouTube não conectada.".to_string())?;
    let plain = unprotect_bytes(&protected)?;
    let token =
        String::from_utf8(plain).map_err(|_| "Credencial do YouTube corrompida.".to_string())?;
    if token.trim().is_empty() {
        return Err("Credencial do YouTube vazia.".into());
    }
    Ok(token)
}

fn clear_refresh_token(app: &AppHandle) -> Result<(), String> {
    let path = token_path(app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_desktop_google_client_id() {
        let value = "1234567890-abc_DEF.apps.googleusercontent.com";
        assert_eq!(validate_client_id(value).unwrap(), value);
    }

    #[test]
    fn rejects_non_google_client_id() {
        assert!(validate_client_id("focuswall.example.com").is_err());
    }

    #[test]
    fn validates_youtube_playlist_ids() {
        assert_eq!(
            validate_playlist_id("PLabc_123-XYZ").unwrap(),
            "PLabc_123-XYZ"
        );
        assert!(validate_playlist_id("../../secret").is_err());
    }

    #[test]
    fn validates_youtube_video_ids() {
        assert!(is_valid_youtube_video_id("dQw4w9WgXcQ"));
        assert!(is_valid_youtube_video_id("abc_DEF-123"));
        assert!(!is_valid_youtube_video_id("too-short"));
        assert!(!is_valid_youtube_video_id("invalid!id00"));
        assert!(!is_valid_youtube_video_id("dQw4w9WgXcQ-extra"));
    }

    #[test]
    fn pkce_challenge_is_url_safe() {
        let (verifier, challenge) = pkce_pair().unwrap();
        assert!(verifier.len() >= 43);
        assert!(!challenge.contains('='));
        assert!(!challenge.contains('+'));
        assert!(!challenge.contains('/'));
    }

    #[test]
    fn config_file_accepts_legacy_plaintext_secret_for_migration() {
        let stored: MusicConfigFile = serde_json::from_str(
            r#"{"clientId":"desktop.apps.googleusercontent.com","clientSecret":"legacy-secret"}"#,
        )
        .unwrap();
        assert_eq!(stored.client_secret, "legacy-secret");
        assert!(stored.client_secret_protected.is_empty());
    }

    #[test]
    fn config_file_omits_legacy_secret_when_serializing_protected_credentials() {
        let stored = MusicConfigFile {
            client_id: "desktop.apps.googleusercontent.com".into(),
            client_secret: String::new(),
            client_secret_protected: "protected-value".into(),
        };
        let payload = serde_json::to_string(&stored).unwrap();
        assert!(!payload.contains("\"clientSecret\":"));
        assert!(payload.contains("\"clientSecretProtected\":\"protected-value\""));
    }

    #[test]
    fn classifies_invalid_grant_as_reconnect_required() {
        let payload = r#"{"error":"invalid_grant","error_description":"Token has been expired or revoked."}"#;
        let error = parse_oauth_error_response(payload).unwrap();
        assert_eq!(error.error, "invalid_grant");
        assert!(requires_auth_reconnect(Some(&error)));
    }

    #[test]
    fn does_not_classify_other_or_malformed_oauth_errors_as_reconnect_required() {
        let invalid_client =
            parse_oauth_error_response(r#"{"error":"invalid_client"}"#).unwrap();
        assert!(!requires_auth_reconnect(Some(&invalid_client)));
        assert!(!requires_auth_reconnect(
            parse_oauth_error_response("not-json").as_ref()
        ));
    }
}
