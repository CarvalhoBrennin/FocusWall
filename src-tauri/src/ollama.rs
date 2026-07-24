use futures_util::StreamExt;
use reqwest::{blocking::Client as BlockingClient, Client as AsyncClient, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    env,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};
use tauri::ipc::Channel;
use tokio::sync::{watch, Mutex as AsyncMutex};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const DEFAULT_BASE_URL: &str = "http://127.0.0.1:11434";
const FALLBACK_BASE_URL: &str = "http://localhost:11434";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const STARTUP_HEALTH_TIMEOUT: Duration = Duration::from_secs(10);
const STARTUP_HEALTH_INTERVAL: Duration = Duration::from_millis(500);
const MAX_REQUEST_BYTES: usize = 2 * 1024 * 1024;
const MAX_STREAM_BYTES: usize = 2 * 1024 * 1024;
const MAX_STREAM_LINE_BYTES: usize = 256 * 1024;

static START_LOCK: Mutex<()> = Mutex::new(());
static CANCELLATIONS: OnceLock<AsyncMutex<HashMap<String, watch::Sender<bool>>>> = OnceLock::new();

fn cancellations() -> &'static AsyncMutex<HashMap<String, watch::Sender<bool>>> {
    CANCELLATIONS.get_or_init(|| AsyncMutex::new(HashMap::new()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelInfo {
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaHealth {
    pub online: bool,
    pub models: Vec<OllamaModelInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStartResult {
    pub online: bool,
    pub started: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelInstallResult {
    pub installed: bool,
    pub model: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStreamChunk {
    pub line: String,
    pub done: bool,
}

fn blocking_client_with_timeout(timeout: Duration) -> Result<BlockingClient, String> {
    BlockingClient::builder()
        .timeout(timeout)
        .connect_timeout(Duration::from_secs(4))
        .build()
        .map_err(|error| error.to_string())
}

fn health_client() -> Result<BlockingClient, String> {
    blocking_client_with_timeout(Duration::from_secs(5))
}

fn validate_local_base_url(value: &str) -> Result<String, String> {
    let mut url = Url::parse(value.trim()).map_err(|_| "URL local do Ollama invalida.".to_string())?;
    if url.scheme() != "http" {
        return Err("A URL do Ollama deve usar HTTP local.".to_string());
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if !matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1") {
        return Err("A URL do Ollama deve apontar apenas para localhost.".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("A URL do Ollama contem componentes nao permitidos.".to_string());
    }
    if url.path() != "/" && !url.path().is_empty() {
        return Err("A URL base do Ollama nao pode conter caminho.".to_string());
    }
    url.set_path("");
    Ok(url.as_str().trim_end_matches('/').to_string())
}

fn normalize_base_urls(base_url: Option<String>) -> Result<Vec<String>, String> {
    let mut urls = Vec::new();
    if let Some(custom) = base_url {
        if !custom.trim().is_empty() {
            urls.push(validate_local_base_url(&custom)?);
        }
    }
    for candidate in [DEFAULT_BASE_URL, FALLBACK_BASE_URL] {
        let validated = validate_local_base_url(candidate)?;
        if !urls.iter().any(|url| url == &validated) {
            urls.push(validated);
        }
    }
    Ok(urls)
}

fn command_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(custom) = env::var("OLLAMA_EXE") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            candidates.push(PathBuf::from(trimmed));
        }
    }
    for var_name in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(root) = env::var(var_name) {
            let root = PathBuf::from(root);
            candidates.push(root.join("Programs").join("Ollama").join("ollama.exe"));
            candidates.push(root.join("Ollama").join("ollama.exe"));
        }
    }
    if let Ok(path) = env::var("PATH") {
        for entry in env::split_paths(&path) {
            candidates.push(entry.join("ollama.exe"));
            candidates.push(entry.join("ollama"));
        }
    }
    candidates.push(PathBuf::from("ollama"));
    let mut unique = Vec::new();
    for candidate in candidates {
        if !unique.iter().any(|entry| entry == &candidate) {
            unique.push(candidate);
        }
    }
    unique
}

fn spawn_ollama_serve() -> Result<(), String> {
    let mut last_error = String::from("Ollama nao encontrado.");
    for candidate in command_candidates() {
        if candidate.components().count() > 1 && !candidate.exists() {
            continue;
        }
        let mut command = Command::new(&candidate);
        command
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);
        match command.spawn() {
            Ok(_) => return Ok(()),
            Err(error) => last_error = format!("{}: {error}", candidate.display()),
        }
    }
    Err(last_error)
}

fn validate_model_name(model: &str) -> Result<String, String> {
    let trimmed = model.trim();
    if trimmed.is_empty() || trimmed.len() > 96 {
        return Err("Modelo do Ollama invalido.".to_string());
    }
    if trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | ':' | '/'))
    {
        Ok(trimmed.to_string())
    } else {
        Err("Nome de modelo contem caracteres invalidos.".to_string())
    }
}

fn run_ollama_pull(model: &str) -> Result<(), String> {
    let mut last_error = String::from("Ollama nao encontrado.");
    for candidate in command_candidates() {
        if candidate.components().count() > 1 && !candidate.exists() {
            continue;
        }
        let mut command = Command::new(&candidate);
        command
            .args(["pull", model])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);
        match command.status() {
            Ok(status) if status.success() => return Ok(()),
            Ok(status) => last_error = format!("{} saiu com codigo {}", candidate.display(), status),
            Err(error) => last_error = format!("{}: {error}", candidate.display()),
        }
    }
    Err(last_error)
}

fn has_model(models: &[OllamaModelInfo], model: &str) -> bool {
    models.iter().any(|entry| entry.name == model)
}

fn parse_models(body: &str) -> Vec<OllamaModelInfo> {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|payload| payload.get("models").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| {
            entry.get("name")?.as_str().map(|name| OllamaModelInfo {
                name: name.to_string(),
            })
        })
        .collect()
}

fn probe_health(client: &BlockingClient, base_url: &str) -> Result<Vec<OllamaModelInfo>, String> {
    let response = client
        .get(format!("{base_url}/api/tags"))
        .send()
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let body = response.text().map_err(|error| error.to_string())?;
    Ok(parse_models(&body))
}

#[tauri::command]
pub fn check_ollama_health(base_url: Option<String>) -> OllamaHealth {
    let candidates = match normalize_base_urls(base_url) {
        Ok(candidates) => candidates,
        Err(error) => {
            return OllamaHealth {
                online: false,
                models: Vec::new(),
                error: Some(error),
                base_url: None,
            }
        }
    };
    let client = match health_client() {
        Ok(client) => client,
        Err(error) => {
            return OllamaHealth {
                online: false,
                models: Vec::new(),
                error: Some(error),
                base_url: None,
            }
        }
    };
    let mut last_error = String::from("Ollama indisponivel.");
    for candidate in candidates {
        match probe_health(&client, &candidate) {
            Ok(models) => {
                return OllamaHealth {
                    online: true,
                    models,
                    error: None,
                    base_url: Some(candidate),
                }
            }
            Err(error) => last_error = error,
        }
    }
    OllamaHealth {
        online: false,
        models: Vec::new(),
        error: Some(last_error),
        base_url: None,
    }
}

fn wait_for_ollama_health(base_url: Option<String>, timeout: Duration) -> OllamaHealth {
    let deadline = Instant::now() + timeout;
    let mut last = check_ollama_health(base_url.clone());
    while !last.online && Instant::now() < deadline {
        thread::sleep(STARTUP_HEALTH_INTERVAL);
        last = check_ollama_health(base_url.clone());
    }
    last
}

pub fn ensure_ollama_started(base_url: Option<String>) -> OllamaStartResult {
    let initial = check_ollama_health(base_url.clone());
    if initial.online {
        return OllamaStartResult {
            online: true,
            started: false,
            message: "Ollama ja estava online.".to_string(),
            base_url: initial.base_url,
            error: None,
        };
    }
    let _guard = START_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let initial = check_ollama_health(base_url.clone());
    if initial.online {
        return OllamaStartResult {
            online: true,
            started: false,
            message: "Ollama ja estava online.".to_string(),
            base_url: initial.base_url,
            error: None,
        };
    }
    if let Err(error) = spawn_ollama_serve() {
        return OllamaStartResult {
            online: false,
            started: false,
            message: "Nao foi possivel iniciar o Ollama.".to_string(),
            base_url: None,
            error: Some(error),
        };
    }
    let health = wait_for_ollama_health(base_url, STARTUP_HEALTH_TIMEOUT);
    OllamaStartResult {
        online: health.online,
        started: health.online,
        message: if health.online {
            "Ollama iniciado.".to_string()
        } else {
            "Ollama foi iniciado, mas nao respondeu a tempo.".to_string()
        },
        base_url: health.base_url,
        error: health.error,
    }
}

#[tauri::command]
pub async fn start_ollama_service(base_url: Option<String>) -> OllamaStartResult {
    tauri::async_runtime::spawn_blocking(move || ensure_ollama_started(base_url))
        .await
        .unwrap_or_else(|error| OllamaStartResult {
            online: false,
            started: false,
            message: "Nao foi possivel iniciar o Ollama.".to_string(),
            base_url: None,
            error: Some(error.to_string()),
        })
}

#[tauri::command]
pub async fn install_ollama_model(model: String, base_url: Option<String>) -> OllamaModelInstallResult {
    tauri::async_runtime::spawn_blocking(move || {
        let model = match validate_model_name(&model) {
            Ok(model) => model,
            Err(error) => {
                return OllamaModelInstallResult {
                    installed: false,
                    model,
                    message: "Modelo invalido.".to_string(),
                    base_url: None,
                    error: Some(error),
                }
            }
        };
        let started = ensure_ollama_started(base_url.clone());
        if !started.online {
            return OllamaModelInstallResult {
                installed: false,
                model,
                message: "Ollama indisponivel para instalar o modelo.".to_string(),
                base_url: started.base_url,
                error: started.error,
            };
        }
        let health = check_ollama_health(base_url.clone());
        if has_model(&health.models, &model) {
            return OllamaModelInstallResult {
                installed: true,
                model,
                message: "Modelo ja estava instalado.".to_string(),
                base_url: health.base_url,
                error: None,
            };
        }
        if let Err(error) = run_ollama_pull(&model) {
            return OllamaModelInstallResult {
                installed: false,
                model,
                message: "Nao foi possivel instalar o modelo.".to_string(),
                base_url: health.base_url,
                error: Some(error),
            };
        }
        let final_health = check_ollama_health(base_url);
        let installed = has_model(&final_health.models, &model);
        OllamaModelInstallResult {
            installed,
            model,
            message: if installed {
                "Modelo instalado.".to_string()
            } else {
                "O comando de instalacao terminou, mas o modelo nao apareceu na lista.".to_string()
            },
            base_url: final_health.base_url,
            error: if installed { None } else { final_health.error },
        }
    })
    .await
    .unwrap_or_else(|error| OllamaModelInstallResult {
        installed: false,
        model: String::new(),
        message: "Nao foi possivel instalar o modelo.".to_string(),
        base_url: None,
        error: Some(error.to_string()),
    })
}

fn validate_request_id(request_id: &str) -> Result<(), String> {
    if request_id.is_empty()
        || request_id.len() > 128
        || !request_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
    {
        return Err("Identificador de requisicao invalido.".to_string());
    }
    Ok(())
}

fn validate_chat_body(body: &str) -> Result<(), String> {
    if body.len() > MAX_REQUEST_BYTES {
        return Err("Payload do Ollama excede o limite permitido.".to_string());
    }
    let parsed: Value = serde_json::from_str(body).map_err(|_| "Payload JSON do Ollama invalido.".to_string())?;
    if !parsed.is_object() {
        return Err("Payload do Ollama deve ser um objeto JSON.".to_string());
    }
    Ok(())
}

fn parse_done_line(line: &str) -> Result<bool, String> {
    let value: Value = serde_json::from_str(line).map_err(|_| "Ollama enviou JSON invalido.".to_string())?;
    if !value.is_object() {
        return Err("Ollama enviou um chunk invalido.".to_string());
    }
    Ok(value.get("done").and_then(Value::as_bool).unwrap_or(false))
}

fn emit_line(on_chunk: &Channel<OllamaStreamChunk>, line_bytes: &[u8]) -> Result<bool, String> {
    if line_bytes.is_empty() || line_bytes.iter().all(|byte| byte.is_ascii_whitespace()) {
        return Ok(false);
    }
    if line_bytes.len() > MAX_STREAM_LINE_BYTES {
        return Err("Ollama enviou uma linha maior que o limite permitido.".to_string());
    }
    let line = std::str::from_utf8(line_bytes)
        .map_err(|_| "Ollama enviou texto UTF-8 invalido.".to_string())?
        .trim_end_matches('\r')
        .to_string();
    let done = parse_done_line(&line)?;
    on_chunk
        .send(OllamaStreamChunk { line, done })
        .map_err(|error| error.to_string())?;
    Ok(done)
}

async fn read_stream(
    response: reqwest::Response,
    on_chunk: &Channel<OllamaStreamChunk>,
    cancel_rx: &mut watch::Receiver<bool>,
    idle_timeout: Duration,
) -> Result<(), String> {
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    let mut total_bytes = 0usize;

    loop {
        let next = tokio::select! {
            changed = cancel_rx.changed() => {
                if changed.is_ok() && *cancel_rx.borrow() {
                    return Err("Solicitacao ao Ollama cancelada.".to_string());
                }
                continue;
            }
            result = tokio::time::timeout(idle_timeout, stream.next()) => {
                result.map_err(|_| "Tempo esgotado aguardando dados do Ollama.".to_string())?
            }
        };

        match next {
            Some(Ok(bytes)) => {
                total_bytes = total_bytes.saturating_add(bytes.len());
                if total_bytes > MAX_STREAM_BYTES {
                    return Err("Resposta do Ollama excede o limite permitido.".to_string());
                }
                buffer.extend_from_slice(&bytes);
                while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
                    let mut line = buffer.drain(..=position).collect::<Vec<_>>();
                    line.pop();
                    if emit_line(on_chunk, &line)? {
                        return Ok(());
                    }
                }
                if buffer.len() > MAX_STREAM_LINE_BYTES {
                    return Err("Ollama enviou uma linha maior que o limite permitido.".to_string());
                }
            }
            Some(Err(error)) => return Err(error.to_string()),
            None => break,
        }
    }

    if !buffer.is_empty() && emit_line(on_chunk, &buffer)? {
        return Ok(());
    }
    Err("A conexao com o Ollama terminou antes do marcador final.".to_string())
}

async fn perform_chat_stream(
    body: String,
    candidates: Vec<String>,
    on_chunk: Channel<OllamaStreamChunk>,
    cancel_rx: &mut watch::Receiver<bool>,
    idle_timeout: Duration,
) -> Result<(), String> {
    let client = AsyncClient::builder()
        .connect_timeout(Duration::from_secs(4))
        .build()
        .map_err(|error| error.to_string())?;
    let mut last_error = "Ollama indisponivel.".to_string();

    for candidate in candidates {
        if *cancel_rx.borrow() {
            return Err("Solicitacao ao Ollama cancelada.".to_string());
        }
        let response = match client
            .post(format!("{candidate}/api/chat"))
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body.clone())
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = error.to_string();
                continue;
            }
        };
        if !response.status().is_success() {
            last_error = format!("Ollama retornou HTTP {}.", response.status());
            continue;
        }
        return read_stream(response, &on_chunk, cancel_rx, idle_timeout).await;
    }
    Err(last_error)
}

#[tauri::command]
pub async fn cancel_ollama_chat(request_id: String) -> bool {
    let sender = { cancellations().lock().await.get(&request_id).cloned() };
    sender.map(|entry| entry.send(true).is_ok()).unwrap_or(false)
}

#[tauri::command]
pub async fn ollama_chat_stream(
    request_id: String,
    body: String,
    base_url: Option<String>,
    idle_timeout_ms: Option<u64>,
    request_timeout_ms: Option<u64>,
    on_chunk: Channel<OllamaStreamChunk>,
) -> Result<(), String> {
    validate_request_id(&request_id)?;
    validate_chat_body(&body)?;
    let candidates = normalize_base_urls(base_url)?;
    let idle_timeout = Duration::from_millis(idle_timeout_ms.unwrap_or(60_000).clamp(1_000, 300_000));
    let request_timeout = Duration::from_millis(request_timeout_ms.unwrap_or(180_000).clamp(5_000, 900_000));
    let (cancel_tx, mut cancel_rx) = watch::channel(false);
    {
        let mut active = cancellations().lock().await;
        if active.contains_key(&request_id) {
            return Err("Ja existe uma solicitacao Ollama com esse identificador.".to_string());
        }
        active.insert(request_id.clone(), cancel_tx);
    }

    let timed_result = tokio::time::timeout(
        request_timeout,
        perform_chat_stream(body, candidates, on_chunk, &mut cancel_rx, idle_timeout),
    )
    .await;

    cancellations().lock().await.remove(&request_id);
    match timed_result {
        Ok(result) => result,
        Err(_) => Err("A resposta do Ollama excedeu o tempo maximo.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_local_http_base_urls() {
        assert_eq!(validate_local_base_url("http://127.0.0.1:11434/").unwrap(), DEFAULT_BASE_URL);
        assert!(validate_local_base_url("https://127.0.0.1:11434").is_err());
        assert!(validate_local_base_url("http://example.com:11434").is_err());
        assert!(validate_local_base_url("http://localhost:11434/api").is_err());
        assert!(validate_local_base_url("http://user@localhost:11434").is_err());
    }

    #[test]
    fn validates_model_names() {
        assert!(validate_model_name("qwen3:4b").is_ok());
        assert!(validate_model_name("../bad model").is_err());
    }

    #[test]
    fn parses_done_flag_from_json() {
        assert!(parse_done_line(r#"{"done":true}"#).unwrap());
        assert!(!parse_done_line(r#"{"done":false}"#).unwrap());
        assert!(parse_done_line("not-json").is_err());
    }
}
