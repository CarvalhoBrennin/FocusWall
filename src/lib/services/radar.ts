import { isTauri, tauriInvoke } from '../utils/tauri.js';
import {
  isRadarOpaqueId,
  normalizeRadarArticlePreview,
  normalizeRadarCategories,
  normalizeRadarLocation,
  normalizeRadarSnapshot
} from '../utils/radar.js';
import type {
  RadarArticlePreview,
  RadarCacheScope,
  RadarLocation,
  RadarSnapshot,
  RadarSnapshotRequest
} from '../types/radar.js';
import { createRadarFixture, RADAR_FIXTURE_LOCATIONS, createRadarFixturePreview } from './radar.fixture.js';

type RadarServiceRuntime = {
  isDesktop: () => boolean;
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
};

function stableError(message: string): Error {
  return new Error(message);
}

/**
 * Payload enviado ao Rust. Os campos seguem o `RadarSnapshotRequest` do backend
 * em camelCase; `RadarRefreshRequest` achata estes mesmos campos ao lado de
 * `forceRefresh`.
 */
function normalizeRequest(request: RadarSnapshotRequest): Record<string, unknown> {
  return {
    location: normalizeRadarLocation(request.location),
    categories: normalizeRadarCategories(request.categories),
    selectedCategory: request.selectedCategory ?? null,
    mutedSources: request.mutedSources ?? [],
    blockedTopics: request.blockedTopics ?? [],
    followedTopics: request.followedTopics ?? [],
    preferredSources: request.preferredSources ?? [],
    pageSize: request.pageSize ?? null
  };
}

export function createRadarService(runtime: RadarServiceRuntime) {
  return {
    async loadRadarSnapshot(request: RadarSnapshotRequest): Promise<RadarSnapshot | null> {
      const payload = normalizeRequest(request);
      if (!runtime.isDesktop()) {
        return createRadarFixture(
          payload.location as RadarLocation | null,
          normalizeRadarCategories(request.categories),
          request.selectedCategory ?? null
        );
      }
      try {
        const raw = await runtime.invoke<unknown>('load_radar_snapshot', { request: payload });
        return raw == null ? null : normalizeRadarSnapshot(raw);
      } catch {
        throw stableError('radar.loadFailed');
      }
    },

    async refreshRadarSnapshot(request: RadarSnapshotRequest, forceRefresh = false): Promise<RadarSnapshot> {
      const payload = normalizeRequest(request);
      if (!runtime.isDesktop()) {
        return createRadarFixture(
          payload.location as RadarLocation | null,
          normalizeRadarCategories(request.categories),
          request.selectedCategory ?? null
        );
      }
      try {
        // `forceRefresh` é irmão dos campos do snapshot, não um objeto aninhado:
        // o backend usa `#[serde(flatten)]`.
        const raw = await runtime.invoke<unknown>('refresh_radar_snapshot', {
          request: { ...payload, forceRefresh }
        });
        const snapshot = normalizeRadarSnapshot(raw);
        if (!snapshot) throw new Error('invalid snapshot');
        return snapshot;
      } catch {
        throw stableError('radar.refreshFailed');
      }
    },

    async searchRadarLocations(query: string, locale: 'pt-BR' | 'en-US'): Promise<RadarLocation[]> {
      const normalizedQuery = Array.from(query.replace(/[\u0000-\u001f\u007f]/g, '').trim())
        .slice(0, 80)
        .join('');
      if (Array.from(normalizedQuery).length < 2) return [];
      if (!runtime.isDesktop()) {
        const needle = normalizedQuery.toLocaleLowerCase(locale);
        return RADAR_FIXTURE_LOCATIONS
          .filter((location) =>
            `${location.name} ${location.admin1 ?? ''} ${location.country}`.toLocaleLowerCase(locale).includes(needle)
          )
          .slice(0, 5);
      }
      try {
        const raw = await runtime.invoke<unknown[]>('search_radar_locations', {
          query: normalizedQuery,
          locale
        });
        const seen = new Set<string>();
        return (Array.isArray(raw) ? raw : [])
          .map(normalizeRadarLocation)
          .filter((location): location is RadarLocation => location !== null)
          .filter((location) => {
            const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
            return !seen.has(key) && Boolean(seen.add(key));
          })
          .slice(0, 5);
      } catch {
        throw stableError('radar.locationSearchError');
      }
    },

    /** Preview interno da matéria. Não abre navegador. */
    async getRadarArticlePreview(articleId: string): Promise<RadarArticlePreview> {
      if (!isRadarOpaqueId(articleId)) throw stableError('radar.articleNotFound');
      if (!runtime.isDesktop()) {
        const preview = createRadarFixturePreview(articleId);
        if (!preview) throw stableError('radar.articleNotFound');
        return preview;
      }
      try {
        const raw = await runtime.invoke<unknown>('get_radar_article_preview', { articleId });
        const preview = normalizeRadarArticlePreview(raw);
        if (!preview) throw new Error('invalid preview');
        return preview;
      } catch {
        throw stableError('radar.articleNotFound');
      }
    },

    /**
     * Abre a matéria no navegador do sistema **por ID opaco**. Nenhuma URL
     * externa atravessa o IPC; o backend resolve e revalida a URL.
     */
    async openRadarArticle(articleId: string): Promise<void> {
      if (!isRadarOpaqueId(articleId)) throw stableError('radar.openFailed');
      if (!runtime.isDesktop()) throw stableError('radar.openFailed');
      try {
        await runtime.invoke('open_radar_article', { articleId });
      } catch {
        throw stableError('radar.openFailed');
      }
    },

    async openRadarAttribution(providerId: string): Promise<void> {
      const normalized = providerId.trim();
      if (!/^[a-z0-9-]{2,60}$/.test(normalized)) throw stableError('radar.openFailed');
      if (!runtime.isDesktop()) throw stableError('radar.openFailed');
      try {
        await runtime.invoke('open_radar_attribution', { providerId: normalized });
      } catch {
        throw stableError('radar.openFailed');
      }
    },

    async clearRadarCache(scope: RadarCacheScope): Promise<void> {
      if (!runtime.isDesktop()) return;
      try {
        await runtime.invoke('clear_radar_cache', { scope });
      } catch {
        throw stableError('radar.storageFailed');
      }
    }
  };
}

const service = createRadarService({ isDesktop: isTauri, invoke: tauriInvoke });

export const loadRadarSnapshot = service.loadRadarSnapshot;
export const refreshRadarSnapshot = service.refreshRadarSnapshot;
export const searchRadarLocations = service.searchRadarLocations;
export const getRadarArticlePreview = service.getRadarArticlePreview;
export const openRadarArticle = service.openRadarArticle;
export const openRadarAttribution = service.openRadarAttribution;
export const clearRadarCache = service.clearRadarCache;
