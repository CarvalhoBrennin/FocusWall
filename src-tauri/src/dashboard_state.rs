use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
};
use tauri::{AppHandle, Manager};

pub const STATE_FILE_NAME: &str = "dashboard-state.json";
pub const CORRUPT_FILE_NAME: &str = "dashboard-state.corrupt.json";
pub const STATE_VERSION: u8 = 6;

static STATE_WRITE_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardState {
    pub version: u8,
    #[serde(default)]
    pub tasks_by_date: BTreeMap<String, Vec<Task>>,
    #[serde(default)]
    pub calendar_events: Vec<CalendarEvent>,
    #[serde(default)]
    pub neural_notes: Vec<NeuralNote>,
    #[serde(default)]
    pub rates_cache: Option<RatesCache>,
    #[serde(default)]
    pub rates_baseline: Option<RatesBaseline>,
    #[serde(default)]
    pub ui: UiState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub text: String,
    pub completed: bool,
    pub priority: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub date_key: String,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeuralNote {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatesCache {
    pub usd: f64,
    pub eur: f64,
    #[serde(default)]
    pub usd_var_bid: Option<f64>,
    #[serde(default)]
    pub usd_pct_change: Option<f64>,
    #[serde(default)]
    pub eur_var_bid: Option<f64>,
    #[serde(default)]
    pub eur_pct_change: Option<f64>,
    pub updated_at: String,
    pub fetched_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatesBaseline {
    pub day_key: String,
    pub usd: f64,
    pub eur: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiState {
    pub last_viewed_base_date: String,
    pub view_offset_days: i32,
    #[serde(default)]
    pub calendar_month: Option<String>,
    #[serde(default)]
    pub preferred_monitor: Option<usize>,
    #[serde(default)]
    pub files_last_path: Option<String>,
    #[serde(default)]
    pub files_favorites: Vec<String>,
    #[serde(default)]
    pub files_recents: Vec<String>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub last_neural_note_id: Option<String>,
}

impl Default for DashboardState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            tasks_by_date: BTreeMap::new(),
            calendar_events: Vec::new(),
            neural_notes: Vec::new(),
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
            files_favorites: Vec::new(),
            files_recents: Vec::new(),
            theme: None,
            locale: None,
            last_neural_note_id: None,
        }
    }
}

impl DashboardState {
    fn migrate(mut self) -> Self {
        while self.version < STATE_VERSION {
            match self.version {
                0 | 1 => {
                    if self.ui.calendar_month.is_none() && self.ui.last_viewed_base_date.len() >= 7
                    {
                        self.ui.calendar_month =
                            Some(self.ui.last_viewed_base_date[..7].to_string());
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

pub fn app_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
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

pub fn write_state_file(path: &Path, state: &DashboardState) -> Result<(), String> {
    let _write_guard = STATE_WRITE_LOCK
        .lock()
        .map_err(|_| "Falha ao serializar escrita do estado.".to_string())?;

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

    fs::rename(&temp_path, path).map_err(|error| {
        error!("Failed to rename state file atomically: {}", error);
        let _ = fs::remove_file(&temp_path);
        format!("Failed to write state file atomically: {}", error)
    })
}

#[tauri::command]
pub fn load_state(app: AppHandle) -> Result<DashboardState, String> {
    let path = state_file_path(&app)?;
    info!("Loading state from {}", path.display());
    ensure_state_file(&path)?;
    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;

    match serde_json::from_str::<DashboardState>(&raw) {
        Ok(state) => {
            let original_version = state.version;
            let migrated = state.migrate();
            if migrated.version != original_version {
                info!(
                    "State migrated from v{} to v{}",
                    original_version, migrated.version
                );
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
pub fn save_state(app: AppHandle, mut state: DashboardState) -> Result<(), String> {
    if state.version != STATE_VERSION {
        state.version = STATE_VERSION;
    }
    write_state_file(&state_file_path(&app)?, &state)
}

#[tauri::command]
pub fn get_app_data_path(app: AppHandle) -> Result<String, String> {
    Ok(app_data_directory(&app)?.to_string_lossy().into_owned())
}
