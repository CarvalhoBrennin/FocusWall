import { get } from 'svelte/store';
import type { AppState, CalendarEvent, Task } from '../types/app.js';
import type { AssistantContextEvent, AssistantContextSnapshot, AssistantContextTask } from '../types/assistant.js';
import { data, visibleDateKey, viewOffsetDays } from '../stores/app-store.js';
import { getEventOccurrencesForDate, sortCalendarEvents } from '../stores/calendar-store.js';
import { extractDateKeyFromText } from './intent.js';

const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/**
 * Relative expressions the model would otherwise have to resolve by itself.
 * Resolved with the same parser the deterministic layer uses, so the hints can
 * never disagree with it.
 */
const DATE_HINT_PHRASES = [
  'amanhã',
  'depois de amanhã',
  'segunda que vem',
  'terça que vem',
  'quarta que vem',
  'quinta que vem',
  'sexta que vem',
  'sábado que vem',
  'domingo que vem',
  'semana que vem',
  'mês que vem'
];

function buildDateHints(): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const phrase of DATE_HINT_PHRASES) {
    const dateKey = extractDateKeyFromText(phrase);
    if (dateKey) hints[phrase] = dateKey;
  }
  return hints;
}

function toContextTask(task: Task): AssistantContextTask {
  return {
    id: task.id,
    text: task.text,
    completed: Boolean(task.completed),
    priority: task.priority,
    pinned: Boolean(task.pinned)
  };
}

function toContextEvent(event: CalendarEvent): AssistantContextEvent {
  const occurrenceDateKey = event.occurrenceDateKey || event.dateKey;
  return {
    id: event.id,
    title: event.title,
    dateKey: occurrenceDateKey,
    baseDateKey: event.dateKey,
    occurrenceDateKey: occurrenceDateKey !== event.dateKey ? occurrenceDateKey : undefined,
    startTime: event.startTime,
    endTime: event.endTime,
    notes: event.notes,
    color: event.color,
    recurrence: event.recurrence
  };
}

export function createAssistantContextSnapshot(
  state: AppState,
  activeDateKey: string,
  offsetDays: number
): AssistantContextSnapshot {
  const tasks = Array.isArray(state.tasksByDate?.[activeDateKey]) ? state.tasksByDate[activeDateKey] : [];
  const events = getEventOccurrencesForDate(activeDateKey, state.calendarEvents);
  const completed = tasks.filter((task) => task.completed).length;
  const pinned = tasks.filter((task) => task.pinned).length;
  const now = new Date();

  return {
    visibleDate: activeDateKey,
    viewOffset: offsetDays,
    today: extractDateKeyFromText('hoje') || activeDateKey,
    todayWeekday: WEEKDAY_NAMES[now.getDay()],
    dateHints: buildDateHints(),
    taskCounts: {
      total: tasks.length,
      completed,
      pending: Math.max(0, tasks.length - completed),
      pinned
    },
    tasks: tasks.map(toContextTask),
    eventsToday: sortCalendarEvents(events, state.ui?.locale).map(toContextEvent)
  };
}

export function buildAssistantContextSnapshot(): AssistantContextSnapshot {
  return createAssistantContextSnapshot(get(data), get(visibleDateKey), get(viewOffsetDays));
}

export function buildAssistantContextMessage(snapshot = buildAssistantContextSnapshot()): string {
  // Compact on purpose: indentation roughly doubled the token cost of this
  // message for no benefit to the model.
  return `Contexto atual do FocusWall:\n${JSON.stringify(snapshot)}`;
}
