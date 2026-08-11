import {
  RADAR_CATEGORIES,
  type RadarArticlePreview,
  type RadarArticleSummary,
  type RadarCacheState,
  type RadarImageRef,
  type RadarLocation,
  type RadarNewsCategory,
  type RadarNewsCollection,
  type RadarPreferences,
  type RadarProviderStatus,
  type RadarRelativeTime,
  type RadarSection,
  type RadarSnapshot,
  type RadarTickerItem,
  type RadarWeather,
  type RadarWeatherAlert,
  type RadarWeatherDay,
  type RadarWeatherHour,
  type RadarWarningCode
} from '../types/radar.js';

const CATEGORY_SET = new Set<string>(RADAR_CATEGORIES);

const WARNING_CODES = new Set<RadarWarningCode>([
  'locationRequired',
  'weatherRefreshFailed',
  'weatherUsingStaleCache',
  'weatherUsingEmergencyCache',
  'newsRefreshFailed',
  'newsUsingStaleCache',
  'newsSourceUnavailable',
  'newsAllSourcesUnavailable',
  'tickerPartiallyUnavailable',
  'tickerUnavailable',
  'imagesUnavailable',
  'cacheReadFailed',
  'cacheWriteFailed',
  'cacheRecovered',
  'providerCooldown'
]);

const ALERT_KINDS = new Set([
  'heavyRain',
  'storm',
  'strongWind',
  'highHeat',
  'intenseCold',
  'lowHumidity',
  'veryHighUv'
]);

const SEVERITIES = new Set(['neutral', 'info', 'warning', 'critical']);
const CACHE_STATES = new Set(['fresh', 'stale', 'unavailable']);
const TICKER_KINDS = new Set(['currency', 'crypto', 'weatherAlert', 'event', 'breakingNews']);
const QUOTE_KINDS = new Set(['ptax', 'spot', 'estimate', 'event']);
const PROVIDER_DOMAINS = new Set(['weather', 'news', 'market', 'events']);
const PROVIDER_STATES = new Set([
  'idle',
  'refreshing',
  'available',
  'stale',
  'cooldown',
  'failed',
  'disabled'
]);
const IMAGE_TONES = new Set(['neutral', 'warm', 'cool', 'olive']);
const MAX_IMAGE_DATA_URL_CHARS = 7_000_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(normalized).slice(0, max).join('');
}

function timezoneId(value: unknown): string {
  const normalized = text(value, 80);
  if (!normalized || normalized.includes('..') || normalized.startsWith('/') || normalized.endsWith('/')) return '';
  return /^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(normalized) ? normalized : '';
}

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function optionalFinite(value: unknown, min: number, max: number): number | null {
  return value == null ? null : finite(value, min, max);
}

function timestamp(value: unknown, max = 80): string | null {
  const normalized = text(value, max);
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(normalized);
  if (!match) return null;
  const [, year, month, day] = match;
  const calendarDate = new Date(Date.UTC(+year, +month - 1, +day));
  if (calendarDate.getUTCFullYear() !== +year || calendarDate.getUTCMonth() !== +month - 1 || calendarDate.getUTCDate() !== +day) {
    return null;
  }
  return Number.isFinite(Date.parse(normalized)) ? normalized : null;
}

function boundedTimestamp(value: unknown, maxFutureMs = 5 * 60_000): string | null {
  const normalized = timestamp(value);
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return parsed <= Date.now() + maxFutureMs ? normalized : null;
}

function localDateTime(value: unknown): string | null {
  const normalized = text(value, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const parsed = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  return parsed.getUTCFullYear() === +year && parsed.getUTCMonth() === +month - 1 && parsed.getUTCDate() === +day &&
    parsed.getUTCHours() === +hour && parsed.getUTCMinutes() === +minute && parsed.getUTCSeconds() === +second
    ? normalized
    : null;
}

function dateOnly(value: unknown): string | null {
  const normalized = text(value, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(+year, +month - 1, +day));
  return parsed.getUTCFullYear() === +year && parsed.getUTCMonth() === +month - 1 && parsed.getUTCDate() === +day
    ? normalized
    : null;
}

function member<T extends string>(value: unknown, allowed: Set<string>): T | null {
  return typeof value === 'string' && allowed.has(value) ? (value as T) : null;
}

function stringList(value: unknown, max: number, maxLength = 40): string[] {
  const source = Array.isArray(value) ? value : [];
  const result: string[] = [];
  for (const entry of source) {
    const cleaned = text(entry, maxLength).toLocaleLowerCase();
    if (cleaned && !result.includes(cleaned)) result.push(cleaned);
    if (result.length >= max) break;
  }
  return result;
}

/**
 * O identificador de artigo é um SHA-256 em hexadecimal. Recusar qualquer outra
 * forma impede que um valor inesperado chegue aos comandos por ID.
 */
export function isRadarOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function normalizeRadarCategories(value: unknown): RadarNewsCategory[] {
  const source = Array.isArray(value) ? value : [];
  const normalized: RadarNewsCategory[] = [];
  for (const item of source) {
    if (typeof item === 'string' && CATEGORY_SET.has(item) && !normalized.includes(item as RadarNewsCategory)) {
      normalized.push(item as RadarNewsCategory);
    }
  }
  return normalized.length ? normalized : [...RADAR_CATEGORIES];
}

export function normalizeRadarLocation(value: unknown): RadarLocation | null {
  const candidate = record(value);
  if (!candidate) return null;
  const latitude = finite(candidate.latitude, -90, 90);
  const longitude = finite(candidate.longitude, -180, 180);
  const name = text(candidate.name, 100);
  const country = text(candidate.country, 100);
  const timezone = timezoneId(candidate.timezone);
  if (latitude == null || longitude == null || !name || !country || !timezone) return null;
  const countryCode = text(candidate.countryCode, 3).toUpperCase();
  const id = text(candidate.id, 120) || `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const admin1 = text(candidate.admin1, 100) || null;
  return { id, name, admin1, country, countryCode, latitude, longitude, timezone };
}

export function normalizeRadarPreferences(value: unknown): RadarPreferences {
  const candidate = record(value);
  return {
    location: normalizeRadarLocation(candidate?.location),
    enabledCategories: normalizeRadarCategories(candidate?.enabledCategories),
    followedTopics: stringList(candidate?.followedTopics, 24),
    blockedTopics: stringList(candidate?.blockedTopics, 24),
    preferredSources: stringList(candidate?.preferredSources, 16, 80),
    mutedSources: stringList(candidate?.mutedSources, 16, 80),
    tickerSymbols: stringList(candidate?.tickerSymbols, 12, 24)
  };
}

// ---------------------------------------------------------------------------
// Clima
// ---------------------------------------------------------------------------

function normalizeDay(value: unknown): RadarWeatherDay | null {
  const day = record(value);
  if (!day) return null;
  const date = dateOnly(day.date);
  const minimumCelsius = finite(day.minimumCelsius, -100, 70);
  const maximumCelsius = finite(day.maximumCelsius, -100, 70);
  const weatherCode = integer(day.weatherCode, 0, 999);
  if (!date || minimumCelsius == null || maximumCelsius == null || weatherCode == null) return null;
  if (minimumCelsius > maximumCelsius) return null;
  return {
    date,
    minimumCelsius,
    maximumCelsius,
    precipitationProbabilityPercent: optionalFinite(day.precipitationProbabilityPercent, 0, 100),
    precipitationSumMm: optionalFinite(day.precipitationSumMm, 0, 2000),
    windSpeedMaxKmh: optionalFinite(day.windSpeedMaxKmh, 0, 700),
    uvIndexMax: optionalFinite(day.uvIndexMax, 0, 20),
    weatherCode,
    sunriseLocal: day.sunriseLocal == null ? null : localDateTime(day.sunriseLocal),
    sunsetLocal: day.sunsetLocal == null ? null : localDateTime(day.sunsetLocal)
  };
}

function normalizeHour(value: unknown): RadarWeatherHour | null {
  const hour = record(value);
  if (!hour) return null;
  const localTime = localDateTime(hour.localTime);
  const temperatureCelsius = finite(hour.temperatureCelsius, -100, 70);
  const weatherCode = integer(hour.weatherCode, 0, 999);
  if (!localTime || temperatureCelsius == null || weatherCode == null) return null;
  return {
    localTime,
    temperatureCelsius,
    apparentTemperatureCelsius: optionalFinite(hour.apparentTemperatureCelsius, -100, 80),
    humidityPercent: optionalFinite(hour.humidityPercent, 0, 100),
    precipitationProbabilityPercent: optionalFinite(hour.precipitationProbabilityPercent, 0, 100),
    precipitationMm: optionalFinite(hour.precipitationMm, 0, 1000),
    windSpeedKmh: optionalFinite(hour.windSpeedKmh, 0, 500),
    weatherCode,
    isCurrentHour: hour.isCurrentHour === true
  };
}

function normalizeAlert(value: unknown): RadarWeatherAlert | null {
  const alert = record(value);
  if (!alert) return null;
  const kind = member<RadarWeatherAlert['kind']>(alert.kind, ALERT_KINDS);
  const severity = member<RadarWeatherAlert['severity']>(alert.severity, SEVERITIES);
  if (!kind || !severity) return null;
  // Um alerta que não se declare estimativa é descartado: o Radar nunca exibe
  // alerta oficial, então esse payload só poderia vir de contrato divergente.
  if (alert.isEstimate !== true) return null;
  return {
    id: text(alert.id, 60) || kind,
    kind,
    severity,
    measuredValue: text(alert.measuredValue, 40),
    windowLocal: alert.windowLocal == null ? null : text(alert.windowLocal, 40) || null,
    isEstimate: true
  };
}

function normalizeWeather(value: unknown): RadarWeather | null {
  const candidate = record(value);
  const current = record(candidate?.current);
  const location = normalizeRadarLocation(candidate?.location);
  if (!candidate || !current || !location) return null;

  const observedAtLocal = localDateTime(current.observedAtLocal);
  const temperatureCelsius = finite(current.temperatureCelsius, -100, 70);
  const apparentTemperatureCelsius = finite(current.apparentTemperatureCelsius, -100, 80);
  const humidityPercent = finite(current.humidityPercent, 0, 100);
  const windSpeedKmh = finite(current.windSpeedKmh, 0, 500);
  const weatherCode = integer(current.weatherCode, 0, 999);
  const isDay = typeof current.isDay === 'boolean' ? current.isDay : null;
  const today = normalizeDay(candidate.today);

  if (!observedAtLocal || temperatureCelsius == null || apparentTemperatureCelsius == null ||
      humidityPercent == null || windSpeedKmh == null || weatherCode == null || isDay == null || !today) {
    return null;
  }

  const hourly = (Array.isArray(candidate.hourly) ? candidate.hourly : [])
    .map(normalizeHour)
    .filter((entry): entry is RadarWeatherHour => entry !== null)
    .sort((left, right) => left.localTime.localeCompare(right.localTime))
    .filter((entry, index, entries) => index === 0 || entry.localTime !== entries[index - 1]?.localTime)
    .slice(0, 24);

  const daily = (Array.isArray(candidate.daily) ? candidate.daily : [])
    .map(normalizeDay)
    .filter((entry): entry is RadarWeatherDay => entry !== null)
    .sort((left, right) => left.date.localeCompare(right.date))
    .filter((entry, index, entries) => index === 0 || entry.date !== entries[index - 1]?.date)
    .slice(0, 7);

  return {
    location,
    timezone: timezoneId(candidate.timezone) || location.timezone,
    providerId: text(candidate.providerId, 60) || 'open-meteo',
    providerName: text(candidate.providerName, 60) || 'Open-Meteo',
    current: {
      observedAtLocal,
      temperatureCelsius,
      apparentTemperatureCelsius,
      humidityPercent,
      precipitationProbabilityPercent: optionalFinite(current.precipitationProbabilityPercent, 0, 100),
      precipitationMm: optionalFinite(current.precipitationMm, 0, 1000),
      rainMm: optionalFinite(current.rainMm, 0, 1000),
      windSpeedKmh,
      windGustsKmh: optionalFinite(current.windGustsKmh, 0, 700),
      surfacePressureHpa: optionalFinite(current.surfacePressureHpa, 500, 1200),
      weatherCode,
      isDay
    },
    today,
    hourly,
    daily: daily.length ? daily : [today],
    alerts: (Array.isArray(candidate.alerts) ? candidate.alerts : [])
      .map(normalizeAlert)
      .filter((entry): entry is RadarWeatherAlert => entry !== null)
      .slice(0, 6)
  };
}

// ---------------------------------------------------------------------------
// Notícias
// ---------------------------------------------------------------------------

function normalizeImage(value: unknown): RadarImageRef | null {
  const image = record(value);
  if (!image) return null;
  const id = text(image.id, 120);
  const width = integer(image.width, 1, 20000);
  const height = integer(image.height, 1, 20000);
  const tone = member<RadarImageRef['dominantTone']>(image.dominantTone, IMAGE_TONES);
  const dataUrl = typeof image.dataUrl === 'string' &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl) &&
    image.dataUrl.length <= MAX_IMAGE_DATA_URL_CHARS
    ? image.dataUrl
    : null;
  if (!id || width == null || height == null || !tone || !dataUrl) return null;
  return {
    id,
    width,
    height,
    aspectRatio: finite(image.aspectRatio, 0.1, 10) ?? width / height,
    dominantTone: tone,
    alt: text(image.alt, 240),
    dataUrl
  };
}

export function normalizeRadarArticle(value: unknown): RadarArticleSummary | null {
  const item = record(value);
  if (!item) return null;
  const id = item.id;
  const category = member<RadarNewsCategory>(item.category, CATEGORY_SET);
  const title = text(item.title, 240);
  const sourceId = text(item.sourceId, 80);
  const sourceName = text(item.sourceName, 100);
  const fetchedAt = boundedTimestamp(item.fetchedAt);
  const cacheState = member<RadarCacheState>(item.cacheState, CACHE_STATES);
  if (!isRadarOpaqueId(id) || !category || !title || !sourceId || !sourceName || !fetchedAt || !cacheState) {
    return null;
  }
  return {
    id,
    sourceId,
    sourceName,
    category,
    title,
    summary: text(item.summary, 400) || null,
    author: text(item.author, 120) || null,
    publishedAt: item.publishedAt == null ? null : boundedTimestamp(item.publishedAt),
    fetchedAt,
    image: normalizeImage(item.image),
    tags: stringList(item.tags, 6),
    score: finite(item.score, 0, 1) ?? 0,
    relatedCount: integer(item.relatedCount, 0, 999) ?? 0,
    cacheState
  };
}

function normalizeNewsCollection(value: unknown): RadarNewsCollection | null {
  const candidate = record(value);
  if (!candidate) return null;

  const seen = new Set<string>();
  const unique = (entry: RadarArticleSummary | null): entry is RadarArticleSummary => {
    if (!entry || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  };

  const lead = normalizeRadarArticle(candidate.lead);
  const leadArticle = unique(lead) ? lead : null;
  const featured = (Array.isArray(candidate.featured) ? candidate.featured : [])
    .map(normalizeRadarArticle)
    .filter(unique)
    .slice(0, 6);
  const list = (Array.isArray(candidate.list) ? candidate.list : [])
    .map(normalizeRadarArticle)
    .filter(unique)
    .slice(0, 200);

  const delivered = (leadArticle ? 1 : 0) + featured.length + list.length;
  if (delivered === 0) return null;

  return {
    lead: leadArticle,
    featured,
    list,
    // O backend nunca deve anunciar mais do que entregou; se isso acontecer,
    // preferimos exibir o número real a propagar a inconsistência.
    totalAvailable: Math.max(integer(candidate.totalAvailable, 0, 100000) ?? delivered, delivered),
    hasMore: candidate.hasMore === true,
    categoriesAvailable: normalizeRadarCategories(candidate.categoriesAvailable)
  };
}

// ---------------------------------------------------------------------------
// Ticker e providers
// ---------------------------------------------------------------------------

function normalizeTickerItem(value: unknown): RadarTickerItem | null {
  const item = record(value);
  if (!item) return null;
  const id = text(item.id, 80);
  const kind = member<RadarTickerItem['kind']>(item.kind, TICKER_KINDS);
  const quoteKind = member<RadarTickerItem['quoteKind']>(item.quoteKind, QUOTE_KINDS);
  const cacheState = member<RadarCacheState>(item.cacheState, CACHE_STATES);
  const severity = member<RadarTickerItem['severity']>(item.severity, SEVERITIES);
  const label = text(item.label, 40);
  const displayValue = text(item.value, 60);
  // Sem timestamp confiável o item não entra: melhor omitir do que exibir um
  // dado que o usuário não consegue situar no tempo.
  const observedAt = boundedTimestamp(item.observedAt);
  if (!id || !kind || !quoteKind || !cacheState || !severity || !label || !displayValue || !observedAt) {
    return null;
  }
  if (cacheState === 'unavailable') return null;
  return {
    id,
    kind,
    quoteKind,
    label,
    value: displayValue,
    variation: optionalFinite(item.variation, -1000, 1000),
    observedAt,
    providerName: text(item.providerName, 60),
    cacheState,
    severity,
    detail: text(item.detail, 120) || null
  };
}

function normalizeTicker(value: unknown): RadarTickerItem[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const items = value
    .map(normalizeTickerItem)
    .filter((entry): entry is RadarTickerItem => entry !== null)
    .filter((entry) => !seen.has(entry.id) && Boolean(seen.add(entry.id)))
    .slice(0, 12);
  return items.length ? items : null;
}

function normalizeProvider(value: unknown): RadarProviderStatus | null {
  const item = record(value);
  if (!item) return null;
  const providerId = text(item.providerId, 60);
  const domain = member<RadarProviderStatus['domain']>(item.domain, PROVIDER_DOMAINS);
  const state = member<RadarProviderStatus['state']>(item.state, PROVIDER_STATES);
  if (!providerId || !domain || !state) return null;
  return {
    providerId,
    displayName: text(item.displayName, 80) || providerId,
    domain,
    state,
    lastSuccessAt: item.lastSuccessAt == null ? null : boundedTimestamp(item.lastSuccessAt),
    lastAttemptAt: item.lastAttemptAt == null ? null : boundedTimestamp(item.lastAttemptAt),
    // O próximo horário de tentativa é intencionalmente no futuro.
    nextAttemptAt: item.nextAttemptAt == null ? null : timestamp(item.nextAttemptAt),
    errorCode: text(item.errorCode, 40) || null
  };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

function normalizeSection<T>(value: unknown, normalizeData: (value: unknown) => T | null): RadarSection<T> {
  const candidate = record(value);
  const state = candidate?.state === 'fresh' || candidate?.state === 'stale' ? candidate.state : 'unavailable';
  const data = normalizeData(candidate?.data);
  const fetchedAt = data == null ? null : boundedTimestamp(candidate?.fetchedAt);
  if (data == null || fetchedAt == null || state === 'unavailable') {
    return { state: 'unavailable', data: null, fetchedAt: null };
  }
  return { state, data, fetchedAt };
}

export function normalizeRadarSnapshot(value: unknown): RadarSnapshot | null {
  const candidate = record(value);
  if (!candidate) return null;
  const warnings = (Array.isArray(candidate.warnings) ? candidate.warnings : [])
    .filter((warning): warning is RadarWarningCode => WARNING_CODES.has(warning as RadarWarningCode));
  return {
    schemaVersion: integer(candidate.schemaVersion, 1, 99) ?? 0,
    generatedAt: boundedTimestamp(candidate.generatedAt),
    weather: normalizeSection(candidate.weather, normalizeWeather),
    news: normalizeSection(candidate.news, normalizeNewsCollection),
    ticker: normalizeSection(candidate.ticker, normalizeTicker),
    providers: (Array.isArray(candidate.providers) ? candidate.providers : [])
      .map(normalizeProvider)
      .filter((entry): entry is RadarProviderStatus => entry !== null)
      .slice(0, 32),
    warnings: [...new Set(warnings)]
  };
}

export function normalizeRadarArticlePreview(value: unknown): RadarArticlePreview | null {
  const item = record(value);
  if (!item) return null;
  const id = item.id;
  const category = member<RadarNewsCategory>(item.category, CATEGORY_SET);
  const title = text(item.title, 240);
  const sourceName = text(item.sourceName, 100);
  const cacheState = member<RadarCacheState>(item.cacheState, CACHE_STATES);
  if (!isRadarOpaqueId(id) || !category || !title || !sourceName || !cacheState) return null;
  return {
    id,
    sourceId: text(item.sourceId, 80),
    sourceName,
    sourceAttribution: text(item.sourceAttribution, 200),
    category,
    title,
    summary: text(item.summary, 900) || null,
    author: text(item.author, 120) || null,
    publishedAt: item.publishedAt == null ? null : boundedTimestamp(item.publishedAt),
    image: normalizeImage(item.image),
    tags: stringList(item.tags, 6),
    related: (Array.isArray(item.related) ? item.related : [])
      .map(normalizeRadarArticle)
      .filter((entry): entry is RadarArticleSummary => entry !== null)
      .slice(0, 6),
    canOpenExternally: item.canOpenExternally === true,
    cacheState
  };
}

// ---------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------

export function weatherCodeToMessageKey(code: number): string {
  if (code === 0) return 'radar.condition.clear';
  if (code === 1) return 'radar.condition.mainlyClear';
  if (code === 2) return 'radar.condition.partlyCloudy';
  if (code === 3) return 'radar.condition.overcast';
  if (code === 45 || code === 48) return 'radar.condition.fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'radar.condition.drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'radar.condition.rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'radar.condition.snow';
  if ([80, 81, 82].includes(code)) return 'radar.condition.showers';
  if ([95, 96, 99].includes(code)) return 'radar.condition.thunderstorm';
  return 'radar.condition.unknown';
}

export function describeRadarRelativeTime(value: string | null, now = Date.now()): RadarRelativeTime | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const delta = now - time;
  if (delta < -5 * 60_000) return null;
  const minutes = Math.max(0, Math.floor(delta / 60000));
  if (minutes < 1) return { unit: 'now', count: 0 };
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.floor(hours / 24) };
}

export function getRadarReferenceFetchedAt(snapshot: RadarSnapshot | null): string | null {
  if (!snapshot) return null;
  const timestamps = [snapshot.weather.fetchedAt, snapshot.news.fetchedAt, snapshot.ticker.fetchedAt]
    .filter((value): value is string => value !== null)
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.time));
  if (!timestamps.length) return null;
  return timestamps.reduce((oldest, current) => (current.time < oldest.time ? current : oldest)).value;
}

export function formatRadarLocationLabel(location: RadarLocation | null): string {
  if (!location) return '';
  const parts = [location.name, location.admin1, location.country].filter((value): value is string => Boolean(value));
  return parts
    .filter((value, index) => parts.findIndex((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === index)
    .join(', ');
}
