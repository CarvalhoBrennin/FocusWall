import { writable, derived, get } from 'svelte/store';
import { CONFIG, VIEW, RATE_STATUS, PRIORITY_ORDER, formatters } from '../config.js';
import { storage } from '../services/storage.js';
import { startTimer, stopAllTimers } from '../services/timer.js';
import { fetchExchangeRates } from '../services/exchange.js';
import {
  createDefaultState,
  normalizeState,
  normalizeTaskText,
  normalizePriority,
  normalizeMonthKey,
  getLocalDateKey,
  getBrazilDateKey,
  parseDateKey,
  addDays,
  createId,
  cloneTask,
  getPinnedCount,
  findTaskIndex
} from '../utils/state.js';
import { ensureAbsolutePath } from '../utils/path.js';
import { applyTheme } from './theme-store.js';
import { setLocale } from '../i18n/index.js';
import { rebuildFormatters } from '../config.js';
import type { LocaleId, ThemeId, AppState, RateStatus } from '../types/app.js';

function ensureDateBucket(data, dk) {
  const tbd = { ...data.tasksByDate };
  if (!Array.isArray(tbd[dk])) tbd[dk] = [];
  return { ...data, tasksByDate: tbd };
}

function pruneHistory(data, currentDateKey) {
  const cutoff = getLocalDateKey(addDays(parseDateKey(currentDateKey), -CONFIG.HISTORY_RETENTION_DAYS));
  const tbd = { ...data.tasksByDate };
  for (const dk of Object.keys(tbd)) {
    if (dk < cutoff) delete tbd[dk];
  }
  return { ...data, tasksByDate: tbd };
}

export function getVisibleDateKey(currentDateKey, viewOffsetDays) {
  return getLocalDateKey(addDays(parseDateKey(currentDateKey), viewOffsetDays));
}

function getTasksByDate(data: import('../types/app.js').AppState, dk: string) {
  return Array.isArray(data.tasksByDate?.[dk]) ? data.tasksByDate[dk] : [];
}

/** Define ui.calendarMonth só quando ainda não há mês salvo (não força mês atual). */
function syncCalendarMonthIfStale(todayDateKey: string) {
  const currentMonth = todayDateKey.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(currentMonth)) return;

  const $data = get(data);
  const stored = normalizeMonthKey($data.ui?.calendarMonth) || '';
  if (!stored) {
    data.set({
      ...$data,
      ui: { ...$data.ui, calendarMonth: currentMonth }
    });
    persistStateDebounced();
  }
}

export const currentDateKey = writable(getLocalDateKey(new Date()));
export const viewOffsetDays = writable<number>(VIEW.TODAY);
export const editingTaskId = writable(null);
export const startupEnabled = writable(false);
export const appDataPath = writable('');
export const appStatusMessage = writable('Inicializando...');
export const appStatusVariant = writable(''); // 'live' | 'warning' | 'error'
export const bootstrapLoading = writable(true);
export const bootstrapError = writable('');
export const paused = writable(false);
export const data = writable<AppState>(createDefaultState());
export const prevRates = writable({ usd: null, eur: null });
export const ratesStatus = writable<RateStatus>(RATE_STATUS.UPDATING);
export const ratesMeta = writable('Buscando cotações...');
export const ratesCache = writable(null);
export const clockTime = writable('00:00:00');
export const clockNow = writable(new Date());
export const lastAddedTaskId = writable(/** @type {string | null} */ (null));

export const visibleDateKey = derived(
  [currentDateKey, viewOffsetDays],
  ([$currentDateKey, $viewOffsetDays]) => getVisibleDateKey($currentDateKey, $viewOffsetDays)
);

export const visibleTasks = derived(
  [data, visibleDateKey],
  ([$data, $visibleDateKey]) => getTasksByDate($data, $visibleDateKey)
);

/** Alinha o painel de execução ao dia escolhido no calendário (sem trocar de aba). */
export function setExecutionDateForDateKey(dateKey: string) {
  const target = parseDateKey(dateKey);
  if (Number.isNaN(target.getTime())) return;
  const current = parseDateKey(get(currentDateKey));
  const offset = Math.round((target.getTime() - current.getTime()) / CONFIG.MS_PER_DAY);
  const min = -(CONFIG.HISTORY_RETENTION_DAYS - 1);
  viewOffsetDays.set(Math.max(min, Math.min(VIEW.TODAY, offset)));
  editingTaskId.set(null);
  persistStateDebounced();
}

export const todayTasks = derived([data, currentDateKey], ([$data, $currentDateKey]) =>
  getTasksByDate($data, $currentDateKey)
);

export const ratesBaseline = derived(data, ($d) => $d?.ratesBaseline ?? null);

let ratesRequestId = 0;
let ratesInFlight = false;
let saveDebounceId = null;
let ratesTickCount = 0;

function buildRateMeta(iso, prefix) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? prefix + '.' : prefix + ' às ' + formatters.shortTime.format(d) + '.';
}

async function persistStateImmediate() {
  const $data = get(data);
  const $currentDateKey = get(currentDateKey);
  const $viewOffsetDays = get(viewOffsetDays);
  const updated = {
    ...$data,
    ui: {
      ...$data.ui,
      lastViewedBaseDate: $currentDateKey,
      viewOffsetDays: $viewOffsetDays
    }
  };
  await storage.saveState(updated);
  data.set(updated);
}

export function persistStateDebounced() {
  if (saveDebounceId) clearTimeout(saveDebounceId);
  saveDebounceId = setTimeout(() => {
    saveDebounceId = null;
    persistStateImmediate().catch(() => {
      appStatusMessage.set('Não foi possível salvar o estado local.');
      appStatusVariant.set('error');
    });
  }, CONFIG.SAVE_DEBOUNCE_MS);
}

export function setAppStatus(message, variant = '', path = '') {
  appStatusMessage.set(message);
  appStatusVariant.set(variant);
  if (path) appDataPath.set(path);
}

export function setViewOffset(offset: number, options: { maxHistoryDays?: number } = {}) {
  const span = options.maxHistoryDays ?? CONFIG.HISTORY_VIEW_DAYS;
  const min = -(span - 1);
  viewOffsetDays.set(Math.max(min, Math.min(VIEW.TODAY, Number(offset) || 0)));
  editingTaskId.set(null);
  persistStateDebounced();
}

export async function setPreferredMonitorPreference(preferredMonitor: number) {
  if (!Number.isInteger(preferredMonitor) || preferredMonitor < 0) return false;
  const $data = get(data);
  const nextData = {
    ...$data,
    ui: {
      ...$data.ui,
      preferredMonitor
    }
  };

  try {
    await storage.saveState(nextData);
    data.set(nextData);
    return true;
  } catch {
    setAppStatus('Não foi possível salvar a preferência de monitor.', 'error', get(appDataPath));
    return false;
  }
}

export async function setThemePreference(nextTheme: ThemeId) {
  applyTheme(nextTheme);
  const $data = get(data);
  const nextData = { ...$data, ui: { ...$data.ui, theme: nextTheme } };
  try {
    await storage.saveState(nextData);
    data.set(nextData);
    return true;
  } catch {
    setAppStatus('Não foi possível salvar o tema.', 'error', get(appDataPath));
    return false;
  }
}

export async function setLocalePreference(nextLocale: LocaleId) {
  setLocale(nextLocale);
  rebuildFormatters(nextLocale);
  const $data = get(data);
  const nextData = { ...$data, ui: { ...$data.ui, locale: nextLocale } };
  try {
    await storage.saveState(nextData);
    data.set(nextData);
    return true;
  } catch {
    setAppStatus('Não foi possível salvar o idioma.', 'error', get(appDataPath));
    return false;
  }
}

export function setClockTime(now: Date) {
  clockNow.set(now);
  clockTime.set(formatters.time.format(now));
}

export function exportStateBackup() {
  const payload = JSON.stringify(get(data), null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const stamp = getLocalDateKey(new Date());
  anchor.href = url;
  anchor.download = `focus-dashboard-backup-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function setFilesLastPath(path: string) {
  if (typeof path !== 'string' || !path.trim()) return;
  const absolute = ensureAbsolutePath(path) || path.trim();
  const $data = get(data);
  const nextData = {
    ...$data,
    ui: {
      ...$data.ui,
      filesLastPath: absolute
    }
  };
  try {
    await storage.saveState(nextData);
    data.set(nextData);
  } catch {
    setAppStatus('Não foi possível salvar o último diretório.', 'error', get(appDataPath));
  }
}

export function bootstrapApp() {
  return (async () => {
    bootstrapLoading.set(true);
    bootstrapError.set('');
    try {
      const raw = await storage.loadState();
      const loaded = normalizeState(raw);
      if (!loaded || typeof loaded !== 'object' || !loaded.tasksByDate) {
        throw new Error('Estado local inválido ou corrompido.');
      }

      const $currentDateKey = getLocalDateKey(new Date());
      currentDateKey.set($currentDateKey);
      viewOffsetDays.set(VIEW.TODAY);
      let d = ensureDateBucket(loaded, $currentDateKey);
      d = pruneHistory(d, $currentDateKey);
      data.set(d);
      syncCalendarMonthIfStale($currentDateKey);
      applyTheme(d.ui.theme ?? 'dark');
      const bootLocale = d.ui.locale ?? 'pt-BR';
      setLocale(bootLocale);
      rebuildFormatters(bootLocale);

      if (d.ratesCache) {
        prevRates.set({ usd: d.ratesCache.usd, eur: d.ratesCache.eur });
        ratesCache.set(d.ratesCache);
        ratesStatus.set(RATE_STATUS.CACHED);
        ratesMeta.set(buildRateMeta(d.ratesCache.updatedAt, 'Mostrando cache'));
      }

      if (storage.mode === 'tauri') {
        const path = await storage.getAppDataPath();
        const startupIsEnabled = Boolean(await storage.getLaunchOnStartup());
        startupEnabled.set(startupIsEnabled);
        if (startupIsEnabled) {
          startupEnabled.set(Boolean(await storage.syncLaunchOnStartup()));
        }
        appDataPath.set(path);
        setAppStatus('Dados salvos no app desktop.', 'live', path);
      } else {
        setAppStatus('Modo navegador: usando armazenamento local para pré-visualização.', 'warning');
      }
    } catch (err) {
      const def = createDefaultState();
      const $currentDateKey = getLocalDateKey(new Date());
      const d = ensureDateBucket(def, $currentDateKey);
      data.set(d);
      applyTheme(d.ui.theme);
      bootstrapError.set(String(err?.message || err));
      setAppStatus('Falha ao carregar o estado local. Um estado vazio foi restaurado.', 'error');
    } finally {
      bootstrapLoading.set(false);
    }
  })();
}

export function startAllTimers(onClockTick, onDayCheck, onRatesTick, onFullscreenCheck, updateRates) {
  startTimer('clock', CONFIG.CLOCK_TICK_MS, onClockTick);
  startTimer('day', CONFIG.DAY_CHECK_MS, onDayCheck);
  startTimer('rates', CONFIG.RATE_REFRESH_MS, () => {
    if (ratesTickCount++ === 0) return;
    onRatesTick();
  });
  startTimer('fullscreen', CONFIG.FULLSCREEN_CHECK_MS, onFullscreenCheck);
  updateRates();
}

export function stopAllAppTimers() {
  stopAllTimers();
}

export async function updateExchangeRates(options: { force?: boolean; silent?: boolean } = {}) {
  const $paused = get(paused);
  if ($paused) return;
  if (ratesInFlight && !options.force) return;

  const rid = ++ratesRequestId;
  const $data = get(data);
  const cached = $data.ratesCache;

  const hasDisplayableRates = cached && Number.isFinite(cached.usd) && Number.isFinite(cached.eur);
  const showUpdatingUi = !hasDisplayableRates && !options.silent;

  if (showUpdatingUi) {
    ratesStatus.set(RATE_STATUS.UPDATING);
    ratesMeta.set(
      cached
        ? buildRateMeta(cached.updatedAt, 'Atualizando a partir do último cache')
        : 'Buscando cotações mais recentes...'
    );
  }

  ratesInFlight = true;
  const controller = new AbortController();

  try {
    const fresh = await fetchExchangeRates(controller);
    if (rid !== ratesRequestId) return;
    const before = get(ratesCache);
    if (before && Number.isFinite(before.usd) && Number.isFinite(before.eur)) {
      prevRates.set({ usd: before.usd, eur: before.eur });
    }
    const todayBR = getBrazilDateKey(new Date());
    const currentBaseline = $data.ratesBaseline;
    const shouldSetBaseline =
      !currentBaseline || currentBaseline.dayKey !== todayBR;
    const nextData = {
      ...$data,
      ratesCache: fresh,
      ratesBaseline: shouldSetBaseline
        ? { dayKey: todayBR, usd: fresh.usd, eur: fresh.eur }
        : currentBaseline
    };
    data.set(nextData);
    await storage.saveState(nextData);
    ratesCache.set(fresh);
    ratesStatus.set(RATE_STATUS.LIVE);
    ratesMeta.set(buildRateMeta(fresh.updatedAt, 'Atualizado'));
  } catch {
    if (rid !== ratesRequestId) return;
    ratesCache.set(cached);
    ratesStatus.set(cached ? RATE_STATUS.CACHED : RATE_STATUS.UNAVAILABLE);
    ratesMeta.set(
      cached ? buildRateMeta(cached.updatedAt, 'Mostrando cache') : 'Cotações indisponíveis no momento.'
    );
  } finally {
    ratesInFlight = false;
  }
}

export function abortRatesFetch() {
  ratesRequestId += 1;
}

export function onDayChange() {
  const next = getLocalDateKey(new Date());
  const $current = get(currentDateKey);
  if (next === $current) return;

  const monthChanged = next.slice(0, 7) !== $current.slice(0, 7);
  currentDateKey.set(next);
  viewOffsetDays.set(VIEW.TODAY);
  editingTaskId.set(null);
  const $data = get(data);
  let d = ensureDateBucket($data, next);
  d = pruneHistory(d, next);
  data.set(d);
  if (monthChanged) {
    syncCalendarMonthIfStale(next);
  }
  persistStateDebounced();
}

export function onFullscreenPause(shouldPause) {
  if (shouldPause) {
    paused.set(true);
    abortRatesFetch();
  } else {
    paused.set(false);
    updateExchangeRates({ silent: true });
  }
}

export async function addTask(text, priority) {
  const t = normalizeTaskText(text);
  if (!t) return null;

  const $data = get(data);
  const $current = get(currentDateKey);
  const $viewOffset = get(viewOffsetDays);
  const dk = getVisibleDateKey($current, $viewOffset);
  const tasks = getTasksByDate($data, dk).map(cloneTask);
  const now = new Date().toISOString();
  const newTask = {
    id: createId(),
    text: t,
    completed: false,
    pinned: false,
    priority: normalizePriority(priority),
    createdAt: now,
    updatedAt: now
  };

  tasks.splice(getPinnedCount(tasks), 0, newTask);
  const tbd = { ...$data.tasksByDate, [dk]: tasks };
  const nextData = {
    ...$data,
    tasksByDate: tbd
  };

  try {
    await storage.saveState(nextData);
    data.set(nextData);
    setAppStatus('Tarefa salva localmente.', 'live', get(appDataPath));
    lastAddedTaskId.set(newTask.id);
    setTimeout(() => lastAddedTaskId.update((id) => (id === newTask.id ? null : id)), CONFIG.TASK_HIGHLIGHT_MS);
    return newTask.id;
  } catch {
    return null;
  }
}

export async function updateTask(taskId, updater) {
  const $data = get(data);
  const $current = get(currentDateKey);
  const $viewOffset = get(viewOffsetDays);
  const dk = getVisibleDateKey($current, $viewOffset);
  const tasks = getTasksByDate($data, dk).map(cloneTask);
  const prev = [...tasks];

  let changed = false;
  const next = tasks.map((t) => {
    if (t.id !== taskId) return t;
    const c = cloneTask(t);
    updater(c);
    changed = true;
    return c;
  });

  if (!changed) return;
  const nextData = { ...$data, tasksByDate: { ...$data.tasksByDate, [dk]: next } };
  try {
    await storage.saveState(nextData);
    data.set(nextData);
  } catch {
    data.set({ ...$data, tasksByDate: { ...$data.tasksByDate, [dk]: prev } });
  }
}

export async function updateVisibleTaskList(mutator) {
  const $data = get(data);
  const $current = get(currentDateKey);
  const $viewOffset = get(viewOffsetDays);
  const dk = getVisibleDateKey($current, $viewOffset);
  const tasks = getTasksByDate($data, dk).map(cloneTask);
  const next = tasks.map(cloneTask);
  if (!mutator(next)) return;

  const prev = [...tasks];
  const nextData = { ...$data, tasksByDate: { ...$data.tasksByDate, [dk]: next } };
  try {
    await storage.saveState(nextData);
    data.set(nextData);
  } catch {
    data.set({ ...$data, tasksByDate: { ...$data.tasksByDate, [dk]: prev } });
  }
}

export async function toggleTask(id) {
  await updateTask(id, (t) => {
    t.completed = !t.completed;
    t.updatedAt = new Date().toISOString();
  });
}

export async function cycleTaskPriority(id) {
  await updateTask(id, (t) => {
    const i = PRIORITY_ORDER.indexOf(t.priority);
    t.priority = PRIORITY_ORDER[(i + 1) % PRIORITY_ORDER.length];
    t.updatedAt = new Date().toISOString();
  });
}

export async function toggleTaskPin(id) {
  await updateVisibleTaskList((tasks) => {
    const i = findTaskIndex(tasks, id);
    if (i === -1) return false;
    const t = tasks[i];
    tasks.splice(i, 1);
    t.pinned = !t.pinned;
    t.updatedAt = new Date().toISOString();
    tasks.splice(t.pinned ? 0 : getPinnedCount(tasks), 0, t);
    return true;
  });
}

export async function moveTask(id, dir) {
  await updateVisibleTaskList((tasks) => {
    const i = findTaskIndex(tasks, id);
    const t = i + dir;
    if (i === -1 || t < 0 || t >= tasks.length || tasks[i].pinned !== tasks[t].pinned) return false;
    const cur = tasks[i];
    cur.updatedAt = new Date().toISOString();
    tasks[i] = tasks[t];
    tasks[t] = cur;
    return true;
  });
}

export async function commitTaskEdit(id, nextText) {
  const t = normalizeTaskText(nextText);
  editingTaskId.set(null);
  if (!t) return;
  await updateTask(id, (task) => {
    task.text = t;
    task.updatedAt = new Date().toISOString();
  });
}

export async function deleteTask(id, onUndo) {
  const $data = get(data);
  const $current = get(currentDateKey);
  const $viewOffset = get(viewOffsetDays);
  const dk = getVisibleDateKey($current, $viewOffset);
  const tasks = getTasksByDate($data, dk);
  const i = findTaskIndex(tasks, id);
  if (i === -1) return;

  const deletedTask = cloneTask(tasks[i]);
  const deletedIndex = i;
  const pinnedCountBefore = getPinnedCount(tasks);
  const prev = tasks.map(cloneTask);
  const next = prev.slice();
  next.splice(i, 1);

  editingTaskId.update((ed) => (ed === id ? null : ed));
  const nextData = { ...$data, tasksByDate: { ...$data.tasksByDate, [dk]: next } };

  try {
    await storage.saveState(nextData);
    data.set(nextData);
    if (onUndo) {
      onUndo(() => {
        const $d = get(data);
        const current = getTasksByDate($d, dk).map(cloneTask);
        const pc = getPinnedCount(current);
        const insertAt = deletedTask.pinned
          ? Math.min(deletedIndex, pc)
          : pc + Math.min(Math.max(0, deletedIndex - pinnedCountBefore), current.length - pc);
        current.splice(insertAt, 0, deletedTask);
        const restored = { ...$d, tasksByDate: { ...$d.tasksByDate, [dk]: current } };
        storage.saveState(restored).then(() => data.set(restored));
      });
    }
  } catch {
    data.set($data);
  }
}

export async function clearTodayTasks(onConfirm) {
  const $data = get(data);
  const $current = get(currentDateKey);
  const today = getTasksByDate($data, $current);
  if (!today.length) return;
  onConfirm(() => {
    const nextData = { ...$data, tasksByDate: { ...$data.tasksByDate, [$current]: [] } };
    storage.saveState(nextData).then(() => {
      data.set(nextData);
      editingTaskId.set(null);
    });
  });
}

export async function toggleStartup() {
  if (storage.mode !== 'tauri') return;
  try {
    const $enabled = get(startupEnabled);
    const enabled = Boolean(await storage.setLaunchOnStartup(!$enabled));
    startupEnabled.set(enabled);
    setAppStatus(
      'Inicialização com Windows ' + (enabled ? 'ativada.' : 'desativada.'),
      'live',
      get(appDataPath)
    );
  } catch {
    setAppStatus('Não foi possível alterar a inicialização com Windows.', 'error', get(appDataPath));
  }
}
