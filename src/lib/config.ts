export const CONFIG = {
  LOCALE: 'pt-BR' as const,
  STORAGE_KEY: 'focus-dashboard-browser-preview',
  STATE_VERSION: 5,
  MAX_TASK_LENGTH: 180,
  TASKS_PER_PAGE: 4,
  EXCHANGE_API_URL: 'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL',
  RATE_REFRESH_MS: 60000,
  RATE_GOLD_USD_AT_OR_BELOW: 5.0,
  RATE_GOLD_EUR_BELOW: 6.0,
  RATE_REQUEST_TIMEOUT_MS: 8000,
  HISTORY_RETENTION_DAYS: 45,
  HISTORY_VIEW_DAYS: 7,
  CLOCK_TICK_MS: 1000,
  DAY_CHECK_MS: 30000,
  FULLSCREEN_CHECK_MS: 3000,
  SAVE_DEBOUNCE_MS: 500,
  MS_PER_DAY: 86400000,
  TASK_HIGHLIGHT_MS: 450,
  TOAST_TIMEOUT_MS: 4000,
  EXCHANGE_MAX_RETRIES: 3,
  EXCHANGE_RETRY_BASE_MS: 1000
};

export const PRIORITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' } as const;
export const VIEW = { TODAY: 0, YESTERDAY: -1 } as const;
export const RATE_STATUS = {
  LIVE: 'live',
  UPDATING: 'updating',
  CACHED: 'cached',
  UNAVAILABLE: 'unavailable'
} as const;
export const PRIORITY_ORDER = [PRIORITY.MEDIUM, PRIORITY.HIGH, PRIORITY.LOW] as const;

export const formatters = {
  time: new Intl.DateTimeFormat(CONFIG.LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  shortTime: new Intl.DateTimeFormat(CONFIG.LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false }),
  longDate: new Intl.DateTimeFormat(CONFIG.LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  historyDate: new Intl.DateTimeFormat(CONFIG.LOCALE, { weekday: 'short', day: '2-digit', month: 'short' }),
  monthYear: new Intl.DateTimeFormat(CONFIG.LOCALE, { month: 'long', year: 'numeric' }),
  rateNumber: new Intl.NumberFormat(CONFIG.LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
};

export function rebuildFormatters(locale: string) {
  Object.assign(formatters, {
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    shortTime: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }),
    longDate: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    historyDate: new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'short' }),
    monthYear: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    rateNumber: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  });
}
