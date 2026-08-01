import { writable, derived, get } from 'svelte/store';
import { CONFIG, VIEW, RATE_STATUS, PRIORITY_ORDER, formatters } from '../config.js';
import { storage } from '../services/storage.js';
import { enqueueStatePersistence } from '../services/state-persistence.js';
import { startTimer, stopAllTimers } from '../services/timer.js';
import { fetchExchangeRates } from '../services/exchange.js';
import { migrateLegacyFilesLists } from '../services/files.js';
import {
  createDefaultState,
  normalizeState,
  normalizeTaskText,
  normalizePriority,
  normalizeMonthKey,
  normalizeDateKey,
  getLocalDateKey,
  getBrazilDateKey,
  getMonthKeyFromDateKey,
  parseDateKey,
  addDays,
  createId,
  cloneTask,
  getPinnedCount,
  findTaskIndex
} from '../utils/state.js';
import { ensureAbsolutePath } from '../utils/path.js';
import { applyTheme } from './theme-store.js';
import { msg, setLocale } from '../i18n/index.js';
import { rebuildFormatters } from '../config.js';
import { normalizeRadarCategories, normalizeRadarLocation, normalizeRadarPreferences } from '../utils/radar.js';
import type { LocaleId, ThemeId, AppState, RateStatus } from '../types/app.js';
import type { RadarLocation, RadarNewsCategory, RadarPreferences } from '../types/radar.js';

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

export function getTasksByDate(data: AppState, dk: string) {
  return Array.isArray(data.tasksByDate?.[dk]) ? data.tasksByDate[dk] : [];
}

/** Garante que ui persista o offset/data visíveis dos stores (evita race com debounce). */
export function mergePersistedState(state: AppState): AppState {
  return {
    ...state,
    ui: {
      ...state.ui,
      lastViewedBaseDate: get(currentDateKey),
      viewOffsetDays: get(viewOffsetDays)
    }
  };
}

/**
 * Publica apenas o domínio confirmado sobre o estado mais recente em memória.
 * Isso preserva mutações otimistas ocorridas enquanto a gravação assíncrona estava em andamento.
 */
export function publishPersistedDomain(mutator: (latest: AppState) => AppState): AppState {
  const published = mergePersistedState(mutator(get(data)));
  data.set(published);
  return published;
}

/** Rejeita payloads brutos claramente inválidos antes da normalização. */
export function assertLoadableRawState(raw: unknown): void {
  if (raw == null) return;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Estado local inválido ou corrompido.');
  }
  const candidate = raw as Record<string, unknown>;
  if (
    'tasksByDate' in candidate &&
    (candidate.tasksByDate == null ||
      typeof candidate.tasksByDate !== 'object' ||
      Array.isArray(candidate.tasksByDate))
  ) {
    throw new Error('Estado local inválido ou corrompido.');
  }
}

/** Restaura offset de navegação só quando a data base salva coincide com hoje. */
export function resolveBootstrapViewOffset(
  savedBase: string,
  savedOffset: unknown,
  todayDateKey: string
): number {
  if (savedBase === todayDateKey && Number.isInteger(savedOffset)) {
    const min = -(CONFIG.HISTORY_RETENTION_DAYS - 1);
    return Math.max(min, Math.min(CONFIG.FUTURE_VIEW_DAYS, savedOffset as number));
  }
  return VIEW.TODAY;
}

/** Define ui.calendarMonth só quando ainda não há mês salvo (não força mês atual). */
async function syncCalendarMonthIfStale(todayDateKey: string): Promise<void> {
  const currentMonth = normalizeMonthKey(getMonthKeyFromDateKey(todayDateKey));
  if (!currentMonth) return;

  await enqueueStateMutation(async () => {
    const current = get(data);
    const stored = normalizeMonthKey(current.ui?.calendarMonth) || '';
    if (stored) return;
    const next = mergePersistedState({
      ...current,
      ui: { ...current.ui, calendarMonth: currentMonth }
    });
    try {
      await storage.saveState(next);
      publishPersistedDomain((latest) => ({
        ...latest,
        ui: { ...latest.ui, calendarMonth: currentMonth }
      }));
    } catch {
      setAppStatus('Não foi possível salvar o mês do calendário.', 'error', get(appDataPath));
    }
  });
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
  viewOffsetDays.set(Math.max(min, Math.min(CONFIG.FUTURE_VIEW_DAYS, offset)));
  editingTaskId.set(null);
  persistStateDebounced();
}

export const todayTasks = derived([data, currentDateKey], ([$data, $currentDateKey]) =>
  getTasksByDate($data, $currentDateKey)
);

export const ratesBaseline = derived(data, ($d) => $d?.ratesBaseline ?? null);

let ratesRequestId = 0;
let ratesInFlight = false;
let ratesAbortController: AbortController | null = null;
let saveDebounceId: ReturnType<typeof setTimeout> | null = null;
let saveGeneration = 0;
let bootstrapPromise: Promise<void> | null = null;
let ratesTickCount = 0;


const enqueueStateMutation = enqueueStatePersistence;

function buildRateMeta(iso, prefix) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? prefix + '.' : prefix + ' às ' + formatters.shortTime.format(d) + '.';
}

async function persistStateImmediate(generation: number) {
  await enqueueStateMutation(async () => {
    const updated = mergePersistedState(get(data));
    await storage.saveState(updated);
    if (generation !== saveGeneration) return;
    data.set(updated);
  });
}

export function persistStateDebounced() {
  const generation = ++saveGeneration;
  if (saveDebounceId) clearTimeout(saveDebounceId);
  saveDebounceId = setTimeout(() => {
    saveDebounceId = null;
    persistStateImmediate(generation).catch(() => {
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
  viewOffsetDays.set(Math.max(min, Math.min(CONFIG.FUTURE_VIEW_DAYS, Number(offset) || 0)));
  editingTaskId.set(null);
  persistStateDebounced();
}

export function setPreferredMonitorPreference(preferredMonitor: number): Promise<boolean> {
  if (!Number.isInteger(preferredMonitor) || preferredMonitor < 0) return Promise.resolve(false);
  return enqueueStateMutation(async () => {
    const current = get(data);
    const nextData = mergePersistedState({
      ...current,
      ui: { ...current.ui, preferredMonitor }
    });
    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({
        ...latest,
        ui: { ...latest.ui, preferredMonitor }
      }));
      return true;
    } catch {
      setAppStatus('Não foi possível salvar a preferência de monitor.', 'error', get(appDataPath));
      return false;
    }
  });
}

export function setThemePreference(nextTheme: ThemeId): Promise<boolean> {
  return enqueueStateMutation(async () => {
    const current = get(data);
    const nextData = mergePersistedState({ ...current, ui: { ...current.ui, theme: nextTheme } });
    applyTheme(nextTheme);
    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({
        ...latest,
        ui: { ...latest.ui, theme: nextTheme }
      }));
      return true;
    } catch {
      applyTheme(current.ui.theme);
      setAppStatus('Não foi possível salvar o tema.', 'error', get(appDataPath));
      return false;
    }
  });
}

function persistRadarPreferences(
  mutate: (current: RadarPreferences) => RadarPreferences
): Promise<boolean> {
  return enqueueStateMutation(async () => {
    const currentState = get(data);
    const normalized = normalizeRadarPreferences(mutate(currentState.radarPreferences));
    const nextData = mergePersistedState({ ...currentState, radarPreferences: normalized });
    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({ ...latest, radarPreferences: normalized }));
      return true;
    } catch {
      setAppStatus(msg('radar.preferencesSaveFailed'), 'error', get(appDataPath));
      return false;
    }
  });
}

export function setRadarPreferences(next: RadarPreferences): Promise<boolean> {
  const normalized = normalizeRadarPreferences(next);
  return persistRadarPreferences(() => normalized);
}

export function setRadarLocation(location: RadarLocation | null): Promise<boolean> {
  const normalizedLocation = normalizeRadarLocation(location);
  return persistRadarPreferences((current) => ({ ...current, location: normalizedLocation }));
}

export function setRadarCategories(categories: RadarNewsCategory[]): Promise<boolean> {
  const normalizedCategories = normalizeRadarCategories(categories);
  return persistRadarPreferences((current) => ({ ...current, enabledCategories: normalizedCategories }));
}

export function setLocalePreference(nextLocale: LocaleId): Promise<boolean> {
  return enqueueStateMutation(async () => {
    const current = get(data);
    const nextData = mergePersistedState({ ...current, ui: { ...current.ui, locale: nextLocale } });
    setLocale(nextLocale);
    rebuildFormatters(nextLocale);
    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({
        ...latest,
        ui: { ...latest.ui, locale: nextLocale }
      }));
      return true;
    } catch {
      setLocale(current.ui.locale);
      rebuildFormatters(current.ui.locale);
      setAppStatus('Não foi possível salvar o idioma.', 'error', get(appDataPath));
      return false;
    }
  });
}

export function setAssistantModelPreference(nextModel: string): Promise<boolean> {
  const assistantModel = nextModel.trim();
  return enqueueStateMutation(async () => {
    const current = get(data);
    const nextData = mergePersistedState({ ...current, ui: { ...current.ui, assistantModel } });
    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({
        ...latest,
        ui: { ...latest.ui, assistantModel }
      }));
      return true;
    } catch {
      setAppStatus('Não foi possível salvar o modelo do Wallbot.', 'error', get(appDataPath));
      return false;
    }
  });
}

export function setClockTime(now: Date) {
  clockNow.set(now);
  clockTime.set(formatters.time.format(now));
}

export function exportStateBackup() {
  const payload = JSON.stringify(mergePersistedState(get(data)), null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const stamp = getLocalDateKey(new Date());
  anchor.href = url;
  anchor.download = `focus-dashboard-backup-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function setFilesLastPath(path: string): Promise<void> {
  if (typeof path !== 'string' || !path.trim()) return Promise.resolve();
  const absolute = ensureAbsolutePath(path) || path.trim();
  return enqueueStateMutation(async () => {
    const current = get(data);
    const nextData = mergePersistedState({
      ...current,
      ui: { ...current.ui, filesLastPath: absolute }
    });
    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({
        ...latest,
        ui: { ...latest.ui, filesLastPath: absolute }
      }));
    } catch {
      setAppStatus('Não foi possível salvar o último diretório.', 'error', get(appDataPath));
    }
  });
}

export function bootstrapApp() {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    bootstrapLoading.set(true);
    bootstrapError.set('');
    try {
      const raw = await storage.loadState();
      assertLoadableRawState(raw);
      const loaded = normalizeState(raw);

      const $currentDateKey = getLocalDateKey(new Date());
      currentDateKey.set($currentDateKey);
      viewOffsetDays.set(
        resolveBootstrapViewOffset(
          loaded.ui?.lastViewedBaseDate ?? '',
          loaded.ui?.viewOffsetDays ?? 0,
          $currentDateKey
        )
      );
      let d = ensureDateBucket(loaded, $currentDateKey);
      d = pruneHistory(d, $currentDateKey);
      data.set(d);
      migrateLegacyFilesLists();
      await syncCalendarMonthIfStale($currentDateKey);
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
      const $currentDateKey = getLocalDateKey(new Date());
      currentDateKey.set($currentDateKey);
      viewOffsetDays.set(VIEW.TODAY);
      const d = ensureDateBucket(createDefaultState(), $currentDateKey);
      data.set(d);
      await syncCalendarMonthIfStale($currentDateKey);
      applyTheme(d.ui.theme);
      const bootLocale = d.ui.locale ?? 'pt-BR';
      setLocale(bootLocale);
      rebuildFormatters(bootLocale);
      bootstrapError.set(String(err?.message || err));
      setAppStatus('Falha ao carregar o estado local. Um estado vazio foi restaurado.', 'error');
    } finally {
      bootstrapLoading.set(false);
    }
  })();

  return bootstrapPromise;
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
  ratesAbortController?.abort();
  const controller = new AbortController();
  ratesAbortController = controller;

  try {
    const fresh = await fetchExchangeRates(controller);
    if (rid !== ratesRequestId) return;
    const before = get(ratesCache);
    if (before && Number.isFinite(before.usd) && Number.isFinite(before.eur)) {
      prevRates.set({ usd: before.usd, eur: before.eur });
    }
    await enqueueStateMutation(async () => {
      if (rid !== ratesRequestId) return;
      const latest = get(data);
      const todayBR = getBrazilDateKey(new Date());
      const currentBaseline = latest.ratesBaseline;
      const shouldSetBaseline = !currentBaseline || currentBaseline.dayKey !== todayBR;
      const nextData = mergePersistedState({
        ...latest,
        ratesCache: fresh,
        ratesBaseline: shouldSetBaseline
          ? { dayKey: todayBR, usd: fresh.usd, eur: fresh.eur }
          : currentBaseline
      });
      await storage.saveState(nextData);
      publishPersistedDomain((current) => ({
        ...current,
        ratesCache: nextData.ratesCache,
        ratesBaseline: nextData.ratesBaseline
      }));
    });
    if (rid !== ratesRequestId) return;
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
    if (ratesAbortController === controller) {
      ratesAbortController = null;
    }
    ratesInFlight = false;
  }
}

export function abortRatesFetch() {
  ratesRequestId += 1;
  ratesAbortController?.abort();
  ratesAbortController = null;
}

export function onDayChange() {
  const next = getLocalDateKey(new Date());
  const previous = get(currentDateKey);
  if (next === previous) return;

  const monthChanged = next.slice(0, 7) !== previous.slice(0, 7);
  currentDateKey.set(next);
  viewOffsetDays.set(VIEW.TODAY);
  editingTaskId.set(null);
  void enqueueStateMutation(async () => {
    let nextData = ensureDateBucket(get(data), next);
    nextData = pruneHistory(nextData, next);
    if (monthChanged) {
      const currentMonth = normalizeMonthKey(getMonthKeyFromDateKey(next));
      if (currentMonth) {
        nextData = { ...nextData, ui: { ...nextData.ui, calendarMonth: currentMonth } };
      }
    }
    const serialized = mergePersistedState(nextData);
    try {
      await storage.saveState(serialized);
      publishPersistedDomain((latest) => ({
        ...latest,
        tasksByDate: serialized.tasksByDate,
        ui: { ...latest.ui, calendarMonth: serialized.ui.calendarMonth }
      }));
    } catch {
      setAppStatus('Não foi possível atualizar o estado para o novo dia.', 'error', get(appDataPath));
    }
  });
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

/**
 * Creates a task on the visible date, or on `targetDateKey` when given. The
 * explicit date exists for the assistant: "cria uma tarefa pra amanhã" must not
 * have to navigate the panel first.
 */
export function addTask(text, priority, targetDateKey = ''): Promise<string | null> {
  return enqueueStateMutation(async () => {
    const t = normalizeTaskText(text);
    if (!t) return null;

    const $data = get(data);
    const $current = get(currentDateKey);
    const $viewOffset = get(viewOffsetDays);
    const dk = normalizeDateKey(targetDateKey) || getVisibleDateKey($current, $viewOffset);
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
    const nextData = mergePersistedState({
      ...$data,
      tasksByDate: tbd
    });

    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({ ...latest, tasksByDate: nextData.tasksByDate }));
      setAppStatus('Tarefa salva localmente.', 'live', get(appDataPath));
      lastAddedTaskId.set(newTask.id);
      setTimeout(() => lastAddedTaskId.update((id) => (id === newTask.id ? null : id)), CONFIG.TASK_HIGHLIGHT_MS);
      return newTask.id;
    } catch {
      setAppStatus('Não foi possível salvar a tarefa.', 'error', get(appDataPath));
      return null;
    }
  });
}

export function updateTask(taskId, updater): Promise<boolean> {
  return enqueueStateMutation(async () => {
    const $data = get(data);
    const $current = get(currentDateKey);
    const $viewOffset = get(viewOffsetDays);
    const dk = getVisibleDateKey($current, $viewOffset);
    const tasks = getTasksByDate($data, dk).map(cloneTask);

    let changed = false;
    const next = tasks.map((t) => {
      if (t.id !== taskId) return t;
      const c = cloneTask(t);
      updater(c);
      changed = true;
      return c;
    });

    if (!changed) return false;
    const nextData = mergePersistedState({ ...$data, tasksByDate: { ...$data.tasksByDate, [dk]: next } });
    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({ ...latest, tasksByDate: nextData.tasksByDate }));
      return true;
    } catch {
      setAppStatus('Não foi possível atualizar a tarefa.', 'error', get(appDataPath));
      return false;
    }
  });
}

export function updateVisibleTaskList(mutator): Promise<boolean> {
  return enqueueStateMutation(async () => {
    const $data = get(data);
    const $current = get(currentDateKey);
    const $viewOffset = get(viewOffsetDays);
    const dk = getVisibleDateKey($current, $viewOffset);
    const tasks = getTasksByDate($data, dk).map(cloneTask);
    const next = tasks.map(cloneTask);
    if (!mutator(next)) return false;

    const nextData = mergePersistedState({ ...$data, tasksByDate: { ...$data.tasksByDate, [dk]: next } });
    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({ ...latest, tasksByDate: nextData.tasksByDate }));
      return true;
    } catch {
      setAppStatus('Não foi possível atualizar as tarefas.', 'error', get(appDataPath));
      return false;
    }
  });
}

export function toggleTask(id): Promise<boolean> {
  return updateTask(id, (t) => {
    t.completed = !t.completed;
    t.updatedAt = new Date().toISOString();
  });
}

export function cycleTaskPriority(id): Promise<boolean> {
  return updateTask(id, (t) => {
    const i = PRIORITY_ORDER.indexOf(t.priority);
    t.priority = PRIORITY_ORDER[(i + 1) % PRIORITY_ORDER.length];
    t.updatedAt = new Date().toISOString();
  });
}

export function toggleTaskPin(id): Promise<boolean> {
  return updateVisibleTaskList((tasks) => {
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

export function moveTask(id, dir): Promise<boolean> {
  return updateVisibleTaskList((tasks) => {
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

export async function commitTaskEdit(id, nextText): Promise<boolean> {
  const t = normalizeTaskText(nextText);
  editingTaskId.set(null);
  if (!t) return false;
  return updateTask(id, (task) => {
    task.text = t;
    task.updatedAt = new Date().toISOString();
  });
}

export function deleteTask(id, onUndo): Promise<boolean> {
  return enqueueStateMutation(async () => {
    const $data = get(data);
    const $current = get(currentDateKey);
    const $viewOffset = get(viewOffsetDays);
    const dk = getVisibleDateKey($current, $viewOffset);
    const tasks = getTasksByDate($data, dk);
    const i = findTaskIndex(tasks, id);
    if (i === -1) return false;

    const deletedTask = cloneTask(tasks[i]);
    const deletedIndex = i;
    const pinnedCountBefore = getPinnedCount(tasks);
    const next = tasks.map(cloneTask);
    next.splice(i, 1);

    editingTaskId.update((ed) => (ed === id ? null : ed));
    const nextData = mergePersistedState({ ...$data, tasksByDate: { ...$data.tasksByDate, [dk]: next } });

    try {
      await storage.saveState(nextData);
      publishPersistedDomain((latest) => ({ ...latest, tasksByDate: nextData.tasksByDate }));
      if (onUndo) {
        onUndo(() => {
          enqueueStateMutation(async () => {
            const $d = get(data);
            const current = getTasksByDate($d, dk).map(cloneTask);
            const pc = getPinnedCount(current);
            const insertAt = deletedTask.pinned
              ? Math.min(deletedIndex, pc)
              : pc + Math.min(Math.max(0, deletedIndex - pinnedCountBefore), current.length - pc);
            current.splice(insertAt, 0, deletedTask);
            const restored = mergePersistedState({ ...$d, tasksByDate: { ...$d.tasksByDate, [dk]: current } });
            try {
              await storage.saveState(restored);
              publishPersistedDomain((latest) => ({ ...latest, tasksByDate: restored.tasksByDate }));
              return true;
            } catch {
              setAppStatus('Não foi possível restaurar a tarefa.', 'error', get(appDataPath));
              return false;
            }
          });
        });
      }
      return true;
    } catch {
      setAppStatus('Não foi possível excluir a tarefa.', 'error', get(appDataPath));
      return false;
    }
  });
}

export async function clearTodayTasks(onConfirm) {
  const $data = get(data);
  const $current = get(currentDateKey);
  const today = getTasksByDate($data, $current);
  if (!today.length) return;
  onConfirm(() => {
    void enqueueStateMutation(async () => {
      const latest = get(data);
      const currentDate = get(currentDateKey);
      const serialized = mergePersistedState({
        ...latest,
        tasksByDate: { ...latest.tasksByDate, [currentDate]: [] }
      });
      try {
        await storage.saveState(serialized);
        publishPersistedDomain((latest) => ({ ...latest, tasksByDate: serialized.tasksByDate }));
        editingTaskId.set(null);
      } catch {
        setAppStatus('Não foi possível limpar as tarefas de hoje.', 'error', get(appDataPath));
      }
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
