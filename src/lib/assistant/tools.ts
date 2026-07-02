import { get } from 'svelte/store';
import { PRIORITY, VIEW } from '../config.js';
import type { CalendarEvent, Priority, Task } from '../types/app.js';
import type {
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
  deleteCalendarEvent,
  getCalendarEvents,
  getEventsForDateKey,
  updateCalendarEvent
} from '../stores/calendar-store.js';
import { buildAssistantContextSnapshot } from './context.js';
import {
  normalizeCalendarColor,
  normalizeCalendarNotes,
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
          color: { type: 'string', enum: ['neutral', 'accent', 'success', 'danger'] }
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
          color: { type: 'string', enum: ['neutral', 'accent', 'success', 'danger'] }
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

function result(tool: string, ok: boolean, message: string, data?: unknown, changed = false): AssistantToolResult {
  return { ok, tool, message, changed, data };
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
  return {
    id: event.id,
    title: event.title,
    dateKey: event.dateKey,
    startTime: event.startTime,
    endTime: event.endTime,
    notes: event.notes,
    color: event.color
  };
}

async function executeGetContext(runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  return result('get_context', true, 'Contexto carregado.', runtime.getContext());
}

async function executeListTasks(runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const tasks = runtime.getTasks().map(serializeTask);
  return result('list_tasks', true, `${tasks.length} tarefa(s) na data visível.`, { tasks });
}

async function executeAddTask(args: AssistantToolArguments, runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const text = normalizeTaskText(getStringArg(args, 'text'));
  if (!text) return result('add_task', false, 'Informe o texto da tarefa.');
  const priority = normalizePriority(getStringArg(args, 'priority')) as Priority;
  const id = await runtime.addTask(text, priority);
  if (!id) return result('add_task', false, 'Não foi possível criar a tarefa.');
  return result('add_task', true, `Tarefa adicionada: ${text}.`, { id, text, priority }, true);
}

async function executeCompleteTask(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const task = findTask(runtime, id);
  if (!task) return result('complete_task', false, 'Tarefa não encontrada.');
  const desired = getBooleanArg(args, 'completed');
  if (desired !== null && task.completed === desired) {
    return result(
      'complete_task',
      true,
      desired ? 'A tarefa já estava concluída.' : 'A tarefa já estava em aberto.',
      { task: serializeTask(task) }
    );
  }
  await runtime.toggleTask(id);
  const nextCompleted = desired ?? !task.completed;
  return result(
    'complete_task',
    true,
    nextCompleted ? `Tarefa concluída: ${task.text}.` : `Tarefa reaberta: ${task.text}.`,
    { id, completed: nextCompleted },
    true
  );
}

async function executeDeleteTask(args: AssistantToolArguments, runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const task = findTask(runtime, id);
  if (!task) return result('delete_task', false, 'Tarefa não encontrada.');
  await runtime.deleteTask(id);
  return result('delete_task', true, `Tarefa excluída: ${task.text}.`, { task: serializeTask(task) }, true);
}

async function executeSetTaskPriority(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const task = findTask(runtime, id);
  if (!task) return result('set_task_priority', false, 'Tarefa não encontrada.');
  const rawPriority = getStringArg(args, 'priority');
  if (![PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW].includes(rawPriority as Priority)) {
    return result('set_task_priority', false, 'Prioridade inválida. Use high, medium ou low.');
  }
  const priority = rawPriority as Priority;
  if (task.priority === priority) {
    return result('set_task_priority', true, 'A tarefa já estava com essa prioridade.', { task: serializeTask(task) });
  }
  await runtime.updateTask(id, (draft) => {
    draft.priority = priority;
    draft.updatedAt = new Date().toISOString();
  });
  return result('set_task_priority', true, `Prioridade alterada para ${priority}.`, { id, priority }, true);
}

async function executePinTask(args: AssistantToolArguments, runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const task = findTask(runtime, id);
  if (!task) return result('pin_task', false, 'Tarefa não encontrada.');
  const desired = getBooleanArg(args, 'pinned');
  if (desired !== null && task.pinned === desired) {
    return result(
      'pin_task',
      true,
      desired ? 'A tarefa já estava fixada.' : 'A tarefa já estava desfixada.',
      { task: serializeTask(task) }
    );
  }
  await runtime.toggleTaskPin(id);
  const nextPinned = desired ?? !task.pinned;
  return result(
    'pin_task',
    true,
    nextPinned ? `Tarefa fixada: ${task.text}.` : `Tarefa desfixada: ${task.text}.`,
    { id, pinned: nextPinned },
    true
  );
}

async function executeListCalendarEvents(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const context = runtime.getContext();
  const dateKey = normalizeDateKey(getStringArg(args, 'dateKey')) || context.visibleDate;
  const events = runtime.getEventsForDate(dateKey).map(serializeEvent);
  return result('list_calendar_events', true, `${events.length} evento(s) em ${dateKey}.`, { dateKey, events });
}

async function executeAddCalendarEvent(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const title = normalizeCalendarTitle(getStringArg(args, 'title'));
  const dateKey = normalizeDateKey(getStringArg(args, 'dateKey'));
  if (!title) return result('add_calendar_event', false, 'Informe o título do evento.');
  if (!dateKey) return result('add_calendar_event', false, 'Informe uma data válida no formato YYYY-MM-DD.');

  const startTime = normalizeTimeValue(getStringArg(args, 'startTime')) || undefined;
  const endTime = normalizeTimeValue(getStringArg(args, 'endTime')) || undefined;
  const notes = normalizeCalendarNotes(getStringArg(args, 'notes')) || undefined;
  const color = normalizeCalendarColor(getStringArg(args, 'color'));
  const id = await runtime.addCalendarEvent({ title, dateKey, startTime, endTime, notes, color });
  if (!id) return result('add_calendar_event', false, 'Não foi possível criar o evento.');
  return result('add_calendar_event', true, `Evento criado: ${title}.`, { id, title, dateKey }, true);
}

async function executeUpdateCalendarEvent(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const event = findCalendarEvent(runtime, id);
  if (!event) return result('update_calendar_event', false, 'Evento não encontrado.');

  const patch: Partial<CalendarEvent> = {};
  if ('title' in args) {
    const title = normalizeCalendarTitle(getStringArg(args, 'title'));
    if (!title) return result('update_calendar_event', false, 'Título do evento inválido.');
    patch.title = title;
  }
  if ('dateKey' in args) {
    const dateKey = normalizeDateKey(getStringArg(args, 'dateKey'));
    if (!dateKey) return result('update_calendar_event', false, 'Data inválida.');
    patch.dateKey = dateKey;
  }
  if ('startTime' in args) patch.startTime = normalizeTimeValue(getStringArg(args, 'startTime')) || undefined;
  if ('endTime' in args) patch.endTime = normalizeTimeValue(getStringArg(args, 'endTime')) || undefined;
  if ('notes' in args) patch.notes = normalizeCalendarNotes(getStringArg(args, 'notes')) || undefined;
  if ('color' in args) patch.color = normalizeCalendarColor(getStringArg(args, 'color'));

  const ok = await runtime.updateCalendarEvent(id, patch);
  if (!ok) return result('update_calendar_event', false, 'Não foi possível atualizar o evento.');
  return result('update_calendar_event', true, `Evento atualizado: ${event.title}.`, { id, patch }, true);
}

async function executeDeleteCalendarEvent(
  args: AssistantToolArguments,
  runtime: AssistantToolRuntime
): Promise<AssistantToolResult> {
  const id = getStringArg(args, 'id');
  const event = findCalendarEvent(runtime, id);
  if (!event) return result('delete_calendar_event', false, 'Evento não encontrado.');
  const ok = await runtime.deleteCalendarEvent(id);
  if (!ok) return result('delete_calendar_event', false, 'Não foi possível excluir o evento.');
  return result('delete_calendar_event', true, `Evento excluído: ${event.title}.`, { event: serializeEvent(event) }, true);
}

async function executeGoToDate(args: AssistantToolArguments, runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  const dateKey = normalizeDateKey(getStringArg(args, 'dateKey'));
  if (!dateKey) return result('go_to_date', false, 'Informe uma data válida no formato YYYY-MM-DD.');
  runtime.goToDate(dateKey);
  return result('go_to_date', true, `Data visível alterada para ${dateKey}.`, { dateKey }, true);
}

async function executeGoToToday(runtime: AssistantToolRuntime): Promise<AssistantToolResult> {
  runtime.goToToday();
  return result('go_to_today', true, 'Data visível alterada para hoje.', undefined, true);
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
    case 'go_to_date':
      return executeGoToDate(args, runtime);
    case 'go_to_today':
      return executeGoToToday(runtime);
    default:
      return result(name || 'unknown_tool', false, 'Tool desconhecida.');
  }
}
