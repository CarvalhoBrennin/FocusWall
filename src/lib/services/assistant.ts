import { CONFIG } from '../config.js';
import type {
  AssistantActionLog,
  AssistantMessage,
  AssistantPendingChoice,
  AssistantPlan,
  AssistantPlanSource,
  AssistantToolCall,
  AssistantToolResult,
  AssistantTurnCallbacks,
  AssistantTurnResult,
  OllamaChatMessage
} from '../types/assistant.js';
import { buildAssistantContextMessage, buildAssistantContextSnapshot } from '../assistant/context.js';
import {
  extractDateKeyFromText,
  extractTimeRange,
  parseDeterministicAssistantTextResponse,
  resolveDeterministicAssistantIntent
} from '../assistant/intent.js';
import { fuzzyIncludes } from '../assistant/matching.js';
import { extractBirthdayTitleFromText, isBirthdayText } from '../assistant/normalizers.js';
import { createAssistantPlanFromToolCalls, planStepToToolCall } from '../assistant/planner.js';
import { ASSISTANT_SYSTEM_PROMPT } from '../assistant/prompts.js';
import {
  executeAssistantTool,
  focusWallAssistantRuntime,
  getAssistantToolCallArguments,
  getAssistantToolCallName,
  getAssistantToolDefinitions,
  isAssistantToolName,
  previewAssistantTool
} from '../assistant/tools.js';
import { validateAssistantPlan } from '../assistant/validators.js';
import { streamOllamaChat } from './ollama.js';

const MAX_RECENT_HISTORY_MESSAGES = 18;
const MAX_RECENT_MESSAGE_CHARS = 1200;
const MAX_SUMMARY_MESSAGES = 28;
const MAX_SUMMARY_MESSAGE_CHARS = 280;
const MAX_CONVERSATION_CONTEXT_CHARS = 3600;

function hasActionLogs(message: AssistantMessage): boolean {
  return Array.isArray(message.actions) && message.actions.some((action) => action.label.trim());
}

function isChatMessage(message: AssistantMessage): boolean {
  return (message.role === 'user' || message.role === 'assistant') &&
    (Boolean(message.content.trim()) || hasActionLogs(message));
}

function trimForContext(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function toOllamaHistory(messages: AssistantMessage[]): OllamaChatMessage[] {
  return messages
    .filter(isChatMessage)
    .slice(-MAX_RECENT_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: formatMessageForRecentHistory(message)
    }));
}

function getOlderConversationMessages(messages: AssistantMessage[]): AssistantMessage[] {
  const chatMessages = messages.filter(isChatMessage);
  return chatMessages.slice(0, Math.max(0, chatMessages.length - MAX_RECENT_HISTORY_MESSAGES));
}

function formatActionEntries(message: AssistantMessage): string[] {
  return (message.actions || [])
    .filter((action) => action.label.trim())
    .map((action) => `${action.ok ? 'ok' : 'falha'}:${action.tool} ${action.label}`);
}

function formatActionsForContext(message: AssistantMessage): string {
  const actions = formatActionEntries(message);
  if (!actions.length) return '';
  return ` Ações: ${trimForContext(actions.join(' | '), MAX_SUMMARY_MESSAGE_CHARS)}`;
}

function formatMessageForRecentHistory(message: AssistantMessage): string {
  const content = trimForContext(message.content, MAX_RECENT_MESSAGE_CHARS);
  const actions = formatActionEntries(message);
  if (!actions.length) return content;

  const actionText = `Ações executadas: ${actions.join(' | ')}`;
  return trimForContext([content, actionText].filter(Boolean).join('\n'), MAX_RECENT_MESSAGE_CHARS);
}

export function buildAssistantConversationContextMessage(sessionMessages: AssistantMessage[]): string | null {
  const olderMessages = getOlderConversationMessages(sessionMessages);
  if (!olderMessages.length) return null;

  const lines = olderMessages.slice(-MAX_SUMMARY_MESSAGES).map((message) => {
    const speaker = message.role === 'user' ? 'Usuário' : 'Assistente';
    const content = trimForContext(message.content, MAX_SUMMARY_MESSAGE_CHARS);
    return `- ${speaker}: ${content}${formatActionsForContext(message)}`;
  });

  const omitted = Math.max(0, olderMessages.length - lines.length);
  const prefix = [
    'Contexto compacto da conversa anterior:',
    omitted ? `(${omitted} mensagem(ns) mais antiga(s) omitida(s).)` : '',
    'Use isto para manter continuidade em referências como "isso", "aquele evento" ou "a última tarefa". O estado atual do FocusWall continua sendo a fonte de verdade para IDs e dados salvos. Se a referência ainda estiver ambígua, pergunte antes de executar.'
  ].filter(Boolean);

  return trimForContext([...prefix, ...lines].join('\n'), MAX_CONVERSATION_CONTEXT_CHARS);
}

export function buildAssistantChatMessages(sessionMessages: AssistantMessage[]): OllamaChatMessage[] {
  const conversationContext = buildAssistantConversationContextMessage(sessionMessages);
  return [
    { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
    { role: 'system', content: buildAssistantContextMessage() },
    ...(conversationContext ? [{ role: 'system' as const, content: conversationContext }] : []),
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

function extractPrimaryAffectedItemId(toolResult: AssistantToolResult): string | undefined {
  const item = Array.isArray(toolResult.affectedItems) ? toolResult.affectedItems[0] : undefined;
  return item?.id || undefined;
}

function createActionLog(toolResult: AssistantToolResult): AssistantActionLog {
  return {
    id: `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    tool: toolResult.tool,
    label: toolResult.message,
    ok: toolResult.ok,
    changed: Boolean(toolResult.changed),
    itemId: extractPrimaryAffectedItemId(toolResult)
  };
}

function latestUserText(messages: AssistantMessage[]): string {
  return [...messages].reverse().find((message) => message.role === 'user')?.content || '';
}

function normalizeAssistantText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isConfirmationText(text: string): boolean {
  return /^(sim|s|confirmo|confirmado|confirma|pode|pode sim|pode ir|manda|vai|faz|faca|ok|isso|isso mesmo|correto|beleza|claro|com certeza|positivo|bora|uhum|aham|por favor|quero)\b/.test(
    normalizeAssistantText(text)
  );
}

function isCancellationText(text: string): boolean {
  return /^(nao|n|nunca|cancela|cancelar|cancele|deixa|deixa quieto|deixa pra la|esquece|para|pare|melhor nao|nao quero|negativo|nem)\b/.test(
    normalizeAssistantText(text)
  );
}

function looksLikeUnsupportedActionClaim(text: string): boolean {
  const normalized = normalizeAssistantText(text);
  return /\bacoes executadas\b/.test(normalized) ||
    /\b(ok|pronto|confirmado|feito)\s*:\s*(add_|delete_|update_|create_)/.test(normalized) ||
    /\b(evento|tarefa|lembrete|compromisso)s?\s+(criad[oa]s?|adicionad[oa]s?|removid[oa]s?|exclu[ií]d[oa]s?|apagad[oa]s?|atualizad[oa]s?|conclu[ií]d[oa]s?|marcad[oa]s?|agendad[oa]s?)\b/.test(normalized) ||
    /\b(criei|adicionei|removi|exclui|apaguei|atualizei|marquei|agendei|conclui|fixei)\b\s+(?:a|o|as|os|um|uma|seu|sua)?\s*\b(evento|tarefa|lembrete|compromisso|aniversario)/.test(normalized);
}

function findPreviousAssistantMessage(messages: AssistantMessage[]): AssistantMessage | null {
  const latestUserIndex = (() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') return index;
    }
    return -1;
  })();
  if (latestUserIndex < 1) return null;

  for (let index = latestUserIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') return message;
  }
  return null;
}

function getPreviousAssistantPendingToolCall(messages: AssistantMessage[]): AssistantToolCall | null {
  return findPreviousAssistantMessage(messages)?.pendingToolCall || null;
}

function getPreviousAssistantPendingChoices(messages: AssistantMessage[]): AssistantPendingChoice[] | null {
  const choices = findPreviousAssistantMessage(messages)?.pendingChoices;
  return Array.isArray(choices) && choices.length ? choices : null;
}

const ORDINAL_CHOICE_WORDS: Record<string, number> = {
  primeira: 0,
  primeiro: 0,
  um: 0,
  uma: 0,
  segunda: 1,
  segundo: 1,
  dois: 1,
  duas: 1,
  terceira: 2,
  terceiro: 2,
  tres: 2,
  quarta: 3,
  quarto: 3,
  ultima: -1,
  ultimo: -1
};

export function resolveChoiceSelection(choices: AssistantPendingChoice[], text: string): AssistantToolCall | null {
  const normalized = normalizeAssistantText(text).replace(/[.!?]+$/, '').trim();
  if (!normalized) return null;

  const numberMatch = normalized.match(/^(?:a|o)?\s*(\d{1,2})\b/);
  if (numberMatch) {
    const index = Number(numberMatch[1]) - 1;
    return choices[index]?.call || null;
  }

  const ordinalMatch = normalized.match(/^(?:a|o)?\s*([a-z]+)\b/);
  if (ordinalMatch && ordinalMatch[1] in ORDINAL_CHOICE_WORDS) {
    const index = ORDINAL_CHOICE_WORDS[ordinalMatch[1]];
    return (index === -1 ? choices[choices.length - 1] : choices[index])?.call || null;
  }

  const exactMatches = choices.filter((choice) => normalizeAssistantText(choice.label) === normalized);
  if (exactMatches.length === 1) return exactMatches[0].call;

  const tokenMatches = choices.filter((choice) => {
    const labelTokens = new Set(normalizeAssistantText(choice.label).split(/[^a-z0-9]+/).filter(Boolean));
    const queryTokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
    return queryTokens.length > 0 && queryTokens.every((token) => labelTokens.has(token));
  });
  if (tokenMatches.length === 1) return tokenMatches[0].call;

  const labelMatches = choices.filter(
    (choice) => fuzzyIncludes(choice.label, normalized) || fuzzyIncludes(normalized, choice.label)
  );
  if (labelMatches.length === 1) return labelMatches[0].call;
  return null;
}

function isProtectedTool(name: string): boolean {
  return name === 'delete_task' || name === 'delete_calendar_event' || name === 'delete_calendar_events';
}

function parseReliableBirthdayToolCall(text: string): AssistantToolCall | null {
  if (!isBirthdayText(text)) return null;
  const dateKey = extractDateKeyFromText(text);
  if (!dateKey) return null;
  const title = extractBirthdayTitleFromText(text) || 'Aniversário';
  const times = extractTimeRange(text);
  return {
    function: {
      name: 'add_calendar_event',
      arguments: {
        title,
        dateKey,
        ...(times.startTime ? { startTime: times.startTime } : {}),
        ...(times.endTime ? { endTime: times.endTime } : {}),
        recurrence: 'yearly',
        color: 'accent'
      }
    }
  };
}

function buildConfirmationRequest(call: AssistantToolCall): AssistantTurnResult | null {
  const tool = getAssistantToolCallName(call);
  if (!isProtectedTool(tool)) return null;

  const preview = previewAssistantTool(tool, getAssistantToolCallArguments(call));
  if (!preview) return null;

  if (!preview.ok || preview.reason === 'not_found') {
    return { content: preview.message, actions: [] };
  }

  const content = `${preview.message}\nResponda "sim" para executar ou "não" para cancelar.`;
  return {
    content,
    actions: [],
    pendingToolCall: call
  };
}

async function runDeterministicToolCall(
  call: AssistantToolCall,
  callbacks: AssistantTurnCallbacks,
  originalText = ''
): Promise<AssistantTurnResult> {
  return runPlannedToolCalls([call], 'deterministic', originalText, callbacks);
}

function blockedPlanResult(message: string, callbacks: AssistantTurnCallbacks): AssistantTurnResult {
  callbacks.onToken?.(message);
  return { content: message, actions: [] };
}

async function executeValidatedPlan(
  plan: AssistantPlan,
  callbacks: AssistantTurnCallbacks,
  confirmed = false
): Promise<AssistantTurnResult> {
  const { plan: validatedPlan, validation } = validateAssistantPlan(plan);
  if (!validation.ok) {
    return blockedPlanResult(
      validation.question || 'Não consegui montar uma ação segura com esse pedido. Pode reformular com mais detalhes?',
      callbacks
    );
  }

  if (!confirmed) {
    for (const step of validatedPlan.steps) {
      const confirmation = buildConfirmationRequest(planStepToToolCall(step));
      if (confirmation) {
        if (confirmation.pendingToolCall) callbacks.onStatus?.('awaiting_confirmation');
        callbacks.onToken?.(confirmation.content);
        return confirmation;
      }
    }

    if (validation.needsConfirmation) {
      const pendingToolCall = planStepToToolCall(validatedPlan.steps[0]);
      const content = `${validation.question || 'Quer que eu execute essa ação?'}\nResponda "sim" para executar ou "não" para cancelar.`;
      callbacks.onStatus?.('awaiting_confirmation');
      callbacks.onToken?.(content);
      return { content, actions: [], pendingToolCall };
    }
  }

  callbacks.onStatus?.('executing');
  const actions: AssistantActionLog[] = [];
  const messages: string[] = [];
  for (const step of validatedPlan.steps) {
    const toolResult = await executeAssistantTool(step.tool, step.args);
    const action = createActionLog(toolResult);
    actions.push(action);
    messages.push(toolResult.message);
    callbacks.onToolResult?.(action, toolResult);
  }

  const ok = actions.every((action) => action.ok);
  const prefix = confirmed ? 'Confirmado.' : 'Pronto.';
  const content = ok ? `${prefix} ${messages.join(' ')}` : messages.join(' ');

  callbacks.onToken?.(content);
  return { content, actions };
}

async function runPlannedToolCalls(
  calls: AssistantToolCall[],
  source: AssistantPlanSource,
  originalText: string,
  callbacks: AssistantTurnCallbacks,
  confirmed = false
): Promise<AssistantTurnResult> {
  const plan = createAssistantPlanFromToolCalls(calls, source, originalText);
  if (!plan) {
    return blockedPlanResult('Não encontrei uma ferramenta segura para executar esse pedido.', callbacks);
  }
  return executeValidatedPlan(plan, callbacks, confirmed);
}

export async function runAssistantTurn(
  sessionMessages: AssistantMessage[],
  callbacks: AssistantTurnCallbacks = {},
  signal?: AbortSignal,
  model = CONFIG.ASSISTANT.model
): Promise<AssistantTurnResult> {
  const latestText = latestUserText(sessionMessages);
  const pendingToolCall = getPreviousAssistantPendingToolCall(sessionMessages);
  if (pendingToolCall && isConfirmationText(latestText)) {
    return runPlannedToolCalls([pendingToolCall], 'confirmation', latestText, callbacks, true);
  }
  if (pendingToolCall && isCancellationText(latestText)) {
    const content = 'Cancelado. Nenhuma alteração foi feita.';
    callbacks.onToken?.(content);
    return { content, actions: [] };
  }

  const pendingChoices = getPreviousAssistantPendingChoices(sessionMessages);
  if (pendingChoices) {
    if (isCancellationText(latestText)) {
      const content = 'Ok, deixei tudo como está.';
      callbacks.onToken?.(content);
      return { content, actions: [] };
    }
    const selected = resolveChoiceSelection(pendingChoices, latestText);
    if (selected) {
      return runPlannedToolCalls([selected], 'confirmation', latestText, callbacks, true);
    }
    if (isConfirmationText(latestText)) {
      const content = `Preciso que você escolha uma das opções:\n${pendingChoices
        .map((choice, index) => `${index + 1}. ${choice.label}`)
        .join('\n')}`;
      callbacks.onToken?.(content);
      return { content, actions: [], pendingChoices };
    }
  }

  const deterministicResponse = parseDeterministicAssistantTextResponse(latestText);
  if (deterministicResponse) {
    callbacks.onToken?.(deterministicResponse);
    return { content: deterministicResponse, actions: [] };
  }

  const reliableBirthdayCall = parseReliableBirthdayToolCall(latestText);
  if (reliableBirthdayCall) {
    return runDeterministicToolCall(reliableBirthdayCall, callbacks, latestText);
  }

  const deterministicIntent = resolveDeterministicAssistantIntent(sessionMessages, buildAssistantContextSnapshot(), {
    events: focusWallAssistantRuntime.getCalendarEvents()
  });
  if (deterministicIntent?.kind === 'question') {
    callbacks.onToken?.(deterministicIntent.content);
    return { content: deterministicIntent.content, actions: [] };
  }
  if (deterministicIntent?.kind === 'choice') {
    callbacks.onStatus?.('awaiting_confirmation');
    callbacks.onToken?.(deterministicIntent.content);
    return { content: deterministicIntent.content, actions: [], pendingChoices: deterministicIntent.choices };
  }
  if (deterministicIntent?.kind === 'tool_call') {
    return runDeterministicToolCall(deterministicIntent.call, callbacks, latestText);
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
      // A false "done" claim is blocked only when no real tool ran in this turn;
      // after real actions, a final natural-language response is legitimate.
      if (!actions.length && looksLikeUnsupportedActionClaim(response.content)) {
        const content = 'Não executei nenhuma ação: o modelo afirmou ter feito algo sem chamar uma ferramenta real. Nada foi alterado. Envie o pedido novamente que eu executo pela ferramenta correta.';
        callbacks.onContentReset?.();
        callbacks.onToken?.(content);
        return { content, actions };
      }
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
    const plan = createAssistantPlanFromToolCalls(
      toolCalls,
      nativeCalls.length ? 'model_tool' : 'model_json',
      latestText
    );
    if (!plan) {
      const content = 'Não encontrei uma ferramenta segura para executar esse pedido.';
      callbacks.onContentReset?.();
      callbacks.onToken?.(content);
      return { content, actions };
    }

    const { plan: validatedPlan, validation } = validateAssistantPlan(plan);
    if (!validation.ok) {
      const content = validation.question || 'Não consegui montar uma ação segura com esse pedido. Pode reformular com mais detalhes?';
      callbacks.onContentReset?.();
      callbacks.onToken?.(content);
      return { content, actions };
    }

    for (const step of validatedPlan.steps) {
      const call = planStepToToolCall(step);
      const confirmation = buildConfirmationRequest(call);
      if (confirmation) {
        if (confirmation.pendingToolCall) callbacks.onStatus?.('awaiting_confirmation');
        callbacks.onContentReset?.();
        callbacks.onToken?.(confirmation.content);
        return { ...confirmation, actions };
      }
    }

    if (validation.needsConfirmation) {
      const pendingToolCall = planStepToToolCall(validatedPlan.steps[0]);
      const content = `${validation.question || 'Quer que eu execute essa ação?'}\nResponda "sim" para executar ou "não" para cancelar.`;
      callbacks.onStatus?.('awaiting_confirmation');
      callbacks.onContentReset?.();
      callbacks.onToken?.(content);
      return { content, actions, pendingToolCall };
    }

    for (const step of validatedPlan.steps) {
      const toolResult = await executeAssistantTool(step.tool, step.args);
      const action = createActionLog(toolResult);
      actions.push(action);
      callbacks.onToolResult?.(action, toolResult);
      messages.push({
        role: 'tool',
        tool_name: step.tool,
        content: JSON.stringify(toolResult)
      });
    }
  }

  const limitMessage = 'Parei porque muitas ações foram solicitadas em sequência. Envie um pedido menor.';
  callbacks.onContentReset?.();
  callbacks.onToken?.(limitMessage);
  return { content: limitMessage, actions, stoppedByLimit: true };
}
