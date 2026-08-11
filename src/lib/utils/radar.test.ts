import { describe, expect, it } from 'vitest';
import {
  describeRadarRelativeTime,
  formatRadarLocationLabel,
  getRadarReferenceFetchedAt,
  isRadarOpaqueId,
  normalizeRadarArticlePreview,
  normalizeRadarCategories,
  normalizeRadarLocation,
  normalizeRadarPreferences,
  normalizeRadarSnapshot,
  weatherCodeToMessageKey
} from './radar.js';
import { RADAR_CATEGORIES, collectionArticles } from '../types/radar.js';

const location = {
  id: 'sp', name: '  São   Paulo ', admin1: ' São Paulo ', country: ' Brasil ', countryCode: 'br',
  latitude: -23.5505, longitude: -46.6333, timezone: 'America/Sao_Paulo'
};

const ARTICLE_ID = 'a'.repeat(64);

function validWeather() {
  return {
    location,
    timezone: 'America/Sao_Paulo',
    providerId: 'open-meteo',
    providerName: 'Open-Meteo',
    current: {
      observedAtLocal: '2026-07-29T12:00',
      temperatureCelsius: 24,
      apparentTemperatureCelsius: 25,
      humidityPercent: 65,
      precipitationProbabilityPercent: 30,
      precipitationMm: 0,
      rainMm: 0,
      windSpeedKmh: 12,
      windGustsKmh: 30,
      surfacePressureHpa: 1013,
      weatherCode: 2,
      isDay: true
    },
    today: {
      date: '2026-07-29', minimumCelsius: 18, maximumCelsius: 27,
      precipitationProbabilityPercent: 40, precipitationSumMm: 2, windSpeedMaxKmh: 25,
      uvIndexMax: 7, weatherCode: 2,
      sunriseLocal: '2026-07-29T06:00', sunsetLocal: '2026-07-29T18:00'
    },
    hourly: [{
      localTime: '2026-07-29T13:00', temperatureCelsius: 24, apparentTemperatureCelsius: 25,
      humidityPercent: 60, precipitationProbabilityPercent: 30, precipitationMm: 0,
      windSpeedKmh: 12, weatherCode: 2, isCurrentHour: true
    }],
    daily: [{
      date: '2026-07-29', minimumCelsius: 18, maximumCelsius: 27,
      precipitationProbabilityPercent: 40, precipitationSumMm: 2, windSpeedMaxKmh: 25,
      uvIndexMax: 7, weatherCode: 2, sunriseLocal: '2026-07-29T06:00', sunsetLocal: '2026-07-29T18:00'
    }],
    alerts: []
  };
}

function article(overrides: Record<string, unknown> = {}) {
  return {
    id: ARTICLE_ID,
    sourceId: 'agencia-brasil',
    sourceName: 'Agência Brasil',
    category: 'brasil',
    title: 'Manchete de teste',
    summary: 'Resumo de teste',
    author: null,
    publishedAt: '2026-07-29T11:00:00Z',
    fetchedAt: '2026-07-29T12:00:00Z',
    image: null,
    tags: [],
    score: 0.5,
    relatedCount: 0,
    cacheState: 'fresh',
    ...overrides
  };
}

function collection(articles = [article()]) {
  return {
    lead: articles[0] ?? null,
    featured: articles.slice(1, 3),
    list: articles.slice(3),
    totalAvailable: articles.length,
    hasMore: false,
    categoriesAvailable: ['brasil']
  };
}

function snapshotOf(overrides: Record<string, unknown> = {}) {
  return normalizeRadarSnapshot({
    schemaVersion: 2,
    generatedAt: '2026-07-29T12:00:00Z',
    warnings: [],
    providers: [],
    weather: { state: 'unavailable', data: null, fetchedAt: null },
    news: { state: 'fresh', data: collection(), fetchedAt: '2026-07-29T12:00:00Z' },
    ticker: { state: 'unavailable', data: null, fetchedAt: null },
    ...overrides
  });
}

describe('radar utils', () => {
  it('normalizes valid locations and labels', () => {
    const normalized = normalizeRadarLocation(location);
    expect(normalized?.name).toBe('São Paulo');
    expect(normalized?.countryCode).toBe('BR');
    expect(formatRadarLocationLabel(normalized)).toBe('São Paulo, Brasil');
  });

  it.each([null, undefined, '', ' ', false, true, '10', Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-numeric or non-finite coordinates: %p',
    (invalid) => {
      expect(normalizeRadarLocation({ ...location, latitude: invalid })).toBeNull();
      expect(normalizeRadarLocation({ ...location, longitude: invalid })).toBeNull();
    }
  );

  it('rejects invalid coordinates without affecting defaults', () => {
    expect(normalizeRadarLocation({ ...location, latitude: 200 })).toBeNull();
    expect(
      normalizeRadarPreferences({
        location: { ...location, longitude: -500 },
        enabledCategories: ['invalid']
      })
    ).toEqual({
      location: null,
      enabledCategories: [...RADAR_CATEGORIES],
      followedTopics: [],
      blockedTopics: [],
      preferredSources: [],
      mutedSources: [],
      tickerSymbols: []
    });
  });

  it('truncates Unicode by code point and rejects malformed timezones', () => {
    const normalized = normalizeRadarLocation({ ...location, name: `${'a'.repeat(99)}😀` });
    expect(normalized?.name.endsWith('😀')).toBe(true);
    expect(Array.from(normalized?.name ?? '')).toHaveLength(100);
    expect(normalizeRadarLocation({ ...location, timezone: '../etc/passwd' })).toBeNull();
    expect(normalizeRadarLocation({ ...location, timezone: 'America/ São_Paulo' })).toBeNull();
  });

  it('discards articles whose identifier is not a well formed opaque id', () => {
    // O DTO v2 não carrega URL: o vetor de abuso passou a ser o identificador,
    // que precisa ter exatamente a forma de um SHA-256.
    const snapshot = snapshotOf({
      news: {
        state: 'fresh',
        fetchedAt: '2026-07-29T12:00:00Z',
        data: collection([
          article({ id: 'https://example.com/a' }),
          article({ id: '../../etc/passwd' }),
          article({ id: 'z'.repeat(64) }),
          article({ id: ARTICLE_ID })
        ])
      }
    });
    const articles = collectionArticles(snapshot?.news.data ?? null);
    expect(articles).toHaveLength(1);
    expect(articles[0]?.id).toBe(ARTICLE_ID);
  });

  it('never exposes a canonical url anywhere in the snapshot', () => {
    const snapshot = snapshotOf({
      weather: { state: 'fresh', data: validWeather(), fetchedAt: '2026-07-29T12:00:00Z' }
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('canonicalUrl');
    expect(serialized).not.toContain('https://');
  });

  it('normalizes categories', () => {
    expect(normalizeRadarCategories(['brasil', 'bad', 'brasil'])).toEqual(['brasil']);
    expect(normalizeRadarCategories(['security', 'world'])).toEqual(['security', 'world']);
    expect(normalizeRadarCategories([])).toEqual([...RADAR_CATEGORIES]);
    // A categoria removida do schema 1 não pode ressuscitar.
    expect(normalizeRadarCategories(['Technology'])).toEqual([...RADAR_CATEGORIES]);
  });

  it('validates opaque identifiers', () => {
    expect(isRadarOpaqueId(ARTICLE_ID)).toBe(true);
    for (const invalid of ['', 'abc', 'A'.repeat(64), 'z'.repeat(64), 'a'.repeat(63), null, 42]) {
      expect(isRadarOpaqueId(invalid)).toBe(false);
    }
  });

  it('maps all WMO groups', () => {
    const cases: Array<[number, string]> = [
      [0, 'radar.condition.clear'], [1, 'radar.condition.mainlyClear'], [2, 'radar.condition.partlyCloudy'],
      [3, 'radar.condition.overcast'], [45, 'radar.condition.fog'], [48, 'radar.condition.fog'],
      [51, 'radar.condition.drizzle'], [57, 'radar.condition.drizzle'], [61, 'radar.condition.rain'],
      [67, 'radar.condition.rain'], [71, 'radar.condition.snow'], [86, 'radar.condition.snow'],
      [80, 'radar.condition.showers'], [82, 'radar.condition.showers'], [95, 'radar.condition.thunderstorm'],
      [99, 'radar.condition.thunderstorm'], [1000, 'radar.condition.unknown']
    ];
    for (const [code, expected] of cases) expect(weatherCodeToMessageKey(code)).toBe(expected);
  });

  it('describes relative time without embedding locale text', () => {
    const now = new Date('2026-07-29T12:00:00Z').getTime();
    expect(describeRadarRelativeTime('2026-07-29T11:59:50Z', now)).toEqual({ unit: 'now', count: 0 });
    expect(describeRadarRelativeTime('2026-07-29T11:30:00Z', now)).toEqual({ unit: 'minutes', count: 30 });
    expect(describeRadarRelativeTime('2026-07-29T10:00:00Z', now)).toEqual({ unit: 'hours', count: 2 });
    expect(describeRadarRelativeTime('2026-07-27T10:00:00Z', now)).toEqual({ unit: 'days', count: 2 });
    expect(describeRadarRelativeTime('bad', now)).toBeNull();
    expect(describeRadarRelativeTime('2026-07-29T12:06:00Z', now)).toBeNull();
  });

  it('normalizes partial snapshots without inventing timestamps', () => {
    const snapshot = snapshotOf({ generatedAt: 'bad', warnings: ['locationRequired', 'unknown'] });
    expect(snapshot?.generatedAt).toBeNull();
    expect(snapshot?.warnings).toEqual(['locationRequired']);
  });

  it('treats an empty news collection as unavailable instead of an empty list', () => {
    const snapshot = snapshotOf({
      news: {
        state: 'fresh',
        fetchedAt: '2026-07-29T12:00:00Z',
        data: { lead: null, featured: [], list: [], totalAvailable: 0, hasMore: false, categoriesAvailable: [] }
      }
    });
    expect(snapshot?.news).toEqual({ state: 'unavailable', data: null, fetchedAt: null });
  });

  it('never announces more articles than it delivered', () => {
    const snapshot = snapshotOf({
      news: {
        state: 'fresh',
        fetchedAt: '2026-07-29T12:00:00Z',
        data: { ...collection(), totalAvailable: 0 }
      }
    });
    expect(snapshot?.news.data?.totalAvailable).toBe(1);
  });

  it('rejects weather with null or empty required numeric values', () => {
    for (const invalid of [null, '', false]) {
      const weather = validWeather();
      weather.current.temperatureCelsius = invalid as never;
      const snapshot = snapshotOf({
        weather: { state: 'fresh', data: weather, fetchedAt: '2026-07-29T12:00:00Z' }
      });
      expect(snapshot?.weather.data).toBeNull();
      expect(snapshot?.weather.state).toBe('unavailable');
    }
  });

  it('degrades invalid optional sunrise and sunset without discarding the forecast', () => {
    // Diferente do schema 1: um campo opcional inválido não invalida mais toda
    // a previsão — o plano pede fallback parcial.
    const weather = validWeather();
    weather.today.sunriseLocal = 'invalid';
    weather.daily[0].sunriseLocal = 'invalid';
    const snapshot = snapshotOf({
      weather: { state: 'fresh', data: weather, fetchedAt: '2026-07-29T12:00:00Z' }
    });
    expect(snapshot?.weather.state).toBe('fresh');
    expect(snapshot?.weather.data?.today.sunriseLocal).toBeNull();
    expect(snapshot?.weather.data?.today.sunsetLocal).toBe('2026-07-29T18:00');
  });

  it('discards weather alerts that do not declare themselves as estimates', () => {
    const weather = validWeather();
    weather.alerts = [
      { id: 'oficial', kind: 'storm', severity: 'critical', measuredValue: '90%', windowLocal: null, isEstimate: false },
      { id: 'estimativa', kind: 'heavyRain', severity: 'warning', measuredValue: '30 mm', windowLocal: null, isEstimate: true }
    ] as never;
    const snapshot = snapshotOf({
      weather: { state: 'fresh', data: weather, fetchedAt: '2026-07-29T12:00:00Z' }
    });
    const alerts = snapshot?.weather.data?.alerts ?? [];
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe('heavyRain');
    expect(alerts.every((alert) => alert.isEstimate)).toBe(true);
  });

  it('accepts only timezone-qualified valid RFC3339 instants', () => {
    for (const invalid of ['2026-07-29', '2026-07-29T12:00:00', '2026-02-30T12:00:00Z', '2026-07-29T25:00:00Z']) {
      const snapshot = snapshotOf({
        generatedAt: invalid,
        news: { state: 'fresh', data: collection(), fetchedAt: invalid }
      });
      expect(snapshot?.generatedAt).toBeNull();
      expect(snapshot?.news).toEqual({ state: 'unavailable', data: null, fetchedAt: null });
    }
  });

  it('rejects section and article timestamps unreasonably far in the future', () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    const snapshot = snapshotOf({
      generatedAt: future,
      news: {
        state: 'fresh',
        fetchedAt: future,
        data: collection([article({ publishedAt: future, fetchedAt: future })])
      }
    });
    expect(snapshot?.generatedAt).toBeNull();
    expect(snapshot?.news).toEqual({ state: 'unavailable', data: null, fetchedAt: null });
  });

  it('drops ticker items without a trustworthy timestamp', () => {
    const base = {
      id: 'ptax-usd-brl', kind: 'currency', quoteKind: 'ptax', label: 'USD/BRL',
      value: 'R$ 5,1217', variation: null, providerName: 'Banco Central',
      cacheState: 'fresh', severity: 'neutral', detail: '29/07/2026'
    };
    const snapshot = snapshotOf({
      ticker: {
        state: 'fresh',
        fetchedAt: '2026-07-29T12:00:00Z',
        data: [
          { ...base, observedAt: 'nao e uma data' },
          { ...base, id: 'ptax-eur-brl', observedAt: '2026-07-29T12:00:00Z' }
        ]
      }
    });
    expect(snapshot?.ticker.data).toHaveLength(1);
    expect(snapshot?.ticker.data?.[0]?.id).toBe('ptax-eur-brl');
    expect(snapshot?.ticker.data?.[0]?.quoteKind).toBe('ptax');
  });

  it('preserves normalized cache warnings', () => {
    const snapshot = snapshotOf({ warnings: ['cacheWriteFailed', 'cacheReadFailed'] });
    expect(snapshot?.warnings).toEqual(['cacheWriteFailed', 'cacheReadFailed']);
  });

  it('uses the oldest visible section timestamp for consolidated status', () => {
    const snapshot = snapshotOf({
      generatedAt: '2026-07-29T12:05:00Z',
      weather: { state: 'fresh', data: validWeather(), fetchedAt: '2026-07-29T12:00:00Z' },
      news: { state: 'fresh', data: collection(), fetchedAt: '2026-07-29T11:30:00Z' }
    });
    expect(getRadarReferenceFetchedAt(snapshot)).toBe('2026-07-29T11:30:00Z');
  });

  it('normalizes an article preview and rejects one without a valid id', () => {
    const preview = normalizeRadarArticlePreview({
      ...article(),
      sourceAttribution: 'Agência Brasil — EBC',
      related: [article({ id: 'b'.repeat(64) })],
      canOpenExternally: true
    });
    expect(preview?.id).toBe(ARTICLE_ID);
    expect(preview?.canOpenExternally).toBe(true);
    expect(preview?.related).toHaveLength(1);
    expect(JSON.stringify(preview)).not.toContain('https://');

    expect(normalizeRadarArticlePreview({ ...article({ id: 'curto' }) })).toBeNull();
    expect(normalizeRadarArticlePreview(null)).toBeNull();
  });

  it('accepts local cached image data and rejects external image sources', () => {
    const localImage = 'data:image/jpeg;base64,/9j/4AAQ';
    const snapshot = snapshotOf({
      news: {
        state: 'fresh',
        data: collection([article({
          image: {
            id: ARTICLE_ID,
            width: 640,
            height: 360,
            aspectRatio: 640 / 360,
            dominantTone: 'cool',
            alt: 'Imagem de teste',
            dataUrl: localImage
          }
        })]),
        fetchedAt: '2026-07-29T12:00:00Z'
      }
    });
    expect(snapshot?.news.data?.lead?.image?.dataUrl).toBe(localImage);
    expect(normalizeRadarArticlePreview({
      ...article({
        image: {
          id: ARTICLE_ID,
          width: 640,
          height: 360,
          aspectRatio: 640 / 360,
          dominantTone: 'cool',
          alt: 'Imagem externa',
          dataUrl: 'https://example.com/image.jpg'
        }
      }),
      sourceAttribution: 'Fonte',
      related: [],
      canOpenExternally: false
    })?.image).toBeNull();
  });
});
