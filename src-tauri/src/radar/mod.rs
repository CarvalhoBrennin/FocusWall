//! Feature Radar: clima, notícias e contexto de mercado.
//!
//! Toda chamada de rede acontece neste módulo. O frontend recebe apenas IDs
//! opacos — nunca URLs externas — e abre matérias por `open_radar_article`.

pub(crate) mod config;
pub(crate) mod error;
pub(crate) mod http;
#[cfg(feature = "live-provider-tests")]
mod live;
pub(crate) mod market;
pub(crate) mod migrations;
pub(crate) mod models;
pub(crate) mod news;
pub(crate) mod repository;
pub(crate) mod security;
pub(crate) mod service;
pub(crate) mod sources;
pub(crate) mod weather;

use error::RadarCommandError;
use log::{info, warn};
use models::*;
use service::RadarService;
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Manager, State};

/// Estado gerenciado pelo Tauri. O serviço é criado sob demanda para que uma
/// falha de disco na inicialização não impeça o FocusWall de abrir.
pub struct RadarRuntime {
    service: OnceLock<Option<Arc<RadarService>>>,
}

impl RadarRuntime {
    pub fn new() -> Self {
        Self {
            service: OnceLock::new(),
        }
    }

    fn service(&self, app: &AppHandle) -> Result<Arc<RadarService>, RadarCommandError> {
        self.service
            .get_or_init(|| {
                let directory = match app.path().app_cache_dir() {
                    Ok(base) => base.join("radar"),
                    Err(_) => {
                        warn!("radar cache directory unavailable: error_kind=storage");
                        return None;
                    }
                };
                match RadarService::new(&directory) {
                    Ok(service) => {
                        info!("radar cache ready");
                        Some(Arc::new(service))
                    }
                    Err(error) => {
                        warn!(
                            "radar service init failed: error_kind={}",
                            error.kind.as_str()
                        );
                        None
                    }
                }
            })
            .clone()
            .ok_or(RadarCommandError::STORAGE_FAILED)
    }
}

impl Default for RadarRuntime {
    fn default() -> Self {
        Self::new()
    }
}

fn validate_request(request: &RadarSnapshotRequest) -> Result<(), RadarCommandError> {
    if let Some(location) = request.location.as_ref() {
        validate_location(location).map_err(|_| RadarCommandError::INVALID_LOCATION)?;
    }
    if request.muted_sources.len() > 32
        || request.blocked_topics.len() > 64
        || request.followed_topics.len() > 64
        || request.preferred_sources.len() > 32
        || request.ticker_symbols.len() > 12
    {
        return Err(RadarCommandError::INVALID_REQUEST);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn load_radar_snapshot(
    app: AppHandle,
    state: State<'_, RadarRuntime>,
    request: RadarSnapshotRequest,
) -> Result<RadarSnapshot, RadarCommandError> {
    validate_request(&request)?;
    let service = state.service(&app)?;
    // Leitura de banco é bloqueante: sai do executor async.
    tokio::task::spawn_blocking(move || service.build_snapshot(&request, chrono::Utc::now()))
        .await
        .map_err(|_| RadarCommandError::LOAD_FAILED)
}

#[tauri::command]
pub async fn refresh_radar_snapshot(
    app: AppHandle,
    state: State<'_, RadarRuntime>,
    request: RadarRefreshRequest,
) -> Result<RadarSnapshot, RadarCommandError> {
    validate_request(&request.snapshot)?;
    let service = state.service(&app)?;
    Ok(service.refresh(&request).await)
}

#[tauri::command]
pub async fn search_radar_locations(
    app: AppHandle,
    state: State<'_, RadarRuntime>,
    query: String,
    locale: String,
) -> Result<Vec<RadarLocation>, RadarCommandError> {
    // A consulta é validada mas nunca registrada em log.
    weather::prepare_location_search(&query, &locale)
        .map_err(|_| RadarCommandError::INVALID_LOCATION_QUERY)?;
    let service = state.service(&app)?;
    service
        .search_locations(&query, &locale)
        .await
        .map_err(|error| {
            warn!(
                "radar location search failed: error_kind={}",
                error.kind.as_str()
            );
            RadarCommandError::LOCATION_SEARCH_FAILED
        })
}

#[tauri::command]
pub async fn get_radar_article_preview(
    app: AppHandle,
    state: State<'_, RadarRuntime>,
    article_id: String,
) -> Result<RadarArticlePreview, RadarCommandError> {
    let service = state.service(&app)?;
    tokio::task::spawn_blocking(move || service.article_preview(&article_id))
        .await
        .map_err(|_| RadarCommandError::ARTICLE_NOT_FOUND)?
        .map_err(|_| RadarCommandError::ARTICLE_NOT_FOUND)
}

/// Abre a matéria no navegador do sistema a partir do **ID opaco**.
///
/// O frontend nunca envia URL: ela é resolvida no banco e revalidada contra a
/// allowlist do provider antes da abertura.
#[tauri::command]
pub async fn open_radar_article(
    app: AppHandle,
    state: State<'_, RadarRuntime>,
    article_id: String,
) -> Result<(), RadarCommandError> {
    let service = state.service(&app)?;
    let (url, provider_id) =
        tokio::task::spawn_blocking(move || service.resolve_article_url(&article_id))
            .await
            .map_err(|_| RadarCommandError::ARTICLE_NOT_FOUND)?
            .map_err(|_| RadarCommandError::ARTICLE_NOT_FOUND)?;

    match open::that_detached(&url) {
        Ok(()) => {
            // Somente resultado e fonte; nunca a URL, o título ou o ID do
            // artigo — este último correlacionaria o histórico de leitura.
            info!("radar article opened provider={provider_id}");
            Ok(())
        }
        Err(_) => {
            warn!("radar article open failed provider={provider_id} error_kind=open");
            Err(RadarCommandError::OPEN_FAILED)
        }
    }
}

#[tauri::command]
pub async fn open_radar_attribution(
    app: AppHandle,
    state: State<'_, RadarRuntime>,
    provider_id: String,
) -> Result<(), RadarCommandError> {
    let service = state.service(&app)?;
    let url = service
        .attribution_url(&provider_id)
        .map_err(|_| RadarCommandError::OPEN_FAILED)?;
    open::that_detached(&url).map_err(|_| {
        warn!("radar attribution open failed: error_kind=open");
        RadarCommandError::OPEN_FAILED
    })
}

#[tauri::command]
pub async fn clear_radar_cache(
    app: AppHandle,
    state: State<'_, RadarRuntime>,
    scope: RadarCacheScope,
) -> Result<(), RadarCommandError> {
    let service = state.service(&app)?;
    tokio::task::spawn_blocking(move || service.clear_cache(scope))
        .await
        .map_err(|_| RadarCommandError::STORAGE_FAILED)?
        .map_err(|_| RadarCommandError::STORAGE_FAILED)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requests_carrying_an_invalid_location_are_rejected() {
        let mut request = RadarSnapshotRequest::default();
        assert!(validate_request(&request).is_ok());

        request.location = Some(RadarLocation {
            id: "x".into(),
            name: "Inválida".into(),
            admin1: None,
            country: "Brasil".into(),
            country_code: "BR".into(),
            latitude: 200.0,
            longitude: 0.0,
            timezone: "America/Sao_Paulo".into(),
        });
        assert_eq!(
            validate_request(&request),
            Err(RadarCommandError::INVALID_LOCATION)
        );
    }

    #[test]
    fn oversized_preference_lists_are_rejected_before_touching_the_database() {
        let request = RadarSnapshotRequest {
            blocked_topics: (0..500).map(|index| format!("t{index}")).collect(),
            ..Default::default()
        };
        assert_eq!(
            validate_request(&request),
            Err(RadarCommandError::INVALID_REQUEST)
        );
    }

    #[test]
    fn the_command_surface_no_longer_accepts_a_url_from_the_frontend() {
        // Teste documental: `open_radar_url` foi removido do módulo. Se alguém
        // reintroduzir um comando que receba URL, este arquivo precisa mudar.
        let source = include_str!("mod.rs");
        // As agulhas são montadas em tempo de execução para que o próprio
        // corpo do teste não case com elas.
        let removed_command = format!("pub async fn open_radar_{}", "url");
        let url_parameter = format!("{}: String", "url");
        assert!(
            !source.contains(&removed_command),
            "open_radar_url não pode voltar a existir"
        );
        assert!(
            !source.contains(&url_parameter),
            "nenhum comando pode receber URL do frontend"
        );
    }
}
