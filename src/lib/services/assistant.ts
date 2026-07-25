import { CONFIG } from '../config.js';
import type {
  AssistantActionLog,
  AssistantMessage,
  AssistantPendingChoice,
  AssistantPlan,
  AssistantPlanSource,
  AssistantPlanStep,
  AssistantToolArguments,
  AssistantToolCall,
  AssistantToolResult,
  AssistantTurnCallbacks,
  AssistantTurnResult,
  OllamaChatMessage
} from '../types/assistant.js';
import { buildAssistantContextMessage, buildAssistantContextSnapshot } from '../assistant/context.js';
import {
  parseDeterministicAssistantTextResponse,
  resolveDeterministicAssistantIntent
} from '../assistant/intent.js';
import { fuzzyIncludes } from '../assistant/matching.js';
import { createAssistantPlanFromToolCalls, planStepToToolCall, toolCallKey } from '../assistant/planner.js';
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
import { createTurnTrace, traceAssistantTurn, type AssistantTurnTrace } from '../assistant/debug.js';
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

function parseJsonPayload(text: string): unknown | null {
  const candidate = stripJsonFence(text);
  if (!candidate || !/^[\[{]/.test(candidate) || !/[\]}]$/.test(candidate)) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
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

function stripReplyPunctuation(text: string): string {
  return normalizeAssistantText(text).replace(/[.!,;:]+$/, '').trim();
}

function countWords(text: string): number {
  return normalizeAssistantText(text).split(' ').filter(Boolean).length;
}

function isConfirmationText(text: string): boolean {
  return /^(sim|s|confirmo|confirmado|confirma|pode|pode sim|pode ir|manda|vai|faz|faca|ok|isso|isso mesmo|correto|beleza|claro|com certeza|positivo|bora|uhum|aham|por favor|quero)\b/.test(
    normalizeAssistantText(text)
  );
}

/**
 * Confirmation gate for destructive plans. The loose prefix match above accepts
 * ordinary sentences that merely start with "vai", "faz" or "ok" ("vai ter
 * reunião amanhã?"), which would silently execute a pending deletion. Here the
 * whole reply must be an explicit yes.
 */
const STRICT_CONFIRMATION_RE =
  /^(sim|s|ok|okay|confirmo|confirmado|confirma|confirmar|pode|pode sim|pode apagar|pode remover|pode excluir|sim pode|isso|isso mesmo|correto|exato|claro|positivo|afirmativo|beleza|blz|certeza|com certeza|sim por favor|por favor sim)$/;

function isStrictConfirmationText(text: string): boolean {
  return STRICT_CONFIRMATION_RE.test(stripReplyPunctuation(text));
}

const MAX_CANCELLATION_WORDS = 5;

function isCancellationText(text: string): boolean {
  // A longer sentence that happens to start with "para" or "não" is a new
  // request, not a cancellation, and must not swallow the user's message.
  if (countWords(text) > MAX_CANCELLATION_WORDS) return false;
  return /^(nao|n|nunca|cancela|cancelar|cancele|deixa|deixa quieto|deixa pra la|esquece|para|pare|melhor nao|nao quero|negativo|nem)\b/.test(
    normalizeAssistantText(text)
  );
}

/**
 * Detects a model claiming it performed an action without calling a tool. Only
 * first-person perfective verbs and echoes of our own machine formatting count:
 * the previous version also matched plain participles, so a legitimate read
 * answer such as "você tem 2 tarefas concluídas hoje" was replaced by a warning.
 */
function looksLikeUnsupportedActionClaim(text: string): boolean {
  const normalized = normalizeAssistantText(text);
  return /\bacoes executadas\b/.test(normalized) ||
    /\b(ok|pronto|confirmado|feito)\s*:\s*(add_|delete_|update_|create_)/.test(normalized) ||
    /\b(criei|adicionei|registrei|inclui|coloquei|agendei|marquei|removi|apaguei|deletei|exclui|atualizei|alterei|mudei|conclui|finalizei|terminei|completei|reabri|fixei|desafixei|remarquei|adiei)\b/.test(normalized);
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

function isMutatingTool(name: string): boolean {
  return !['get_context', 'list_tasks', 'list_calendar_events'].includes(name);
}

function getPreviousAssistantPendingPlan(messages: AssistantMessage[]): AssistantPlan | null {
  return findPreviousAssistantMessage(messages)?.pendingPlan || null;
}

function createAbortError(): Error {
  try {
    return new DOMException('Operação cancelada.', 'AbortError');
  } catch {
    const error = new Error('Operação cancelada.');
    error.name = 'AbortError';
    return error;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function blockedPlanResult(message: string, callbacks: AssistantTurnCallbacks): AssistantTurnResult {
  callbacks.onToken?.(message);
  return { content: message, actions: [] };
}

/**
 * Runs the dry-run preview of every destructive step once, and pins the exact
 * IDs a bulk deletion may touch so the confirmed run cannot pick up items that
 * appeared while the user was deciding.
 */
function freezeProtectedPlan(plan: AssistantPlan): {
  plan: AssistantPlan;
  previews: AssistantToolResult[];
  error?: AssistantToolResult;
} {
  const previews: AssistantToolResult[] = [];
  const steps: AssistantPlanStep[] = [];
  let error: AssistantToolResult | undefined;

  for (const step of plan.steps) {
    if (!isProtectedTool(step.tool)) {
      steps.push(step);
      continue;
    }

    const preview = previewAssistantTool(step.tool, step.args);
    if (!preview) {
      steps.push(step);
      continue;
    }
    if (!preview.ok || preview.reason === 'not_found') {
      error = error || preview;
      steps.push(step);
      continue;
    }

    previews.push(preview);
    steps.push(step.tool === 'delete_calendar_events'
      ? { ...step, args: { ...step.args, expectedIds: preview.affectedItems.map((item) => item.id) } }
      : step);
  }

  return { plan: { ...plan, steps }, previews, ...(error ? { error } : {}) };
}

function buildPlanConfirmationRequest(
  plan: AssistantPlan,
  validationQuestion: string | undefined,
  callbacks: AssistantTurnCallbacks
): AssistantTurnResult {
  const frozen = freezeProtectedPlan(plan);
  if (frozen.error) return blockedPlanResult(frozen.error.message, callbacks);

  const previewLines = frozen.previews.map((preview) => preview.message.replace(/\s*Confirmar\??$/i, '').trim());
  const question = validationQuestion || (previewLines.length ? 'Confirmar a execução desse plano?' : 'Quer que eu execute essa ação?');
  const content = [
    ...previewLines,
    question,
    'Responda "sim" para executar ou "não" para cancelar.'
  ].filter(Boolean).join('\n');
  callbacks.onStatus?.('awaiting_confirmation');
  callbacks.onToken?.(content);
  return {
    content,
    actions: [],
    pendingPlan: frozen.plan,
    ...(frozen.plan.steps.length === 1 ? { pendingToolCall: planStepToToolCall(frozen.plan.steps[0]) } : {})
  };
}

async function executeValidatedPlan(
  plan: AssistantPlan,
  callbacks: AssistantTurnCallbacks,
  confirmed = false,
  signal?: AbortSignal
): Promise<AssistantTurnResult> {
  const { plan: validatedPlan, validation } = validateAssistantPlan(plan);
  if (!validation.ok) {
    return blockedPlanResult(
      validation.question || 'Não consegui montar uma ação segura com esse pedido. Pode reformular com mais detalhes?',
      callbacks
    );
  }

  const protectedPlan = validatedPlan.steps.some((step) => isProtectedTool(step.tool));
  if (!confirmed && (protectedPlan || validation.needsConfirmation)) {
    return buildPlanConfirmationRequest(validatedPlan, validation.question, callbacks);
  }

  callbacks.onStatus?.('executing');
  const actions: AssistantActionLog[] = [];
  const messages: string[] = [];
  for (const step of validatedPlan.steps) {
    throwIfAborted(signal);
    const toolResult = await executeAssistantTool(step.tool, step.args);
    const action = createActionLog(toolResult);
    actions.push(action);
    messages.push(toolResult.message);
    callbacks.onToolResult?.(action, toolResult);
    if (!toolResult.ok) break;
  }

  const ok = actions.length === validatedPlan.steps.length && actions.every((action) => action.ok);
  const prefix = confirmed && ok ? 'Confirmado.' : ok ? 'Pronto.' : '';
  const content = [prefix, ...messages].filter(Boolean).join(' ');
  callbacks.onToken?.(content);
  return { content, actions };
}

async function runPlannedToolCalls(
  calls: AssistantToolCall[],
  source: AssistantPlanSource,
  originalText: string,
  callbacks: AssistantTurnCallbacks,
  confirmed = false,
  signal?: AbortSignal
): Promise<AssistantTurnResult> {
  const plan = createAssistantPlanFromToolCalls(calls, source, originalText);
  if (!plan) {
    return blockedPlanResult('Não encontrei uma ferramenta segura para executar esse pedido.', callbacks);
  }
  return executeValidatedPlan(plan, callbacks, confirmed, signal);
}

async function runDeterministicToolCall(
  call: AssistantToolCall,
  callbacks: AssistantTurnCallbacks,
  originalText = '',
  signal?: AbortSignal
): Promise<AssistantTurnResult> {
  return runPlannedToolCalls([call], 'deterministic', originalText, callbacks, false, signal);
}

function toolResultMessage(toolResult: AssistantToolResult): OllamaChatMessage {
  return {
    role: 'tool',
    tool_name: toolResult.tool,
    content: JSON.stringify(toolResult)
  };
}

async function runAssistantTurnInternal(
  sessionMessages: AssistantMessage[],
  callbacks: AssistantTurnCallbacks = {},
  signal?: AbortSignal,
  model = CONFIG.ASSISTANT.model,
  trace: AssistantTurnTrace = createTurnTrace()
): Promise<AssistantTurnResult> {
  throwIfAborted(signal);
  const latestText = latestUserText(sessionMessages);
  const pendingPlan = getPreviousAssistantPendingPlan(sessionMessages);
  const pendingToolCall = getPreviousAssistantPendingToolCall(sessionMessages);
  // A destructive plan needs an unambiguous yes; anything else falls through and
  // is handled as a brand new request, leaving the data untouched.
  const pendingIsDestructive = pendingPlan
    ? pendingPlan.steps.some((step) => isProtectedTool(step.tool))
    : Boolean(pendingToolCall) && isProtectedTool(getAssistantToolCallName(pendingToolCall!));
  const confirmsPending = pendingIsDestructive
    ? isStrictConfirmationText(latestText)
    : isConfirmationText(latestText);

  if ((pendingPlan || pendingToolCall) && confirmsPending) {
    trace.path = 'confirmation';
    if (pendingPlan) return executeValidatedPlan({ ...pendingPlan, source: 'confirmation' }, callbacks, true, signal);
    return runPlannedToolCalls([pendingToolCall!], 'confirmation', latestText, callbacks, true, signal);
  }
  if ((pendingPlan || pendingToolCall) && isCancellationText(latestText)) {
    trace.path = 'cancellation';
    const content = 'Cancelado. Nenhuma alteração foi feita.';
    callbacks.onToken?.(content);
    return { content, actions: [] };
  }

  const pendingChoices = getPreviousAssistantPendingChoices(sessionMessages);
  if (pendingChoices) {
    if (isCancellationText(latestText)) {
      trace.path = 'cancellation';
      const content = 'Ok, deixei tudo como está.';
      callbacks.onToken?.(content);
      return { content, actions: [] };
    }
    const selected = resolveChoiceSelection(pendingChoices, latestText);
    if (selected) {
      trace.path = 'choice_selection';
      return runPlannedToolCalls([selected], 'confirmation', latestText, callbacks, true, signal);
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
    trace.path = 'canned_text';
    callbacks.onToken?.(deterministicResponse);
    return { content: deterministicResponse, actions: [] };
  }

  const deterministicIntent = resolveDeterministicAssistantIntent(sessionMessages, buildAssistantContextSnapshot());
  if (deterministicIntent?.kind === 'question') {
    trace.path = 'deterministic';
    callbacks.onToken?.(deterministicIntent.content);
    return { content: deterministicIntent.content, actions: [] };
  }
  if (deterministicIntent?.kind === 'choice') {
    trace.path = 'choice_prompt';
    callbacks.onStatus?.('awaiting_confirmation');
    callbacks.onToken?.(deterministicIntent.content);
    return { content: deterministicIntent.content, actions: [], pendingChoices: deterministicIntent.choices };
  }
  if (deterministicIntent?.kind === 'tool_call') {
    trace.path = 'deterministic';
    trace.tools.push(getAssistantToolCallName(deterministicIntent.call));
    return runDeterministicToolCall(deterministicIntent.call, callbacks, latestText, signal);
  }

  trace.path = 'model';
  const messages = buildAssistantChatMessages(sessionMessages);
  const actions: AssistantActionLog[] = [];
  const executedMutations = new Set<string>();
  let totalToolCalls = 0;

  for (let round = 0; round < CONFIG.ASSISTANT.maxToolRounds; round += 1) {
    throwIfAborted(signal);
    trace.rounds = round + 1;
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
      const finalContent = response.content.trim();
      if (!actions.length && looksLikeUnsupportedActionClaim(finalContent)) {
        const content = 'Não executei nenhuma ação: o modelo afirmou ter feito algo sem chamar uma ferramenta real. Nada foi alterado. Envie o pedido novamente que eu executo pela ferramenta correta.';
        callbacks.onContentReset?.();
        callbacks.onToken?.(content);
        return { content, actions };
      }
      if (!finalContent) {
        const content = actions.length
          ? `Pronto. ${actions.map((action) => action.label).join(' ')}`
          : 'O Ollama encerrou a resposta sem conteúdo ou chamada de ferramenta. Tente novamente ou selecione outro modelo.';
        callbacks.onContentReset?.();
        callbacks.onToken?.(content);
        return { content, actions };
      }
      return { content: finalContent, actions };
    }

    if (streamedContent.trim()) callbacks.onContentReset?.();
    if (toolCalls.length > CONFIG.ASSISTANT.maxToolCallsPerRound || totalToolCalls + toolCalls.length > CONFIG.ASSISTANT.maxToolCallsPerTurn) {
      trace.stoppedByLimit = true;
      const content = 'Parei porque o modelo solicitou ações demais em uma única resposta. Divida o pedido em etapas menores.';
      callbacks.onContentReset?.();
      callbacks.onToken?.(content);
      return { content, actions, stoppedByLimit: true };
    }
    totalToolCalls += toolCalls.length;

    messages.push({
      role: 'assistant',
      content: response.content,
      thinking: response.thinking,
      tool_calls: toolCalls
    });

    const uniqueCalls: AssistantToolCall[] = [];
    const scheduledMutationKeys = new Set(executedMutations);
    for (const call of toolCalls) {
      const name = getAssistantToolCallName(call);
      const key = toolCallKey(call);
      if (isMutatingTool(name) && scheduledMutationKeys.has(key)) {
        messages.push(toolResultMessage({
          ok: true,
          tool: name,
          message: 'Chamada mutável idêntica ignorada porque já foi executada nesta interação.',
          changed: false,
          matchedCount: 0,
          changedCount: 0,
          reason: 'duplicate_call',
          affectedItems: []
        }));
        continue;
      }
      uniqueCalls.push(call);
      if (isMutatingTool(name)) scheduledMutationKeys.add(key);
    }

    if (!uniqueCalls.length) continue;
    const plan = createAssistantPlanFromToolCalls(
      uniqueCalls,
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

    if (validatedPlan.steps.some((step) => isProtectedTool(step.tool)) || validation.needsConfirmation) {
      callbacks.onContentReset?.();
      const pending = buildPlanConfirmationRequest(validatedPlan, validation.question, callbacks);
      return { ...pending, actions };
    }

    callbacks.onStatus?.('executing');
    for (const step of validatedPlan.steps) {
      throwIfAborted(signal);
      const toolResult = await executeAssistantTool(step.tool, step.args);
      trace.tools.push(step.tool);
      const action = createActionLog(toolResult);
      actions.push(action);
      callbacks.onToolResult?.(action, toolResult);
      messages.push(toolResultMessage(toolResult));
      // The key must come from the original call: validators rewrite args, so a
      // key built from step.args would never match the next round's raw call.
      if (isMutatingTool(step.tool) && toolResult.ok && step.sourceKey) executedMutations.add(step.sourceKey);
      if (!toolResult.ok) {
        callbacks.onContentReset?.();
        callbacks.onToken?.(toolResult.message);
        return { content: toolResult.message, actions };
      }
    }
  }

  trace.stoppedByLimit = true;
  const limitMessage = 'Parei porque muitas ações foram solicitadas em sequência. Envie um pedido menor.';
  callbacks.onContentReset?.();
  callbacks.onToken?.(limitMessage);
  return { content: limitMessage, actions, stoppedByLimit: true };
}

let assistantTurnQueue: Promise<void> = Promise.resolve();

/**
 * Turns are serialized: two overlapping turns would interleave their mutations
 * and their tool results. Callers never share a turn, so there is no dedup by
 * message id — a second call always gets its own run with its own callbacks and
 * abort signal.
 */
export function runAssistantTurn(
  sessionMessages: AssistantMessage[],
  callbacks: AssistantTurnCallbacks = {},
  signal?: AbortSignal,
  model = CONFIG.ASSISTANT.model
): Promise<AssistantTurnResult> {
  const operation = async () => {
    const trace = createTurnTrace();
    try {
      return await runAssistantTurnInternal(sessionMessages, callbacks, signal, model, trace);
    } finally {
      traceAssistantTurn(trace);
    }
  };
  const promise = assistantTurnQueue.then(operation, operation);
  assistantTurnQueue = promise.then(() => undefined, () => undefined);
  return promise;
}
