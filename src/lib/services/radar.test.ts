import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRadarService } from './radar.js';
import { RADAR_CATEGORIES, collectionArticles, type RadarSnapshotRequest } from '../types/radar.js';

const baseRequest: RadarSnapshotRequest = { location: null, categories: [...RADAR_CATEGORIES] };

/** ID no formato exigido pelos comandos por ID (SHA-256 hexadecimal). */
const ARTICLE_ID = 'a'.repeat(64);

const emptySnapshot = {
  schemaVersion: 2,
  generatedAt: '2026-07-29T12:00:00Z',
  warnings: [],
  providers: [],
  weather: { state: 'unavailable', data: null, fetchedAt: null },
  news: { state: 'unavailable', data: null, fetchedAt: null },
  ticker: { state: 'unavailable', data: null, fetchedAt: null }
};

describe('radar service', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    invoke.mockReset();
  });

  it('sends the full camelCase request shape the backend expects', async () => {
    const service = createRadarService({ isDesktop: () => true, invoke });
    invoke.mockResolvedValueOnce(null);
    await service.loadRadarSnapshot({ ...baseRequest, selectedCategory: 'brasil', pageSize: 24 });

    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe('load_radar_snapshot');
    expect(args.request).toMatchObject({
      location: null,
      selectedCategory: 'brasil',
      pageSize: 24,
      mutedSources: [],
      blockedTopics: [],
      followedTopics: [],
      preferredSources: []
    });
    expect(args.request.categories).toEqual([...RADAR_CATEGORIES]);
  });

  it('flattens forceRefresh alongside the snapshot fields, not nested', async () => {
    const service = createRadarService({ isDesktop: () => true, invoke });
    invoke.mockResolvedValueOnce(emptySnapshot);
    await service.refreshRadarSnapshot(baseRequest, true);

    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe('refresh_radar_snapshot');
    expect(args.request.forceRefresh).toBe(true);
    // O backend usa `#[serde(flatten)]`: nada de objeto `snapshot` aninhado.
    expect(args.request.snapshot).toBeUndefined();
    expect(args.request.categories).toBeDefined();
  });

  it('opens articles by opaque id and never by url', async () => {
    const service = createRadarService({ isDesktop: () => true, invoke });
    invoke.mockResolvedValueOnce(undefined);
    await service.openRadarArticle(ARTICLE_ID);
    expect(invoke).toHaveBeenCalledWith('open_radar_article', { articleId: ARTICLE_ID });

    const payloads = JSON.stringify(invoke.mock.calls);
    expect(payloads).not.toContain('http');
    expect(payloads).not.toContain('url');
  });

  it('rejects anything that is not a well formed opaque id', async () => {
    const service = createRadarService({ isDesktop: () => true, invoke });
    for (const invalid of ['', 'abc', 'https://example.com/a', '../../etc/passwd', 'z'.repeat(64)]) {
      await expect(service.openRadarArticle(invalid)).rejects.toThrow('radar.openFailed');
      await expect(service.getRadarArticlePreview(invalid)).rejects.toThrow('radar.articleNotFound');
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects malformed provider ids before invoking attribution', async () => {
    const service = createRadarService({ isDesktop: () => true, invoke });
    for (const invalid of ['', '../etc', 'Agência Brasil', 'a']) {
      await expect(service.openRadarAttribution(invalid)).rejects.toThrow('radar.openFailed');
    }
    expect(invoke).not.toHaveBeenCalled();

    invoke.mockResolvedValueOnce(undefined);
    await service.openRadarAttribution('agencia-brasil');
    expect(invoke).toHaveBeenCalledWith('open_radar_attribution', { providerId: 'agencia-brasil' });
  });

  it('sends location queries only through the desktop command', async () => {
    const service = createRadarService({ isDesktop: () => true, invoke });
    invoke.mockResolvedValueOnce([]);
    await service.searchRadarLocations('São Paulo', 'pt-BR');
    expect(invoke).toHaveBeenCalledWith('search_radar_locations', {
      query: 'São Paulo',
      locale: 'pt-BR'
    });
  });

  it('encapsulates desktop failures behind stable message keys', async () => {
    const service = createRadarService({ isDesktop: () => true, invoke });
    invoke.mockRejectedValueOnce(new Error('raw stack with secrets'));
    await expect(service.loadRadarSnapshot(baseRequest)).rejects.toThrow('radar.loadFailed');

    invoke.mockRejectedValueOnce(new Error('raw stack'));
    await expect(service.refreshRadarSnapshot(baseRequest)).rejects.toThrow('radar.refreshFailed');

    invoke.mockRejectedValueOnce(new Error('raw stack'));
    await expect(service.getRadarArticlePreview(ARTICLE_ID)).rejects.toThrow('radar.articleNotFound');
  });

  it('uses deterministic fixtures in the web preview without touching the backend', async () => {
    const service = createRadarService({ isDesktop: () => false, invoke });
    const fixture = await service.refreshRadarSnapshot(baseRequest);
    expect(fixture.schemaVersion).toBe(2);
    expect(fixture.weather.data).toBeNull();
    expect(fixture.warnings).toContain('locationRequired');
    // A origem fictícia precisa ficar visível na interface.
    expect(fixture.warnings).toContain('newsUsingStaleCache');
    expect(collectionArticles(fixture.news.data).length).toBeGreaterThan(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('filters preview news by the selected category', async () => {
    const service = createRadarService({ isDesktop: () => false, invoke });
    const fixture = await service.refreshRadarSnapshot({
      ...baseRequest,
      selectedCategory: 'development'
    });
    const articles = collectionArticles(fixture.news.data);
    expect(articles).toHaveLength(1);
    expect(articles[0]?.category).toBe('development');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('never opens a browser from the web preview', async () => {
    const service = createRadarService({ isDesktop: () => false, invoke });
    const preview = await service.getRadarArticlePreview('01'.repeat(32));
    expect(preview.canOpenExternally).toBe(false);
    await expect(service.openRadarArticle('01'.repeat(32))).rejects.toThrow('radar.openFailed');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('deduplicates normalized location results', async () => {
    const service = createRadarService({ isDesktop: () => true, invoke });
    invoke.mockResolvedValueOnce([
      { id: 'a', name: 'A', admin1: null, country: 'X', countryCode: 'XX', latitude: 1, longitude: 2, timezone: 'Etc/UTC' },
      { id: 'b', name: 'B', admin1: null, country: 'X', countryCode: 'XX', latitude: 1, longitude: 2, timezone: 'Etc/UTC' }
    ]);
    await expect(service.searchRadarLocations('ab', 'en-US')).resolves.toHaveLength(1);
  });
});
