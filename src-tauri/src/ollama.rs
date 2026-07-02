use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::ipc::Channel;

const DEFAULT_BASE_URL: &str = "http://127.0.0.1:11434";
const FALLBACK_BASE_URL: &str = "http://localhost:11434";

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
pub struct OllamaStreamChunk {
    pub line: String,
    pub done: bool,
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(90))
        .connect_timeout(Duration::from_secs(4))
        .build()
        .map_err(|error| error.to_string())
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
    let client = match http_client() {
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
pub fn ollama_chat_stream(
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
