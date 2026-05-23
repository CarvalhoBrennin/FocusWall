import { get, derived } from 'svelte/store';
import { CONFIG } from '../config.js';
import { storage } from '../services/storage.js';
import {
  normalizeCalendarEvent,
  normalizeMonthKey,
  createId,
  parseDateKey
} from '../utils/state.js';
import type { AppState, CalendarEvent } from '../types/app.js';
import { setPanelTab } from './ui-store.js';
import { data, currentDateKey, viewOffsetDays, editingTaskId, appDataPath, persistStateDebounced, setAppStatus } from './app-store.js';

export const calendarMonth = derived(data, ($d) => $d.ui?.calendarMonth ?? '');

export function sortCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const leftTime = left.startTime || '';
    const rightTime = right.startTime || '';
    if (!leftTime && rightTime) return -1;
    if (leftTime && !rightTime) return 1;
    return leftTime.localeCompare(rightTime) || left.title.localeCompare(right.title, CONFIG.LOCALE);
  });
}

export function getCalendarEvents(state: AppState): CalendarEvent[] {
  return Array.isArray(state.calendarEvents) ? state.calendarEvents : [];
}

export function getEventsForDateKey(dateKey: string): CalendarEvent[] {
  const events = getCalendarEvents(get(data)).filter((event) => event.dateKey === dateKey);
  return sortCalendarEvents(events);
}

export function getEventsForMonth(year: number, month: number): CalendarEvent[] {
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  return sortCalendarEvents(getCalendarEvents(get(data)).filter((event) => event.dateKey?.startsWith(prefix)));
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

async function saveCalendarState(nextData: AppState, success: string, failure: string) {
  try {
    await storage.saveState(nextData);
    data.set(nextData);
    setAppStatus(success, 'live', get(appDataPath));
    return true;
  } catch {
    setAppStatus(failure, 'error', get(appDataPath));
    return false;
  }
}

export async function addCalendarEvent(payload: Partial<CalendarEvent>): Promise<string | null> {
  const now = new Date().toISOString();
  const event = normalizeCalendarEvent({
    ...payload,
    id: createId('event'),
    createdAt: now,
    updatedAt: now
  });
  if (!event) return null;

  const $data = get(data);
  const nextData: AppState = {
    ...$data,
    calendarEvents: sortCalendarEvents([...getCalendarEvents($data), event])
  };

  const ok = await saveCalendarState(nextData, 'Evento salvo localmente.', 'Não foi possível salvar o evento.');
  return ok ? event.id : null;
}

export async function updateCalendarEvent(id: string, patch: Partial<CalendarEvent>): Promise<boolean> {
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
    { ...$data, calendarEvents: sortCalendarEvents(nextEvents) },
    'Evento atualizado localmente.',
    'Não foi possível atualizar o evento.'
  );
}

export async function deleteCalendarEvent(id: string): Promise<boolean> {
  const $data = get(data);
  const nextEvents = getCalendarEvents($data).filter((event) => event.id !== id);
  if (nextEvents.length === getCalendarEvents($data).length) return false;

  return saveCalendarState(
    { ...$data, calendarEvents: nextEvents },
    'Evento excluído.',
    'Não foi possível excluir o evento.'
  );
}

export function jumpToExecutionForDate(dateKey: string) {
  const target = parseDateKey(dateKey);
  if (Number.isNaN(target.getTime())) return;
  const current = parseDateKey(get(currentDateKey));
  const offset = Math.round((target.getTime() - current.getTime()) / CONFIG.MS_PER_DAY);
  viewOffsetDays.set(offset);
  editingTaskId.set(null);
  setPanelTab('execution');
  persistStateDebounced();
}
