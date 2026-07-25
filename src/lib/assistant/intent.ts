/**
 * Deterministic layer of the assistant.
 *
 * This is intentionally NOT a general pt-BR parser. The model handles the long
 * tail of phrasing; what stays here is only what the model cannot do as well:
 *
 * - pt-BR date resolution, which also feeds the `dateHints` sent in the context
 *   so the model never has to compute a date by itself;
 * - date navigation, which is instant and has no destructive effect;
 * - references to an existing task ("a última", "a do contrato"), which depend
 *   on the exact order of the visible list and produce the numbered choice UI.
 *
 * Everything else — creating events, extracting titles, rescheduling, deleting
 * by title, listing — goes to the model, with validators.ts and the mandatory
 * confirmation for destructive plans as the safety net.
 */
import type { Priority } from '../types/app.js';
import type {
  AssistantContextSnapshot,
  AssistantContextTask,
  AssistantMessage,
  AssistantPendingChoice,
  AssistantToolCall
} from '../types/assistant.js';
import { fuzzyIncludes } from './matching.js';

const DELETE_RE = /\b(remove|remova|remover|apaga|apague|apagar|deleta|delete|deletar|exclui|exclua|excluir|tira|tire|tirar)\b/i;
const EVENT_RE = /\b(evento|eventos|calend(?:a|á)rio|agenda|anivers(?:a|á)rio|niver)\b/i;
const WEEKDAY_NAMES: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6
};
const MONTH_NAMES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

// "add" is common informal Portuguese usage (English loanword), not covered by
// the Portuguese verb conjugations below. Without it, "add uma tarefa... como
// urgente" wasn't recognized as a creation request, so parseTaskReferenceIntent
// treated "como urgente" as a priority change on an EXISTING task and asked
// "quer que eu crie uma?" instead of deferring to the model to create it.
const ADD_TASK_RE = /\b(adicion(?:a|e|ar)|cri(?:a|e|ar)|registr(?:a|e|ar)|inclu(?:a|ir)|coloca|coloque|add)\b/i;
const TASK_RE = /\b(tarefa|tarefas|task|afazer|afazeres|pend[êe]ncia|pendencia|pend[êe]ncias|pendencias)\b/i;
const OBLIGATION_START_RE = /^(tenho que|preciso|devo|necessito|vou ter que)\b/i;

/**
 * Only unambiguous navigation verbs. "muda", "leva" and "mostra" used to be here
 * and made "muda a reunião para 13/07" navigate the panel instead of moving the
 * event, since navigation now runs without a reschedule parser ahead of it.
 */
const NAVIGATE_RE = /\b(vai|v[aá]|ir|volta|voltar|volte|navega|navegar|navegue|abre|abra|abrir|pula|pular|pule)\b/i;
/** Nouns that make the request about an item, not about the visible date. */
const SCHEDULABLE_NOUN_RE = /\b(reuni[ãa]o|consulta|encontro|compromisso|call|entrevista|almo[çc]o|jantar|caf[ée]|festa|prova|aula|apresenta[çc][ãa]o|viagem|voo|show|exame|treino|lembrete)\b/i;

const COMPLETE_VERB_RE = /\b(conclui|concluir|conclua|finaliza|finalizar|finalize|termina|terminar|termine|completa|completar|complete)\b/i;
const MARK_VERB_RE = /\b(marca|marcar|marque|coloca|coloque|colocar)\b/i;
const COMPLETED_STATE_RE = /\bcomo\s+(?:conclu[ií]d[ao]|feit[ao]|finalizad[ao]|pront[ao]|completad[ao]|terminad[ao])\b/i;
const REOPEN_VERB_RE = /\b(reabre|reabrir|reabra|desmarca|desmarcar|desmarque)\b/i;
const PIN_VERB_RE = /\b(fixa|fixar|fixe)\b/i;
const UNPIN_VERB_RE = /\b(desafixa|desafixar|desfixa|desfixar|solta|soltar|solte)\b/i;
const PRONOUN_REFERENCE_RE = /\b(isso|essa|esse|dessa|desse|nisso|nele|nela|ela|ele|aquele|aquela)\b/i;
const LAST_REFERENCE_RE = /\b[uú]ltim[oa]\b/i;
const FIRST_REFERENCE_RE = /\bprimeir[oa]\b/i;

export type DeterministicAssistantIntent =
  | { kind: 'tool_call'; call: AssistantToolCall }
  | { kind: 'question'; content: string }
  | { kind: 'choice'; content: string; choices: AssistantPendingChoice[] };

type TaskOperation = 'complete' | 'reopen' | 'delete' | 'pin' | 'unpin' | 'priority';

interface DetectedTaskOperation {
  operation: TaskOperation;
  priority?: Priority;
}

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForMatching(value: string): string {
  return cleanSpaces(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function buildDateKey(year: number, month: number, day: number): string | null {
  if (!isValidDateParts(year, month, day)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function dateToKey(date: Date): string {
  return buildDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate()) || '';
}

function inferYear(yearText?: string): number {
  if (!yearText) return new Date().getFullYear();
  const year = Number(yearText);
  if (yearText.length === 2) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function extractWeekdayDate(normalizedText: string, today: Date): string | null {
  const match = normalizedText.match(
    /\b(?:tod[ao]s?\s+(?:as\s+|os\s+)?|proxim[ao]\s+|nes[st]a\s+|na\s+|no\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:s\b|\s*-?\s*feiras?)?(\s+que\s+vem)?\b/
  );
  if (!match) return null;
  // "segunda" is also an ordinal ("a segunda tarefa"); in these contexts it is not a date.
  const after = normalizedText.slice((match.index ?? 0) + match[0].length);
  if (/^\s+(tarefa|tarefas|opcao|opcoes|vez|parte|etapa|chamada)\b/.test(after)) return null;

  const target = WEEKDAY_NAMES[match[1]];
  const explicitNext = Boolean(match[2]) || /proxim[ao]/.test(match[0]);
  let delta = (target - today.getDay() + 7) % 7;
  if (delta === 0 && explicitNext) delta = 7;
  return dateToKey(addDays(today, delta));
}

/**
 * Resolves a pt-BR date expression to a dateKey. Also used by context.ts to
 * pre-resolve the hints the model receives, so both always agree.
 */
export function extractDateKeyFromText(input: string): string | null {
  const text = normalizeForMatching(input);
  const currentYear = new Date().getFullYear();
  const today = new Date();
  if (/\bdepois de amanha\b/.test(text)) return dateToKey(addDays(today, 2));
  if (/\bamanha\b/.test(text)) return dateToKey(addDays(today, 1));
  if (/\bhoje\b/.test(text)) return dateToKey(today);
  if (/\b(semana que vem|proxima semana)\b/.test(text)) return dateToKey(addDays(today, 7));
  if (/\b(mes que vem|proximo mes)\b/.test(text)) return dateToKey(addMonthsClamped(today, 1));

  const weekdayKey = extractWeekdayDate(text, today);
  if (weekdayKey) return weekdayKey;

  for (const match of text.matchAll(/\b(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{2,4}))?\b/g)) {
    const month = MONTH_NAMES[match[2]];
    if (!month) continue;
    const day = Number(match[1]);
    const year = inferYear(match[3]);
    const key = buildDateKey(year, month, day);
    if (key) return key;
  }

  for (const match of text.matchAll(/\b(?:tod[oa]\s+)?([a-z]+)\s+(?:dia\s+)?(\d{1,2})(?:\s+de\s+(\d{2,4}))?\b/g)) {
    const month = MONTH_NAMES[match[1]];
    if (!month) continue;
    const day = Number(match[2]);
    const year = inferYear(match[3]);
    const key = buildDateKey(year, month, day);
    if (key) return key;
  }

  const numericDate = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!numericDate) return null;
  const day = Number(numericDate[1]);
  const month = Number(numericDate[2]);
  const year = numericDate[3] ? inferYear(numericDate[3]) : currentYear;
  return buildDateKey(year, month, day);
}

function findLatestUserIndex(messages: AssistantMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index;
  }
  return -1;
}

/** Date navigation only: instant, reversible, and never touches saved data. */
function parseDeterministicNavigation(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input);
  if (!text || !NAVIGATE_RE.test(text)) return null;
  if (DELETE_RE.test(text) || ADD_TASK_RE.test(text) || TASK_RE.test(text) || EVENT_RE.test(text)) return null;
  if (SCHEDULABLE_NOUN_RE.test(text)) return null;

  const normalized = normalizeForMatching(text);
  if (/\bhoje\b/.test(normalized)) {
    return { function: { name: 'go_to_today', arguments: {} } };
  }

  const dateKey = extractDateKeyFromText(text);
  if (!dateKey) return null;
  return { function: { name: 'go_to_date', arguments: { dateKey } } };
}

export function parseDeterministicAssistantToolCall(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input);
  if (!text) return null;
  return parseDeterministicNavigation(text);
}

function taskOperationLabel(operation: TaskOperation): string {
  switch (operation) {
    case 'complete':
      return 'concluir';
    case 'reopen':
      return 'reabrir';
    case 'delete':
      return 'apagar';
    case 'pin':
      return 'fixar';
    case 'unpin':
      return 'desafixar';
    case 'priority':
      return 'alterar';
  }
}

const PRIORITY_WORD_RE = /\b(prioridade|urg[êe]ncia)\b/i;
const PRIORITY_SHORTCUT_RE = /\bcomo\s+(urgente|importante|priorit[áa]ri[ao])\b/i;

function detectTaskPriorityTarget(normalized: string): Priority | null {
  if (/\b(alta|urgente|importante|critic[ao]|maxima)\b/.test(normalized)) return 'high';
  if (/\b(baixa|minima|sem pressa)\b/.test(normalized)) return 'low';
  if (/\b(media|normal|padrao)\b/.test(normalized)) return 'medium';
  return null;
}

function detectTaskOperation(text: string): DetectedTaskOperation | null {
  const normalized = normalizeForMatching(text);
  const mentionsTask = TASK_RE.test(normalized);
  const hasPronoun = PRONOUN_REFERENCE_RE.test(normalized) || LAST_REFERENCE_RE.test(normalized) || FIRST_REFERENCE_RE.test(normalized);
  const priorityTarget = detectTaskPriorityTarget(normalized);
  const clearTaskMutation =
    REOPEN_VERB_RE.test(normalized) ||
    UNPIN_VERB_RE.test(normalized) ||
    PIN_VERB_RE.test(normalized) ||
    COMPLETE_VERB_RE.test(normalized) ||
    (MARK_VERB_RE.test(normalized) && COMPLETED_STATE_RE.test(normalized)) ||
    (PRIORITY_WORD_RE.test(normalized) && Boolean(priorityTarget)) ||
    PRIORITY_SHORTCUT_RE.test(normalized);
  const hasReference = mentionsTask || hasPronoun || clearTaskMutation;
  if (!hasReference) return null;
  // Event requests do not go through the task flow.
  if (/\b(evento|eventos|agenda|calendario|aniversario|niver)\b/.test(normalized) && !mentionsTask) return null;

  if (PRIORITY_WORD_RE.test(normalized) && priorityTarget) {
    return { operation: 'priority', priority: priorityTarget };
  }
  if (PRIORITY_SHORTCUT_RE.test(normalized)) {
    return { operation: 'priority', priority: priorityTarget || 'high' };
  }

  if (REOPEN_VERB_RE.test(normalized)) return { operation: 'reopen' };
  if (UNPIN_VERB_RE.test(normalized)) return { operation: 'unpin' };
  if (PIN_VERB_RE.test(normalized)) return { operation: 'pin' };
  if (COMPLETE_VERB_RE.test(normalized)) return { operation: 'complete' };
  if (MARK_VERB_RE.test(normalized) && COMPLETED_STATE_RE.test(normalized)) return { operation: 'complete' };
  if (DELETE_RE.test(normalized) && mentionsTask) return { operation: 'delete' };
  return null;
}

function extractTaskQuery(text: string, operation: TaskOperation): string {
  let query = normalizeForMatching(text)
    .replace(COMPLETED_STATE_RE, ' ')
    .replace(/\b(marca|marcar|marque|conclui|concluir|conclua|finaliza|finalizar|finalize|termina|terminar|termine|completa|completar|complete|reabre|reabrir|reabra|desmarca|desmarcar|desmarque|fixa|fixar|fixe|desafixa|desafixar|desfixa|desfixar|solta|soltar|solte|remove|remova|remover|apaga|apague|apagar|deleta|delete|deletar|exclui|exclua|excluir|tira|tire|tirar|muda|mudar|mude|altera|alterar|altere|define|definir|defina|deixa|deixar|deixe|coloca|coloque|colocar|seta|setar|sete)\b/g, ' ')
    .replace(/\b(tarefa|tarefas|task|afazer|afazeres|pendencia|pendencias)\b/g, ' ')
    .replace(/\b(por favor|pf|como|isso|essa|esse|aquela|aquele|ela|ele|minha|meu|a|o|as|os|um|uma)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  query = query.replace(/^(?:de|do|da|no|na|em|para|pra|que)\s+/, '').trim();
  if (operation === 'complete') {
    query = query.replace(/\b(concluid[ao]|feit[ao]|pront[ao]|finalizad[ao]|terminad[ao])\b/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (operation === 'priority') {
    query = query
      .replace(/\b(prioridade|urgencia|para|pra|alta|baixa|media|urgente|importante|prioritari[ao]|normal|padrao|maxima|minima|critic[ao])\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return query;
}

function matchTasksByQuery(tasks: AssistantContextTask[], query: string): AssistantContextTask[] {
  if (query.length < 3) return [];
  const strong = tasks.filter((task) => normalizeForMatching(task.text).includes(query));
  if (strong.length) return strong;
  return tasks.filter((task) => fuzzyIncludes(task.text, query));
}

function findRecentTaskActionId(messages: AssistantMessage[]): string {
  const taskTools = new Set(['add_task', 'complete_task', 'pin_task', 'set_task_priority']);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant' || !Array.isArray(message.actions)) continue;
    for (let actionIndex = message.actions.length - 1; actionIndex >= 0; actionIndex -= 1) {
      const action = message.actions[actionIndex];
      if (action.ok && action.itemId && taskTools.has(action.tool)) return action.itemId;
    }
  }
  return '';
}

function buildTaskToolCall(detected: DetectedTaskOperation, task: AssistantContextTask): AssistantToolCall {
  switch (detected.operation) {
    case 'complete':
      return { function: { name: 'complete_task', arguments: { id: task.id, completed: true } } };
    case 'reopen':
      return { function: { name: 'complete_task', arguments: { id: task.id, completed: false } } };
    case 'delete':
      return { function: { name: 'delete_task', arguments: { id: task.id } } };
    case 'pin':
      return { function: { name: 'pin_task', arguments: { id: task.id, pinned: true } } };
    case 'unpin':
      return { function: { name: 'pin_task', arguments: { id: task.id, pinned: false } } };
    case 'priority':
      return { function: { name: 'set_task_priority', arguments: { id: task.id, priority: detected.priority || 'medium' } } };
  }
}

function buildChoiceIntent(
  choices: AssistantPendingChoice[],
  question: string
): DeterministicAssistantIntent {
  const numbered = choices.map((choice, index) => `${index + 1}. ${choice.label}`).join('\n');
  return {
    kind: 'choice',
    content: `${question}\n${numbered}\nResponda com o número ou o texto da opção.`,
    choices
  };
}

function parseTaskReferenceIntent(
  input: string,
  snapshot: AssistantContextSnapshot,
  messages: AssistantMessage[]
): DeterministicAssistantIntent | null {
  const text = cleanSpaces(input);
  if (!text) return null;

  // Task creation always stays with the model, even when the request also sets
  // a priority or completion state inline ("add uma tarefa: X, marca como
  // urgente"). An earlier version let a completion/priority hint override this
  // and treat the text as a mutation of an EXISTING task instead — which
  // misfired on exactly that kind of single creation request: with zero tasks
  // on the visible date, it answered "quer que eu crie uma?" instead of
  // creating it. The model already handles priority-in-creation correctly.
  const looksLikeAddTask = (ADD_TASK_RE.test(text) && TASK_RE.test(text)) || OBLIGATION_START_RE.test(text);
  if (looksLikeAddTask) return null;

  const detected = detectTaskOperation(text);
  if (!detected) return null;

  const verbLabel = taskOperationLabel(detected.operation);
  const tasks = snapshot.tasks || [];
  if (!tasks.length) {
    return { kind: 'question', content: `Não há tarefas na data visível para ${verbLabel}. Quer que eu crie uma?` };
  }

  const normalized = normalizeForMatching(text);
  if (LAST_REFERENCE_RE.test(normalized)) {
    return { kind: 'tool_call', call: buildTaskToolCall(detected, tasks[tasks.length - 1]) };
  }
  if (FIRST_REFERENCE_RE.test(normalized)) {
    return { kind: 'tool_call', call: buildTaskToolCall(detected, tasks[0]) };
  }

  const query = extractTaskQuery(text, detected.operation);
  const matches = matchTasksByQuery(tasks, query);
  if (matches.length === 1) {
    return { kind: 'tool_call', call: buildTaskToolCall(detected, matches[0]) };
  }
  if (matches.length > 1) {
    return buildChoiceIntent(
      matches.slice(0, 4).map((task) => ({ label: task.text, call: buildTaskToolCall(detected, task) })),
      `Encontrei ${matches.length} tarefas parecidas. Qual delas devo ${verbLabel}?`
    );
  }

  if (PRONOUN_REFERENCE_RE.test(normalized)) {
    const recentTaskId = findRecentTaskActionId(messages);
    const referenced = recentTaskId ? tasks.find((task) => task.id === recentTaskId) : undefined;
    if (referenced) {
      return { kind: 'tool_call', call: buildTaskToolCall(detected, referenced) };
    }
    if (tasks.length === 1) {
      return { kind: 'tool_call', call: buildTaskToolCall(detected, tasks[0]) };
    }
    return {
      kind: 'question',
      content: `Qual tarefa devo ${verbLabel}? Você pode dizer o texto dela ou "a última tarefa".`
    };
  }

  if (tasks.length === 1) {
    return { kind: 'tool_call', call: buildTaskToolCall(detected, tasks[0]) };
  }

  return {
    kind: 'question',
    content: `Qual tarefa devo ${verbLabel}? Você pode dizer o texto dela ou "a última tarefa".`
  };
}

export function resolveDeterministicAssistantIntent(
  messages: AssistantMessage[],
  snapshot?: AssistantContextSnapshot | null
): DeterministicAssistantIntent | null {
  const latestIndex = findLatestUserIndex(messages);
  const latest = latestIndex >= 0 ? messages[latestIndex].content : '';

  if (snapshot) {
    const taskIntent = parseTaskReferenceIntent(latest, snapshot, messages);
    if (taskIntent) return taskIntent;
  }

  const navigationCall = parseDeterministicAssistantToolCall(latest);
  if (navigationCall) return { kind: 'tool_call', call: navigationCall };

  return null;
}

export function parseDeterministicAssistantTextResponse(input: string): string | null {
  const text = cleanSpaces(input).toLowerCase();
  if (/^(oi|olá|ola|hi|hello|bom dia|boa tarde|boa noite)[!.?]*$/.test(text)) {
    return 'Olá. Posso criar tarefas, listar o que existe no dia visível, marcar itens como concluídos e ajustar eventos do calendário.';
  }
  return null;
}
