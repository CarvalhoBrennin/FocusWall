use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, AtomicU8, Ordering},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, RunEvent, Size, WindowEvent,
};

const STATE_FILE_NAME: &str = "dashboard-state.json";
const CORRUPT_FILE_NAME: &str = "dashboard-state.corrupt.json";
const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Default)]
struct RuntimeState {
    quitting: AtomicBool,
    close_to_tray: AtomicBool,
    auto_hide_on_blur: AtomicBool,
    window_layer: AtomicU8, // 0=bottom, 1=normal, 2=top
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardState {
    version: u8,
    #[serde(default)]
    tasks_by_date: BTreeMap<String, Vec<Task>>,
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
    preferred_monitor: Option<usize>,
    #[serde(default)]
    preferences: UiPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UiPreferences {
    #[serde(default)]
    window: WindowPreferences,
    #[serde(default)]
    panel: PanelPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowPreferences {
    #[serde(default = "default_window_layer")]
    layer: String,
    #[serde(default = "default_true")]
    close_to_tray: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PanelPreferences {
    #[serde(default)]
    auto_hide_on_blur: bool,
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
            version: 4,
            tasks_by_date: BTreeMap::new(),
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
            preferred_monitor: None,
            preferences: UiPreferences::default(),
        }
    }
}

impl Default for UiPreferences {
    fn default() -> Self {
        Self {
            window: WindowPreferences::default(),
            panel: PanelPreferences::default(),
        }
    }
}

impl Default for WindowPreferences {
    fn default() -> Self {
        Self {
            layer: default_window_layer(),
            close_to_tray: true,
        }
    }
}

impl Default for PanelPreferences {
    fn default() -> Self {
        Self {
            auto_hide_on_blur: false,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_window_layer() -> String {
    "bottom".to_string()
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<DashboardState, String> {
    let path = state_file_path(&app)?;
    ensure_state_file(&path)?;
    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;

    match serde_json::from_str::<DashboardState>(&raw) {
        Ok(state) => Ok(state),
        Err(_) => {
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
        Ok(false)
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
        Ok(false)
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
        Ok(false)
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
        apply_window_layer(&window, "bottom");
        
        Ok(())
    } else {
        Err(format!("Monitor index {} not found", monitor_index))
    }
}

fn apply_window_layer(window: &tauri::WebviewWindow, layer: &str) {
    match layer {
        "top" => {
            let _ = window.set_always_on_bottom(false);
            let _ = window.set_always_on_top(true);
        }
        "normal" => {
            let _ = window.set_always_on_bottom(false);
            let _ = window.set_always_on_top(false);
        }
        _ => {
            let _ = window.set_always_on_top(false);
            let _ = window.set_always_on_bottom(true);
        }
    }
}

#[tauri::command]
fn set_window_layer(
    app: AppHandle,
    window: tauri::WebviewWindow,
    layer: String,
) -> Result<bool, String> {
    apply_window_layer(&window, &layer);
    let mut state = load_state(app)?;
    state.ui.preferences.window.layer = layer.clone();
    save_state(window.app_handle(), state)?;
    Ok(layer == "top" || layer == "normal" || layer == "bottom")
}

#[tauri::command]
fn set_close_to_tray(app: AppHandle, enabled: bool) -> Result<bool, String> {
    app.state::<RuntimeState>()
        .close_to_tray
        .store(enabled, Ordering::Relaxed);
    let mut state = load_state(app.clone())?;
    state.ui.preferences.window.close_to_tray = enabled;
    save_state(app, state)?;
    Ok(enabled)
}

#[tauri::command]
fn set_auto_hide_on_blur(app: AppHandle, enabled: bool) -> Result<bool, String> {
    app.state::<RuntimeState>()
        .auto_hide_on_blur
        .store(enabled, Ordering::Relaxed);
    let mut state = load_state(app.clone())?;
    state.ui.preferences.panel.auto_hide_on_blur = enabled;
    save_state(app, state)?;
    Ok(enabled)
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

    let payload = serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, payload).map_err(|error| error.to_string())?;

    if path.exists() {
        match fs::remove_file(path) {
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }

    match fs::rename(&temp_path, path) {
        Ok(_) => Ok(()),
        Err(_) => {
            let bytes = fs::read(&temp_path).map_err(|error| error.to_string())?;
            fs::write(path, bytes).map_err(|error| error.to_string())?;
            fs::remove_file(temp_path).map_err(|error| error.to_string())?;
            Ok(())
        }
    }
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
                apply_window_layer(window, &state.ui.preferences.window.layer);
                return Ok(());
            }
        }
    }

    // Fallback to original logic
    let primary = window.primary_monitor()?;
    let target = if let Some(primary_monitor) = primary {
        monitors
            .into_iter()
            .find(|monitor| monitor.position() != primary_monitor.position())
            .unwrap_or(primary_monitor)
    } else {
        monitors.into_iter().next().unwrap()
    };

    let work_area = target.work_area();
    let position = work_area.position;
    let size = work_area.size;

    let _ = window.set_fullscreen(false);
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(position.x, position.y)));
    let _ = window.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)));
    apply_window_layer(window, "bottom");

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
                    .store(true, Ordering::Relaxed);
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
    let app = tauri::Builder::default()
        .manage(RuntimeState::default())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&'static str>>,
        ))
        .setup(|app| {
            build_tray(app.handle())?;
            if let Ok(state) = load_state(app.handle().clone()) {
                app.state::<RuntimeState>()
                    .close_to_tray
                    .store(state.ui.preferences.window.close_to_tray, Ordering::Relaxed);
                app.state::<RuntimeState>()
                    .auto_hide_on_blur
                    .store(state.ui.preferences.panel.auto_hide_on_blur, Ordering::Relaxed);
                let layer = match state.ui.preferences.window.layer.as_str() {
                    "top" => 2,
                    "normal" => 1,
                    _ => 0,
                };
                app.state::<RuntimeState>()
                    .window_layer
                    .store(layer, Ordering::Relaxed);
            }

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
            set_window_layer,
            set_close_to_tray,
            set_auto_hide_on_blur
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        RunEvent::WindowEvent { label, event, .. } if label == MAIN_WINDOW_LABEL => match event {
            WindowEvent::CloseRequested { api, .. } => {
                let runtime = app.state::<RuntimeState>();
                if !runtime.quitting.load(Ordering::Relaxed)
                    && runtime.close_to_tray.load(Ordering::Relaxed)
                {
                    api.prevent_close();
                    hide_main_window(app);
                }
            }
            WindowEvent::Focused(false) => {
                if app
                    .state::<RuntimeState>()
                    .auto_hide_on_blur
                    .load(Ordering::Relaxed)
                {
                    hide_main_window(app);
                }
            }
            _ => {}
        },
        _ => {}
    });
}
