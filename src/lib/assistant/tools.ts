import { get } from 'svelte/store';
import { PRIORITY, VIEW } from '../config.js';
import type { CalendarEvent, Priority, Task } from '../types/app.js';
import type {
  AssistantAffectedItem,
  AssistantContextSnapshot,
  AssistantToolArguments,
  AssistantToolCall,
  AssistantToolName,
  AssistantToolResult,
  OllamaToolDefinition
} from '../types/assistant.js';
import {
  addTask,
  deleteTask,
  setExecutionDateForDateKey,
  setViewOffset,
  toggleTask,
  toggleTaskPin,
  updateTask,
  visibleTasks,
  data
} from '../stores/app-store.js';
import {
  addCalendarEvent,
  calendarEventOccursOnDate,
  deleteCalendarEvent,
  getCalendarEvents,
  getEventsForDateKey,
  updateCalendarEvent
} from '../stores/calendar-store.js';
import { buildAssistantContextSnapshot } from './context.js';
import { fuzzyIncludes, normalizeComparableTitle, titlesRoughlyEqual } from './matching.js';
import {
  normalizeCalendarColor,
  normalizeCalendarNotes,
  normalizeCalendarRecurrence,
  normalizeCalendarTitle,
  normalizeDateKey,
  normalizePriority,
  normalizeTaskText,
  normalizeTimeValue
} from '../utils/state.js';

export interface AssistantToolRuntime {
  getContext: () => AssistantContextSnapshot;
  getTasks: () => Task[];
  getCalendarEvents: () => CalendarEvent[];
  getEventsForDate: (dateKey: string) => CalendarEvent[];
  addTask: (text: string, priority: Priority) => Promise<string | null>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateTask: (id: string, updater: (task: Task) => void) => Promise<void>;
  toggleTaskPin: (id: string) => Promise<void>;
  addCalendarEvent: (payload: Partial<CalendarEvent>) => Promise<string | null>;
  updateCalendarEvent: (id: string, patch: Partial<CalendarEvent>) => Promise<boolean>;
  deleteCalendarEvent: (id: string) => Promise<boolean>;
  goToDate: (dateKey: string) => void;
  goToToday: () => void;
}

const priorityProperty = {
  type: 'string',
  enum: [PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW],
  description: 'Prioridade da tarefa: high, medium ou low.'
};

const dateKeyProperty = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Data no formato YYYY-MM-DD.'
};

const timeProperty = {
  type: 'string',
  pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
  description: 'Horário no formato HH:mm.'
};

const recurrenceProperty = {
  type: 'string',
  enum: ['none', 'weekly', 'monthly', 'yearly'],
  description: 'Repetição do evento: none, weekly, monthly ou yearly. Use yearly para aniversários e weekly para compromissos semanais.'
};

const calendarColors = ['neutral', 'accent', 'success', 'danger'] as const;
const calendarRecurrences = ['none', 'weekly', 'monthly', 'yearly'] as const;

function isValidCalendarColor(value: string): boolean {
  return (calendarColors as readonly string[]).includes(value);
}

function isValidCalendarRecurrence(value: string): boolean {
  return (calendarRecurrences as readonly string[]).includes(value);
}

const assistantToolDefinitions: OllamaToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_context',
      description: 'Lê o contexto atual do FocusWall: data visível, contagens, tarefas e eventos do dia.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Lista as tarefas da data visível no painel de execução.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Cria uma tarefa na data visível.',
      parameters: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Texto da tarefa.' },
          priority: priorityProperty
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Marca uma tarefa como concluída ou reabre uma tarefa existente.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'ID da tarefa.' },
          completed: { type: 'boolean', description: 'true para concluir, false para reabrir. Se omitido, alterna.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Exclui uma tarefa existente da data visível.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'ID da tarefa.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_task_priority',
      description: 'Altera a prioridade de uma tarefa existente.',
      parameters: {
        type: 'object',
        required: ['id', 'priority'],
        properties: {
          id: { type: 'string', description: 'ID da tarefa.' },
          priority: priorityProperty
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pin_task',
      description: 'Fixa ou desfixa uma tarefa existente.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'ID da tarefa.' },
          pinned: { type: 'boolean', description: 'true para fixar, false para desfixar. Se omitido, alterna.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_calendar_events',
      description: 'Lista eventos de uma data. Se dateKey for omitido, usa a data visível.',
      parameters: {
        type: 'object',
        properties: {
          dateKey: dateKeyProperty
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_calendar_event',
      description: 'Cria um evento de calendário.',
      parameters: {
        type: 'object',
        required: ['title', 'dateKey'],
        properties: {
          title: { type: 'string', description: 'Título do evento.' },
          dateKey: dateKeyProperty,
          startTime: timeProperty,
          endTime: timeProperty,
          notes: { type: 'string', description: 'Observações curtas.' },
          color: { type: 'string', enum: ['neutral', 'accent', 'success', 'danger'] },
          recurrence: recurrenceProperty
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_calendar_event',
      description: 'Edita um evento existente.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'ID do evento.' },
          title: { type: 'string' },
          dateKey: dateKeyProperty,
          startTime: timeProperty,
          endTime: timeProperty,
          notes: { type: 'string' },
          color: { type: 'string', enum: ['neutral', 'accent', 'success', 'danger'] },
          recurrence: recurrenceProperty
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_calendar_event',
      description: 'Remove um evento de calendário existente.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'ID do evento.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_calendar_events',
      description: 'Remove eventos de calendário por data e filtros opcionais. Use para pedidos como remover todos os eventos recorrentes de um dia.',
      parameters: {
        type: 'object',
        required: ['dateKey'],
        properties: {
          dateKey: dateKeyProperty,
          title: { type: 'string', description: 'Título ou parte do título para filtrar. Omita para todos os eventos do dia.' },
          recurring: { type: 'boolean', description: 'true para remover apenas eventos recorrentes, independentemente do tipo.' },
          recurrence: recurrenceProperty
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'go_to_date',
      description: 'Muda a data visível do painel de execução.',
      parameters: {
        type: 'object',
        required: ['dateKey'],
        properties: {
          dateKey: dateKeyProperty
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'go_to_today',
      description: 'Volta a data visível para hoje.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

export const focusWallAssistantRuntime: AssistantToolRuntime = {
  getContext: buildAssistantContextSnapshot,
  getTasks: () => get(visibleTasks) || [],
  getCalendarEvents: () => getCalendarEvents(get(data)),
  getEventsForDate: (dateKey: string) => getEventsForDateKey(dateKey),
  addTask: (text, priority) => addTask(text, priority),
  toggleTask: (id) => toggleTask(id),
  deleteTask: (id) => deleteTask(id, undefined),
  updateTask: (id, updater) => updateTask(id, updater),
  toggleTaskPin: (id) => toggleTaskPin(id),
  addCalendarEvent: (payload) => addCalendarEvent(payload),
  updateCalendarEvent: (id, patch) => updateCalendarEvent(id, patch),
  deleteCalendarEvent: (id) => deleteCalendarEvent(id),
  goToDate: (dateKey) => setExecutionDateForDateKey(dateKey),
  goToToday: () => setViewOffset(VIEW.TODAY)
};

export function getAssistantToolDefinitions(): OllamaToolDefinition[] {
  return assistantToolDefinitions;
}

export function isAssistantToolName(name: string): name is AssistantToolName {
  return assistantToolDefinitions.some((tool) => tool.function.name === name);
}

export function normalizeToolArguments(args: unknown): AssistantToolArguments {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return args && typeof args === 'object' && !Array.isArray(args) ? args as AssistantToolArguments : {};
}

export function getAssistantToolCallName(call: AssistantToolCall): string {
  return String(call?.function?.name || '');
}

export function getAssistantToolCallArguments(call: AssistantToolCall): AssistantToolArguments {
  return normalizeToolArguments(call?.function?.arguments);
}

interface AssistantToolResultOptions {
  data?: unknown;
  changed?: boolean;
  matchedCount?: number;
  changedCount?: number;
  reason?: string;
  affectedItems?: AssistantAffectedItem[];
}

function result(
  tool: string,
  ok: boolean,
  message: string,
  options: AssistantToolResultOptions = {}
): AssistantToolResult {
  const affectedItems = options.affectedItems || [];
  const changed = Boolean(options.changed);
  return {
    ok,
    tool,
    message,
    changed,
    matchedCount: options.matchedCount ?? affectedItems.length,
    changedCount: options.changedCount ?? (changed ? Math.max(1, affectedItems.length) : 0),
    reason: options.reason || '',
    affectedItems,
    data: options.data
  };
}

function taskItem(task: Task): AssistantAffectedItem {
  return { type: 'task', id: task.id, label: task.text };
}

function eventItem(event: CalendarEvent): AssistantAffectedItem {
  return { type: 'event', id: event.id, label: event.title };
}

function getStringArg(args: AssistantToolArguments, name: string): string {
  return typeof args[name] === 'string' ? String(args[name]).trim() : '';
}

function getBooleanArg(args: AssistantToolArguments, name: string): boolean | null {
  return typeof args[name] === 'boolean' ? Boolean(args[name]) : null;
}

function findTask(runtime: AssistantToolRuntime, id: string): Task | null {
  return runtime.getTasks().find((task) => task.id === id) ?? null;
}

function findCalendarEvent(runtime: AssistantToolRuntime, id: string): CalendarEvent | null {
  return runtime.getCalendarEvents().find((event) => event.id === id) ?? null;
}

function calendarEventMatchesPayload(
  event: CalendarEvent,
  payload: {
    title: string;
    dateKey: string;
    startTime?: string;
    endTime?: string;
    recurrence?: string;
  }
): boolean {
  return titlesRoughlyEqual(event.title, payload.title) &&
    event.dateKey === payload.dateKey &&
    (event.startTime || '') === (payload.startTime || '') &&
    (event.endTime || '') === (payload.endTime || '') &&
    (event.recurrence || 'none') === (payload.recurrence || 'none');
}

function serializeTask(task: Task) {
  return {
    id: task.id,
    text: task.text,
    completed: task.completed,
    priority: task.priority,
    pinned: task.pinned
  };
}

function serializeEvent(event: CalendarEvent) {
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

function describeEventList(events: CalendarEvent[]): string {
  if (!events.length) return 'nenhum evento';
  return events
    .slice(0, 5)
    .map((event) => event.title)
    .join(', ') + (events.length > 5 ? ` e mais ${events.length - 5}` : '');
}

function findCalendarEventsForDeletion(args: AssistantToolArguments, runtime: AssistantToolRuntime): {
  dateKey: string;
  matches: CalendarEvent[];
  error?: AssistantToolResult;
} {
  const dateKey = normalizeDateKey(getStringArg(args, 'dateKey'));
  if (!dateKey) {
    return {
      dateKey: '',
      matches: [],
      error: result('delete_calendar_events', false, 'Informe uma data válida no formato YYYY-MM-DD.', { reason: 'invalid_date' })
    };
  }

  const rawRecurrence = getStringArg(args, 'recurrence');
  if (rawRecurrence && !isValidCalendarRecurrence(rawRecurrence)) {
    return {
      dateKey,
      matches: [],
      error: result('delete_calendar_events', false, 'Recorrência inválida. Use none, monthly ou yearly.', { reason: 'invalid_recurrence' })
    };
  }

  const titleFilter = normalizeComparableTitle(getStringArg(args, 'title'));
  const recurringOnly = getBooleanArg(args, 'recurring') === true;
  const recurrence = rawRecurrence ? normalizeCalendarRecurrence(rawRecurrence) : '';
  const matches = runtime.getCalendarEvents().filter((event) => {
    if (!calendarEventOccursOnDate(event, dateKey)) return false;
    if (recurringOnly && (event.recurrence || 'none') === 'none') return false;
    if (recurrence && (event.recurrence || 'none') !== recurrence) return false;
    if (titleFilter && !normalizeComparableTitle(event.title).includes(titleFilter) && !fuzzyIncludes(normalizeComparableTitle(event.title), titleFilter)) return false;
    return true;
  });

  return { dateKey, matches };
}

async function executeGetContext(runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  return result('get_context', true, 'Contexto carregado.', { data: runtime.getContext() });
}

async function executeListTasks(runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const tasks = runtime.getTasks();
  return result('list_tasks', true, `${tasks.length} tarefa(s) na data visível.`, {
    data: { tasks: tasks.map(serializeTask) },
    matchedCount: tasks.length,
    affectedItems: tasks.map(taskItem)
  });
}

async function executeAddTask(args: AssistantToolArguments, runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const text = normalizeTaskText(getStringArg(args, 'text'));
  if (!text) return result('add_task', false, 'Informe o texto da tarefa.', { reason: 'invalid_text' });
  const priority = normalizePriority(getStringArg(args, 'priority')) as Priority;
  const id = await runtime.addTask(text, priority);
  if (!id) return result('add_task', false, 'Não foi possível criar a tarefa.', { reason: 'store_error' });
  return result('add_task', true, `Tarefa adicionada: ${text}.`, {
    data: { id, text, priority },
    changed: true,
    matchedCount: 1,
    affectedItems: [{ type: 'task', id, label: text }]
  });
}

async function executeCompleteTask(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const task = findTask(runtime, id);
  if (!task) return result('complete_task', false, 'Tarefa não encontrada.', { reason: 'not_found' });
  const desired = getBooleanArg(args, 'completed');
  if (desired !== null && task.completed === desired) {
    return result(
      'complete_task',
      true,
      desired ? 'A tarefa já estava concluída.' : 'A tarefa já estava em aberto.',
      { data: { task: serializeTask(task) }, matchedCount: 1, reason: 'no_change_needed', affectedItems: [taskItem(task)] }
    );
  }
  await runtime.toggleTask(id);
  const nextCompleted = desired ?? !task.completed;
  return result(
    'complete_task',
    true,
    nextCompleted ? `Tarefa concluída: ${task.text}.` : `Tarefa reaberta: ${task.text}.`,
    { data: { id, completed: nextCompleted }, changed: true, matchedCount: 1, affectedItems: [taskItem(task)] }
  );
}

async function executeDeleteTask(args: AssistantToolArguments, runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const task = findTask(runtime, id);
  if (!task) return result('delete_task', false, 'Tarefa não encontrada.', { reason: 'not_found' });
  await runtime.deleteTask(id);
  return result('delete_task', true, `Tarefa excluída: ${task.text}.`, {
    data: { task: serializeTask(task) },
    changed: true,
    matchedCount: 1,
    affectedItems: [taskItem(task)]
  });
}

async function executeSetTaskPriority(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const task = findTask(runtime, id);
  if (!task) return result('set_task_priority', false, 'Tarefa não encontrada.', { reason: 'not_found' });
  const rawPriority = getStringArg(args, 'priority');
  if (![PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW].includes(rawPriority as Priority)) {
    return result('set_task_priority', false, 'Prioridade inválida. Use high, medium ou low.', { reason: 'invalid_priority' });
  }
  const priority = rawPriority as Priority;
  if (task.priority === priority) {
    return result('set_task_priority', true, 'A tarefa já estava com essa prioridade.', {
      data: { task: serializeTask(task) },
      matchedCount: 1,
      reason: 'no_change_needed',
      affectedItems: [taskItem(task)]
    });
  }
  await runtime.updateTask(id, (draft) => {
    draft.priority = priority;
    draft.updatedAt = new Date().toISOString();
  });
  return result('set_task_priority', true, `Prioridade alterada para ${priority}.`, {
    data: { id, priority },
    changed: true,
    matchedCount: 1,
    affectedItems: [taskItem(task)]
  });
}

async function executePinTask(args: AssistantToolArguments, runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const task = findTask(runtime, id);
  if (!task) return result('pin_task', false, 'Tarefa não encontrada.', { reason: 'not_found' });
  const desired = getBooleanArg(args, 'pinned');
  if (desired !== null && task.pinned === desired) {
    return result(
      'pin_task',
      true,
      desired ? 'A tarefa já estava fixada.' : 'A tarefa já estava desfixada.',
      { data: { task: serializeTask(task) }, matchedCount: 1, reason: 'no_change_needed', affectedItems: [taskItem(task)] }
    );
  }
  await runtime.toggleTaskPin(id);
  const nextPinned = desired ?? !task.pinned;
  return result(
    'pin_task',
    true,
    nextPinned ? `Tarefa fixada: ${task.text}.` : `Tarefa desfixada: ${task.text}.`,
    { data: { id, pinned: nextPinned }, changed: true, matchedCount: 1, affectedItems: [taskItem(task)] }
  );
}

async function executeListCalendarEvents(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const context = runtime.getContext();
  const rawDateKey = getStringArg(args, 'dateKey');
  const dateKey = rawDateKey ? normalizeDateKey(rawDateKey) : context.visibleDate;
  if (!dateKey) return result('list_calendar_events', false, 'Informe uma data válida no formato YYYY-MM-DD.', { reason: 'invalid_date' });
  const events = runtime.getEventsForDate(dateKey);
  return result('list_calendar_events', true, `${events.length} evento(s) em ${dateKey}.`, {
    data: { dateKey, events: events.map(serializeEvent) },
    matchedCount: events.length,
    affectedItems: events.map(eventItem)
  });
}

async function executeAddCalendarEvent(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const title = normalizeCalendarTitle(getStringArg(args, 'title'));
  const dateKey = normalizeDateKey(getStringArg(args, 'dateKey'));
  if (!title) return result('add_calendar_event', false, 'Informe o título do evento.', { reason: 'invalid_title' });
  if (!dateKey) return result('add_calendar_event', false, 'Informe uma data válida no formato YYYY-MM-DD.', { reason: 'invalid_date' });

  const startTime = normalizeTimeValue(getStringArg(args, 'startTime')) || undefined;
  const endTime = normalizeTimeValue(getStringArg(args, 'endTime')) || undefined;
  if ('startTime' in args && getStringArg(args, 'startTime') && !startTime) {
    return result('add_calendar_event', false, 'Horário inicial inválido. Use HH:mm.', { reason: 'invalid_time' });
  }
  if ('endTime' in args && getStringArg(args, 'endTime') && !endTime) {
    return result('add_calendar_event', false, 'Horário final inválido. Use HH:mm.', { reason: 'invalid_time' });
  }
  if (startTime && endTime && endTime < startTime) {
    return result('add_calendar_event', false, 'O horário final precisa ser depois do início.', { reason: 'invalid_time_range' });
  }
  const notes = normalizeCalendarNotes(getStringArg(args, 'notes')) || undefined;
  const rawColor = getStringArg(args, 'color');
  if (rawColor && !isValidCalendarColor(rawColor)) {
    return result('add_calendar_event', false, 'Cor inválida. Use neutral, accent, success ou danger.', { reason: 'invalid_color' });
  }
  const rawRecurrence = getStringArg(args, 'recurrence');
  if (rawRecurrence && !isValidCalendarRecurrence(rawRecurrence)) {
    return result('add_calendar_event', false, 'Recorrência inválida. Use none, monthly ou yearly.', { reason: 'invalid_recurrence' });
  }
  const color = normalizeCalendarColor(rawColor);
  const recurrence = normalizeCalendarRecurrence(rawRecurrence);
  const duplicate = runtime.getCalendarEvents().find((event) =>
    calendarEventMatchesPayload(event, { title, dateKey, startTime, endTime, recurrence })
  );
  if (duplicate) {
    return result(
      'add_calendar_event',
      true,
      `Evento já existia: ${duplicate.title}.`,
      {
        data: { event: serializeEvent(duplicate), duplicate: true },
        matchedCount: 1,
        reason: 'duplicate',
        affectedItems: [eventItem(duplicate)]
      }
    );
  }
  const id = await runtime.addCalendarEvent({ title, dateKey, startTime, endTime, notes, color, recurrence });
  if (!id) return result('add_calendar_event', false, 'Não foi possível criar o evento.', { reason: 'store_error' });
  return result('add_calendar_event', true, `Evento criado: ${title}.`, {
    data: { id, title, dateKey, recurrence },
    changed: true,
    matchedCount: 1,
    affectedItems: [{ type: 'event', id, label: title }]
  });
}

async function executeUpdateCalendarEvent(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const event = findCalendarEvent(runtime, id);
  if (!event) return result('update_calendar_event', false, 'Evento não encontrado.', { reason: 'not_found' });

  const patch: Partial<CalendarEvent> = {};
  if ('title' in args) {
    const title = normalizeCalendarTitle(getStringArg(args, 'title'));
    if (!title) return result('update_calendar_event', false, 'Título do evento inválido.', { reason: 'invalid_title' });
    patch.title = title;
  }
  if ('dateKey' in args) {
    const dateKey = normalizeDateKey(getStringArg(args, 'dateKey'));
    if (!dateKey) return result('update_calendar_event', false, 'Data inválida.', { reason: 'invalid_date' });
    patch.dateKey = dateKey;
  }
  if ('startTime' in args) {
    const rawStart = getStringArg(args, 'startTime');
    const startTime = normalizeTimeValue(rawStart);
    if (rawStart && !startTime) return result('update_calendar_event', false, 'Horário inicial inválido. Use HH:mm.', { reason: 'invalid_time' });
    patch.startTime = startTime || undefined;
  }
  if ('endTime' in args) {
    const rawEnd = getStringArg(args, 'endTime');
    const endTime = normalizeTimeValue(rawEnd);
    if (rawEnd && !endTime) return result('update_calendar_event', false, 'Horário final inválido. Use HH:mm.', { reason: 'invalid_time' });
    patch.endTime = endTime || undefined;
  }
  const nextStartTime = 'startTime' in patch ? patch.startTime : event.startTime;
  const nextEndTime = 'endTime' in patch ? patch.endTime : event.endTime;
  if (nextStartTime && nextEndTime && nextEndTime < nextStartTime) {
    return result('update_calendar_event', false, 'O horário final precisa ser depois do início.', { reason: 'invalid_time_range' });
  }
  if ('notes' in args) patch.notes = normalizeCalendarNotes(getStringArg(args, 'notes')) || undefined;
  if ('color' in args) {
    const rawColor = getStringArg(args, 'color');
    if (rawColor && !isValidCalendarColor(rawColor)) {
      return result('update_calendar_event', false, 'Cor inválida. Use neutral, accent, success ou danger.', { reason: 'invalid_color' });
    }
    patch.color = normalizeCalendarColor(rawColor);
  }
  if ('recurrence' in args) {
    const rawRecurrence = getStringArg(args, 'recurrence');
    if (rawRecurrence && !isValidCalendarRecurrence(rawRecurrence)) {
      return result('update_calendar_event', false, 'Recorrência inválida. Use none, monthly ou yearly.', { reason: 'invalid_recurrence' });
    }
    patch.recurrence = normalizeCalendarRecurrence(rawRecurrence);
  }

  if (Object.keys(patch).length === 0) {
    return result('update_calendar_event', false, 'Informe ao menos um campo para atualizar.', { reason: 'empty_patch' });
  }

  const ok = await runtime.updateCalendarEvent(id, patch);
  if (!ok) return result('update_calendar_event', false, 'Não foi possível atualizar o evento.', { reason: 'store_error' });
  return result('update_calendar_event', true, `Evento atualizado: ${event.title}.`, {
    data: { id, patch },
    changed: true,
    matchedCount: 1,
    affectedItems: [eventItem(event)]
  });
}

async function executeDeleteCalendarEvent(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const event = findCalendarEvent(runtime, id);
  if (!event) return result('delete_calendar_event', false, 'Evento não encontrado.', { reason: 'not_found' });
  const ok = await runtime.deleteCalendarEvent(id);
  if (!ok) return result('delete_calendar_event', false, 'Não foi possível excluir o evento.', { reason: 'store_error' });
  return result('delete_calendar_event', true, `Evento excluído: ${event.title}.`, {
    data: { event: serializeEvent(event) },
    changed: true,
    matchedCount: 1,
    affectedItems: [eventItem(event)]
  });
}

async function executeDeleteCalendarEvents(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const { dateKey, matches, error } = findCalendarEventsForDeletion(args, runtime);
  if (error) return error;

  if (!matches.length) {
    return result('delete_calendar_events', true, 'Nenhum evento encontrado para remover.', {
      data: { dateKey, deleted: [] },
      reason: 'not_found'
    });
  }

  const deleted: CalendarEvent[] = [];
  for (const event of matches) {
    const ok = await runtime.deleteCalendarEvent(event.id);
    if (ok) deleted.push(event);
  }

  if (!deleted.length) {
    return result('delete_calendar_events', false, 'Não foi possível remover os eventos encontrados.', {
      data: { dateKey },
      matchedCount: matches.length,
      reason: 'store_error'
    });
  }

  const titles = deleted.map((event) => event.title).join(', ');
  return result(
    'delete_calendar_events',
    true,
    `Eventos removidos: ${titles}.`,
    {
      data: { dateKey, deleted: deleted.map(serializeEvent) },
      changed: true,
      matchedCount: matches.length,
      changedCount: deleted.length,
      affectedItems: deleted.map(eventItem)
    }
  );
}

async function executeGoToDate(args: AssistantToolArguments, runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const dateKey = normalizeDateKey(getStringArg(args, 'dateKey'));
  if (!dateKey) return result('go_to_date', false, 'Informe uma data válida no formato YYYY-MM-DD.', { reason: 'invalid_date' });
  runtime.goToDate(dateKey);
  return result('go_to_date', true, `Data visível alterada para ${dateKey}.`, { data: { dateKey }, changed: true });
}

async function executeGoToToday(runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  runtime.goToToday();
  return result('go_to_today', true, 'Data visível alterada para hoje.', { changed: true });
}

export function previewAssistantTool(
  name: string,
  rawArgs: unknown = {},
  runtime: AssistantToolRuntime = focusWallAssistantRuntime
): AssistantToolResult | null {
  const args = normalizeToolArguments(rawArgs);

  if (name === 'delete_task') {
    const id = getStringArg(args, 'id');
    const task = findTask(runtime, id);
    if (!task) return result(name, false, 'Tarefa não encontrada.', { reason: 'not_found' });
    return result(
      name,
      true,
      `Vou remover a tarefa: ${task.text}. Confirmar?`,
      {
        data: { task: serializeTask(task) },
        matchedCount: 1,
        reason: 'needs_confirmation',
        affectedItems: [taskItem(task)]
      }
    );
  }

  if (name === 'delete_calendar_event') {
    const id = getStringArg(args, 'id');
    const event = findCalendarEvent(runtime, id);
    if (!event) return result(name, false, 'Evento não encontrado.', { reason: 'not_found' });
    return result(
      name,
      true,
      `Vou remover o evento: ${event.title}. Confirmar?`,
      {
        data: { event: serializeEvent(event) },
        matchedCount: 1,
        reason: 'needs_confirmation',
        affectedItems: [eventItem(event)]
      }
    );
  }

  if (name === 'delete_calendar_events') {
    const { dateKey, matches, error } = findCalendarEventsForDeletion(args, runtime);
    if (error) return error;
    if (!matches.length) {
      return result(
        name,
        true,
        `Nenhum evento encontrado em ${dateKey} para remover.`,
        { data: { dateKey, matches: [] }, reason: 'not_found' }
      );
    }
    return result(
      name,
      true,
      `Encontrei ${matches.length} evento(s) para remover em ${dateKey}: ${describeEventList(matches)}. Confirmar remoção?`,
      {
        data: { dateKey, matches: matches.map(serializeEvent) },
        matchedCount: matches.length,
        reason: 'needs_confirmation',
        affectedItems: matches.map(eventItem)
      }
    );
  }

  return null;
}

export async function executeAssistantTool(
  name: string,
  rawArgs: unknown = {},
  runtime: AssistantToolRuntime = focusWallAssistantRuntime
): Promise<AssistantToolResult> {
  const args = normalizeToolArguments(rawArgs);

  switch (name) {
    case 'get_context':
      return executeGetContext(runtime);
    case 'list_tasks':
      return executeListTasks(runtime);
    case 'add_task':
      return executeAddTask(args, runtime);
    case 'complete_task':
      return executeCompleteTask(args, runtime);
    case 'delete_task':
      return executeDeleteTask(args, runtime);
    case 'set_task_priority':
      return executeSetTaskPriority(args, runtime);
    case 'pin_task':
      return executePinTask(args, runtime);
    case 'list_calendar_events':
      return executeListCalendarEvents(args, runtime);
    case 'add_calendar_event':
      return executeAddCalendarEvent(args, runtime);
    case 'update_calendar_event':
      return executeUpdateCalendarEvent(args, runtime);
    case 'delete_calendar_event':
      return executeDeleteCalendarEvent(args, runtime);
    case 'delete_calendar_events':
      return executeDeleteCalendarEvents(args, runtime);
    case 'go_to_date':
      return executeGoToDate(args, runtime);
    case 'go_to_today':
      return executeGoToToday(runtime);
    default:
      return result(name || 'unknown_tool', false, 'Tool desconhecida.', { reason: 'unknown_tool' });
  }
}
