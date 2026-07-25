mod wmi;

use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::{Disks, Networks, ProcessesToUpdate, System};

static REQUESTS: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static PENDING_CANCELLATIONS: LazyLock<Mutex<HashMap<String, Instant>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const SAMPLE_MS: u64 = 300;
const MAX_PROCESS_ROWS: usize = 250;
const PENDING_CANCELLATION_TTL: Duration = Duration::from_secs(10);
const MAX_PENDING_CANCELLATIONS: usize = 64;
const MAX_REQUEST_ID_LENGTH: usize = 128;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailabilityInfo {
    pub disks: bool,
    pub network: bool,
    pub gpu: bool,
    pub temperatures: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SnapshotWarning {
    DisksUnavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub usage_percent: f32,
    pub name: String,
    pub frequency_mhz: u64,
    pub physical_cores: usize,
    pub logical_cores: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub total_bytes: u64,
    pub usage_percent: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os_name: String,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemperatureInfo {
    pub cpu_celsius: Option<f32>,
    pub gpu_celsius: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub kind: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub usage_percent: f32,
    pub read_bytes_per_second: u64,
    pub write_bytes_per_second: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub adapter: String,
    pub download_bytes_per_second: u64,
    pub upload_bytes_per_second: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub usage_percent: Option<f32>,
    pub memory_total_bytes: Option<u64>,
    pub temperature_celsius: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRow {
    pub name: String,
    pub exe: String,
    pub pid: u32,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub read_bytes_per_second: u64,
    pub write_bytes_per_second: u64,
    pub is_system: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub captured_at: String,
    pub availability: AvailabilityInfo,
    pub warnings: Vec<SnapshotWarning>,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub system: SystemInfo,
    pub temperature: TemperatureInfo,
    pub disks: Vec<DiskInfo>,
    pub network: Vec<NetworkInfo>,
    pub gpus: Vec<GpuInfo>,
    pub processes: Vec<ProcessRow>,
    pub total_process_count: usize,
    pub processes_truncated: bool,
}

fn request_token(request_id: &str) -> Result<Arc<AtomicBool>, String> {
    if request_id.trim().is_empty() || request_id.len() > MAX_REQUEST_ID_LENGTH {
        return Err("Identificador da coleta inválido.".to_string());
    }
    let cancelled_before_start = take_pending_cancellation(request_id)?;
    let mut requests = REQUESTS
        .lock()
        .map_err(|_| "Controle de coleta indisponível.".to_string())?;
    let token = requests
        .entry(request_id.to_string())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .clone();
    if cancelled_before_start {
        token.store(true, Ordering::SeqCst);
    }
    Ok(token)
}

fn take_pending_cancellation(request_id: &str) -> Result<bool, String> {
    let mut pending = PENDING_CANCELLATIONS
        .lock()
        .map_err(|_| "Controle de coleta indisponível.".to_string())?;
    prune_pending_cancellations(&mut pending, Instant::now());
    Ok(pending.remove(request_id).is_some())
}

fn prune_pending_cancellations(pending: &mut HashMap<String, Instant>, now: Instant) {
    pending.retain(|_, created_at| now.duration_since(*created_at) < PENDING_CANCELLATION_TTL);
}

fn insert_pending_cancellation(pending: &mut HashMap<String, Instant>, request_id: String) {
    let now = Instant::now();
    prune_pending_cancellations(pending, now);
    if !pending.contains_key(&request_id) && pending.len() >= MAX_PENDING_CANCELLATIONS {
        if let Some(oldest_request_id) = pending
            .iter()
            .min_by_key(|(_, created_at)| *created_at)
            .map(|(request_id, _)| request_id.clone())
        {
            pending.remove(&oldest_request_id);
        }
    }
    pending.insert(request_id, now);
}

fn finish_request(request_id: &str) {
    if let Ok(mut requests) = REQUESTS.lock() {
        requests.remove(request_id);
    }
}

fn ensure_not_cancelled(cancelled: &AtomicBool) -> Result<(), String> {
    if cancelled.load(Ordering::SeqCst) {
        Err("Coleta cancelada.".to_string())
    } else {
        Ok(())
    }
}

fn os_name() -> String {
    let name = System::long_os_version()
        .or_else(System::name)
        .unwrap_or_else(|| std::env::consts::OS.to_string());
    let version = System::os_version().unwrap_or_default();
    if version.is_empty() || name.contains(&version) {
        name
    } else {
        format!("{name} {version}")
    }
}

fn cpu_name(sys: &System) -> String {
    sys.cpus()
        .first()
        .map(|cpu| cpu.brand().trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "CPU".to_string())
}

fn memory_info(sys: &System) -> MemoryInfo {
    let total_bytes = sys.total_memory();
    let available_bytes = sys.available_memory().min(total_bytes);
    let used_bytes = total_bytes.saturating_sub(available_bytes);
    let usage_percent = if total_bytes == 0 {
        0.0
    } else {
        ((used_bytes as f64 / total_bytes as f64) * 100.0) as f32
    };
    MemoryInfo {
        used_bytes,
        available_bytes,
        total_bytes,
        usage_percent: usage_percent.clamp(0.0, 100.0),
    }
}

fn is_system_path(process: &sysinfo::Process) -> bool {
    process
        .exe()
        .map(|path| {
            let lower = path.to_string_lossy().to_ascii_lowercase();
            lower.contains("\\windows\\") || lower.contains("/usr/") || lower.contains("/system/")
        })
        .unwrap_or_else(|| {
            let name = process.name().to_string_lossy().to_ascii_lowercase();
            matches!(
                name.trim_end_matches(".exe"),
                "system"
                    | "registry"
                    | "idle"
                    | "svchost"
                    | "csrss"
                    | "lsass"
                    | "services"
                    | "smss"
                    | "wininit"
                    | "winlogon"
            )
        })
}

fn friendly_process_name(process: &sysinfo::Process) -> String {
    let raw_name = process.name().to_string_lossy();
    let base = raw_name
        .trim_end_matches(".exe")
        .trim()
        .to_ascii_lowercase();
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
        "node" => "Node.js",
        "searchhost" => "Pesquisar",
        "applicationframehost" => "Application Frame Host",
        "msedgewebview2" => "WebView2",
        "focus-desktop-dashboard" => "FocusWall",
        _ => "",
    };
    if mapped.is_empty() {
        let value = raw_name.trim();
        if value.is_empty() {
            "Processo".to_string()
        } else {
            value.to_string()
        }
    } else {
        mapped.to_string()
    }
}

fn rate_per_second(bytes: u64, sample_duration: Duration) -> u64 {
    let seconds = sample_duration.as_secs_f64();
    if seconds <= f64::EPSILON {
        0
    } else {
        (bytes as f64 / seconds) as u64
    }
}

fn collect_processes(sys: &System, sample_duration: Duration) -> (Vec<ProcessRow>, usize) {
    let logical_cores = sys.cpus().len().max(1) as f32;
    let mut rows = sys
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let raw_name = process.name().to_string_lossy();
            if raw_name.trim().is_empty() {
                return None;
            }
            let disk = process.disk_usage();
            let exe = process
                .exe()
                .and_then(|path| path.file_name())
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| raw_name.to_string());
            Some(ProcessRow {
                name: friendly_process_name(process),
                exe,
                pid: pid.as_u32(),
                cpu_percent: (process.cpu_usage() / logical_cores).clamp(0.0, 100.0),
                memory_bytes: process.memory(),
                read_bytes_per_second: rate_per_second(disk.read_bytes, sample_duration),
                write_bytes_per_second: rate_per_second(disk.written_bytes, sample_duration),
                is_system: is_system_path(process),
            })
        })
        .collect::<Vec<_>>();

    rows.sort_by(|a, b| {
        b.cpu_percent
            .partial_cmp(&a.cpu_percent)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.memory_bytes.cmp(&a.memory_bytes))
    });
    limit_process_rows(rows)
}

fn limit_process_rows(mut rows: Vec<ProcessRow>) -> (Vec<ProcessRow>, usize) {
    let total_process_count = rows.len();
    rows.truncate(MAX_PROCESS_ROWS);
    (rows, total_process_count)
}

fn collect_disks(disks: &Disks, sample_duration: Duration) -> Vec<DiskInfo> {
    disks
        .iter()
        .filter(|disk| disk.total_space() > 0)
        .map(|disk| {
            let total_bytes = disk.total_space();
            let used_bytes = total_bytes.saturating_sub(disk.available_space());
            let usage = disk.usage();
            DiskInfo {
                name: disk.name().to_string_lossy().to_string(),
                mount_point: disk.mount_point().to_string_lossy().to_string(),
                file_system: disk.file_system().to_string_lossy().to_string(),
                kind: format!("{:?}", disk.kind()),
                total_bytes,
                used_bytes,
                usage_percent: ((used_bytes as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0)
                    as f32,
                read_bytes_per_second: rate_per_second(usage.read_bytes, sample_duration),
                write_bytes_per_second: rate_per_second(usage.written_bytes, sample_duration),
            }
        })
        .collect()
}

fn ignored_adapter(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("loopback")
        || lower.contains("isatap")
        || lower.contains("teredo")
        || lower.contains("bluetooth")
}

fn collect_network(networks: &Networks, sample_duration: Duration) -> Vec<NetworkInfo> {
    let mut rows = networks
        .iter()
        .filter(|(name, data)| !ignored_adapter(name) && !data.ip_networks().is_empty())
        .map(|(name, data)| NetworkInfo {
            adapter: name.clone(),
            download_bytes_per_second: rate_per_second(data.received(), sample_duration),
            upload_bytes_per_second: rate_per_second(data.transmitted(), sample_duration),
        })
        .collect::<Vec<_>>();
    rows.sort_by(|a, b| {
        (b.download_bytes_per_second + b.upload_bytes_per_second)
            .cmp(&(a.download_bytes_per_second + a.upload_bytes_per_second))
    });
    rows
}

pub fn build_system_snapshot(cancelled: &AtomicBool) -> Result<SystemSnapshot, String> {
    ensure_not_cancelled(cancelled)?;
    let mut disks = Disks::new_with_refreshed_list();
    let disk_sample_started = Instant::now();
    let mut networks = Networks::new_with_refreshed_list();
    let network_sample_started = Instant::now();

    // Keep sampling state scoped to this request. A cancelled request can then
    // never influence the rate baseline of a subsequent System-tab entry.
    let mut sys = System::new_all();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.refresh_cpu_usage();
    let process_sample_started = Instant::now();
    let cpu_label = cpu_name(&sys);
    let physical_cores = sys.physical_core_count().unwrap_or(0);
    let logical_cores = sys.cpus().len();
    ensure_not_cancelled(cancelled)?;
    thread::sleep(Duration::from_millis(SAMPLE_MS));
    ensure_not_cancelled(cancelled)?;

    disks.refresh(true);
    networks.refresh(true);

    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, false);
    sys.refresh_cpu_usage();
    ensure_not_cancelled(cancelled)?;

    let frequency_mhz = sys
        .cpus()
        .iter()
        .map(|cpu| cpu.frequency())
        .max()
        .unwrap_or(0);
    let cpu = CpuInfo {
        usage_percent: sys.global_cpu_usage().clamp(0.0, 100.0),
        name: cpu_label,
        frequency_mhz,
        physical_cores,
        logical_cores,
    };
    let memory = memory_info(&sys);
    let (processes, total_process_count) =
        collect_processes(&sys, process_sample_started.elapsed());
    ensure_not_cancelled(cancelled)?;
    let disk_rows = collect_disks(&disks, disk_sample_started.elapsed());
    let network_rows = collect_network(&networks, network_sample_started.elapsed());
    ensure_not_cancelled(cancelled)?;

    // WMI probes are optional and always start after the core snapshot is ready.
    // Each probe receives the cancellation token so that no additional WMI work
    // begins once the System tab has been closed.
    let temperature = wmi::read_temperatures(cancelled);
    ensure_not_cancelled(cancelled)?;
    let gpus = wmi::read_gpus(cancelled);
    ensure_not_cancelled(cancelled)?;

    let mut warnings = Vec::new();
    if disk_rows.is_empty() {
        warnings.push(SnapshotWarning::DisksUnavailable);
    }
    Ok(SystemSnapshot {
        captured_at: Utc::now().to_rfc3339(),
        availability: AvailabilityInfo {
            disks: !disk_rows.is_empty(),
            network: !network_rows.is_empty(),
            gpu: !gpus.is_empty(),
            temperatures: temperature.cpu_celsius.is_some() || temperature.gpu_celsius.is_some(),
        },
        warnings,
        cpu,
        memory,
        system: SystemInfo {
            os_name: os_name(),
            uptime_seconds: System::uptime(),
        },
        temperature,
        disks: disk_rows,
        network: network_rows,
        gpus,
        processes,
        total_process_count,
        processes_truncated: total_process_count > MAX_PROCESS_ROWS,
    })
}

#[tauri::command]
pub async fn get_system_snapshot(request_id: String) -> Result<SystemSnapshot, String> {
    let token = request_token(&request_id)?;
    let join_result =
        tauri::async_runtime::spawn_blocking(move || build_system_snapshot(&token)).await;
    finish_request(&request_id);
    join_result.map_err(|error| format!("Falha ao coletar métricas: {error}"))?
}

#[tauri::command]
pub fn cancel_system_snapshot(request_id: String) -> Result<(), String> {
    if request_id.trim().is_empty() || request_id.len() > MAX_REQUEST_ID_LENGTH {
        return Err("Identificador da coleta inválido.".to_string());
    }
    let requests = REQUESTS
        .lock()
        .map_err(|_| "Controle de coleta indisponível.".to_string())?;
    if let Some(token) = requests.get(&request_id) {
        token.store(true, Ordering::SeqCst);
        return Ok(());
    }
    drop(requests);

    let mut pending = PENDING_CANCELLATIONS
        .lock()
        .map_err(|_| "Controle de coleta indisponível.".to_string())?;
    insert_pending_cancellation(&mut pending, request_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelled_snapshot_stops_before_work() {
        let cancelled = AtomicBool::new(true);
        let result = build_system_snapshot(&cancelled);
        assert_eq!(result.unwrap_err(), "Coleta cancelada.");
    }

    #[test]
    fn ignored_network_adapters_are_filtered() {
        assert!(ignored_adapter("Loopback Pseudo-Interface"));
        assert!(ignored_adapter("Teredo Tunneling"));
        assert!(!ignored_adapter("Ethernet"));
    }

    #[test]
    fn cancellation_that_arrives_early_stops_the_request() {
        let request_id = "early-system-request".to_string();
        cancel_system_snapshot(request_id.clone()).unwrap();
        let requests = REQUESTS.lock().unwrap();
        assert!(!requests.contains_key(&request_id));
        drop(requests);

        let token = request_token(&request_id).unwrap();
        assert!(token.load(Ordering::SeqCst));
        finish_request(&request_id);
    }

    #[test]
    fn process_list_is_limited_without_losing_its_total() {
        let rows = (0..=MAX_PROCESS_ROWS)
            .map(|pid| ProcessRow {
                name: "Process".to_string(),
                exe: "process.exe".to_string(),
                pid: pid as u32 + 1,
                cpu_percent: 0.0,
                memory_bytes: 0,
                read_bytes_per_second: 0,
                write_bytes_per_second: 0,
                is_system: false,
            })
            .collect();

        let (limited, total) = limit_process_rows(rows);
        assert_eq!(total, MAX_PROCESS_ROWS + 1);
        assert_eq!(limited.len(), MAX_PROCESS_ROWS);
    }

    #[test]
    fn rates_use_the_measured_sample_duration() {
        assert_eq!(rate_per_second(1_024, Duration::from_millis(500)), 2_048);
        assert_eq!(rate_per_second(1_024, Duration::ZERO), 0);
    }

    #[test]
    fn pending_cancellations_have_a_fixed_capacity() {
        let mut pending = HashMap::new();
        for index in 0..=MAX_PENDING_CANCELLATIONS {
            insert_pending_cancellation(&mut pending, format!("request-{index}"));
        }
        assert_eq!(pending.len(), MAX_PENDING_CANCELLATIONS);
    }
}
