export const CONFIG = {
  LOCALE: 'pt-BR' as const,
  STORAGE_KEY: 'focus-dashboard-browser-preview',
  STATE_VERSION: 8,
  MAX_TASK_LENGTH: 180,
  TASKS_PER_PAGE: 6,
  EXCHANGE_API_URL: 'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL',
  RATE_REFRESH_MS: 60000,
  RATE_GOLD_USD_AT_OR_BELOW: 5.0,
  RATE_GOLD_EUR_BELOW: 6.0,
  RATE_REQUEST_TIMEOUT_MS: 8000,
  HISTORY_RETENTION_DAYS: 45,
  HISTORY_VIEW_DAYS: 7,
  FUTURE_VIEW_DAYS: 3650,
  CLOCK_TICK_MS: 1000,
  DAY_CHECK_MS: 30000,
  FULLSCREEN_CHECK_MS: 3000,
  SAVE_DEBOUNCE_MS: 500,
  MS_PER_DAY: 86400000,
  TASK_HIGHLIGHT_MS: 450,
  TOAST_TIMEOUT_MS: 4000,
  EXCHANGE_MAX_RETRIES: 3,
  EXCHANGE_RETRY_BASE_MS: 1000,
  ASSISTANT: {
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    // qwen3:8b measured both more accurate on multi-step tool sequences and
    // ~2.5x faster than qwen3:4b on this hardware (RX 7600, 8GB VRAM) — see
    // assistant.live.test.ts. Falls back down the list if not installed.
    model: 'qwen3:8b',
    modelPreferences: ['qwen3:8b', 'qwen3:4b', 'qwen2.5:3b', 'qwen2.5:1.5b'],
    temperature: 0.2,
    /**
     * Ollama defaults to 4096 and truncates from the front, which drops the
     * system prompt once the tool definitions and the state snapshot are added.
     */
    numCtx: 8192,
    healthTimeoutMs: 5000,
    streamIdleTimeoutMs: 60000,
    requestTimeoutMs: 180000,
    maxStreamBytes: 2 * 1024 * 1024,
    maxStreamLineBytes: 256 * 1024,
    maxToolRounds: 5,
    maxToolCallsPerRound: 8,
    maxToolCallsPerTurn: 12
  }
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
