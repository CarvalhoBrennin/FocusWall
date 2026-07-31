import { get, derived } from 'svelte/store';
import { CONFIG } from '../config.js';
import { storage } from '../services/storage.js';
import { enqueueStatePersistence } from '../services/state-persistence.js';
import {
  normalizeCalendarEvent,
  normalizeMonthKey,
  createId,
  getLocalDateKey,
  getMonthKeyFromDateKey,
  normalizeDateKey,
  parseMonthKey
} from '../utils/state.js';
import type { AppState, CalendarEvent, CalendarRecurrence, Task } from '../types/app.js';
import { setPanelTab } from './ui-store.js';
import {
  data,
  visibleDateKey,
  visibleTasks,
  appDataPath,
  persistStateDebounced,
  mergePersistedState,
  publishPersistedDomain,
  setAppStatus,
  setExecutionDateForDateKey
} from './app-store.js';

export const calendarMonth = derived(data, ($d) => $d.ui?.calendarMonth ?? '');

let calendarMutationQueue: Promise<void> = Promise.resolve();

function enqueueCalendarMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = calendarMutationQueue.then(operation, operation);
  calendarMutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

export type TaskDayStats = {
  total: number;
  completed: number;
  pending: number;
};

export type TaskDayMarker = {
  id: string;
  completed: boolean;
  priority: Task['priority'];
};

export type CalendarDayTasks = {
  stats: TaskDayStats;
  markers: TaskDayMarker[];
};

export const EMPTY_DAY_TASKS: CalendarDayTasks = {
  stats: { total: 0, completed: 0, pending: 0 },
  markers: []
};

/** Contagens por dia — derived store para o calendário reagir a edições no painel de execução. */
export function buildTaskCountsByDate(
  tasksByDate: Record<string, Task[]> | undefined
): Record<string, TaskDayStats> {
  const counts: Record<string, TaskDayStats> = {};
  for (const [dateKey, bundle] of Object.entries(buildCalendarDayTasks(tasksByDate))) {
    counts[dateKey] = bundle.stats;
  }
  return counts;
}

/** Stats + marcadores para uma lista de tarefas (mesma fonte que o painel de execução). */
export function buildDayTasksFromList(tasks: Task[] | undefined): CalendarDayTasks {
  const list = Array.isArray(tasks) ? tasks : [];
  const completed = list.filter((t) => t?.completed).length;
  return {
    stats: {
      total: list.length,
      completed,
      pending: list.length - completed
    },
    markers: list.map((t) => ({
      id: t.id,
      completed: Boolean(t.completed),
      priority: t.priority || 'medium'
    }))
  };
}

/** Stats + marcadores (quadradinhos) por dia para o grid do calendário. */
export function buildCalendarDayTasks(
  tasksByDate: Record<string, Task[]> | undefined
): Record<string, CalendarDayTasks> {
  const overlay: Record<string, CalendarDayTasks> = {};
  for (const [dateKey, tasks] of Object.entries(tasksByDate || {})) {
    overlay[dateKey] = buildDayTasksFromList(tasks);
  }
  return overlay;
}

export function getCalendarDayTasks(
  overlay: Record<string, CalendarDayTasks>,
  dateKey: string
): CalendarDayTasks {
  return overlay[dateKey] ?? EMPTY_DAY_TASKS;
}

export function buildEventsByDate(
  events: CalendarEvent[],
  locale: string = CONFIG.LOCALE,
  dateKeys?: string[]
): Record<string, CalendarEvent[]> {
  const grouped: Record<string, CalendarEvent[]> = {};

  if (Array.isArray(dateKeys) && dateKeys.length > 0) {
    for (const dateKey of dateKeys) {
      const dayEvents = getEventOccurrencesForDate(dateKey, events);
      if (dayEvents.length > 0) grouped[dateKey] = dayEvents;
    }
  } else {
    for (const event of events || []) {
      if (!grouped[event.dateKey]) grouped[event.dateKey] = [];
      grouped[event.dateKey].push(event);
    }
  }

  for (const dateKey of Object.keys(grouped)) {
    grouped[dateKey] = sortCalendarEvents(grouped[dateKey], locale);
  }
  return grouped;
}

export function buildCalendarGridDateKeys(monthKey: string): string[] {
  const first = parseMonthKey(monthKey);
  if (Number.isNaN(first.getTime())) return [];
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const dateKeys: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dateKeys.push(getLocalDateKey(date));
  }
  return dateKeys;
}

export function getCalendarEventRecurrenceLabel(recurrence?: CalendarRecurrence): string {
  if (recurrence === 'yearly') return 'Repete todo ano';
  if (recurrence === 'monthly') return 'Repete todo mês';
  if (recurrence === 'weekly') return 'Repete toda semana';
  return 'Não repete';
}

function dateKeyWeekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getDay();
}

export function calendarEventOccursOnDate(event: CalendarEvent, dateKey: string): boolean {
  const occurrenceDateKey = normalizeDateKey(dateKey);
  const eventDateKey = normalizeDateKey(event?.dateKey);
  if (!occurrenceDateKey || !eventDateKey) return false;

  if (event.recurrence === 'yearly') {
    return occurrenceDateKey >= eventDateKey && occurrenceDateKey.slice(5) === eventDateKey.slice(5);
  }

  if (event.recurrence === 'monthly') {
    return occurrenceDateKey >= eventDateKey && occurrenceDateKey.slice(8, 10) === eventDateKey.slice(8, 10);
  }

  if (event.recurrence === 'weekly') {
    return occurrenceDateKey >= eventDateKey && dateKeyWeekday(occurrenceDateKey) === dateKeyWeekday(eventDateKey);
  }

  return occurrenceDateKey === eventDateKey;
}

function toEventOccurrence(event: CalendarEvent, occurrenceDateKey: string): CalendarEvent {
  if (event.dateKey === occurrenceDateKey) return event;
  return { ...event, occurrenceDateKey };
}

export function getEventOccurrencesForDate(
  dateKey: string,
  events: CalendarEvent[] | undefined
): CalendarEvent[] {
  const occurrenceDateKey = normalizeDateKey(dateKey);
  if (!occurrenceDateKey) return [];

  const occurrences = (events || [])
    .filter((event) => calendarEventOccursOnDate(event, occurrenceDateKey))
    .map((event) => toEventOccurrence(event, occurrenceDateKey));

  return sortCalendarEvents(occurrences);
}

export const taskCountsByDate = derived(data, ($d) => buildTaskCountsByDate($d.tasksByDate));

/** Marcadores por dia (histórico salvo) — o dia em execução usa visibleTasks ao vivo na célula. */
export const calendarDayTasks = derived(data, ($d) => buildCalendarDayTasks($d.tasksByDate));

/** Digest só do dia visível no painel de execução — única fonte de tarefas no calendário. */
export const executionTasksDigest = derived(visibleTasks, ($tasks) =>
  ($tasks || [])
    .map(
      (task) =>
        `${task.id}|${task.completed ? 1 : 0}|${task.priority}|${task.updatedAt ?? ''}`
    )
    .join('\n')
);

export const eventsByDate = derived([data, calendarMonth, visibleDateKey], ([$d, $calendarMonth, $visibleDateKey]) =>
  buildEventsByDate(
    getCalendarEvents($d),
    $d.ui?.locale ?? CONFIG.LOCALE,
    buildCalendarGridDateKeys($calendarMonth || $d.ui?.calendarMonth || getMonthKeyFromDateKey($visibleDateKey))
  )
);

export function sortCalendarEvents(
  events: CalendarEvent[],
  locale: string = CONFIG.LOCALE
): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const leftTime = left.startTime || '';
    const rightTime = right.startTime || '';
    if (!leftTime && rightTime) return -1;
    if (leftTime && !rightTime) return 1;
    return leftTime.localeCompare(rightTime) || left.title.localeCompare(right.title, locale);
  });
}

export function getCalendarEvents(state: AppState): CalendarEvent[] {
  return Array.isArray(state.calendarEvents) ? state.calendarEvents : [];
}

export function getEventsForDateKey(dateKey: string): CalendarEvent[] {
  const $data = get(data);
  const events = getEventOccurrencesForDate(dateKey, getCalendarEvents($data));
  return sortCalendarEvents(events, $data.ui?.locale);
}

export function getEventsForMonth(year: number, month: number): CalendarEvent[] {
  const $data = get(data);
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  const dateKeys = buildCalendarGridDateKeys(prefix).filter((dateKey) => dateKey.startsWith(prefix));
  return sortCalendarEvents(
    dateKeys.flatMap((dateKey) => getEventOccurrencesForDate(dateKey, getCalendarEvents($data))),
    $data.ui?.locale
  );
}

export function setCalendarMonth(yearMonth: string) {
  const calendarMonth = normalizeMonthKey(yearMonth);
  if (!calendarMonth) return;
  const $data = get(data);
  data.set({
    ...$data,
    ui: {
      ...$data.ui,
      calendarMonth
    }
  });
  persistStateDebounced();
}

/** Inicializa calendarMonth apenas se estiver vazio (permite navegar a meses anteriores). */
export function ensureCalendarMonthInitialized(todayDateKey: string) {
  const $data = get(data);
  const stored = normalizeMonthKey($data.ui?.calendarMonth) || '';
  if (stored) return;

  const currentMonth = getMonthKeyFromDateKey(todayDateKey);
  if (currentMonth) setCalendarMonth(currentMonth);
}

async function saveCalendarState(nextEvents: CalendarEvent[], success: string, failure: string) {
  return enqueueStatePersistence(async () => {
    const latest = get(data);
    const persisted = mergePersistedState({ ...latest, calendarEvents: nextEvents });
    try {
      await storage.saveState(persisted);
      publishPersistedDomain((current) => ({ ...current, calendarEvents: nextEvents }));
      setAppStatus(success, 'live', get(appDataPath));
      return true;
    } catch {
      setAppStatus(failure, 'error', get(appDataPath));
      return false;
    }
  });
}

export function addCalendarEvent(payload: Partial<CalendarEvent>): Promise<string | null> {
  return enqueueCalendarMutation(async () => {
    const now = new Date().toISOString();
    const event = normalizeCalendarEvent({
      ...payload,
      id: createId('event'),
      createdAt: now,
      updatedAt: now
    });
    if (!event) return null;

    const $data = get(data);
    const nextEvents = sortCalendarEvents([...getCalendarEvents($data), event], $data.ui?.locale);

    const ok = await saveCalendarState(nextEvents, 'Evento salvo localmente.', 'Não foi possível salvar o evento.');
    return ok ? event.id : null;
  });
}

export function updateCalendarEvent(id: string, patch: Partial<CalendarEvent>): Promise<boolean> {
  return enqueueCalendarMutation(async () => {
    const $data = get(data);
    let changed = false;
    const nextEvents = getCalendarEvents($data).map((event) => {
      if (event.id !== id) return event;
      const updated = normalizeCalendarEvent({
        ...event,
        ...patch,
        id: event.id,
        createdAt: event.createdAt,
        updatedAt: new Date().toISOString()
      });
      if (!updated) return event;
      changed = true;
      return updated;
    });
    if (!changed) return false;

    return saveCalendarState(
      sortCalendarEvents(nextEvents, $data.ui?.locale),
      'Evento atualizado localmente.',
      'Não foi possível atualizar o evento.'
    );
  });
}

export function deleteCalendarEvent(id: string): Promise<boolean> {
  return enqueueCalendarMutation(async () => {
    const $data = get(data);
    const currentEvents = getCalendarEvents($data);
    const nextEvents = currentEvents.filter((event) => event.id !== id);
    if (nextEvents.length === currentEvents.length) return false;

    return saveCalendarState(
      nextEvents,
      'Evento excluído.',
      'Não foi possível excluir o evento.'
    );
  });
}

/** Exclui um conjunto fechado de eventos em uma única gravação, evitando estado parcial. */
export function deleteCalendarEvents(ids: string[]): Promise<string[]> {
  return enqueueCalendarMutation(async () => {
    const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()))];
    if (!uniqueIds.length) return [];

    const idSet = new Set(uniqueIds);
    const $data = get(data);
    const currentEvents = getCalendarEvents($data);
    const deletedIds = currentEvents.filter((event) => idSet.has(event.id)).map((event) => event.id);
    if (!deletedIds.length) return [];

    const nextEvents = currentEvents.filter((event) => !idSet.has(event.id));
    const ok = await saveCalendarState(
      nextEvents,
      deletedIds.length === 1 ? 'Evento excluído.' : `${deletedIds.length} eventos excluídos.`,
      'Não foi possível excluir os eventos.'
    );
    return ok ? deletedIds : [];
  });
}

export function getVisibleExecutionDateKey(): string {
  return get(visibleDateKey);
}

export function jumpToExecutionForDate(dateKey: string) {
  setExecutionDateForDateKey(dateKey);
  setPanelTab('execution');
}
