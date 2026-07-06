import type { CalendarColor, CalendarRecurrence, Priority } from './app.js';

export type AssistantRole = 'user' | 'assistant';
export type AssistantStatus =
  | 'checking'
  | 'starting'
  | 'offline'
  | 'ready'
  | 'thinking'
  | 'executing'
  | 'awaiting_confirmation'
  | 'error';

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
  | 'delete_calendar_events'
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

export type AssistantPlanSource = 'deterministic' | 'model_tool' | 'model_json' | 'confirmation';
export type AssistantPlanRisk = 'low' | 'medium' | 'high';
export type AssistantPlanStatus = 'ready' | 'needs_confirmation' | 'blocked';

export interface AssistantPlanStep {
  id: string;
  tool: AssistantToolName;
  args: AssistantToolArguments;
  description: string;
  risk: AssistantPlanRisk;
}

export interface AssistantPlan {
  id: string;
  source: AssistantPlanSource;
  status: AssistantPlanStatus;
  confidence: number;
  risk: AssistantPlanRisk;
  originalText: string;
  steps: AssistantPlanStep[];
}

export interface AssistantPlanValidation {
  ok: boolean;
  needsConfirmation: boolean;
  reason: string;
  fixedArgs?: AssistantToolArguments;
  question?: string;
  confidence?: number;
}

export interface AssistantAffectedItem {
  type: 'task' | 'event';
  id: string;
  label: string;
}

export interface AssistantToolResult {
  ok: boolean;
  tool: string;
  message: string;
  changed: boolean;
  matchedCount: number;
  changedCount: number;
  reason: string;
  affectedItems: AssistantAffectedItem[];
  data?: unknown;
}

export interface AssistantActionLog {
  id: string;
  tool: string;
  label: string;
  ok: boolean;
  changed: boolean;
  /** Primary affected item ID, when available. Used to resolve references such as "isso". */
  itemId?: string;
}

/** Option shown when a reference is ambiguous; the user reply selects the exact tool call. */
export interface AssistantPendingChoice {
  label: string;
  call: AssistantToolCall;
}

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  createdAt: string;
  actions?: AssistantActionLog[];
  pendingToolCall?: AssistantToolCall;
  pendingChoices?: AssistantPendingChoice[];
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
  /** Visible occurrence date for recurring events; equal to the saved date for one-off events. */
  dateKey: string;
  /** Saved base date for the event. Use only when moving the full recurring series. */
  baseDateKey?: string;
  /** Expanded occurrence date when it differs from the base date. */
  occurrenceDateKey?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  color?: CalendarColor;
  recurrence?: CalendarRecurrence;
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
  pendingToolCall?: AssistantToolCall;
  pendingChoices?: AssistantPendingChoice[];
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

export interface OllamaStartResult {
  online: boolean;
  started: boolean;
  message: string;
  error?: string;
  baseUrl?: string;
}

export interface OllamaModelInstallResult {
  installed: boolean;
  model: string;
  message: string;
  error?: string;
  baseUrl?: string;
}
