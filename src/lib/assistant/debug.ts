/**
 * Turn telemetry, off by default.
 *
 * Which path a turn took (deterministic shortcut vs. model), how many rounds it
 * needed and which tools ran is otherwise invisible, which makes every report of
 * "the assistant did the wrong thing" a guess.
 *
 * Enable in the app console with:
 *   localStorage.setItem('focuswall.assistantDebug', '1')
 */

const STORAGE_KEY = 'focuswall.assistantDebug';

export type AssistantTurnPath =
  | 'confirmation'
  | 'cancellation'
  | 'choice_selection'
  | 'choice_prompt'
  | 'canned_text'
  | 'deterministic'
  | 'model'
  | 'unknown';

export interface AssistantTurnTrace {
  path: AssistantTurnPath;
  rounds: number;
  tools: string[];
  startedAt: number;
  stoppedByLimit?: boolean;
}

export function createTurnTrace(): AssistantTurnTrace {
  return { path: 'unknown', rounds: 0, tools: [], startedAt: Date.now() };
}

let override: boolean | null = null;

/** Forces tracing on or off; pass null to fall back to the stored flag. */
export function setAssistantDebugEnabled(value: boolean | null): void {
  override = value;
}

export function isAssistantDebugEnabled(): boolean {
  if (override !== null) return override;
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function traceAssistantTurn(trace: AssistantTurnTrace): void {
  if (!isAssistantDebugEnabled()) return;
  const durationMs = Date.now() - trace.startedAt;
  const summary = [
    `path=${trace.path}`,
    `rounds=${trace.rounds}`,
    `tools=${trace.tools.join(',') || 'nenhuma'}`,
    `${durationMs}ms`,
    trace.stoppedByLimit ? 'stoppedByLimit' : ''
  ].filter(Boolean).join(' ');
  console.info(`[assistant] ${summary}`);
}
