use serde::{Deserialize, Serialize};
use log::{info, error, warn};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, RunEvent, Size, WindowEvent,
};

const STATE_FILE_NAME: &str = "dashboard-state.json";
const CORRUPT_FILE_NAME: &str = "dashboard-state.corrupt.json";
const MAIN_WINDOW_LABEL: &str = "main";
const STATE_VERSION: u8 = 5;

#[derive(Default)]
struct RuntimeState {
    quitting: AtomicBool,
    dialog_open: AtomicBool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardState {
    version: u8,
    #[serde(default)]
    tasks_by_date: BTreeMap<String, Vec<Task>>,
    #[serde(default)]
    calendar_events: Vec<CalendarEvent>,
    #[serde(default)]
    rates_cache: Option<RatesCache>,
    #[serde(default)]
    rates_baseline: Option<RatesBaseline>,
    #[serde(default)]
    ui: UiState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Task {
    id: String,
    text: String,
    completed: bool,
    priority: String,
    pinned: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarEvent {
    id: String,
    title: String,
    date_key: String,
    #[serde(default)]
    start_time: Option<String>,
    #[serde(default)]
    end_time: Option<String>,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    color: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RatesCache {
    usd: f64,
    eur: f64,
    #[serde(default)]
    usd_var_bid: Option<f64>,
    #[serde(default)]
    usd_pct_change: Option<f64>,
    #[serde(default)]
    eur_var_bid: Option<f64>,
    #[serde(default)]
    eur_pct_change: Option<f64>,
    updated_at: String,
    fetched_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RatesBaseline {
    day_key: String,
    usd: f64,
    eur: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UiState {
    last_viewed_base_date: String,
    view_offset_days: i32,
    #[serde(default)]
    calendar_month: Option<String>,
    #[serde(default)]
    preferred_monitor: Option<usize>,
    #[serde(default)]
    files_last_path: Option<String>,
    #[serde(default)]
    theme: Option<String>,
    #[serde(default)]
    locale: Option<String>,
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

impl Default for DashboardState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            tasks_by_date: BTreeMap::new(),
            calendar_events: Vec::new(),
            rates_cache: None,
            rates_baseline: None,
            ui: UiState::default(),
        }
    }
}

impl Default for UiState {
    fn default() -> Self {
        Self {
            last_viewed_base_date: String::new(),
            view_offset_days: 0,
            calendar_month: None,
            preferred_monitor: None,
            files_last_path: None,
            theme: None,
            locale: None,
        }
    }
}

impl DashboardState {
    fn migrate(mut self) -> Self {
        while self.version < STATE_VERSION {
            match self.version {
                0 | 1 => {
                    if self.ui.calendar_month.is_none() && self.ui.last_viewed_base_date.len() >= 7 {
                        self.ui.calendar_month =
                            Some(self.ui.last_viewed_base_date[..7].to_string());
                    }
                }
                2 | 3 | 4 => {
                    if self.ui.preferred_monitor.is_none() {
                        self.ui.preferred_monitor = None;
                    }
                }
                _ => {}
            }
            self.version += 1;
        }
        if self.version > STATE_VERSION {
            self.version = STATE_VERSION;
        }
        self
    }
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

#[tauri::command]
fn search_project_dirs(query: String, limit: Option<usize>) -> Result<Vec<ProjectDirEntry>, String> {
    let limit = limit.unwrap_or(24).clamp(1, 48);
    let query = query.trim().to_lowercase();
    let mut results = Vec::new();
    let mut seen = HashSet::new();

    for root in project_search_roots() {
        if !root.is_dir() {
            continue;
        }

        let entries = match fs::read_dir(&root) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
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
        let mut builder = app_handle
            .dialog()
            .file()
            .set_title("Escolher repositório");

        if let Some(path) = default_path {
            builder = builder.set_directory(path);
        }

        builder.blocking_pick_folder()
    })
    .await;

    end_folder_dialog(&window, &app, &state);

    let picked = picked.map_err(|error| error.to_string())?;
    Ok(picked.map(|path| path.to_string()))
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<DashboardState, String> {
    let path = state_file_path(&app)?;
    info!("Loading state from {}", path.display());
    ensure_state_file(&path)?;
    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;

    match serde_json::from_str::<DashboardState>(&raw) {
        Ok(state) => {
            let original_version = state.version;
            let migrated = state.migrate();
            if migrated.version != original_version {
                info!("State migrated from v{} to v{}", original_version, migrated.version);
                write_state_file(&path, &migrated)?;
            }
            if let Ok(corrupt_path) = corrupt_file_path(&app) {
                if corrupt_path.exists() {
                    info!("Removing stale corrupt state file");
                    let _ = fs::remove_file(corrupt_path);
                }
            }
            Ok(migrated)
        }
        Err(err) => {
            warn!("State corruption detected: {}. Restoring defaults.", err);
            let _ = fs::write(corrupt_file_path(&app)?, raw);
            let default_state = DashboardState::default();
            write_state_file(&path, &default_state)?;
            Ok(default_state)
        }
    }
}

#[tauri::command]
fn save_state(app: AppHandle, state: DashboardState) -> Result<(), String> {
    write_state_file(&state_file_path(&app)?, &state)
}

#[tauri::command]
fn get_app_data_path(app: AppHandle) -> Result<String, String> {
    Ok(app_data_directory(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn get_launch_on_startup(app: AppHandle) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch().is_enabled().map_err(|error| error.to_string())
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
    let monitors = window.available_monitors().map_err(|error| error.to_string())?;
    let primary_monitor = window.primary_monitor().map_err(|error| error.to_string())?;
    
    let mut monitor_list = Vec::new();
    
    for (index, monitor) in monitors.iter().enumerate() {
        let work_area = monitor.work_area();
        let is_primary = primary_monitor.as_ref()
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
    let monitors = window.available_monitors().map_err(|error| error.to_string())?;
    let primary_monitor = window.primary_monitor().map_err(|error| error.to_string())?;
    let current_monitor = window.current_monitor().map_err(|error| error.to_string())?;
    
    if let Some((index, monitor)) = monitors.iter().enumerate().find(|(_, m)| {
        current_monitor.as_ref().map(|cm| cm.position() == m.position()).unwrap_or(false)
    }) {
        let work_area = monitor.work_area();
        let is_primary = primary_monitor.as_ref()
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
        Err("Could not determine current monitor".to_string())
    }
}

#[tauri::command]
fn move_to_monitor(window: tauri::WebviewWindow, monitor_index: usize) -> Result<(), String> {
    let monitors = window.available_monitors().map_err(|error| error.to_string())?;
    
    if let Some(monitor) = monitors.get(monitor_index) {
        let work_area = monitor.work_area();
        let position = work_area.position;
        let size = work_area.size;

        let _ = window.set_fullscreen(false);
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(position.x, position.y)));
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

fn app_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_directory(app)?.join(STATE_FILE_NAME))
}

fn corrupt_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_directory(app)?.join(CORRUPT_FILE_NAME))
}

fn ensure_state_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    write_state_file(path, &DashboardState::default())
}

fn write_state_file(path: &Path, state: &DashboardState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let payload = serde_json::to_vec_pretty(state).map_err(|error| {
        error!("Failed to serialize state: {}", error);
        error.to_string()
    })?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, payload).map_err(|error| {
        error!("Failed to write temp state file: {}", error);
        error.to_string()
    })?;

    if path.exists() {
        fs::remove_file(path).map_err(|error| {
            error!("Failed to remove old state file: {}", error);
            let _ = fs::remove_file(&temp_path);
            error.to_string()
        })?;
    }

    fs::rename(&temp_path, path).map_err(|error| {
        error!("Failed to rename state file atomically: {}", error);
        let _ = fs::remove_file(&temp_path);
        format!("Failed to write state file atomically: {}", error)
    })
}

fn validate_directory_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    if path.contains('\0') {
        return Err("Path contains invalid characters".to_string());
    }

    let dir = PathBuf::from(path);
    if !dir.is_absolute() {
        return Err("Path must be absolute".to_string());
    }
    if !dir.is_dir() {
        return Err(format!("{} is not a directory", path));
    }

    Ok(dir)
}

fn validate_file_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    if path.contains('\0') {
        return Err("Path contains invalid characters".to_string());
    }

    let file = PathBuf::from(path);
    if !file.is_absolute() {
        return Err("Path must be absolute".to_string());
    }
    if !file.exists() {
        return Err(format!("{} does not exist", path));
    }

    Ok(file)
}

#[tauri::command]
fn read_directory(path: String, include_hidden: Option<bool>) -> Result<Vec<FileEntry>, String> {
    let dir = validate_directory_path(&path)?;
    let show_hidden = include_hidden.unwrap_or(false);

    let mut entries = Vec::new();

    let read = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in read.flatten() {
        let file_path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_at = metadata
            .and_then(|m| m.modified().ok())
            .and_then(|t| {
                let datetime: chrono::DateTime<chrono::Local> = t.into();
                Some(datetime.format("%d/%m/%Y %H:%M").to_string())
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

fn move_window_to_target_monitor(window: &tauri::WebviewWindow, app: &AppHandle) -> tauri::Result<()> {
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
                let _ = window.set_position(Position::Physical(PhysicalPosition::new(position.x, position.y)));
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
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(position.x, position.y)));
    let _ = window.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)));
    let _ = window.set_always_on_bottom(true);

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = move_window_to_target_monitor(&window, app);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
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
                app.state::<RuntimeState>()
                    .quitting
                    .store(true, Ordering::SeqCst);
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
                show_main_window(&tray.app_handle());
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
    info!("Starting Focus Dashboard...");

    let app = tauri::Builder::default()
        .manage(RuntimeState::default())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&'static str>>,
        ))
        .setup(|app| {
            build_tray(app.handle())?;

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = move_window_to_target_monitor(&window, app.handle());
                let _ = window.show();
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
            read_directory,
            open_file,
            get_desktop_path
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        RunEvent::WindowEvent { label, event, .. } if label == MAIN_WINDOW_LABEL => match event {
            WindowEvent::CloseRequested { api, .. } => {
                let state = app.state::<RuntimeState>();
                if state.dialog_open.load(Ordering::SeqCst) {
                    api.prevent_close();
                    return;
                }
                if !state.quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    hide_main_window(app);
                }
            }
            _ => {}
        },
        _ => {}
    });
}
