use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::{
    env,
    path::PathBuf,
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::ipc::Channel;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const DEFAULT_BASE_URL: &str = "http://127.0.0.1:11434";
const FALLBACK_BASE_URL: &str = "http://localhost:11434";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const STARTUP_HEALTH_TIMEOUT: Duration = Duration::from_secs(10);
const STARTUP_HEALTH_INTERVAL: Duration = Duration::from_millis(500);

static START_LOCK: Mutex<()> = Mutex::new(());

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

fn http_client_with_timeout(timeout: Duration) -> Result<Client, String> {
    Client::builder()
        .timeout(timeout)
        .connect_timeout(Duration::from_secs(4))
        .build()
        .map_err(|error| error.to_string())
}

fn http_client() -> Result<Client, String> {
    http_client_with_timeout(Duration::from_secs(90))
}

fn health_client() -> Result<Client, String> {
    http_client_with_timeout(Duration::from_secs(5))
}

fn normalize_base_url(base_url: Option<String>) -> Vec<String> {
    let mut urls = Vec::new();
    if let Some(custom) = base_url {
        let trimmed = custom.trim().trim_end_matches('/').to_string();
        if !trimmed.is_empty() {
            urls.push(trimmed);
        }
    }
    for candidate in [DEFAULT_BASE_URL, FALLBACK_BASE_URL] {
        if !urls.iter().any(|url| url == candidate) {
            urls.push(candidate.to_string());
        }
    }
    urls
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
        {
            command.creation_flags(CREATE_NO_WINDOW);
        }

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
        {
            command.creation_flags(CREATE_NO_WINDOW);
        }

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

    // O app chama este fluxo no boot e a UI tambem oferece um botao manual.
    // O lock evita que duas chamadas simultaneas disparem dois `ollama serve`.
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
            message: "Nao foi possivel iniciar o Ollama automaticamente.".to_string(),
            base_url: None,
            error: Some(error),
        };
    }

    let health = wait_for_ollama_health(base_url, STARTUP_HEALTH_TIMEOUT);
    OllamaStartResult {
        online: health.online,
        started: true,
        message: if health.online {
            "Assistente iniciado.".to_string()
        } else {
            "O processo foi chamado, mas o servico ainda nao respondeu.".to_string()
        },
        base_url: health.base_url,
        error: health.error,
    }
}

fn parse_models(payload: &str) -> Vec<OllamaModelInfo> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else {
        return Vec::new();
    };
    let Some(models) = value.get("models").and_then(|entry| entry.as_array()) else {
        return Vec::new();
    };

    models
        .iter()
        .filter_map(|model| {
            model
                .get("name")
                .and_then(|name| name.as_str())
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(|name| OllamaModelInfo {
                    name: name.to_string(),
                })
        })
        .collect()
}

fn probe_health(client: &Client, base_url: &str) -> Result<Vec<OllamaModelInfo>, String> {
    let url = format!("{base_url}/api/tags");
    let response = client
        .get(url)
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
    let client = match health_client() {
        Ok(client) => client,
        Err(error) => {
            return OllamaHealth {
                online: false,
                models: Vec::new(),
                error: Some(error),
                base_url: None,
            };
        }
    };

    let mut last_error = String::from("Ollama indisponivel.");
    for candidate in normalize_base_url(base_url) {
        match probe_health(&client, &candidate) {
            Ok(models) => {
                return OllamaHealth {
                    online: true,
                    models,
                    error: None,
                    base_url: Some(candidate),
                };
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

#[tauri::command]
pub fn start_ollama_service(base_url: Option<String>) -> OllamaStartResult {
    ensure_ollama_started(base_url)
}

#[tauri::command]
pub fn install_ollama_model(model: String, base_url: Option<String>) -> OllamaModelInstallResult {
    let model = match validate_model_name(&model) {
        Ok(model) => model,
        Err(error) => {
            return OllamaModelInstallResult {
                installed: false,
                model,
                message: "Modelo invalido.".to_string(),
                base_url: None,
                error: Some(error),
            };
        }
    };

    let start = ensure_ollama_started(base_url.clone());
    if !start.online {
        return OllamaModelInstallResult {
            installed: false,
            model,
            message: "Ollama nao esta online para instalar o modelo.".to_string(),
            base_url: start.base_url,
            error: start.error.or(Some(start.message)),
        };
    }

    let health = check_ollama_health(base_url.clone());
    if health.online && has_model(&health.models, &model) {
        return OllamaModelInstallResult {
            installed: true,
            model,
            message: "Modelo ja estava instalado.".to_string(),
            base_url: health.base_url,
            error: None,
        };
    }

    let _guard = START_LOCK.lock().unwrap_or_else(|error| error.into_inner());

    if let Err(error) = run_ollama_pull(&model) {
        return OllamaModelInstallResult {
            installed: false,
            model,
            message: "Nao foi possivel instalar o modelo do assistente.".to_string(),
            base_url: health.base_url,
            error: Some(error),
        };
    }

    let health = check_ollama_health(base_url);
    let installed = health.online && has_model(&health.models, &model);
    OllamaModelInstallResult {
        installed,
        model,
        message: if installed {
            "Modelo do assistente instalado.".to_string()
        } else {
            "O pull terminou, mas o modelo nao apareceu na lista local.".to_string()
        },
        base_url: health.base_url,
        error: if installed { None } else { health.error },
    }
}

fn ollama_chat_stream_blocking(
    body: String,
    base_url: Option<String>,
    on_chunk: Channel<OllamaStreamChunk>,
) -> Result<(), String> {
    let client = http_client()?;
    let mut last_error = String::from("Ollama indisponivel.");
    let urls = normalize_base_url(base_url);

    for candidate in urls {
        let url = format!("{candidate}/api/chat");
        let response = match client
            .post(url)
            .header("content-type", "application/json")
            .body(body.clone())
            .send()
        {
            Ok(response) => response,
            Err(error) => {
                last_error = error.to_string();
                continue;
            }
        };

        if !response.status().is_success() {
            last_error = format!("HTTP {}", response.status());
            continue;
        }

        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(response);
        for line in reader.lines() {
            let line = line.map_err(|error| error.to_string())?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let done = trimmed.contains("\"done\":true") || trimmed.contains("\"done\": true");
            on_chunk
                .send(OllamaStreamChunk {
                    line: trimmed.to_string(),
                    done,
                })
                .map_err(|error| error.to_string())?;
            if done {
                return Ok(());
            }
        }
        return Ok(());
    }

    Err(last_error)
}

#[tauri::command]
pub async fn ollama_chat_stream(
    body: String,
    base_url: Option<String>,
    on_chunk: Channel<OllamaStreamChunk>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || ollama_chat_stream_blocking(body, base_url, on_chunk))
        .await
        .map_err(|error| error.to_string())?
}
