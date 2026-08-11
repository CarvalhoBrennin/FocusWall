import { get, writable } from 'svelte/store';
import type {
  RadarArticlePreview,
  RadarNewsCategory,
  RadarSnapshot,
  RadarSnapshotRequest
} from '../types/radar.js';
import { collectionArticles } from '../types/radar.js';
import type { MessageKey } from '../i18n/messages.js';
import {
  getRadarArticlePreview,
  loadRadarSnapshot,
  refreshRadarSnapshot
} from '../services/radar.js';

export type RadarPhase = 'idle' | 'loading' | 'ready' | 'refreshing' | 'partial' | 'stale' | 'error';

export type RadarManualRefreshResult = 'started' | 'inactive' | 'paused' | 'busy' | 'cooldown';

type RadarServices = {
  load: typeof loadRadarSnapshot;
  refresh: typeof refreshRadarSnapshot;
};

type RadarClock = {
  now: () => number;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

const REEVALUATE_MS = 5 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 30 * 1000;
const INITIAL_PAGE_SIZE = 16;
const PAGE_SIZE_INCREMENT = 12;

const defaultClock: RadarClock = {
  now: () => Date.now(),
  setTimeout: (handler, timeout, ...args) => globalThis.setTimeout(handler, timeout, ...args),
  clearTimeout: (handle) => globalThis.clearTimeout(handle)
};

export function createRadarController(
  services: RadarServices = { load: loadRadarSnapshot, refresh: refreshRadarSnapshot },
  clock: RadarClock = defaultClock
) {
  const phase = writable<RadarPhase>('idle');
  const snapshot = writable<RadarSnapshot | null>(null);
  const errorKey = writable<MessageKey | ''>('');
  const lastRefreshAttemptAt = writable<string | null>(null);
  const refreshAvailableAt = writable<string | null>(null);

  let active = false;
  let paused = false;
  let generation = 0;
  let reevaluateTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let cooldownTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let cyclePromise: Promise<void> | null = null;
  let request: RadarSnapshotRequest | null = null;
  let requestKey = '';
  let lastManualAt: number | null = null;

  const signatureFor = (value: RadarSnapshotRequest): string => {
    const location = value.location
      ? `${value.location.id}:${value.location.latitude.toFixed(4)}:${value.location.longitude.toFixed(4)}`
      : 'none';
    // A categoria em foco entra na assinatura porque o backend pagina por ela:
    // trocar o filtro precisa disparar um novo ciclo, não reaproveitar o cache.
    return [
      location,
      [...value.categories].sort().join(','),
      value.selectedCategory ?? 'all',
      [...(value.mutedSources ?? [])].sort().join(','),
      [...(value.blockedTopics ?? [])].sort().join(','),
      [...(value.followedTopics ?? [])].sort().join(','),
      [...(value.preferredSources ?? [])].sort().join(','),
      [...(value.tickerSymbols ?? [])].sort().join(','),
      value.pageSize ?? INITIAL_PAGE_SIZE
    ].join('|');
  };

  const prepareSnapshotForRequest = (nextRequest: RadarSnapshotRequest) => {
    const current = get(snapshot);
    if (!current) return;
    const requestedLocation = nextRequest.location;
    const currentLocation = current.weather.data?.location;
    const weatherCompatible = Boolean(
      requestedLocation && currentLocation &&
      requestedLocation.latitude.toFixed(4) === currentLocation.latitude.toFixed(4) &&
      requestedLocation.longitude.toFixed(4) === currentLocation.longitude.toFixed(4)
    );
    // A coleção anterior é filtrada para as categorias ainda habilitadas, para
    // que a troca de filtro não pisque uma lista com conteúdo já descartado.
    const previous = current.news.data;
    const allowed = (category: RadarNewsCategory) =>
      nextRequest.categories.includes(category) &&
      (nextRequest.selectedCategory == null || nextRequest.selectedCategory === category);
    const survivors = collectionArticles(previous).filter((article) => allowed(article.category));
    const filteredNews = previous == null || survivors.length === 0
      ? null
      : {
          ...previous,
          lead: survivors[0] ?? null,
          featured: survivors.slice(1, 4),
          list: survivors.slice(4),
          totalAvailable: survivors.length,
          hasMore: false,
          categoriesAvailable: [...new Set(survivors.map((article) => article.category))]
        };
    const categoriesChanged = request != null &&
      signatureFor({ ...request, location: null }) !== signatureFor({ ...nextRequest, location: null });
    const warnings = current.warnings.filter((warning) =>
      weatherCompatible || (warning !== 'weatherRefreshFailed' && warning !== 'weatherUsingStaleCache')
    );
    if (!requestedLocation && !warnings.includes('locationRequired')) warnings.push('locationRequired');
    if (requestedLocation) {
      const index = warnings.indexOf('locationRequired');
      if (index >= 0) warnings.splice(index, 1);
    }
    snapshot.set({
      ...current,
      weather: weatherCompatible ? current.weather : { state: 'unavailable', data: null, fetchedAt: null },
      news: current.news.data == null
        ? current.news
        : {
            ...current.news,
            state: categoriesChanged ? 'stale' : current.news.state,
            data: filteredNews
          },
      warnings
    });
  };

  const clearReevaluateTimer = () => {
    if (reevaluateTimer) clock.clearTimeout(reevaluateTimer);
    reevaluateTimer = null;
  };

  const clearCooldownTimer = () => {
    if (cooldownTimer) clock.clearTimeout(cooldownTimer);
    cooldownTimer = null;
  };

  const setManualCooldown = () => {
    clearCooldownTimer();
    lastManualAt = clock.now();
    refreshAvailableAt.set(new Date(lastManualAt + MANUAL_COOLDOWN_MS).toISOString());
    cooldownTimer = clock.setTimeout(() => {
      cooldownTimer = null;
      refreshAvailableAt.set(null);
    }, MANUAL_COOLDOWN_MS);
  };

  const computePhase = (value: RadarSnapshot | null, refreshing = false, hasError = false): RadarPhase => {
    if (!value) return refreshing ? 'loading' : 'error';
    // O ticker é contexto opcional: sua ausência não define a fase da tela.
    const available = [value.weather, value.news].filter((section) => section.data != null);
    if (!available.length) return refreshing ? 'loading' : 'error';
    if (refreshing) return 'refreshing';
    if (hasError) return 'partial';
    if (available.some((section) => section.state === 'stale')) return 'stale';
    const expectedSections = request?.location ? 2 : 1;
    if (available.length < expectedSections || value.warnings.some((warning) =>
      warning === 'weatherRefreshFailed' ||
      warning === 'newsRefreshFailed' ||
      warning === 'newsSourceUnavailable' ||
      warning === 'newsAllSourcesUnavailable' ||
      warning === 'providerCooldown' ||
      warning === 'imagesUnavailable' ||
      warning === 'cacheWriteFailed' ||
      warning === 'cacheReadFailed' ||
      warning === 'cacheRecovered'
    )) return 'partial';
    return 'ready';
  };

  const needsRefresh = (value: RadarSnapshot | null): boolean => {
    if (!value) return true;
    const weatherNeeded = request?.location ? value.weather.state !== 'fresh' : false;
    const visibleArticles = collectionArticles(value.news.data).slice(0, 4);
    const imageEnrichmentNeeded = visibleArticles.some((article) => article.image == null) &&
      !value.warnings.includes('imagesUnavailable');
    const newsNeeded = value.news.state !== 'fresh' ||
      value.warnings.includes('newsSourceUnavailable') ||
      imageEnrichmentNeeded;
    return weatherNeeded || newsNeeded;
  };

  const schedule = (cycleGeneration: number) => {
    clearReevaluateTimer();
    if (!active || paused || cycleGeneration !== generation) return;
    reevaluateTimer = clock.setTimeout(() => {
      reevaluateTimer = null;
      void startCycle(false);
    }, REEVALUATE_MS);
  };

  const executeRefresh = async (cycleGeneration: number, currentRequest: RadarSnapshotRequest, force: boolean) => {
    if (!active || paused || cycleGeneration !== generation) return;
    phase.set(computePhase(get(snapshot), true));
    errorKey.set('');
    lastRefreshAttemptAt.set(new Date(clock.now()).toISOString());
    try {
      const next = await services.refresh(currentRequest, force);
      if (!active || paused || cycleGeneration !== generation) return;
      snapshot.set(next);
      phase.set(computePhase(next));
    } catch {
      if (!active || paused || cycleGeneration !== generation) return;
      errorKey.set('radar.refreshFailed');
      phase.set(computePhase(get(snapshot), false, true));
    }
  };

  const executeCycle = async (force: boolean, cycleGeneration: number, currentRequest: RadarSnapshotRequest) => {
    try {
      if (!force) {
        let cached: RadarSnapshot | null = null;
        try {
          cached = await services.load(currentRequest);
        } catch {
          if (!active || paused || cycleGeneration !== generation) return;
          errorKey.set('radar.loadFailed');
        }
        if (!active || paused || cycleGeneration !== generation) return;
        if (cached) {
          snapshot.set(cached);
          phase.set(computePhase(cached, false, Boolean(get(errorKey))));
        } else if (!get(snapshot)) {
          phase.set('loading');
        }
        const current = cached ?? get(snapshot);
        if (!needsRefresh(current)) return;
      }
      await executeRefresh(cycleGeneration, currentRequest, force);
    } finally {
      schedule(cycleGeneration);
    }
  };

  const startCycle = async (force: boolean): Promise<void> => {
    if (!active || paused || !request) return;
    if (cyclePromise) {
      await cyclePromise;
      if (!active || paused || !request) return;
    }
    const cycleGeneration = generation;
    const currentRequest = request;
    const running = executeCycle(force, cycleGeneration, currentRequest);
    cyclePromise = running;
    try {
      await running;
    } finally {
      if (cyclePromise === running) cyclePromise = null;
    }
  };

  return {
    phase,
    snapshot,
    errorKey,
    lastRefreshAttemptAt,
    refreshAvailableAt,
    activate(nextRequest: RadarSnapshotRequest) {
      const nextKey = signatureFor(nextRequest);
      if (active && requestKey === nextKey) return;
      if (requestKey && requestKey !== nextKey) prepareSnapshotForRequest(nextRequest);
      request = nextRequest;
      requestKey = nextKey;
      active = true;
      generation += 1;
      clearReevaluateTimer();
      errorKey.set('');
      if (!paused) void startCycle(false);
    },
    deactivate() {
      if (!active) return;
      active = false;
      generation += 1;
      clearReevaluateTimer();
    },
    setPaused(nextPaused: boolean) {
      if (paused === nextPaused) return;
      paused = nextPaused;
      generation += 1;
      clearReevaluateTimer();
      if (!paused && active) void startCycle(false);
    },
    async manualRefresh(nextRequest: RadarSnapshotRequest): Promise<RadarManualRefreshResult> {
      if (!active) return 'inactive';
      if (paused) return 'paused';
      if (cyclePromise) return 'busy';
      if (lastManualAt != null && clock.now() - lastManualAt < MANUAL_COOLDOWN_MS) return 'cooldown';
      request = nextRequest;
      requestKey = signatureFor(nextRequest);
      generation += 1;
      clearReevaluateTimer();
      setManualCooldown();
      await startCycle(true);
      return 'started';
    },
    clear() {
      active = false;
      paused = false;
      generation += 1;
      clearReevaluateTimer();
      clearCooldownTimer();
      request = null;
      requestKey = '';
      snapshot.set(null);
      phase.set('idle');
      errorKey.set('');
      lastRefreshAttemptAt.set(null);
      refreshAvailableAt.set(null);
      lastManualAt = null;
      radarNewsPageSize.set(INITIAL_PAGE_SIZE);
    }
  };
}

const controller = createRadarController();
export const radarPhase = controller.phase;
export const radarSnapshot = controller.snapshot;
export const radarErrorKey = controller.errorKey;
export const radarLastRefreshAttemptAt = controller.lastRefreshAttemptAt;
export const radarRefreshAvailableAt = controller.refreshAvailableAt;
export const radarNewsPageSize = writable(INITIAL_PAGE_SIZE);

export function loadMoreRadarNews(): void {
  radarNewsPageSize.update((value) => value + PAGE_SIZE_INCREMENT);
}

export function resetRadarNewsPageSize(): void {
  radarNewsPageSize.set(INITIAL_PAGE_SIZE);
}

/** `'all'` significa "sem filtro"; o backend então pagina por todas as categorias. */
export const radarSelectedCategory = writable<RadarNewsCategory | 'all'>('all');
export const radarLocationPickerOpen = writable(false);

// ---------------------------------------------------------------------------
// Preview interno da matéria
// ---------------------------------------------------------------------------

export type RadarPreviewPhase = 'idle' | 'loading' | 'ready' | 'error';

export const radarSelectedArticleId = writable<string | null>(null);
export const radarArticlePreview = writable<RadarArticlePreview | null>(null);
export const radarArticlePreviewPhase = writable<RadarPreviewPhase>('idle');

/** Descarta respostas de previews que o usuário já abandonou. */
let previewGeneration = 0;

export async function openRadarArticlePreview(articleId: string): Promise<void> {
  const generation = ++previewGeneration;
  radarSelectedArticleId.set(articleId);
  radarArticlePreview.set(null);
  radarArticlePreviewPhase.set('loading');
  try {
    const preview = await getRadarArticlePreview(articleId);
    if (generation !== previewGeneration) return;
    radarArticlePreview.set(preview);
    radarArticlePreviewPhase.set('ready');
  } catch {
    if (generation !== previewGeneration) return;
    radarArticlePreviewPhase.set('error');
  }
}

export function closeRadarArticlePreview(): void {
  previewGeneration += 1;
  radarSelectedArticleId.set(null);
  radarArticlePreview.set(null);
  radarArticlePreviewPhase.set('idle');
}
export const activateRadar = controller.activate;
export const deactivateRadar = controller.deactivate;
export const setRadarPaused = controller.setPaused;
export const manualRefreshRadar = controller.manualRefresh;
export const clearRadarRuntime = controller.clear;
