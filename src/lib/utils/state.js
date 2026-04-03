import { CONFIG, PRIORITY } from '../config.js';

export const DEFAULT_PREFERENCES = {
  appearance: {
    theme: 'system',
    density: 'comfortable'
  },
  locale: {
    code: 'pt-BR'
  },
  panel: {
    autoHideOnBlur: false,
    showSeconds: true
  },
  window: {
    layer: 'bottom',
    closeToTray: true
  }
};

function normalizePreferences(prefs) {
  const candidate = prefs && typeof prefs === 'object' ? prefs : {};
  const theme = candidate.appearance?.theme;
  const density = candidate.appearance?.density;
  const locale = candidate.locale?.code;
  const layer = candidate.window?.layer;

  return {
    appearance: {
      theme: theme === 'dark' || theme === 'light' || theme === 'system' ? theme : DEFAULT_PREFERENCES.appearance.theme,
      density: density === 'compact' || density === 'comfortable' ? density : DEFAULT_PREFERENCES.appearance.density
    },
    locale: {
      code: locale === 'en-US' || locale === 'pt-BR' ? locale : DEFAULT_PREFERENCES.locale.code
    },
    panel: {
      autoHideOnBlur: Boolean(candidate.panel?.autoHideOnBlur),
      showSeconds: candidate.panel?.showSeconds !== false
    },
    window: {
      layer: layer === 'top' || layer === 'normal' || layer === 'bottom' ? layer : DEFAULT_PREFERENCES.window.layer,
      closeToTray: candidate.window?.closeToTray !== false
    }
  };
}

export function createDefaultState() {
  return {
    version: CONFIG.STATE_VERSION,
    tasksByDate: {},
    ratesCache: null,
    ratesBaseline: null,
    ui: { lastViewedBaseDate: '', viewOffsetDays: 0, preferredMonitor: null, preferences: normalizePreferences() }
  };
}

function normalizeRatesBaseline(rb) {
  if (!rb || typeof rb !== 'object') return null;
  const dayKey = typeof rb.dayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rb.dayKey) ? rb.dayKey : null;
  const usd = Number(rb.usd);
  const eur = Number(rb.eur);
  if (!dayKey || !Number.isFinite(usd) || !Number.isFinite(eur)) return null;
  return { dayKey, usd, eur };
}

export function normalizeState(candidate) {
  if (!candidate || typeof candidate !== 'object') return createDefaultState();
  return {
    version: CONFIG.STATE_VERSION,
    tasksByDate: normalizeTasksByDate(candidate.tasksByDate),
    ratesCache: normalizeRatesCache(candidate.ratesCache),
    ratesBaseline: normalizeRatesBaseline(candidate.ratesBaseline),
    ui: {
      lastViewedBaseDate: typeof candidate.ui?.lastViewedBaseDate === 'string' ? candidate.ui.lastViewedBaseDate : '',
      viewOffsetDays: Number.isInteger(candidate.ui?.viewOffsetDays) ? candidate.ui.viewOffsetDays : 0,
      preferredMonitor: Number.isInteger(candidate.ui?.preferredMonitor) ? candidate.ui.preferredMonitor : null,
      preferences: normalizePreferences(candidate.ui?.preferences)
    }
  };
}

export function normalizeTasksByDate(tbd) {
  const normalized = {};
  if (!tbd || typeof tbd !== 'object') return normalized;
  for (const dk of Object.keys(tbd)) {
    const list = Array.isArray(tbd[dk]) ? tbd[dk] : [];
    normalized[dk] = list.map(normalizeTask).filter(Boolean);
  }
  return normalized;
}

export function normalizeTask(task) {
  if (!task || typeof task !== 'object') return null;
  const text = normalizeTaskText(task.text);
  if (!text) return null;
  const createdAt = isValidIsoString(task.createdAt) ? task.createdAt : new Date().toISOString();
  return {
    id: typeof task.id === 'string' && task.id ? task.id : createId(),
    text,
    completed: Boolean(task.completed),
    pinned: Boolean(task.pinned),
    priority: normalizePriority(task.priority),
    tags: normalizeTags(task.tags),
    dueDate: normalizeDueDate(task.dueDate),
    checklist: normalizeChecklist(task.checklist),
    inInbox: Boolean(task.inInbox),
    createdAt,
    updatedAt: isValidIsoString(task.updatedAt) ? task.updatedAt : createdAt
  };
}

export function normalizeRatesCache(rc) {
  if (!rc || typeof rc !== 'object') return null;
  const usd = Number(rc.usd);
  const eur = Number(rc.eur);
  if (!Number.isFinite(usd) || !Number.isFinite(eur)) return null;
  const parseOpt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    usd,
    eur,
    usdVarBid: parseOpt(rc.usdVarBid) ?? null,
    usdPctChange: parseOpt(rc.usdPctChange) ?? null,
    eurVarBid: parseOpt(rc.eurVarBid) ?? null,
    eurPctChange: parseOpt(rc.eurPctChange) ?? null,
    updatedAt: isValidIsoString(rc.updatedAt) ? rc.updatedAt : new Date().toISOString(),
    fetchedAt: isValidIsoString(rc.fetchedAt) ? rc.fetchedAt : new Date().toISOString()
  };
}

export function normalizePriority(p) {
  return p === PRIORITY.HIGH || p === PRIORITY.LOW ? p : PRIORITY.MEDIUM;
}

export function normalizeTaskText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, CONFIG.MAX_TASK_LENGTH);
}

export function isValidIsoString(v) {
  return typeof v === 'string' && v !== '' && !Number.isNaN(new Date(v).getTime());
}

export function createId() {
  return 'task-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function getLocalDateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function getBrazilDateKey(d) {
  try {
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return getLocalDateKey(d);
  }
}

export function parseDateKey(dk) {
  return new Date(dk + 'T00:00:00');
}

export function addDays(d, n) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function cloneTask(t) {
  return {
    id: t.id,
    text: t.text,
    completed: t.completed,
    pinned: t.pinned,
    priority: t.priority,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
  };
}

export function getPinnedCount(tasks) {
  let c = 0;
  for (let i = 0; i < tasks.length; i++) if (tasks[i].pinned) c++;
  return c;
}

export function findTaskIndex(tasks, id) {
  for (let i = 0; i < tasks.length; i++) if (tasks[i].id === id) return i;
  return -1;
}

export function getPriorityLabel(p) {
  if (p === PRIORITY.HIGH) return 'Alta';
  if (p === PRIORITY.LOW) return 'Baixa';
  return 'Média';
}

export function pruneTasksByRetention(tasksByDate, currentDateKey, retentionDays = CONFIG.HISTORY_RETENTION_DAYS) {
  const cutoff = getLocalDateKey(addDays(parseDateKey(currentDateKey), -retentionDays));
  const normalized = tasksByDate && typeof tasksByDate === 'object' ? tasksByDate : {};
  const next = {};
  for (const dk of Object.keys(normalized)) {
    if (dk >= cutoff) next[dk] = normalized[dk];
  }
  return next;
}
