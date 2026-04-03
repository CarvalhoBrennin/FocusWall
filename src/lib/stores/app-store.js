import { writable, derived, get } from 'svelte/store';
import { CONFIG, VIEW, RATE_STATUS } from '../config.js';
import { storage } from '../services/storage.js';
import { fetchExchangeRates } from '../services/exchange.js';
import {
  createDefaultState,
  normalizeState,
  getLocalDateKey,
  cloneTask
} from '../utils/state.js';
import {
  ensureDateBucket,
  pruneTaskHistory,
  resolveVisibleDateKey,
  getTasksForDate,
  createTaskForList,
  insertTaskRespectingPinOrder,
  patchTaskById,
  toggleTaskCompleted,
  cycleTaskPriorityValue,
  toggleTaskPinned,
  moveTaskInsidePinSegment,
  renameTaskText,
  removeTaskWithMetadata,
  restoreDeletedTask
} from '../domain/tasks/task-domain.js';
import {
  clampViewOffset,
  buildStartupToggleStatusMessage
} from '../domain/settings/settings-domain.js';
import {
  buildRateMeta,
  hasDisplayableRates,
  mergeFreshRatesIntoState
} from '../domain/exchange/exchange-domain.js';
import { saveAppStateSnapshot } from '../effects/persistence/persistence-effects.js';
import { startAppRuntimeTimers, stopAppRuntimeTimers } from '../runtime/runtime-effects.js';

export const currentDateKey = writable(getLocalDateKey(new Date()));
export const viewOffsetDays = writable(VIEW.TODAY);
export const editingTaskId = writable(null);
export const startupEnabled = writable(false);
export const preferences = writable(structuredClone(DEFAULT_PREFERENCES));
export const appDataPath = writable('');
export const appStatusMessage = writable('Inicializando...');
export const appStatusVariant = writable('');
export const paused = writable(false);
export const data = writable(createDefaultState());
export const prevRates = writable({ usd: null, eur: null });
export const ratesStatus = writable(RATE_STATUS.UPDATING);
export const ratesMeta = writable('Buscando cotações...');
export const ratesCache = writable(null);
export const clockTime = writable('00:00:00');
export const lastAddedTaskId = writable(/** @type {string | null} */ (null));
export const taskSearch = writable('');
export const taskFilters = writable({ status: 'all', priority: 'all', tag: 'all', scope: 'all' });
export const taskSort = writable('manual');

export const visibleTasks = derived([data, currentDateKey, viewOffsetDays], ([$data, $currentDateKey, $viewOffsetDays]) => {
  const visibleDateKey = resolveVisibleDateKey($currentDateKey, $viewOffsetDays);
  return getTasksForDate($data, visibleDateKey);
});

export const availableTags = derived(visibleTasks, ($tasks) => {
  const all = new Set();
  ($tasks || []).forEach((task) => {
    (task.tags || []).forEach((tag) => all.add(tag));
  });
  return [...all].sort((a, b) => a.localeCompare(b, 'pt-BR'));
});

export const processedVisibleTasks = derived(
  [visibleTasks, taskSearch, taskFilters, taskSort],
  ([$tasks, $search, $filters, $sort]) => {
    const base = Array.isArray($tasks) ? [...$tasks] : [];
    const search = String($search || '').trim().toLowerCase();
    const filterByStatus = (task) =>
      $filters.status === 'all' ||
      ($filters.status === 'open' && !task.completed) ||
      ($filters.status === 'done' && task.completed);
    const filterByPriority = (task) => $filters.priority === 'all' || task.priority === $filters.priority;
    const filterByTag = (task) => $filters.tag === 'all' || (task.tags || []).includes($filters.tag);
    const filterByScope = (task) => $filters.scope === 'all' || ($filters.scope === 'inbox' ? task.inInbox : !task.inInbox);
    const filterBySearch = (task) => {
      if (!search) return true;
      const inText = task.text.toLowerCase().includes(search);
      const inTags = (task.tags || []).some((tag) => tag.includes(search));
      const inChecklist = (task.checklist || []).some((item) => item.text.toLowerCase().includes(search));
      return inText || inTags || inChecklist;
    };

    const filtered = base.filter((task) => filterByStatus(task) && filterByPriority(task) && filterByTag(task) && filterByScope(task) && filterBySearch(task));
    if ($sort === 'manual') return filtered;

    const priorityScore = { high: 0, medium: 1, low: 2 };
    return filtered.sort((a, b) => {
      if ($sort === 'priority') return (priorityScore[a.priority] ?? 9) - (priorityScore[b.priority] ?? 9);
      if ($sort === 'created-desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if ($sort === 'updated-desc') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if ($sort === 'due-asc') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      return 0;
    });
  }
);

export const todayTasks = derived([data, currentDateKey], ([$data, $currentDateKey]) =>
  getTasksForDate($data, $currentDateKey)
);

export const ratesBaseline = derived(data, ($data) => $data?.ratesBaseline ?? null);

let ratesRequestId = 0;
let activeRatesController = null;
let saveDebounceId = null;

async function persistStateImmediate() {
  const nextData = await saveAppStateSnapshot(storage, get(data), get(currentDateKey), get(viewOffsetDays));
  data.set(nextData);
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

export function setViewOffset(offset) {
  viewOffsetDays.set(clampViewOffset(offset));
  editingTaskId.set(null);
  persistStateDebounced();
}

export function setClockTime(now) {
  const $preferences = get(preferences);
  const locale = $preferences.locale.code || 'pt-BR';
  const showSeconds = $preferences.panel.showSeconds !== false;
  const text = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: false
  }).format(now);
  clockTime.set(text);
}

export function bootstrapApp() {
  return (async () => {
    try {
      const loaded = normalizeState(await storage.loadState());
      const todayDateKey = getLocalDateKey(new Date());
      currentDateKey.set(todayDateKey);
      viewOffsetDays.set(VIEW.TODAY);
      const initialData = pruneTaskHistory(ensureDateBucket(loaded, todayDateKey), todayDateKey);
      data.set(initialData);

      if (initialData.ratesCache) {
        prevRates.set({ usd: initialData.ratesCache.usd, eur: initialData.ratesCache.eur });
        ratesCache.set(initialData.ratesCache);
        ratesStatus.set(RATE_STATUS.CACHED);
        ratesMeta.set(buildRateMeta(initialData.ratesCache.updatedAt, 'Mostrando cache'));
      }

      if (storage.mode === 'tauri') {
        const path = await storage.getAppDataPath();
        const startupIsEnabled = Boolean(await storage.getLaunchOnStartup());
        startupEnabled.set(startupIsEnabled);
        if (startupIsEnabled) startupEnabled.set(Boolean(await storage.syncLaunchOnStartup()));
        appDataPath.set(path);
        setAppStatus('Dados salvos no app desktop.', 'live', path);
      } else {
        setAppStatus('Modo navegador: usando armazenamento local para pré-visualização.', 'warning');
      }
    } catch {
      const todayDateKey = getLocalDateKey(new Date());
      data.set(ensureDateBucket(createDefaultState(), todayDateKey));
      setAppStatus('Falha ao carregar o estado local. Um estado vazio foi restaurado.', 'error');
    }
  })();
}

export function startAllTimers(onClockTick, onDayCheck, onRatesTick, onFullscreenCheck, updateRates) {
  startAppRuntimeTimers({
    onClockTick,
    onDayCheck,
    onRatesTick,
    onFullscreenCheck,
    onFirstRatesFetch: updateRates
  });
}

export function stopAllAppTimers() {
  stopAppRuntimeTimers();
}

export async function updateExchangeRates(options = {}) {
  if (get(paused)) return;

  const requestId = ++ratesRequestId;
  const state = get(data);
  const cachedRates = state.ratesCache;
  const showUpdatingUi = !hasDisplayableRates(cachedRates) && !options.silent;

  if (showUpdatingUi) {
    ratesStatus.set(RATE_STATUS.UPDATING);
    ratesMeta.set(
      cachedRates
        ? buildRateMeta(cachedRates.updatedAt, 'Atualizando a partir do último cache')
        : 'Buscando cotações mais recentes...'
    );
  }

  activeRatesController = new AbortController();

  try {
    const freshRates = await fetchExchangeRates(activeRatesController);
    if (requestId !== ratesRequestId) return;

    const before = get(ratesCache);
    if (hasDisplayableRates(before)) prevRates.set({ usd: before.usd, eur: before.eur });

    const nextState = mergeFreshRatesIntoState(state, freshRates, new Date());
    data.set(nextState);
    await storage.saveState(nextState);

    ratesCache.set(freshRates);
    ratesStatus.set(RATE_STATUS.LIVE);
    ratesMeta.set(buildRateMeta(freshRates.updatedAt, 'Atualizado'));
  } catch {
    if (requestId !== ratesRequestId) return;
    ratesCache.set(cachedRates);
    ratesStatus.set(cachedRates ? RATE_STATUS.CACHED : RATE_STATUS.UNAVAILABLE);
    ratesMeta.set(cachedRates ? buildRateMeta(cachedRates.updatedAt, 'Mostrando cache') : 'Cotações indisponíveis no momento.');
  } finally {
    activeRatesController = null;
  }
}

export function abortRatesFetch() {
  if (activeRatesController) activeRatesController.abort();
}

export function onDayChange() {
  const nextDateKey = getLocalDateKey(new Date());
  if (nextDateKey === get(currentDateKey)) return;

  currentDateKey.set(nextDateKey);
  viewOffsetDays.set(VIEW.TODAY);
  editingTaskId.set(null);
  const nextData = pruneTaskHistory(ensureDateBucket(get(data), nextDateKey), nextDateKey);
  data.set(nextData);
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

function buildNextStateWithVisibleTasks(nextTasks) {
  const state = get(data);
  const visibleDateKey = resolveVisibleDateKey(get(currentDateKey), get(viewOffsetDays));
  return { ...state, tasksByDate: { ...state.tasksByDate, [visibleDateKey]: nextTasks } };
}

async function persistVisibleTasks(nextTasks, rollbackState) {
  const nextState = buildNextStateWithVisibleTasks(nextTasks);
  try {
    await storage.saveState(nextState);
    data.set(nextState);
    return true;
  } catch {
    if (rollbackState) data.set(rollbackState);
    return false;
  }
}

export async function createTaskAction(text, priority) {
  const newTask = createTaskForList(text, priority);
  if (!newTask) return null;

  const state = get(data);
  const visibleDateKey = resolveVisibleDateKey(get(currentDateKey), get(viewOffsetDays));
  const nextTasks = insertTaskRespectingPinOrder(getTasksForDate(state, visibleDateKey), newTask);
  const nextState = { ...state, tasksByDate: { ...state.tasksByDate, [visibleDateKey]: nextTasks } };

  try {
    await storage.saveState(nextState);
    data.set(nextState);
    setAppStatus('Tarefa salva localmente.', 'live', get(appDataPath));
    lastAddedTaskId.set(newTask.id);
    setTimeout(() => lastAddedTaskId.update((id) => (id === newTask.id ? null : id)), 450);
    return newTask.id;
  } catch {
    return null;
  }
}

export async function addTask(text, priority) {
  return createTaskAction(text, priority);
}

export async function updateTask(taskId, updater) {
  const state = get(data);
  const visibleDateKey = resolveVisibleDateKey(get(currentDateKey), get(viewOffsetDays));
  const visibleTasks = getTasksForDate(state, visibleDateKey);
  const nextTasks = patchTaskById(visibleTasks, taskId, updater);
  if (!nextTasks) return;
  await persistVisibleTasks(nextTasks, state);
}

export async function toggleTask(id) {
  const state = get(data);
  const dateKey = resolveVisibleDateKey(get(currentDateKey), get(viewOffsetDays));
  const nextTasks = toggleTaskCompleted(getTasksForDate(state, dateKey), id);
  if (!nextTasks) return;
  await persistVisibleTasks(nextTasks, state);
}

export async function cycleTaskPriority(id) {
  const state = get(data);
  const dateKey = resolveVisibleDateKey(get(currentDateKey), get(viewOffsetDays));
  const nextTasks = cycleTaskPriorityValue(getTasksForDate(state, dateKey), id);
  if (!nextTasks) return;
  await persistVisibleTasks(nextTasks, state);
}

export async function toggleTaskPin(id) {
  const state = get(data);
  const dateKey = resolveVisibleDateKey(get(currentDateKey), get(viewOffsetDays));
  const nextTasks = toggleTaskPinned(getTasksForDate(state, dateKey), id);
  if (!nextTasks) return;
  await persistVisibleTasks(nextTasks, state);
}

export async function moveTask(id, dir) {
  const state = get(data);
  const dateKey = resolveVisibleDateKey(get(currentDateKey), get(viewOffsetDays));
  const nextTasks = moveTaskInsidePinSegment(getTasksForDate(state, dateKey), id, dir);
  if (!nextTasks) return;
  await persistVisibleTasks(nextTasks, state);
}

export async function commitTaskEdit(id, nextText) {
  editingTaskId.set(null);
  const state = get(data);
  const dateKey = resolveVisibleDateKey(get(currentDateKey), get(viewOffsetDays));
  const nextTasks = renameTaskText(getTasksForDate(state, dateKey), id, nextText);
  if (!nextTasks) return;
  await persistVisibleTasks(nextTasks, state);
}

export async function updateTaskDetails(id, details = {}) {
  await updateTask(id, (task) => {
    if (typeof details.text === 'string') task.text = normalizeTaskText(details.text) || task.text;
    if (details.priority) task.priority = normalizePriority(details.priority);
    if (Array.isArray(details.tags)) task.tags = normalizeTags(details.tags);
    if ('dueDate' in details) task.dueDate = normalizeDueDate(details.dueDate);
    if ('inInbox' in details) task.inInbox = Boolean(details.inInbox);
    task.updatedAt = new Date().toISOString();
  });
}

export async function updateTaskTagsFromInput(id, tagInput) {
  await updateTaskDetails(id, { tags: parseTagsInput(tagInput) });
}

export async function addChecklistItem(id, text) {
  const clean = normalizeTaskText(text).slice(0, 80);
  if (!clean) return;
  await updateTask(id, (task) => {
    const current = Array.isArray(task.checklist) ? [...task.checklist] : [];
    if (current.length >= 8) return;
    current.push({ id: createId(), text: clean, done: false });
    task.checklist = current;
    task.updatedAt = new Date().toISOString();
  });
}

export async function toggleChecklistItem(taskId, itemId) {
  await updateTask(taskId, (task) => {
    task.checklist = (task.checklist || []).map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    task.updatedAt = new Date().toISOString();
  });
}

export async function removeChecklistItem(taskId, itemId) {
  await updateTask(taskId, (task) => {
    task.checklist = (task.checklist || []).filter((item) => item.id !== itemId);
    task.updatedAt = new Date().toISOString();
  });
}

export async function deleteTask(id, onUndo) {
  const state = get(data);
  const visibleDateKey = resolveVisibleDateKey(get(currentDateKey), get(viewOffsetDays));
  const currentTasks = getTasksForDate(state, visibleDateKey);
  const deletion = removeTaskWithMetadata(currentTasks, id);
  if (!deletion) return;

  editingTaskId.update((editingId) => (editingId === id ? null : editingId));
  const didPersist = await persistVisibleTasks(deletion.nextTasks, state);
  if (!didPersist || !onUndo) return;

  onUndo(() => {
    const latestState = get(data);
    const latestTasks = getTasksForDate(latestState, visibleDateKey);
    const restoredTasks = restoreDeletedTask(
      latestTasks,
      deletion.deletedTask,
      deletion.deletedIndex,
      deletion.pinnedCountBefore
    );
    const restoredState = { ...latestState, tasksByDate: { ...latestState.tasksByDate, [visibleDateKey]: restoredTasks } };
    storage.saveState(restoredState).then(() => data.set(restoredState));
  });
}

export async function clearTodayTasks(onConfirm) {
  const state = get(data);
  const todayDateKey = get(currentDateKey);
  if (!getTasksForDate(state, todayDateKey).length) return;

  onConfirm(() => {
    const nextState = { ...state, tasksByDate: { ...state.tasksByDate, [todayDateKey]: [] } };
    storage.saveState(nextState).then(() => {
      data.set(nextState);
      editingTaskId.set(null);
    });
  });
}


function applyPreferencesToDom(currentPreferences) {
  if (typeof document === 'undefined') return;
  const body = document.body;
  if (!body) return;
  body.dataset.theme = currentPreferences.appearance.theme;
  body.dataset.density = currentPreferences.appearance.density;
}

export async function updatePreferences(nextPreferences) {
  const normalized = structuredClone(nextPreferences);
  const previous = get(preferences);
  const $data = get(data);
  const nextData = {
    ...$data,
    ui: {
      ...$data.ui,
      preferences: normalized
    }
  };

  preferences.set(normalized);
  applyPreferencesToDom(normalized);

  try {
    await storage.saveState(nextData);
    data.set(nextData);

    if (storage.mode === 'tauri') {
      await storage.setWindowLayer(normalized.window.layer);
      await storage.setCloseToTray(normalized.window.closeToTray);
      await storage.setAutoHideOnBlur(normalized.panel.autoHideOnBlur);
    }

    setAppStatus('Preferências salvas com sucesso.', 'live', get(appDataPath));
    return { ok: true };
  } catch (error) {
    preferences.set(previous);
    applyPreferencesToDom(previous);
    data.set($data);
    setAppStatus('Falha ao salvar preferências.', 'error', get(appDataPath));
    return { ok: false, error: String(error?.message || error) };
  }
}

export async function toggleStartup() {
  if (storage.mode !== 'tauri') return { ok: false, message: 'Disponível apenas no app desktop.' };
  try {
    const enabled = Boolean(await storage.setLaunchOnStartup(!get(startupEnabled)));
    startupEnabled.set(enabled);
    setAppStatus(buildStartupToggleStatusMessage(enabled), 'live', get(appDataPath));
  } catch {
    const message = 'Não foi possível alterar a inicialização com Windows.';
    setAppStatus(message, 'error', get(appDataPath));
    return { ok: false, message };
  }
}
