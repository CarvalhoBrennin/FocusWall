export const CONFIG = {
  LOCALE: 'pt-BR',
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
  SAVE_DEBOUNCE_MS: 500
};

export const PRIORITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
export const VIEW = { TODAY: 0, YESTERDAY: -1 };
export const RATE_STATUS = { LIVE: 'live', UPDATING: 'updating', CACHED: 'cached', UNAVAILABLE: 'unavailable' };
export const PRIORITY_ORDER = [PRIORITY.MEDIUM, PRIORITY.HIGH, PRIORITY.LOW];

export function createFormatters(locale = CONFIG.LOCALE) {
  return {
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    shortTime: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }),
    longDate: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    historyDate: new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'short' }),
    rateNumber: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    percent: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })
  };
}

export const formatters = createFormatters(CONFIG.LOCALE);

export const ICONS = {
  moveUp: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14V4M9 4L5 8M9 4l4 4"/></svg>',
  moveDown: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v10M9 14l-4-4M9 14l4-4"/></svg>',
  delete: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h12M7 5V3a2 2 0 012-2h0a2 2 0 012 2v2M14 5v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5"/><path d="M7 9v4M11 9v4"/></svg>',
  edit: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 2.5a2.1 2.1 0 013 3L7 15l-4 1 1-4 9.5-9.5z"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="2"/><path d="M9 1v3.5M9 13.5V17M16.5 9h-3.5M4.5 9H1M14.5 4.5l-2.5 2.5M6 11l-2.5 2.5M14.5 13.5l-2.5-2.5M6 7L3.5 4.5"/></svg>'
};
