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

export const visibleTasks = derived([data, currentDateKey, viewOffsetDays], ([$data, $currentDateKey, $viewOffsetDays]) => {
  const visibleDateKey = resolveVisibleDateKey($currentDateKey, $viewOffsetDays);
  return getTasksForDate($data, visibleDateKey);
});

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
  const text = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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

export async function toggleStartup() {
  if (storage.mode !== 'tauri') return;
  try {
    const enabled = Boolean(await storage.setLaunchOnStartup(!get(startupEnabled)));
    startupEnabled.set(enabled);
    setAppStatus(buildStartupToggleStatusMessage(enabled), 'live', get(appDataPath));
  } catch {
    setAppStatus('Não foi possível alterar a inicialização com Windows.', 'error', get(appDataPath));
  }
}
