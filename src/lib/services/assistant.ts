import { CONFIG } from '../config.js';
import type {
  AssistantActionLog,
  AssistantMessage,
  AssistantToolCall,
  AssistantTurnCallbacks,
  AssistantTurnResult,
  OllamaChatMessage
} from '../types/assistant.js';
import { buildAssistantContextMessage } from '../assistant/context.js';
import { parseDeterministicAssistantTextResponse, parseDeterministicAssistantToolCall } from '../assistant/intent.js';
import { ASSISTANT_SYSTEM_PROMPT } from '../assistant/prompts.js';
import {
  executeAssistantTool,
  getAssistantToolCallArguments,
  getAssistantToolCallName,
  getAssistantToolDefinitions,
  isAssistantToolName
} from '../assistant/tools.js';
import { streamOllamaChat } from './ollama.js';

const MAX_HISTORY_MESSAGES = 18;

function toOllamaHistory(messages: AssistantMessage[]): OllamaChatMessage[] {
  return messages
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({ role: message.role, content: message.content.trim() }));
}

export function buildAssistantChatMessages(sessionMessages: AssistantMessage[]): OllamaChatMessage[] {
  return [
    { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
    { role: 'system', content: buildAssistantContextMessage() },
    ...toOllamaHistory(sessionMessages)
  ];
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function findBalancedJson(text: string): string {
  const source = stripJsonFence(text);
  const start = source.search(/[\[{]/);
  if (start < 0) return source;
  const open = source[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }

  return source.slice(start);
}

function parseJsonPayload(text: string): unknown | null {
  const candidates = [stripJsonFence(text), findBalancedJson(text)];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function toFallbackCall(entry: unknown): AssistantToolCall | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  const name = String(record.action || record.tool || record.name || '').trim();
  if (!isAssistantToolName(name)) return null;
  const args = record.args || record.arguments || record.input || {};
  return { function: { name, arguments: args as Record<string, unknown> } };
}

export function parseFallbackToolCalls(text: string): AssistantToolCall[] {
  const payload = parseJsonPayload(text);
  if (!payload) return [];
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { actions?: unknown[] })?.actions)
      ? (payload as { actions: unknown[] }).actions
      : [payload];
  return entries.map(toFallbackCall).filter(Boolean) as AssistantToolCall[];
}

function createActionLog(tool: string, message: string, ok: boolean, changed: boolean): AssistantActionLog {
  return {
    id: `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    tool,
    label: message,
    ok,
    changed
  };
}

function latestUserText(messages: AssistantMessage[]): string {
  return [...messages].reverse().find((message) => message.role === 'user')?.content || '';
}

async function runDeterministicToolCall(
  call: AssistantToolCall,
  callbacks: AssistantTurnCallbacks
): Promise<AssistantTurnResult> {
  callbacks.onStatus?.('executing');
  const tool = getAssistantToolCallName(call);
  const args = getAssistantToolCallArguments(call);
  const toolResult = await executeAssistantTool(tool, args);
  const action = createActionLog(tool, toolResult.message, toolResult.ok, Boolean(toolResult.changed));
  callbacks.onToolResult?.(action, toolResult);

  const text = typeof args.text === 'string' ? args.text : '';
  const priorityLabel = args.priority === 'high' ? 'alta' : args.priority === 'low' ? 'baixa' : 'média';
  const content = toolResult.ok
    ? `Pronto. Adicionei "${text}" como tarefa de prioridade ${priorityLabel}.`
    : toolResult.message;

  callbacks.onToken?.(content);
  return { content, actions: [action] };
}

export async function runAssistantTurn(
  sessionMessages: AssistantMessage[],
  callbacks: AssistantTurnCallbacks = {},
  signal?: AbortSignal,
  model = CONFIG.ASSISTANT.model
): Promise<AssistantTurnResult> {
  const deterministicResponse = parseDeterministicAssistantTextResponse(latestUserText(sessionMessages));
  if (deterministicResponse) {
    callbacks.onToken?.(deterministicResponse);
    return { content: deterministicResponse, actions: [] };
  }

  const deterministicCall = parseDeterministicAssistantToolCall(latestUserText(sessionMessages));
  if (deterministicCall) {
    return runDeterministicToolCall(deterministicCall, callbacks);
  }

  const messages = buildAssistantChatMessages(sessionMessages);
  const actions: AssistantActionLog[] = [];

  for (let round = 0; round < CONFIG.ASSISTANT.maxToolRounds; round += 1) {
    callbacks.onStatus?.(round === 0 ? 'thinking' : 'executing');
    let streamedContent = '';
    const response = await streamOllamaChat({
      model,
      messages,
      tools: getAssistantToolDefinitions(),
      signal,
      onContent: (chunk) => {
        streamedContent += chunk;
        callbacks.onToken?.(chunk);
      }
    });

    const nativeCalls = response.toolCalls;
    const fallbackCalls = nativeCalls.length ? [] : parseFallbackToolCalls(response.content);
    const toolCalls = nativeCalls.length ? nativeCalls : fallbackCalls;

    if (!toolCalls.length) {
      return { content: response.content, actions };
    }

    if (streamedContent.trim()) {
      callbacks.onContentReset?.();
    }

    messages.push({
      role: 'assistant',
      content: response.content,
      thinking: response.thinking,
      tool_calls: toolCalls
    });

    callbacks.onStatus?.('executing');
    for (const call of toolCalls) {
      const tool = getAssistantToolCallName(call);
      const args = getAssistantToolCallArguments(call);
      const toolResult = await executeAssistantTool(tool, args);
      const action = createActionLog(tool, toolResult.message, toolResult.ok, Boolean(toolResult.changed));
      actions.push(action);
      callbacks.onToolResult?.(action, toolResult);
      messages.push({
        role: 'tool',
        tool_name: tool,
        content: JSON.stringify(toolResult)
      });
    }
  }

  const limitMessage = 'Parei porque muitas ações foram solicitadas em sequência. Envie um pedido menor.';
  callbacks.onContentReset?.();
  callbacks.onToken?.(limitMessage);
  return { content: limitMessage, actions, stoppedByLimit: true };
}
