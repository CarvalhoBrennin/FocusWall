import type { CalendarColor, Priority } from './app.js';

export type AssistantRole = 'user' | 'assistant';
export type AssistantStatus = 'checking' | 'offline' | 'ready' | 'thinking' | 'executing' | 'error';

export type AssistantToolName =
  | 'get_context'
  | 'list_tasks'
  | 'add_task'
  | 'complete_task'
  | 'delete_task'
  | 'set_task_priority'
  | 'pin_task'
  | 'list_calendar_events'
  | 'add_calendar_event'
  | 'update_calendar_event'
  | 'delete_calendar_event'
  | 'go_to_date'
  | 'go_to_today';

export type AssistantToolArguments = Record<string, unknown>;

export interface AssistantToolCall {
  id?: string;
  function: {
    name: string;
    arguments?: AssistantToolArguments | string;
  };
}

export interface AssistantToolResult {
  ok: boolean;
  tool: string;
  message: string;
  changed?: boolean;
  data?: unknown;
}

export interface AssistantActionLog {
  id: string;
  tool: string;
  label: string;
  ok: boolean;
  changed: boolean;
}

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  createdAt: string;
  actions?: AssistantActionLog[];
  error?: boolean;
  pending?: boolean;
}

export interface AssistantContextTask {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  pinned: boolean;
}

export interface AssistantContextEvent {
  id: string;
  title: string;
  dateKey: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  color?: CalendarColor;
}

export interface AssistantContextSnapshot {
  visibleDate: string;
  viewOffset: number;
  taskCounts: {
    total: number;
    completed: number;
    pending: number;
    pinned: number;
  };
  tasks: AssistantContextTask[];
  eventsToday: AssistantContextEvent[];
}

export interface AssistantTurnResult {
  content: string;
  actions: AssistantActionLog[];
  stoppedByLimit?: boolean;
}

export interface AssistantTurnCallbacks {
  onToken?: (chunk: string) => void;
  onContentReset?: () => void;
  onToolResult?: (action: AssistantActionLog, result: AssistantToolResult) => void;
  onStatus?: (status: AssistantStatus) => void;
}

export interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: AssistantToolName;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  thinking?: string;
  tool_calls?: AssistantToolCall[];
  tool_name?: string;
}

export interface OllamaStreamResult {
  content: string;
  thinking: string;
  toolCalls: AssistantToolCall[];
  doneReason?: string;
}

export interface OllamaModelInfo {
  name: string;
  modified_at?: string;
  size?: number;
}

export interface OllamaHealth {
  online: boolean;
  models: OllamaModelInfo[];
  error?: string;
  baseUrl?: string;
}
