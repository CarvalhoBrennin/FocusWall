import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createRadarController } from './radar-store.js';
import type {
  RadarLocation,
  RadarNewsCategory,
  RadarNewsCollection,
  RadarSnapshot
} from '../types/radar.js';

/** Coleção mínima válida: o backend nunca devolve uma seção resh vazia. */
function collection(category: RadarNewsCategory = 'technology'): RadarNewsCollection {
  return {
    lead: {
      id: 'f'.repeat(64),
      sourceId: 'agencia-brasil',
      sourceName: 'Agência Brasil',
      category,
      title: 'Manchete de teste',
      summary: null,
      author: null,
      publishedAt: '2026-07-29T11:00:00Z',
      fetchedAt: '2026-07-29T12:00:00Z',
      image: {
        id: 'i'.repeat(64),
        width: 640,
        height: 360,
        aspectRatio: 16 / 9,
        dominantTone: 'cool',
        alt: 'Imagem de teste',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      },
      tags: [],
      score: 0.5,
      relatedCount: 0,
      cacheState: 'fresh'
    },
    featured: [],
    list: [],
    totalAvailable: 1,
    hasMore: false,
    categoriesAvailable: [category]
  };
}

const fresh: RadarSnapshot = {
  schemaVersion: 2,
  generatedAt: '2026-07-29T12:00:00Z',
  warnings: [],
  providers: [],
  weather: { state: 'unavailable', data: null, fetchedAt: null },
  news: { state: 'fresh', data: collection(), fetchedAt: '2026-07-29T12:00:00Z' },
  ticker: { state: 'unavailable', data: null, fetchedAt: null }
};
const stale: RadarSnapshot = {
  ...fresh,
  news: { ...fresh.news, state: 'stale' },
  warnings: ['newsUsingStaleCache']
};
const request = { location: null, categories: ['technology', 'development'] as const };
const location: RadarLocation = {
  id: 'sp', name: 'São Paulo', admin1: 'São Paulo', country: 'Brasil', countryCode: 'BR',
  latitude: -23.5505, longitude: -46.6333, timezone: 'America/Sao_Paulo'
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-29T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('radar controller', () => {
  it('does not refresh fresh cache automatically', async () => {
    const load = vi.fn().mockResolvedValue(fresh);
    const refresh = vi.fn().mockResolvedValue(fresh);
    const controller = createRadarController({ load, refresh });
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    expect(get(controller.snapshot)).toEqual(fresh);
    expect(refresh).not.toHaveBeenCalled();
    controller.deactivate();
  });

  it('shows stale cache before refresh and preserves it while refreshing', async () => {
    let resolveRefresh: (value: RadarSnapshot) => void = () => {};
    const refreshPromise = new Promise<RadarSnapshot>((resolve) => { resolveRefresh = resolve; });
    const controller = createRadarController({
      load: vi.fn().mockResolvedValue(stale),
      refresh: vi.fn().mockReturnValue(refreshPromise)
    });
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    expect(get(controller.snapshot)).toEqual(stale);
    expect(get(controller.phase)).toBe('refreshing');
    resolveRefresh(fresh);
    await flush();
    expect(get(controller.snapshot)).toEqual(fresh);
    expect(get(controller.phase)).toBe('ready');
    controller.deactivate();
  });

  it('ignores late results after deactivation', async () => {
    let resolveRefresh: (value: RadarSnapshot) => void = () => {};
    const controller = createRadarController({
      load: vi.fn().mockResolvedValue(stale),
      refresh: vi.fn().mockReturnValue(new Promise<RadarSnapshot>((resolve) => { resolveRefresh = resolve; }))
    });
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    controller.deactivate();
    resolveRefresh(fresh);
    await flush();
    expect(get(controller.snapshot)).toEqual(stale);
  });

  it('ignores a response from the previous location', async () => {
    let resolveFirst: (value: RadarSnapshot) => void = () => {};
    const refresh = vi.fn()
      .mockReturnValueOnce(new Promise<RadarSnapshot>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(fresh);
    const controller = createRadarController({ load: vi.fn().mockResolvedValue(stale), refresh });
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    controller.activate({ location, categories: ['technology', 'development'] });
    resolveFirst({ ...fresh, warnings: ['newsSourceUnavailable'] });
    await flush();
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(get(controller.snapshot)?.warnings).not.toContain('newsSourceUnavailable');
    controller.deactivate();
  });

  it('refreshes when one requested news source is missing even if cached news is fresh', async () => {
    const cached: RadarSnapshot = { ...fresh, warnings: ['newsSourceUnavailable'] };
    const load = vi.fn().mockResolvedValue(cached);
    const refresh = vi.fn().mockResolvedValue(fresh);
    const controller = createRadarController({ load, refresh });

    controller.activate({ location: null, categories: ['technology', 'development'] });
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('marks preserved news stale when enabled categories change so missing sources refresh', async () => {
    const technologyOnly: RadarSnapshot = {
      ...fresh,
      news: {
        ...fresh.news,
        data: collection('technology')
      }
    };
    const load = vi.fn()
      .mockResolvedValueOnce(technologyOnly)
      .mockResolvedValueOnce(null);
    const refresh = vi.fn().mockResolvedValue(fresh);
    const controller = createRadarController({ load, refresh });
    controller.activate({ location: null, categories: ['technology'] });
    await flush();
    controller.activate({ location: null, categories: ['development'] });
    await flush();
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    controller.deactivate();
  });

  it('does not reactivate the same request or create duplicate refreshes', async () => {
    const load = vi.fn().mockResolvedValue(stale);
    const refresh = vi.fn().mockResolvedValue(fresh);
    const controller = createRadarController({ load, refresh });
    const activeRequest = { ...request, categories: [...request.categories] };
    controller.activate(activeRequest);
    controller.activate({ ...activeRequest, categories: [...activeRequest.categories] });
    await flush();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    controller.deactivate();
  });

  it('refreshes when personalization or page size changes', async () => {
    const load = vi.fn().mockResolvedValue(fresh);
    const refresh = vi.fn().mockResolvedValue(fresh);
    const controller = createRadarController({ load, refresh });
    const base = { ...request, categories: [...request.categories], pageSize: 16 };
    controller.activate(base);
    await flush();
    controller.activate({ ...base, followedTopics: ['energia'] });
    await flush();
    controller.activate({ ...base, followedTopics: ['energia'], pageSize: 28 });
    await flush();
    expect(load).toHaveBeenCalledTimes(3);
    expect(refresh).not.toHaveBeenCalled();
    controller.deactivate();
  });

  it('does not start refresh after being paused during cache loading', async () => {
    let resolveLoad: (value: RadarSnapshot) => void = () => {};
    const load = vi.fn().mockReturnValue(new Promise<RadarSnapshot>((resolve) => { resolveLoad = resolve; }));
    const refresh = vi.fn().mockResolvedValue(fresh);
    const controller = createRadarController({ load, refresh });
    controller.activate({ ...request, categories: [...request.categories] });
    controller.setPaused(true);
    resolveLoad(stale);
    await flush();
    expect(refresh).not.toHaveBeenCalled();
    controller.deactivate();
  });

  it('re-evaluates only after five minutes while active', async () => {
    const load = vi.fn().mockResolvedValue(fresh);
    const controller = createRadarController({ load, refresh: vi.fn().mockResolvedValue(fresh) });
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    controller.deactivate();
  });

  it('clears the scheduled re-evaluation after deactivation', async () => {
    const load = vi.fn().mockResolvedValue(fresh);
    const controller = createRadarController({ load, refresh: vi.fn().mockResolvedValue(fresh) });
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    controller.deactivate();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('exposes and clears the manual refresh cooldown', async () => {
    const refresh = vi.fn().mockResolvedValue(fresh);
    const controller = createRadarController({ load: vi.fn().mockResolvedValue(fresh), refresh });
    const activeRequest = { ...request, categories: [...request.categories] };
    controller.activate(activeRequest);
    await flush();
    await expect(controller.manualRefresh(activeRequest)).resolves.toBe('started');
    expect(get(controller.refreshAvailableAt)).not.toBeNull();
    await expect(controller.manualRefresh(activeRequest)).resolves.toBe('cooldown');
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(get(controller.refreshAvailableAt)).toBeNull();
    controller.deactivate();
  });

  it('marks a successful refresh with cache persistence warning as partial', async () => {
    const warningSnapshot: RadarSnapshot = { ...fresh, warnings: ['cacheWriteFailed'] };
    const controller = createRadarController({
      load: vi.fn().mockResolvedValue(stale),
      refresh: vi.fn().mockResolvedValue(warningSnapshot)
    });
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    await flush();
    expect(get(controller.snapshot)?.warnings).toContain('cacheWriteFailed');
    expect(get(controller.phase)).toBe('partial');
    controller.deactivate();
  });


  it('marks cache read failures as partial without dropping refreshed data', async () => {
    const warningSnapshot: RadarSnapshot = { ...fresh, warnings: ['cacheReadFailed'] };
    const controller = createRadarController({
      load: vi.fn().mockResolvedValue(stale),
      refresh: vi.fn().mockResolvedValue(warningSnapshot)
    });
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    await flush();
    expect(get(controller.snapshot)?.warnings).toContain('cacheReadFailed');
    expect(get(controller.phase)).toBe('partial');
    controller.deactivate();
  });

  it('keeps an in-flight cycle coordinated after clear and reactivation', async () => {
    let resolveLoad!: (value: RadarSnapshot) => void;
    const load = vi.fn()
      .mockReturnValueOnce(new Promise<RadarSnapshot>((resolve) => { resolveLoad = resolve; }))
      .mockResolvedValueOnce(fresh);
    const controller = createRadarController({ load, refresh: vi.fn().mockResolvedValue(fresh) });
    controller.activate({ ...request, categories: [...request.categories] });
    controller.clear();
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    resolveLoad(stale);
    await flush();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    controller.deactivate();
  });

  it('preserves cached data and exposes refresh failure', async () => {
    const controller = createRadarController({
      load: vi.fn().mockResolvedValue(stale),
      refresh: vi.fn().mockRejectedValue(new Error('offline'))
    });
    controller.activate({ ...request, categories: [...request.categories] });
    await flush();
    await flush();
    expect(get(controller.snapshot)).toEqual(stale);
    expect(get(controller.errorKey)).toBe('radar.refreshFailed');
    expect(get(controller.phase)).toBe('partial');
    controller.deactivate();
  });
});
