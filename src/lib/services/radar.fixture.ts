/**
 * Dados determinísticos para o preview web (`npm run dev` fora do Tauri).
 *
 * Nunca são usados no desktop: `createRadarService` só cai aqui quando
 * `isTauri()` é falso. O snapshot é marcado com `newsUsingStaleCache` para que a
 * origem fictícia fique visível na interface.
 */
import type {
  RadarArticlePreview,
  RadarArticleSummary,
  RadarImageRef,
  RadarLocation,
  RadarNewsCategory,
  RadarSnapshot,
  RadarWeatherDay,
  RadarWeatherHour
} from '../types/radar.js';

export const RADAR_FIXTURE_LOCATIONS: RadarLocation[] = [
  { id: 'fixture-sao-paulo', name: 'São Paulo', admin1: 'São Paulo', country: 'Brasil', countryCode: 'BR', latitude: -23.5505, longitude: -46.6333, timezone: 'America/Sao_Paulo' },
  { id: 'fixture-lisbon', name: 'Lisboa', admin1: 'Lisboa', country: 'Portugal', countryCode: 'PT', latitude: 38.7223, longitude: -9.1393, timezone: 'Europe/Lisbon' },
  { id: 'fixture-new-york', name: 'New York', admin1: 'New York', country: 'United States', countryCode: 'US', latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York' }
];

const FETCHED_AT = '2026-07-29T18:00:00.000Z';
const FIXTURE_IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** IDs precisam ter a forma de SHA-256 para passar pelo validador de ID opaco. */
function fixtureId(seed: number): string {
  return seed.toString(16).padStart(2, '0').repeat(32);
}

type FixtureSeed = {
  seed: number;
  category: RadarNewsCategory;
  title: string;
  summary: string;
  sourceId: string;
  sourceName: string;
  tags: string[];
};

function fixtureImage(entry: FixtureSeed): RadarImageRef {
  const dominantTone = entry.category === 'security' || entry.category === 'brasil'
    ? 'warm'
    : entry.category === 'technology' || entry.category === 'development'
      ? 'cool'
      : 'neutral';
  return {
    id: fixtureId(100 + entry.seed),
    width: 640,
    height: 360,
    aspectRatio: 16 / 9,
    dominantTone,
    alt: entry.title,
    dataUrl: FIXTURE_IMAGE_DATA_URL
  };
}

const FIXTURE_SEEDS: FixtureSeed[] = [
  {
    seed: 1,
    category: 'brasil',
    title: 'Exemplo de manchete nacional para o preview do Radar',
    summary: 'Conteúdo de demonstração usado apenas no preview web, fora do aplicativo desktop.',
    sourceId: 'fixture-brasil',
    sourceName: 'Fonte demonstrativa',
    tags: ['demonstração']
  },
  {
    seed: 2,
    category: 'technology',
    title: 'Exemplo de notícia de tecnologia',
    summary: 'Resumo fictício exibido apenas quando o Radar roda no navegador.',
    sourceId: 'fixture-technology',
    sourceName: 'Fonte demonstrativa',
    tags: ['demonstração']
  },
  {
    seed: 3,
    category: 'development',
    title: 'Exemplo de notícia de desenvolvimento',
    summary: 'Resumo fictício exibido apenas quando o Radar roda no navegador.',
    sourceId: 'fixture-development',
    sourceName: 'Fonte demonstrativa',
    tags: ['demonstração']
  },
  {
    seed: 4,
    category: 'security',
    title: 'Exemplo de alerta de segurança para demonstração',
    summary: 'Resumo fictício exibido apenas quando o Radar roda no navegador.',
    sourceId: 'fixture-security',
    sourceName: 'Fonte demonstrativa',
    tags: ['demonstração']
  }
];

function fixtureArticle(entry: FixtureSeed): RadarArticleSummary {
  return {
    id: fixtureId(entry.seed),
    sourceId: entry.sourceId,
    sourceName: entry.sourceName,
    category: entry.category,
    title: entry.title,
    summary: entry.summary,
    author: null,
    publishedAt: FETCHED_AT,
    fetchedAt: FETCHED_AT,
    image: fixtureImage(entry),
    tags: entry.tags,
    score: 0.5,
    relatedCount: 0,
    cacheState: 'fresh'
  };
}

function fixtureHours(): RadarWeatherHour[] {
  return Array.from({ length: 12 }, (_, index) => {
    const hour = 15 + index;
    const day = hour >= 24 ? 30 : 29;
    const localHour = hour % 24;
    return {
      localTime: `2026-07-${String(day).padStart(2, '0')}T${String(localHour).padStart(2, '0')}:00`,
      temperatureCelsius: 24 - index * 0.5,
      apparentTemperatureCelsius: 25 - index * 0.5,
      humidityPercent: 60 + index,
      precipitationProbabilityPercent: Math.min(95, 25 + index * 5),
      precipitationMm: index > 6 ? 1.2 : 0,
      windSpeedKmh: 10 + index,
      weatherCode: index < 3 ? 2 : 3,
      isCurrentHour: index === 0
    };
  });
}

function fixtureDays(): RadarWeatherDay[] {
  return Array.from({ length: 7 }, (_, index) => ({
    date: `2026-07-${String(29 + index).padStart(2, '0')}`,
    minimumCelsius: 17 + (index % 3),
    maximumCelsius: 26 + (index % 4),
    precipitationProbabilityPercent: 30 + index * 5,
    precipitationSumMm: index * 1.5,
    windSpeedMaxKmh: 20 + index,
    uvIndexMax: 6 + (index % 3),
    weatherCode: index % 2 === 0 ? 2 : 3,
    sunriseLocal: `2026-07-${String(29 + index).padStart(2, '0')}T06:42`,
    sunsetLocal: `2026-07-${String(29 + index).padStart(2, '0')}T17:43`
  })).map((day, index) =>
    // As datas acima passam de 31; normaliza para agosto quando necessário.
    29 + index > 31
      ? {
          ...day,
          date: `2026-08-${String(29 + index - 31).padStart(2, '0')}`,
          sunriseLocal: `2026-08-${String(29 + index - 31).padStart(2, '0')}T06:42`,
          sunsetLocal: `2026-08-${String(29 + index - 31).padStart(2, '0')}T17:43`
        }
      : day
  );
}

export function createRadarFixture(
  location: RadarLocation | null,
  categories: RadarNewsCategory[],
  selectedCategory: RadarNewsCategory | null = null
): RadarSnapshot {
  const visible = FIXTURE_SEEDS.filter(
    (entry) =>
      categories.includes(entry.category) &&
      (selectedCategory == null || entry.category === selectedCategory)
  ).map(fixtureArticle);

  const days = fixtureDays();
  const [today] = days;

  return {
    schemaVersion: 2,
    generatedAt: FETCHED_AT,
    weather: location
      ? {
          state: 'fresh' as const,
          fetchedAt: FETCHED_AT,
          data: {
            location,
            timezone: location.timezone,
            providerId: 'open-meteo',
            providerName: 'Open-Meteo',
            current: {
              observedAtLocal: '2026-07-29T15:00',
              temperatureCelsius: 24,
              apparentTemperatureCelsius: 25,
              humidityPercent: 65,
              precipitationProbabilityPercent: 30,
              precipitationMm: 0,
              rainMm: 0,
              windSpeedKmh: 12,
              windGustsKmh: 28,
              surfacePressureHpa: 1014,
              weatherCode: 2,
              isDay: true
            },
            today,
            hourly: fixtureHours(),
            daily: days,
            alerts: []
          }
        }
      : { state: 'unavailable' as const, data: null, fetchedAt: null },
    news: visible.length
      ? {
          state: 'stale' as const,
          fetchedAt: FETCHED_AT,
          data: {
            lead: visible[0] ?? null,
            featured: visible.slice(1, 3),
            list: visible.slice(3),
            totalAvailable: visible.length,
            hasMore: false,
            categoriesAvailable: [...new Set(visible.map((article) => article.category))]
          }
        }
      : { state: 'unavailable' as const, data: null, fetchedAt: null },
    ticker: { state: 'unavailable' as const, data: null, fetchedAt: null },
    providers: [],
    // `newsUsingStaleCache` deixa explícito na UI que o conteúdo não é real.
    warnings: location ? ['newsUsingStaleCache'] : ['newsUsingStaleCache', 'locationRequired']
  };
}

export function createRadarFixturePreview(articleId: string): RadarArticlePreview | null {
  const entry = FIXTURE_SEEDS.find((seed) => fixtureId(seed.seed) === articleId);
  if (!entry) return null;
  const article = fixtureArticle(entry);
  return {
    id: article.id,
    sourceId: article.sourceId,
    sourceName: article.sourceName,
    sourceAttribution: 'Conteúdo de demonstração do preview web',
    category: article.category,
    title: article.title,
    summary: article.summary,
    author: null,
    publishedAt: article.publishedAt,
    image: article.image,
    tags: article.tags,
    related: [],
    // O preview web não abre navegador: não há URL real por trás da fixture.
    canOpenExternally: false,
    cacheState: 'stale'
  };
}
