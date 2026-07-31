mod dashboard_state;
mod media;
mod metrics;
mod ollama;
mod radar;

use dashboard_state::{get_app_data_path, load_state, save_state};

use log::{info, warn};
use reqwest::blocking::Client;
use serde::Serialize;
use serde_json::{json, Value};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::HashSet,
    fs,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, RunEvent, Size, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
struct RuntimeState {
    quitting: AtomicBool,
    dialog_open: AtomicBool,
    opencode_starting: AtomicBool,
    opencode_server: Mutex<Option<OpencodeServerState>>,
    opencode_client: Mutex<Option<Client>>,
}

struct OpencodeStartingGuard<'a> {
    state: &'a RuntimeState,
}

impl Drop for OpencodeStartingGuard<'_> {
    fn drop(&mut self) {
        self.state.opencode_starting.store(false, Ordering::SeqCst);
    }
}

struct OpencodeServerState {
    cwd: String,
    base_url: String,
    password: String,
    child: Child,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    index: usize,
    name: String,
    width: u32,
    height: u32,
    is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectDirEntry {
    name: String,
    path: String,
    is_git: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size_bytes: u64,
    modified_at: String,
    extension: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WellKnownFolder {
    id: String,
    label: String,
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeCommand {
    program: String,
    args: Vec<String>,
    resolved_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpencodeServerInfo {
    base_url: String,
    cwd: String,
    version: String,
}

fn project_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    let mut push_root = |path: PathBuf| {
        if path.is_dir() && seen.insert(path.clone()) {
            roots.push(path);
        }
    };

    if let Ok(home) = std::env::var("USERPROFILE") {
        let home = PathBuf::from(&home);
        for segment in [
            "Projects",
            "projects",
            "Desktop",
            "Documents",
            "source",
            "repos",
            "dev",
            "code",
        ] {
            push_root(home.join(segment));
        }

        if let Ok(one_drive) = std::env::var("OneDrive") {
            let one_drive = PathBuf::from(one_drive);
            for segment in [
                "Projects",
                "projects",
                "Desktop",
                "Documentos",
                "Documents",
                "Área de Trabalho",
            ] {
                push_root(one_drive.join(segment));
            }

            push_root(one_drive.join("Área de Trabalho").join("Projects"));
        }
    }

    roots
}

#[tauri::command(async)]
fn search_project_dirs(
    query: String,
    limit: Option<usize>,
) -> Result<Vec<ProjectDirEntry>, String> {
    let limit = limit.unwrap_or(24).clamp(1, 48);
    let query = query.trim().to_lowercase();
    let mut results = Vec::new();
    let mut seen = HashSet::new();
    let max_scan = 500usize;

    for root in project_search_roots() {
        if !root.is_dir() {
            continue;
        }

        let mut entries: Vec<_> = match fs::read_dir(&root) {
            Ok(entries) => entries.flatten().collect(),
            Err(_) => continue,
        };
        entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());

        let mut scanned = 0usize;
        for entry in entries {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            scanned += 1;
            if scanned > max_scan {
                break;
            }

            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }

            let path_str = path.to_string_lossy().into_owned();
            if !seen.insert(path_str.clone()) {
                continue;
            }

            if !query.is_empty() {
                let haystack = format!("{} {}", name.to_lowercase(), path_str.to_lowercase());
                if !haystack.contains(&query) {
                    continue;
                }
            }

            let is_git = path.join(".git").exists();
            results.push(ProjectDirEntry {
                name,
                path: path_str,
                is_git,
            });
        }

        if results.len() >= limit.saturating_mul(2) {
            break;
        }
    }

    results.sort_by(|left, right| {
        right
            .is_git
            .cmp(&left.is_git)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    results.truncate(limit);
    Ok(results)
}

#[tauri::command(async)]
fn resolve_opencode_command() -> Result<OpencodeCommand, String> {
    let executable = find_opencode_executable()?;
    let path_str = executable.to_string_lossy().into_owned();
    Ok(OpencodeCommand {
        program: path_str.clone(),
        args: vec![],
        resolved_path: path_str,
    })
}

#[tauri::command(async)]
fn validate_project_directory(path: String) -> Result<String, String> {
    let canonical = validate_directory_path(&path)?;
    Ok(windows_process_path(&canonical))
}

#[tauri::command(async)]
fn start_opencode_server(
    path: String,
    state: tauri::State<'_, RuntimeState>,
) -> Result<OpencodeServerInfo, String> {
    if state
        .opencode_starting
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Outro arranque do OpenCode ja esta em andamento.".to_string());
    }
    let _starting_guard = OpencodeStartingGuard {
        state: state.inner(),
    };

    let cwd = validate_project_directory(path)?;
    let client = opencode_http_client(&state)?;

    {
        let mut guard = state
            .opencode_server
            .lock()
            .map_err(|_| "Falha ao acessar estado do OpenCode.".to_string())?;

        if let Some(server) = guard.as_mut() {
            if server.cwd == cwd
                && server
                    .child
                    .try_wait()
                    .map_err(|e| e.to_string())?
                    .is_none()
            {
                if let Ok(version) = opencode_health(&client, &server.base_url, &server.password) {
                    return Ok(OpencodeServerInfo {
                        base_url: server.base_url.clone(),
                        cwd,
                        version,
                    });
                }
            }
        }

        stop_opencode_server_locked(&mut guard);
    }

    let (port, port_guard) = reserve_local_port()?;
    let base_url = format!("http://127.0.0.1:{}", port);
    let password = generate_opencode_password()?;
    let executable = find_opencode_executable()?;
    let serve_args = vec![
        "serve".to_string(),
        "--hostname".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
    ];
    let mut command = opencode_command(&executable, &serve_args);
    let child = command
        .current_dir(&cwd)
        .env("PATH", enriched_opencode_path())
        .env("OPENCODE_SERVER_USERNAME", "focuswall")
        .env("OPENCODE_SERVER_PASSWORD", &password)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Falha ao iniciar servidor OpenCode: {}", error))?;
    // Libera a porta reservada logo após o spawn para o processo filho fazer bind.
    drop(port_guard);

    // Registra o filho antes do health-check para que stop/quit nao deixem processo orfao.
    {
        let mut guard = state
            .opencode_server
            .lock()
            .map_err(|_| "Falha ao acessar estado do OpenCode.".to_string())?;
        *guard = Some(OpencodeServerState {
            cwd: cwd.clone(),
            base_url: base_url.clone(),
            password: password.clone(),
            child,
        });
    }

    let mut version = String::new();
    let mut ready = false;
    for _ in 0..40 {
        {
            let mut guard = state
                .opencode_server
                .lock()
                .map_err(|_| "Falha ao acessar estado do OpenCode.".to_string())?;
            let Some(server) = guard.as_mut() else {
                return Err("Servidor OpenCode foi interrompido durante o arranque.".to_string());
            };
            if server
                .child
                .try_wait()
                .map_err(|e| e.to_string())?
                .is_some()
            {
                break;
            }
        }
        for health_attempt in 0..3 {
            match opencode_health(&client, &base_url, &password) {
                Ok(health_version) => {
                    version = health_version;
                    ready = true;
                    break;
                }
                Err(_) if health_attempt < 2 => {
                    thread::sleep(Duration::from_millis(80));
                }
                Err(_) => {}
            }
        }
        if ready {
            break;
        }
        thread::sleep(Duration::from_millis(250));
    }

    if !ready {
        let mut diag = String::new();
        let mut guard = state
            .opencode_server
            .lock()
            .map_err(|_| "Falha ao acessar estado do OpenCode.".to_string())?;
        if let Some(mut server) = guard.take() {
            let exited = server
                .child
                .try_wait()
                .map(|status| status.is_some())
                .unwrap_or(false);
            if exited {
                if let Ok(output) = server.child.wait_with_output() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    if !stderr.is_empty() {
                        diag = format!(" — stderr: {}", stderr.trim());
                    }
                }
            } else {
                cleanup_opencode_child(&mut server.child);
            }
        }
        return Err(format!(
            "Servidor OpenCode nao respondeu ao health-check.{}",
            diag
        ));
    }

    Ok(OpencodeServerInfo {
        base_url,
        cwd,
        version,
    })
}

#[tauri::command(async)]
fn stop_opencode_server(state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let mut guard = state
        .opencode_server
        .lock()
        .map_err(|_| "Falha ao acessar estado do OpenCode.".to_string())?;
    stop_opencode_server_locked(&mut guard);
    Ok(())
}

#[tauri::command(async)]
fn list_opencode_sessions(
    path: String,
    state: tauri::State<'_, RuntimeState>,
) -> Result<Value, String> {
    let directory = validate_project_directory(path)?;
    opencode_get(state, "/session", &[("directory", directory)])
}

#[tauri::command(async)]
fn create_opencode_session(
    path: String,
    title: Option<String>,
    state: tauri::State<'_, RuntimeState>,
) -> Result<Value, String> {
    let directory = validate_project_directory(path)?;
    let body = match title.filter(|value| !value.trim().is_empty()) {
        Some(title) => json!({ "title": title }),
        None => json!({}),
    };
    opencode_post_json_once(state, "/session", &[("directory", directory)], &body)
}

#[tauri::command(async)]
fn get_opencode_messages(
    session_id: String,
    state: tauri::State<'_, RuntimeState>,
) -> Result<Value, String> {
    let session_id = validate_opencode_path_segment(&session_id)?;
    opencode_get(state, &format!("/session/{}/message", session_id), &[])
}

#[tauri::command(async)]
fn send_opencode_prompt(
    session_id: String,
    text: String,
    state: tauri::State<'_, RuntimeState>,
) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Prompt nao pode ficar vazio.".to_string());
    }
    let session_id = validate_opencode_path_segment(&session_id)?;

    let body = json!({
        "parts": [
            {
                "type": "text",
                "text": text
            }
        ]
    });

    opencode_post_no_content_once(
        state,
        &format!("/session/{}/prompt_async", session_id),
        &[],
        &body,
    )
}

#[tauri::command(async)]
fn abort_opencode_session(
    session_id: String,
    state: tauri::State<'_, RuntimeState>,
) -> Result<Value, String> {
    let session_id = validate_opencode_path_segment(&session_id)?;
    opencode_post_json(
        state,
        &format!("/session/{}/abort", session_id),
        &[],
        &json!({}),
    )
}

#[tauri::command(async)]
fn get_opencode_session_status(state: tauri::State<'_, RuntimeState>) -> Result<Value, String> {
    opencode_get(state, "/session/status", &[])
}

#[tauri::command(async)]
fn get_opencode_diff(
    session_id: String,
    message_id: Option<String>,
    state: tauri::State<'_, RuntimeState>,
) -> Result<Value, String> {
    let session_id = validate_opencode_path_segment(&session_id)?;
    let mut query = Vec::new();
    if let Some(message_id) = message_id.filter(|value| !value.trim().is_empty()) {
        let message_id = validate_opencode_path_segment(&message_id)?;
        query.push(("messageID", message_id));
    }
    opencode_get(state, &format!("/session/{}/diff", session_id), &query)
}

#[tauri::command(async)]
fn get_opencode_file_status(
    path: String,
    state: tauri::State<'_, RuntimeState>,
) -> Result<Value, String> {
    let directory = validate_project_directory(path)?;
    opencode_get(state, "/file/status", &[("directory", directory)])
}

fn reserve_local_port() -> Result<(u16, TcpListener), String> {
    let mut last_err = String::new();
    for _ in 0..5 {
        match TcpListener::bind("127.0.0.1:0") {
            Ok(listener) => {
                let port = listener
                    .local_addr()
                    .map(|addr| addr.port())
                    .map_err(|e| e.to_string())?;
                return Ok((port, listener));
            }
            Err(err) => {
                last_err = err.to_string();
                thread::sleep(Duration::from_millis(50));
            }
        }
    }
    Err(format!("Falha ao reservar porta local: {}", last_err))
}

fn random_hex(bytes_len: usize) -> Result<String, String> {
    let mut bytes = vec![0u8; bytes_len];
    getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
    Ok(bytes.iter().map(|byte| format!("{:02x}", byte)).collect())
}

fn generate_opencode_password() -> Result<String, String> {
    random_hex(32)
}

fn validate_opencode_path_segment(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Identificador de sessao vazio.".to_string());
    }
    if trimmed.len() > 160
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err("Identificador de sessao invalido.".to_string());
    }
    Ok(trimmed.to_string())
}

fn opencode_command(executable: &Path, args: &[String]) -> Command {
    let extension = executable
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    if matches!(extension.as_deref(), Some("exe")) {
        let mut command = Command::new(executable);
        command.args(args);
        hide_windows_console(&mut command);
        return command;
    }

    let mut shell_line = format!("\"{}\"", windows_process_path(executable));
    for arg in args {
        shell_line.push(' ');
        shell_line.push_str(&quote_cmd_arg(arg));
    }

    let mut command = Command::new("cmd.exe");
    command.args(["/d", "/s", "/c", &shell_line]);
    hide_windows_console(&mut command);
    command
}

fn hide_windows_console(command: &mut Command) {
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

fn quote_cmd_arg(value: &str) -> String {
    if !value.is_empty()
        && value.chars().all(|ch| {
            ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':' | '/' | '\\')
        })
    {
        return value.to_string();
    }

    format!("\"{}\"", value.replace('"', "\\\""))
}

fn opencode_http_client(state: &RuntimeState) -> Result<Client, String> {
    let mut guard = state
        .opencode_client
        .lock()
        .map_err(|_| "Falha ao acessar estado do OpenCode.".to_string())?;

    if let Some(client) = guard.as_ref() {
        return Ok(client.clone());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(4)
        .build()
        .map_err(|e| e.to_string())?;

    *guard = Some(client.clone());
    Ok(client)
}

fn opencode_health(client: &Client, base_url: &str, password: &str) -> Result<String, String> {
    let health: Value = client
        .get(format!("{}/global/health", base_url))
        .basic_auth("focuswall", Some(password))
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    Ok(health
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string())
}

fn cleanup_opencode_child(child: &mut Child) {
    if child.try_wait().ok().flatten().is_none() {
        if let Err(err) = child.kill() {
            warn!("Failed to kill OpenCode process: {}", err);
        }
    }
    match child.wait() {
        Ok(_) => {}
        Err(err) => warn!("Failed to wait on OpenCode process: {}", err),
    }
}

fn stop_opencode_server_locked(server: &mut Option<OpencodeServerState>) {
    if let Some(mut current) = server.take() {
        cleanup_opencode_child(&mut current.child);
    }
}

fn active_opencode_server(state: &RuntimeState) -> Result<(String, String), String> {
    let stale_server = {
        let mut guard = state
            .opencode_server
            .lock()
            .map_err(|_| "Falha ao acessar estado do OpenCode.".to_string())?;

        let Some(server) = guard.as_mut() else {
            return Err("Servidor OpenCode nao esta ativo.".to_string());
        };

        match server.child.try_wait() {
            Ok(None) => {
                return Ok((server.base_url.clone(), server.password.clone()));
            }
            Ok(Some(_)) => {}
            Err(err) => return Err(err.to_string()),
        }

        guard.take()
    };

    if let Some(mut server) = stale_server {
        cleanup_opencode_child(&mut server.child);
    }

    Err("Servidor OpenCode nao esta ativo.".to_string())
}

fn opencode_get(
    state: tauri::State<'_, RuntimeState>,
    path: &str,
    query: &[(&str, String)],
) -> Result<Value, String> {
    let (base_url, password) = active_opencode_server(&state)?;
    let client = opencode_http_client(&state)?;
    opencode_get_with_retry(&client, &base_url, &password, path, query)
}

fn opencode_get_with_retry(
    client: &Client,
    base_url: &str,
    password: &str,
    path: &str,
    query: &[(&str, String)],
) -> Result<Value, String> {
    let mut last_err = String::new();
    for attempt in 0..3 {
        match client
            .get(format!("{}{}", base_url, path))
            .basic_auth("focuswall", Some(password))
            .query(query)
            .send()
        {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    let value: Value = response.json().map_err(|e| e.to_string())?;
                    if let Some(err_msg) = value.get("error").and_then(Value::as_str) {
                        return Err(format!("OpenCode retornou erro: {}", err_msg));
                    }
                    return Ok(value);
                }

                let body = response.text().unwrap_or_default();
                let message = if body.trim().is_empty() {
                    format!("OpenCode retornou HTTP {}", status)
                } else {
                    format!("OpenCode retornou HTTP {}: {}", status, body.trim())
                };
                if attempt < 2 && status.is_server_error() {
                    last_err = message;
                    thread::sleep(Duration::from_millis(300 * (attempt + 1) as u64));
                    continue;
                }
                return Err(message);
            }
            Err(err) => {
                if attempt < 2 {
                    last_err = err.to_string();
                    thread::sleep(Duration::from_millis(300 * (attempt + 1) as u64));
                    continue;
                }
                return Err(err.to_string());
            }
        }
    }
    Err(last_err)
}

fn opencode_post_json(
    state: tauri::State<'_, RuntimeState>,
    path: &str,
    query: &[(&str, String)],
    body: &Value,
) -> Result<Value, String> {
    opencode_post_with_retry(state, path, query, body, |resp| {
        let value: Value = resp.json().map_err(|e| e.to_string())?;
        if let Some(err_msg) = value.get("error").and_then(Value::as_str) {
            return Err(format!("OpenCode retornou erro: {}", err_msg));
        }
        Ok(value)
    })
}

fn opencode_post_json_once(
    state: tauri::State<'_, RuntimeState>,
    path: &str,
    query: &[(&str, String)],
    body: &Value,
) -> Result<Value, String> {
    let (base_url, password) = active_opencode_server(&state)?;
    let client = opencode_http_client(&state)?;
    let response = client
        .post(format!("{}{}", base_url, path))
        .basic_auth("focuswall", Some(&password))
        .query(query)
        .json(body)
        .send()
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if status.is_success() {
        let value: Value = response.json().map_err(|error| error.to_string())?;
        if let Some(err_msg) = value.get("error").and_then(Value::as_str) {
            return Err(format!("OpenCode retornou erro: {}", err_msg));
        }
        return Ok(value);
    }
    let body = response.text().unwrap_or_default();
    if body.trim().is_empty() {
        Err(format!("OpenCode retornou HTTP {}", status))
    } else {
        Err(format!(
            "OpenCode retornou HTTP {}: {}",
            status,
            body.trim()
        ))
    }
}

fn opencode_post_no_content_once(
    state: tauri::State<'_, RuntimeState>,
    path: &str,
    query: &[(&str, String)],
    body: &Value,
) -> Result<(), String> {
    let (base_url, password) = active_opencode_server(&state)?;
    let client = opencode_http_client(&state)?;
    let response = client
        .post(format!("{}{}", base_url, path))
        .basic_auth("focuswall", Some(&password))
        .query(query)
        .json(body)
        .send()
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if status.is_success() {
        let body = response.text().unwrap_or_default();
        if body.trim().is_empty() {
            return Ok(());
        }
        if let Ok(value) = serde_json::from_str::<Value>(&body) {
            if let Some(err_msg) = value.get("error").and_then(Value::as_str) {
                return Err(format!("OpenCode retornou erro: {}", err_msg));
            }
        }
        return Ok(());
    }
    let body = response.text().unwrap_or_default();
    if body.trim().is_empty() {
        Err(format!("OpenCode retornou HTTP {}", status))
    } else {
        Err(format!(
            "OpenCode retornou HTTP {}: {}",
            status,
            body.trim()
        ))
    }
}

fn opencode_post_with_retry<T>(
    state: tauri::State<'_, RuntimeState>,
    path: &str,
    query: &[(&str, String)],
    body: &Value,
    on_success: fn(reqwest::blocking::Response) -> Result<T, String>,
) -> Result<T, String> {
    let (base_url, password) = active_opencode_server(&state)?;
    let client = opencode_http_client(&state)?;
    let mut last_err = String::new();
    for attempt in 0..3 {
        match client
            .post(format!("{}{}", base_url, path))
            .basic_auth("focuswall", Some(&password))
            .query(query)
            .json(body)
            .send()
        {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    return on_success(response);
                }

                let body = response.text().unwrap_or_default();
                let message = if body.trim().is_empty() {
                    format!("OpenCode retornou HTTP {}", status)
                } else {
                    format!("OpenCode retornou HTTP {}: {}", status, body.trim())
                };
                if attempt < 2 && status.is_server_error() {
                    last_err = message;
                    thread::sleep(Duration::from_millis(400 * (attempt + 1) as u64));
                    continue;
                }
                return Err(message);
            }
            Err(err) => {
                if attempt < 2 {
                    last_err = err.to_string();
                    thread::sleep(Duration::from_millis(400 * (attempt + 1) as u64));
                    continue;
                }
                return Err(err.to_string());
            }
        }
    }
    Err(last_err)
}

fn enriched_opencode_path() -> String {
    let mut path_segments: Vec<String> = Vec::new();

    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        path_segments.push(format!("{}\\AppData\\Roaming\\npm", userprofile));
    }
    if let Ok(programfiles) = std::env::var("ProgramFiles") {
        path_segments.push(format!("{}\\nodejs", programfiles));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        path_segments.push(format!("{}\\npm", appdata));
    }
    if let Ok(current_path) = std::env::var("PATH") {
        path_segments.push(current_path);
    }

    path_segments.join(";")
}

fn command_rank(path: &Path) -> u8 {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("exe") => 0,
        Some("cmd") | Some("bat") => 1,
        Some(_) => 2,
        None => 3,
    }
}

fn find_opencode_executable() -> Result<PathBuf, String> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let npm_modules = PathBuf::from(&appdata).join("npm").join("node_modules");
        let direct_candidates = [
            npm_modules
                .join("opencode-ai")
                .join("bin")
                .join("opencode.exe"),
            npm_modules
                .join("opencode-ai")
                .join("node_modules")
                .join("opencode-windows-x64")
                .join("bin")
                .join("opencode.exe"),
            npm_modules
                .join("opencode-ai")
                .join("node_modules")
                .join("opencode-windows-x64-baseline")
                .join("bin")
                .join("opencode.exe"),
        ];

        for candidate in direct_candidates {
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    let mut where_command = std::process::Command::new("cmd.exe");
    where_command
        .args(["/d", "/s", "/c", "where", "opencode"])
        .env("PATH", enriched_opencode_path());
    hide_windows_console(&mut where_command);
    let where_result = where_command.output();

    if let Ok(output) = where_result {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(best_match) = stdout
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .min_by_key(|line| command_rank(&PathBuf::from(line)))
            {
                return Ok(PathBuf::from(best_match));
            }
        }
    }

    if let Ok(appdata) = std::env::var("APPDATA") {
        for name in ["opencode.exe", "opencode.cmd", "opencode"] {
            let candidate = PathBuf::from(&appdata).join("npm").join(name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    Err(
        "OpenCode nao encontrado. Instale com: npm i -g opencode-ai ou configure o PATH."
            .to_string(),
    )
}

fn windows_process_path(path: &Path) -> String {
    let path = path.to_string_lossy();

    #[cfg(windows)]
    {
        if let Some(stripped) = path.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{}", stripped);
        }
        if let Some(stripped) = path.strip_prefix(r"\\?\") {
            return stripped.to_string();
        }
    }

    path.into_owned()
}

fn begin_folder_dialog(window: &tauri::WebviewWindow, state: &RuntimeState) {
    state.dialog_open.store(true, Ordering::SeqCst);
    let _ = window.set_always_on_bottom(false);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn end_folder_dialog(window: &tauri::WebviewWindow, app: &AppHandle, state: &RuntimeState) {
    state.dialog_open.store(false, Ordering::SeqCst);
    let _ = move_window_to_target_monitor(window, app);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

#[tauri::command]
async fn pick_project_directory(
    app: AppHandle,
    window: tauri::WebviewWindow,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let state = app.state::<RuntimeState>();
    begin_folder_dialog(&window, &state);

    let default_path = default_path.and_then(|path| {
        let candidate = PathBuf::from(&path);
        candidate.is_dir().then_some(path)
    });

    let app_handle = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app_handle.dialog().file().set_title("Escolher repositório");

        if let Some(path) = default_path {
            builder = builder.set_directory(path);
        }

        builder.blocking_pick_folder()
    })
    .await;

    end_folder_dialog(&window, &app, &state);

    let picked = picked.map_err(|error| error.to_string())?;
    Ok(match picked {
        Some(path) => {
            let canonical = validate_directory_path(&path.to_string())?;
            Some(windows_process_path(&canonical))
        }
        None => None,
    })
}

#[tauri::command]
fn get_launch_on_startup(app: AppHandle) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch()
            .is_enabled()
            .map_err(|error| error.to_string())
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        Err("Autostart is only available on desktop platforms".to_string())
    }
}

#[tauri::command]
fn set_launch_on_startup(app: AppHandle, enabled: bool) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let manager = app.autolaunch();
        if enabled {
            manager.enable().map_err(|error| error.to_string())?;
        } else {
            manager.disable().map_err(|error| error.to_string())?;
        }
        manager.is_enabled().map_err(|error| error.to_string())
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, enabled);
        Err("Autostart is only available on desktop platforms".to_string())
    }
}

#[tauri::command]
fn sync_launch_on_startup(app: AppHandle) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let manager = app.autolaunch();
        let enabled = manager.is_enabled().map_err(|error| error.to_string())?;
        if enabled {
            manager.disable().map_err(|error| error.to_string())?;
            manager.enable().map_err(|error| error.to_string())?;
        }
        manager.is_enabled().map_err(|error| error.to_string())
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        Err("Autostart is only available on desktop platforms".to_string())
    }
}

#[tauri::command]
fn get_available_monitors(window: tauri::WebviewWindow) -> Result<Vec<MonitorInfo>, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let primary_monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?;

    let mut monitor_list = Vec::new();

    for (index, monitor) in monitors.iter().enumerate() {
        let work_area = monitor.work_area();
        let is_primary = primary_monitor
            .as_ref()
            .map(|pm| pm.position() == monitor.position())
            .unwrap_or(false);

        monitor_list.push(MonitorInfo {
            index,
            name: format!("Monitor {}", index + 1),
            width: work_area.size.width,
            height: work_area.size.height,
            is_primary,
        });
    }

    Ok(monitor_list)
}

#[tauri::command]
fn get_current_monitor(window: tauri::WebviewWindow) -> Result<MonitorInfo, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let primary_monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?;
    let current_monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?;

    if let Some((index, monitor)) = monitors.iter().enumerate().find(|(_, m)| {
        current_monitor
            .as_ref()
            .map(|cm| cm.position() == m.position())
            .unwrap_or(false)
    }) {
        let work_area = monitor.work_area();
        let is_primary = primary_monitor
            .as_ref()
            .map(|pm| pm.position() == monitor.position())
            .unwrap_or(false);

        Ok(MonitorInfo {
            index,
            name: format!("Monitor {}", index + 1),
            width: work_area.size.width,
            height: work_area.size.height,
            is_primary,
        })
    } else {
        Err("Nao foi possivel determinar o monitor atual.".to_string())
    }
}

#[tauri::command]
fn move_to_monitor(window: tauri::WebviewWindow, monitor_index: usize) -> Result<(), String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;

    if let Some(monitor) = monitors.get(monitor_index) {
        let work_area = monitor.work_area();
        let position = work_area.position;
        let size = work_area.size;

        let _ = window.set_fullscreen(false);
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(
            position.x, position.y,
        )));
        let _ = window.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)));
        let _ = window.set_always_on_bottom(true);

        Ok(())
    } else {
        Err(format!("Monitor index {} not found", monitor_index))
    }
}

#[tauri::command]
fn save_monitor_preference(app: AppHandle, monitor_index: usize) -> Result<(), String> {
    let mut state = load_state(app.clone())?;
    state.ui.preferred_monitor = Some(monitor_index);
    save_state(app, state)
}

#[cfg(windows)]
fn normalize_windows_path_input(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if trimmed.len() == 2 {
        let bytes = trimmed.as_bytes();
        if bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
            return PathBuf::from(format!("{}\\", trimmed));
        }
    }
    PathBuf::from(trimmed)
}

#[cfg(not(windows))]
fn normalize_windows_path_input(path: &str) -> PathBuf {
    PathBuf::from(path.trim())
}

fn resolve_absolute_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("Caminho nao pode ficar vazio.".to_string());
    }
    if path.contains('\0') {
        return Err("Caminho contem caracteres invalidos.".to_string());
    }

    let mut candidate = normalize_windows_path_input(path);
    if !candidate.is_absolute() {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        candidate = cwd.join(candidate);
    }

    std::fs::canonicalize(&candidate).map_err(|e| {
        format!(
            "Nao foi possivel resolver o caminho \"{}\": {}",
            path.trim(),
            e
        )
    })
}

fn validate_directory_path(path: &str) -> Result<PathBuf, String> {
    let canonical = resolve_absolute_path(path)?;
    if !canonical.is_dir() {
        return Err(format!("{} nao e um diretorio.", path.trim()));
    }

    Ok(canonical)
}

fn validate_file_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("Caminho nao pode ficar vazio.".to_string());
    }
    if path.contains('\0') {
        return Err("Caminho contem caracteres invalidos.".to_string());
    }

    let mut candidate = normalize_windows_path_input(path);
    if !candidate.is_absolute() {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        candidate = cwd.join(candidate);
    }

    let canonical = std::fs::canonicalize(&candidate).map_err(|e| {
        format!(
            "Nao foi possivel resolver o caminho \"{}\": {}",
            path.trim(),
            e
        )
    })?;

    if !canonical.exists() {
        return Err(format!("{} nao existe.", path.trim()));
    }

    Ok(canonical)
}

#[tauri::command]
fn read_directory(path: String, include_hidden: Option<bool>) -> Result<Vec<FileEntry>, String> {
    let dir = validate_directory_path(&path)?;
    let show_hidden = include_hidden.unwrap_or(false);

    let mut entries = Vec::new();

    let read = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let file_path = {
            let raw = entry.path();
            if raw.is_absolute() {
                raw
            } else {
                dir.join(&name)
            }
        };

        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_at = metadata
            .and_then(|m| m.modified().ok())
            .map(|t| {
                let datetime: chrono::DateTime<chrono::Local> = t.into();
                datetime.format("%d/%m/%Y %H:%M").to_string()
            })
            .unwrap_or_default();

        let extension = if is_dir {
            String::new()
        } else {
            file_path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };

        entries.push(FileEntry {
            name,
            path: file_path.to_string_lossy().into_owned(),
            is_dir,
            size_bytes,
            modified_at,
            extension,
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    let file = validate_file_path(&path)?;
    info!("Opening file: {}", file.display());
    if file.is_dir() {
        open::that(&file).map_err(|e| e.to_string())
    } else if file.is_file() {
        open::that(&file).map_err(|e| e.to_string())
    } else {
        warn!("Path is not a file or directory: {}", file.display());
        Err(format!("{} is not a file or directory", path))
    }
}

#[tauri::command]
fn get_desktop_path() -> Result<String, String> {
    dirs::desktop_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "Could not find desktop directory".to_string())
}

fn push_well_known_folder(
    folders: &mut Vec<WellKnownFolder>,
    seen: &mut HashSet<String>,
    id: &str,
    label: &str,
    path: Option<PathBuf>,
) {
    let Some(path) = path.filter(|candidate| candidate.is_dir()) else {
        return;
    };
    let path_str = path.to_string_lossy().into_owned();
    if seen.insert(path_str.clone()) {
        folders.push(WellKnownFolder {
            id: id.to_string(),
            label: label.to_string(),
            path: path_str,
        });
    }
}

#[tauri::command]
fn get_well_known_folders() -> Result<Vec<WellKnownFolder>, String> {
    let mut folders = Vec::new();
    let mut seen = HashSet::new();

    push_well_known_folder(
        &mut folders,
        &mut seen,
        "desktop",
        "Área de Trabalho",
        dirs::desktop_dir(),
    );
    push_well_known_folder(
        &mut folders,
        &mut seen,
        "documents",
        "Documentos",
        dirs::document_dir(),
    );
    push_well_known_folder(
        &mut folders,
        &mut seen,
        "downloads",
        "Downloads",
        dirs::download_dir(),
    );
    push_well_known_folder(
        &mut folders,
        &mut seen,
        "pictures",
        "Imagens",
        dirs::picture_dir(),
    );
    push_well_known_folder(
        &mut folders,
        &mut seen,
        "music",
        "Música",
        dirs::audio_dir(),
    );
    push_well_known_folder(
        &mut folders,
        &mut seen,
        "videos",
        "Vídeos",
        dirs::video_dir(),
    );

    if let Some(home) = dirs::home_dir() {
        push_well_known_folder(
            &mut folders,
            &mut seen,
            "home",
            "Usuário",
            Some(home.clone()),
        );

        for (id, label, segment) in [
            ("projects", "Projetos", "Projects"),
            ("projects-pt", "Projetos", "projects"),
            ("dev", "Dev", "dev"),
            ("code", "Code", "code"),
        ] {
            push_well_known_folder(&mut folders, &mut seen, id, label, Some(home.join(segment)));
        }
    }

    if let Ok(one_drive) = std::env::var("OneDrive") {
        let one_drive = PathBuf::from(one_drive);
        for (id, label, segment) in [
            ("onedrive", "OneDrive", ""),
            ("onedrive-desktop", "OneDrive — Desktop", "Desktop"),
            ("onedrive-docs", "OneDrive — Documentos", "Documents"),
            (
                "onedrive-desktop-pt",
                "OneDrive — Área de Trabalho",
                "Área de Trabalho",
            ),
            (
                "onedrive-projects",
                "OneDrive — Projetos",
                "Área de Trabalho/Projects",
            ),
        ] {
            let path = if segment.is_empty() {
                one_drive.clone()
            } else {
                one_drive.join(segment)
            };
            push_well_known_folder(&mut folders, &mut seen, id, label, Some(path));
        }
    }

    Ok(folders)
}

fn move_window_to_target_monitor(
    window: &tauri::WebviewWindow,
    app: &AppHandle,
) -> tauri::Result<()> {
    let monitors = window.available_monitors()?;
    if monitors.is_empty() {
        return Ok(());
    }

    // Try to use saved preference first
    if let Ok(state) = load_state(app.clone()) {
        if let Some(preferred_index) = state.ui.preferred_monitor {
            if let Some(preferred_monitor) = monitors.get(preferred_index) {
                let work_area = preferred_monitor.work_area();
                let position = work_area.position;
                let size = work_area.size;

                let _ = window.set_fullscreen(false);
                let _ = window.set_position(Position::Physical(PhysicalPosition::new(
                    position.x, position.y,
                )));
                let _ = window.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)));
                let _ = window.set_always_on_bottom(true);
                return Ok(());
            }
        }
    }

    // Fallback to original logic
    let primary = window.primary_monitor()?;
    let target = if let Some(ref primary_monitor) = primary {
        monitors
            .iter()
            .find(|monitor| monitor.position() != primary_monitor.position())
            .or_else(|| monitors.first())
    } else {
        monitors.first()
    };

    let Some(target) = target else {
        return Ok(());
    };

    let work_area = target.work_area();
    let position = work_area.position;
    let size = work_area.size;

    let _ = window.set_fullscreen(false);
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(
        position.x, position.y,
    )));
    let _ = window.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)));
    let _ = window.set_always_on_bottom(true);

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = move_window_to_target_monitor(&window, app);
        let _ = window.set_skip_taskbar(false);
        let _ = window.set_always_on_bottom(false);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.set_skip_taskbar(true);
        let _ = window.hide();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Mostrar painel", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Ocultar", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_main_window(app),
            "quit" => {
                let state = app.state::<RuntimeState>();
                state.quitting.store(true, Ordering::SeqCst);
                if let Ok(mut guard) = state.opencode_server.lock() {
                    stop_opencode_server_locked(&mut guard);
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    let _ = builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::try_init();
    info!("Starting FocusWall...");

    let app = tauri::Builder::default()
        .manage(RuntimeState::default())
        .manage(radar::RadarRuntime::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&'static str>>,
        ))
        .setup(|app| {
            build_tray(app.handle())?;

            show_main_window(app.handle());

            media::start_media_events(app.handle().clone());

            if let Err(error) = thread::Builder::new()
                .name("ollama-autostart".into())
                .spawn(|| {
                    let result = ollama::ensure_ollama_started(None);
                    if result.online {
                        info!("Ollama ready for FocusWall assistant.");
                    } else if let Some(error) = result.error {
                        warn!("Ollama autostart failed: {error}");
                    }
                })
            {
                warn!("Could not spawn Ollama autostart thread: {error}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            get_app_data_path,
            get_launch_on_startup,
            set_launch_on_startup,
            sync_launch_on_startup,
            get_available_monitors,
            get_current_monitor,
            move_to_monitor,
            save_monitor_preference,
            search_project_dirs,
            pick_project_directory,
            resolve_opencode_command,
            validate_project_directory,
            start_opencode_server,
            stop_opencode_server,
            list_opencode_sessions,
            create_opencode_session,
            get_opencode_messages,
            send_opencode_prompt,
            abort_opencode_session,
            get_opencode_session_status,
            get_opencode_diff,
            get_opencode_file_status,
            read_directory,
            open_file,
            get_desktop_path,
            get_well_known_folders,
            metrics::get_system_snapshot,
            metrics::cancel_system_snapshot,
            media::get_media_snapshot,
            media::get_media_artwork,
            media::media_toggle_playback,
            media::media_skip_next,
            media::media_skip_previous,
            ollama::check_ollama_health,
            ollama::start_ollama_service,
            ollama::install_ollama_model,
            ollama::ollama_chat_stream,
            ollama::cancel_ollama_chat,
            radar::load_radar_snapshot,
            radar::refresh_radar_snapshot,
            radar::search_radar_locations,
            radar::get_radar_article_preview,
            radar::open_radar_article,
            radar::open_radar_attribution,
            radar::clear_radar_cache
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } if label == MAIN_WINDOW_LABEL => {
            let state = app.state::<RuntimeState>();
            if state.dialog_open.load(Ordering::SeqCst) {
                api.prevent_close();
                return;
            }
            if !state.quitting.load(Ordering::SeqCst) {
                api.prevent_close();
                hide_main_window(app);
            } else if let Ok(mut guard) = state.opencode_server.lock() {
                stop_opencode_server_locked(&mut guard);
            }
        }
        RunEvent::Exit => {
            let state = app.state::<RuntimeState>();
            if let Ok(mut guard) = state.opencode_server.lock() {
                stop_opencode_server_locked(&mut guard);
            };
        }
        _ => {}
    });
}
