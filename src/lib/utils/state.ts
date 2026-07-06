import { CONFIG, PRIORITY } from '../config.js';
import type { AppState } from '../types/app.js';
import { normalizeNeuralNotes } from './neural.js';

export function createDefaultState(): AppState {
  return {
    version: CONFIG.STATE_VERSION,
    tasksByDate: {},
    calendarEvents: [],
    neuralNotes: [],
    ratesCache: null,
    ratesBaseline: null,
    ui: {
      lastViewedBaseDate: '',
      viewOffsetDays: 0,
      calendarMonth: '',
      filesLastPath: '',
      filesFavorites: [],
      filesRecents: [],
      lastNeuralNoteId: null,
      theme: 'dark',
      locale: CONFIG.LOCALE,
      preferredMonitor: null
    }
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
    calendarEvents: normalizeCalendarEvents(candidate.calendarEvents),
    neuralNotes: normalizeNeuralNotes(candidate.neuralNotes),
    ratesCache: normalizeRatesCache(candidate.ratesCache),
    ratesBaseline: normalizeRatesBaseline(candidate.ratesBaseline),
    ui: {
      lastViewedBaseDate: typeof candidate.ui?.lastViewedBaseDate === 'string' ? candidate.ui.lastViewedBaseDate : '',
      viewOffsetDays: Number.isInteger(candidate.ui?.viewOffsetDays) ? candidate.ui.viewOffsetDays : 0,
      calendarMonth: normalizeMonthKey(candidate.ui?.calendarMonth) || '',
      preferredMonitor: Number.isInteger(candidate.ui?.preferredMonitor) ? candidate.ui.preferredMonitor : null,
      filesLastPath: typeof candidate.ui?.filesLastPath === 'string' ? candidate.ui.filesLastPath : '',
      filesFavorites: normalizePathList(candidate.ui?.filesFavorites, 12),
      filesRecents: normalizePathList(candidate.ui?.filesRecents, 10),
      lastNeuralNoteId:
        typeof candidate.ui?.lastNeuralNoteId === 'string' && candidate.ui.lastNeuralNoteId
          ? candidate.ui.lastNeuralNoteId
          : null,
      theme:
        candidate.ui?.theme === 'light' || candidate.ui?.theme === 'olive' || candidate.ui?.theme === 'dark'
          ? candidate.ui.theme
          : 'dark',
      locale: candidate.ui?.locale === 'en-US' ? 'en-US' : CONFIG.LOCALE
    }
  };
}

function normalizePathList(value, maxItems) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const next = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
    if (next.length >= maxItems) break;
  }
  return next;
}

export function normalizeTasksByDate(tbd) {
  const normalized = {};
  if (!tbd || typeof tbd !== 'object') return normalized;
  for (const dk of Object.keys(tbd)) {
    if (!normalizeDateKey(dk)) continue;
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
    createdAt,
    updatedAt: isValidIsoString(task.updatedAt) ? task.updatedAt : createdAt
  };
}

export function normalizeCalendarEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map(normalizeCalendarEvent).filter(Boolean);
}

export function normalizeCalendarEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const title = normalizeCalendarTitle(event.title);
  const dateKey = normalizeDateKey(event.dateKey);
  if (!title || !dateKey) return null;

  const startTime = normalizeTimeValue(event.startTime);
  const endTime = normalizeTimeValue(event.endTime);
  const createdAt = isValidIsoString(event.createdAt) ? event.createdAt : new Date().toISOString();

  return {
    id: typeof event.id === 'string' && event.id ? event.id : createId('event'),
    title,
    dateKey,
    startTime: startTime || undefined,
    endTime: endTime && (!startTime || endTime >= startTime) ? endTime : undefined,
    notes: normalizeCalendarNotes(event.notes) || undefined,
    color: normalizeCalendarColor(event.color),
    recurrence: normalizeCalendarRecurrence(event.recurrence),
    createdAt,
    updatedAt: isValidIsoString(event.updatedAt) ? event.updatedAt : createdAt
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

export function normalizeCalendarTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function normalizeCalendarNotes(notes) {
  return String(notes || '').trim().slice(0, 500);
}

export function normalizeCalendarColor(color) {
  return color === 'accent' || color === 'success' || color === 'danger' ? color : 'neutral';
}

export function normalizeCalendarRecurrence(recurrence) {
  return recurrence === 'weekly' || recurrence === 'monthly' || recurrence === 'yearly' ? recurrence : 'none';
}

export function normalizeDateKey(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '';
  const parsed = parseDateKey(dateKey);
  return !Number.isNaN(parsed.getTime()) && getLocalDateKey(parsed) === dateKey ? dateKey : '';
}

export function normalizeMonthKey(monthKey) {
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) return '';
  const month = Number(monthKey.slice(5, 7));
  return month >= 1 && month <= 12 ? monthKey : '';
}

export function normalizeTimeValue(time) {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '';
}

export function isValidIsoString(v) {
  return typeof v === 'string' && v !== '' && !Number.isNaN(new Date(v).getTime());
}

export function createId(prefix = 'task') {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function getLocalDateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** YYYY-MM from a local date key (YYYY-MM-DD). */
export function getMonthKeyFromDateKey(dateKey) {
  return typeof dateKey === 'string' ? dateKey.slice(0, 7) : '';
}

/** Parse YYYY-MM as local midnight (avoids UTC shift in month labels). */
export function parseMonthKey(monthKey) {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return new Date(Number.NaN);
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));
  return new Date(year, month - 1, 1);
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
  return { id: t.id, text: t.text, completed: t.completed, pinned: t.pinned, priority: t.priority, createdAt: t.createdAt, updatedAt: t.updatedAt };
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
