/**
 * Contratos do Radar (schema 2), espelhando `src-tauri/src/radar/models.rs`.
 *
 * Nenhum tipo aqui carrega URL externa: artigos são referenciados por `id`
 * opaco e abertos por `open_radar_article`.
 */

export const RADAR_SCHEMA_VERSION = 2;

export type RadarNewsCategory =
  | 'brasil'
  | 'technology'
  | 'development'
  | 'security'
  | 'business'
  | 'science'
  | 'world';

export const RADAR_CATEGORIES: readonly RadarNewsCategory[] = [
  'brasil',
  'technology',
  'development',
  'security',
  'business',
  'science',
  'world'
];

export type RadarCacheState = 'fresh' | 'stale' | 'unavailable';

export type RadarProviderDomain = 'weather' | 'news' | 'market' | 'events';

export type RadarProviderStateValue =
  | 'idle'
  | 'refreshing'
  | 'available'
  | 'stale'
  | 'cooldown'
  | 'failed'
  | 'disabled';

export type RadarWarningCode =
  | 'locationRequired'
  | 'weatherRefreshFailed'
  | 'weatherUsingStaleCache'
  | 'weatherUsingEmergencyCache'
  | 'newsRefreshFailed'
  | 'newsUsingStaleCache'
  | 'newsSourceUnavailable'
  | 'newsAllSourcesUnavailable'
  | 'tickerPartiallyUnavailable'
  | 'tickerUnavailable'
  | 'imagesUnavailable'
  | 'cacheReadFailed'
  | 'cacheWriteFailed'
  | 'cacheRecovered'
  | 'providerCooldown';

export type RadarSeverity = 'neutral' | 'info' | 'warning' | 'critical';

export type RadarImageTone = 'neutral' | 'warm' | 'cool' | 'olive';

export type RadarTickerKind = 'currency' | 'crypto' | 'weatherAlert' | 'event' | 'breakingNews';

/** `ptax` nunca pode ser apresentado como cotação ao vivo. */
export type RadarQuoteKind = 'ptax' | 'spot' | 'estimate' | 'event';

export type RadarLocation = {
  id: string;
  name: string;
  admin1: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type RadarPreferences = {
  location: RadarLocation | null;
  enabledCategories: RadarNewsCategory[];
  followedTopics: string[];
  blockedTopics: string[];
  preferredSources: string[];
  mutedSources: string[];
  tickerSymbols: string[];
};

export type RadarWeatherCurrent = {
  observedAtLocal: string;
  temperatureCelsius: number;
  apparentTemperatureCelsius: number;
  humidityPercent: number;
  precipitationProbabilityPercent: number | null;
  precipitationMm: number | null;
  rainMm: number | null;
  windSpeedKmh: number;
  windGustsKmh: number | null;
  surfacePressureHpa: number | null;
  weatherCode: number;
  isDay: boolean;
};

export type RadarWeatherDay = {
  date: string;
  minimumCelsius: number;
  maximumCelsius: number;
  precipitationProbabilityPercent: number | null;
  precipitationSumMm: number | null;
  windSpeedMaxKmh: number | null;
  uvIndexMax: number | null;
  weatherCode: number;
  sunriseLocal: string | null;
  sunsetLocal: string | null;
};

export type RadarWeatherHour = {
  localTime: string;
  temperatureCelsius: number;
  apparentTemperatureCelsius: number | null;
  humidityPercent: number | null;
  precipitationProbabilityPercent: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  weatherCode: number;
  isCurrentHour: boolean;
};

export type RadarWeatherAlertKind =
  | 'heavyRain'
  | 'storm'
  | 'strongWind'
  | 'highHeat'
  | 'intenseCold'
  | 'lowHumidity'
  | 'veryHighUv';

/**
 * Estimativa derivada da própria previsão. `isEstimate` é sempre `true` — a UI
 * precisa rotulá-la como estimativa, nunca como alerta oficial.
 */
export type RadarWeatherAlert = {
  id: string;
  kind: RadarWeatherAlertKind;
  severity: RadarSeverity;
  measuredValue: string;
  windowLocal: string | null;
  isEstimate: boolean;
};

export type RadarWeather = {
  location: RadarLocation;
  timezone: string;
  providerId: string;
  providerName: string;
  current: RadarWeatherCurrent;
  today: RadarWeatherDay;
  hourly: RadarWeatherHour[];
  daily: RadarWeatherDay[];
  alerts: RadarWeatherAlert[];
};

export type RadarImageRef = {
  id: string;
  width: number;
  height: number;
  aspectRatio: number;
  dominantTone: RadarImageTone;
  alt: string;
};

/** DTO de listagem. Deliberadamente **sem** `canonicalUrl`. */
export type RadarArticleSummary = {
  id: string;
  sourceId: string;
  sourceName: string;
  category: RadarNewsCategory;
  title: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  image: RadarImageRef | null;
  tags: string[];
  score: number;
  relatedCount: number;
  cacheState: RadarCacheState;
};

export type RadarArticlePreview = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceAttribution: string;
  category: RadarNewsCategory;
  title: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  image: RadarImageRef | null;
  tags: string[];
  related: RadarArticleSummary[];
  canOpenExternally: boolean;
  cacheState: RadarCacheState;
};

export type RadarNewsCollection = {
  lead: RadarArticleSummary | null;
  featured: RadarArticleSummary[];
  list: RadarArticleSummary[];
  totalAvailable: number;
  hasMore: boolean;
  categoriesAvailable: RadarNewsCategory[];
};

export type RadarTickerItem = {
  id: string;
  kind: RadarTickerKind;
  quoteKind: RadarQuoteKind;
  label: string;
  value: string;
  variation: number | null;
  observedAt: string;
  providerName: string;
  cacheState: RadarCacheState;
  severity: RadarSeverity;
  detail: string | null;
};

export type RadarProviderStatus = {
  providerId: string;
  displayName: string;
  domain: RadarProviderDomain;
  state: RadarProviderStateValue;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  errorCode: string | null;
};

export type RadarSection<T> = {
  state: RadarCacheState;
  data: T | null;
  fetchedAt: string | null;
};

export type RadarSnapshot = {
  schemaVersion: number;
  /** Momento em que o snapshot foi montado. Não representa a idade dos dados. */
  generatedAt: string | null;
  weather: RadarSection<RadarWeather>;
  news: RadarSection<RadarNewsCollection>;
  ticker: RadarSection<RadarTickerItem[]>;
  providers: RadarProviderStatus[];
  warnings: RadarWarningCode[];
};

export type RadarSnapshotRequest = {
  location: RadarLocation | null;
  categories: RadarNewsCategory[];
  selectedCategory?: RadarNewsCategory | null;
  mutedSources?: string[];
  blockedTopics?: string[];
  followedTopics?: string[];
  preferredSources?: string[];
  pageSize?: number | null;
};

export type RadarCacheScope = 'all' | 'news' | 'weather' | 'images' | 'market';

export type RadarRelativeTime = {
  unit: 'now' | 'minutes' | 'hours' | 'days';
  count: number;
};

/** Todos os artigos de uma coleção, na ordem editorial. */
export function collectionArticles(
  collection: RadarNewsCollection | null
): RadarArticleSummary[] {
  if (!collection) return [];
  return [
    ...(collection.lead ? [collection.lead] : []),
    ...collection.featured,
    ...collection.list
  ];
}
