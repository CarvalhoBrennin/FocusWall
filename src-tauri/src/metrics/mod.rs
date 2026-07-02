mod visible;
mod wmi;

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, Mutex};
use std::thread;
use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};

pub use wmi::read_temperatures_cached;

static SYS: LazyLock<Mutex<System>> = LazyLock::new(|| Mutex::new(System::new()));
static HARDWARE_CACHE: LazyLock<Mutex<Option<HardwareInfo>>> = LazyLock::new(|| Mutex::new(None));

const CPU_SAMPLE_MS: u64 = 200;
const MIN_AGGREGATED_MEMORY_BYTES: u64 = 20 * 1024 * 1024;
const MIN_BACKGROUND_SEED_BYTES: u64 = 10 * 1024 * 1024;
const DEFAULT_TOP_APPS: u32 = 15;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetrics {
    pub cpu_percent: f32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub memory_percent: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub cpu_name: String,
    pub total_memory_mb: u64,
    pub os_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemperatureInfo {
    pub cpu_celsius: Option<f32>,
    pub gpu_celsius: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppProcessRow {
    pub name: String,
    pub exe: String,
    pub pid: u32,
    pub instance_count: u32,
    pub cpu_percent: f32,
    pub memory_mb: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub metrics: SystemMetrics,
    pub hardware: HardwareInfo,
    pub temperature: TemperatureInfo,
    pub apps: Vec<AppProcessRow>,
}

struct AggregatedApp {
    name: String,
    exe: String,
    pid: u32,
    instance_count: u32,
    cpu_percent: f32,
    memory_bytes: u64,
    peak_memory_bytes: u64,
}

fn process_denied(name: &str) -> bool {
    let key = name.trim().to_ascii_lowercase();
    let base = key.strip_suffix(".exe").unwrap_or(&key);
    matches!(
        base,
        "system"
            | "registry"
            | "idle"
            | "svchost"
            | "runtimebroker"
            | "dllhost"
            | "wmiprvse"
            | "csrss"
            | "lsass"
            | "services"
            | "smss"
            | "wininit"
            | "winlogon"
            | "fontdrvhost"
            | "dwm"
            | "conhost"
            | "sihost"
            | "taskhostw"
            | "searchindexer"
            | "spoolsv"
            | "audiodg"
            |         "memory compression"
            | "memcompression"
            | "system idle process"
            | "focus-desktop-dashboard"
            | "focus dashboard"
    )
}

fn is_system_path(process: &sysinfo::Process) -> bool {
    process
        .exe()
        .map(|path| {
            let lower = path.to_string_lossy().to_ascii_lowercase();
            lower.contains("\\windows\\system32\\")
                || lower.contains("\\windows\\syswow64\\")
                || lower.contains("\\windows\\winsxs\\")
                || lower.contains("\\windows\\servicing\\")
        })
        .unwrap_or(false)
}

fn exe_key(process: &sysinfo::Process) -> String {
    if let Some(path) = process.exe() {
        path.file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_else(|| process.name().to_string_lossy().to_ascii_lowercase())
    } else {
        process.name().to_string_lossy().to_ascii_lowercase()
    }
}

fn read_hardware(sys: &System) -> HardwareInfo {
    if let Ok(guard) = HARDWARE_CACHE.lock() {
        if let Some(info) = guard.as_ref() {
            return info.clone();
        }
    }

    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "CPU".to_string());

    let total_memory_mb = bytes_to_mb(sys.total_memory()).round() as u64;
    let os_name = {
        let name = System::name()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let version = System::os_version()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        match (name, version) {
            (Some(n), Some(v)) => format!("{n} {v}"),
            (Some(n), None) => n,
            (None, Some(v)) => v,
            (None, None) => std::env::consts::OS.to_string(),
        }
    };

    let info = HardwareInfo {
        cpu_name,
        total_memory_mb,
        os_name,
    };

    if let Ok(mut guard) = HARDWARE_CACHE.lock() {
        *guard = Some(info.clone());
    }

    info
}

fn bytes_to_mb(bytes: u64) -> f64 {
    (bytes as f64) / (1024.0 * 1024.0)
}

fn metrics_from_sys(sys: &System) -> SystemMetrics {
    let cpu_percent = sys.global_cpu_usage().clamp(0.0, 100.0);
    let total = sys.total_memory();
    let used = sys.used_memory();
    let memory_total_mb = bytes_to_mb(total).round() as u64;
    let memory_used_mb = bytes_to_mb(used).round() as u64;
    let memory_percent = if total > 0 {
        ((used as f64 / total as f64) * 100.0) as f32
    } else {
        0.0
    };

    SystemMetrics {
        cpu_percent,
        memory_used_mb,
        memory_total_mb,
        memory_percent: memory_percent.clamp(0.0, 100.0),
    }
}

fn friendly_app_title(exe: &str, process_name: &str) -> String {
    let trimmed = process_name.trim();
    let base = exe.strip_suffix(".exe").unwrap_or(exe).to_ascii_lowercase();
    let mapped = match base.as_str() {
        "brave" => "Brave Browser",
        "chrome" => "Google Chrome",
        "msedge" => "Microsoft Edge",
        "firefox" => "Firefox",
        "cursor" => "Cursor",
        "code" => "Visual Studio Code",
        "devenv" => "Visual Studio",
        "explorer" => "Windows Explorer",
        "taskmgr" => "Gerenciador de Tarefas",
        "snippingtool" => "Ferramenta de Captura",
        "steam" | "steamwebhelper" => "Steam",
        "node" => "Node.js JavaScript Runtime",
        "msmpeng" => "Antimalware Service Executable",
        "searchhost" => "Pesquisar",
        "applicationframehost" => "Application Frame Host",
        "webview2" | "msedgewebview2" => "Gerenciador WebView2",
        "focus-desktop-dashboard" => "FocusWall",
        _ => "",
    };
    if !mapped.is_empty() {
        return mapped.to_string();
    }
    if !trimmed.is_empty() && !trimmed.eq_ignore_ascii_case(exe) {
        return trimmed.to_string();
    }
    let base = exe.strip_suffix(".exe").unwrap_or(exe);
    if base.is_empty() {
        return "App".to_string();
    }
    let mut chars = base.chars();
    match chars.next() {
        None => "App".to_string(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

/// Descobre executáveis "ativos" (janela visível ou app de usuário em segundo plano).
fn seed_active_exe_keys(sys: &System, visible: &HashSet<u32>) -> HashSet<String> {
    let mut keys = HashSet::new();

    if visible.is_empty() {
        return keys;
    }

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy();
        if process_denied(&name) || is_system_path(process) {
            continue;
        }

        let key = exe_key(process);
        if key.is_empty() {
            continue;
        }

        let pid_u32 = pid.as_u32();
        let has_window = visible.contains(&pid_u32);
        let user_background = process.memory() >= MIN_BACKGROUND_SEED_BYTES;

        if has_window || user_background {
            keys.insert(key);
        }
    }

    keys
}

fn collect_apps(sys: &System, top_apps: u32, broad_fallback: bool) -> Vec<AppProcessRow> {
    let num_cpus = sys.cpus().len().max(1) as f32;
    let visible = visible::visible_window_pids();
    let active_exe_keys = seed_active_exe_keys(sys, &visible);
    let use_exe_filter = !broad_fallback && !active_exe_keys.is_empty();

    let mut grouped: HashMap<String, AggregatedApp> = HashMap::new();

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_string();
        if process_denied(&name) {
            continue;
        }

        let key = exe_key(process);
        if key.is_empty() {
            continue;
        }

        if use_exe_filter && !active_exe_keys.contains(&key) {
            continue;
        }

        if !use_exe_filter && is_system_path(process) {
            continue;
        }

        let pid_u32 = pid.as_u32();
        let memory_bytes = process.memory();
        let exe = if key.ends_with(".exe") {
            key.clone()
        } else {
            format!("{key}.exe")
        };

        let cpu = process.cpu_usage().max(0.0);
        let entry = grouped.entry(key).or_insert(AggregatedApp {
            name: friendly_app_title(&exe, &name),
            exe: exe.clone(),
            pid: pid_u32,
            instance_count: 0,
            cpu_percent: 0.0,
            memory_bytes: 0,
            peak_memory_bytes: 0,
        });

        entry.instance_count += 1;
        entry.cpu_percent += cpu;
        entry.memory_bytes += memory_bytes;
        if memory_bytes >= entry.peak_memory_bytes {
            entry.peak_memory_bytes = memory_bytes;
            entry.pid = pid_u32;
            entry.name = friendly_app_title(&exe, &name);
        }
    }

    let mut apps: Vec<AppProcessRow> = grouped
        .into_values()
        .filter(|a| a.memory_bytes >= MIN_AGGREGATED_MEMORY_BYTES)
        .map(|a| {
            let memory_mb = bytes_to_mb(a.memory_bytes);
            let cpu_percent = (a.cpu_percent / num_cpus).clamp(0.0, 100.0);
            AppProcessRow {
                name: a.name,
                exe: a.exe,
                pid: a.pid,
                instance_count: a.instance_count,
                cpu_percent,
                memory_mb: (memory_mb * 10.0).round() / 10.0,
            }
        })
        .collect();

    apps.sort_by(|a, b| {
        b.memory_mb
            .partial_cmp(&a.memory_mb)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                b.cpu_percent
                    .partial_cmp(&a.cpu_percent)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    apps.truncate(top_apps as usize);
    apps
}

fn collect_apps_with_fallback(sys: &System, top_apps: u32) -> Vec<AppProcessRow> {
    let apps = collect_apps(sys, top_apps, false);
    if apps.is_empty() {
        collect_apps(sys, top_apps, true)
    } else {
        apps
    }
}

pub fn build_system_snapshot(top_apps: Option<u32>) -> Result<SystemSnapshot, String> {
    let limit = top_apps.unwrap_or(DEFAULT_TOP_APPS).clamp(1, 50);
    let temperature = read_temperatures_cached();

    let mut sys = SYS
        .lock()
        .map_err(|_| "Estado de métricas indisponível.".to_string())?;

    sys.refresh_memory();
    let hardware = read_hardware(&sys);

    // CPU global e por processo exigem duas amostras com intervalo (delta temporal).
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.refresh_cpu_usage();
    drop(sys);
    thread::sleep(Duration::from_millis(CPU_SAMPLE_MS));
    let mut sys = SYS
        .lock()
        .map_err(|_| "Estado de métricas indisponível.".to_string())?;
    sys.refresh_processes(ProcessesToUpdate::All, false);
    sys.refresh_cpu_usage();
    let metrics = metrics_from_sys(&sys);
    let apps = collect_apps_with_fallback(&sys, limit);

    Ok(SystemSnapshot {
        metrics,
        hardware,
        temperature,
        apps,
    })
}

#[tauri::command]
pub async fn get_system_snapshot(top_apps: Option<u32>) -> Result<SystemSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || build_system_snapshot(top_apps))
        .await
        .map_err(|e| format!("Falha ao coletar métricas: {e}"))?
}
