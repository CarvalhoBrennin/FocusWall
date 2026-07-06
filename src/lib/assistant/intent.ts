import type { Priority } from '../types/app.js';
import type {
  AssistantContextEvent,
  AssistantContextSnapshot,
  AssistantContextTask,
  AssistantMessage,
  AssistantPendingChoice,
  AssistantToolCall
} from '../types/assistant.js';
import { fuzzyIncludes } from './matching.js';

const BIRTHDAY_RE = /\b(anivers(?:a|á)rio|niver)\b/i;
const ALL_DAY_RE = /\b(dia inteiro|o dia todo|all day)\b/i;
const DELETE_RE = /\b(remove|remova|remover|apaga|apague|apagar|deleta|delete|deletar|exclui|exclua|excluir|tira|tire|tirar)\b/i;
const EVENT_RE = /\b(evento|eventos|calend(?:a|á)rio|agenda|anivers(?:a|á)rio|niver)\b/i;
const RECURRING_RE = /\b(recorrentes?|recorr(?:e|ê)ncia|todo ano|todos os anos|anual|anualmente|yearly)\b/i;
const MONTHLY_RE = /\b(todo m(?:e|ê)s|todos os meses|mensal|mensalmente|monthly)\b/i;
const WEEKLY_RE = /\b(toda semana|todas as semanas|semanal|semanalmente|weekly|tod[ao]s?\s+(?:as\s+|os\s+)?(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo))/i;
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
// Alternation used against the original (possibly accented) text.
const MONTH_ALTERNATION = 'janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';

const ADD_TASK_RE = /\b(adicion(?:a|e|ar)|cri(?:a|e|ar)|registr(?:a|e|ar)|inclu(?:a|ir)|coloca|coloque)\b/i;
const TASK_RE = /\b(tarefa|tarefas|task|afazer|afazeres|pend[êe]ncia|pendencia|pend[êe]ncias|pendencias)\b/i;
const OBLIGATION_RE = /\b(tenho que|preciso|devo|necessito|vou ter que)\b/gi;

const EVENT_NOUN_START_RE = /^(reuni[aã]o|consulta|encontro|compromisso|call|entrevista|almo[cç]o|jantar|caf[eé]|festa|prova|aula|apresenta[cç][aã]o|viagem|voo|show|m[eé]dic[oa]|dentista|exame|treino|academia)\b/i;

const LIST_VERB_RE = /\b(lista|listar|liste|mostra|mostrar|mostre|exibe|exiba|exibir|quais|consulta|consultar|ver|veja|checa|checar|confere|conferir)\b/i;
const WHAT_DO_I_HAVE_RE = /\bo que (?:eu )?(?:tenho|tem|ha)\b/i;
const NAVIGATE_RE = /\b(vai|va|ir|volta|voltar|volte|navega|navegar|navegue|abre|abra|abrir|mostra|mostrar|mostre|leva|levar|leve|pula|pular|pule|muda|mudar|mude)\b/i;

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

export interface DeterministicIntentOptions {
  /** Saved events used to resolve references such as "apaga a reunião" without a date. */
  events?: AssistantContextEvent[];
}

type TaskOperation = 'complete' | 'reopen' | 'delete' | 'pin' | 'unpin' | 'priority';

interface DetectedTaskOperation {
  operation: TaskOperation;
  priority?: Priority;
}

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sentenceCase(value: string): string {
  const text = cleanSpaces(value);
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
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

function normalizeTaskTextForAssistant(value: string): string {
  return cleanSpaces(value)
    .replace(/^uma\s+nova\s+tarefa\s+(?:que\s+)?/i, '')
    .replace(/^nova\s+tarefa\s+(?:que\s+)?/i, '')
    .replace(/^tarefa\s+(?:que\s+)?/i, '')
    .replace(/^(?:urgente|importante|alta prioridade|prioridade alta)\s+(?:para\s+)?/i, '')
    .replace(/^eu\s+/i, '')
    .replace(/\bpdf\s+download\b/gi, 'download de PDF')
    .replace(/\bdownload\s+pdf\b/gi, 'download de PDF')
    .replace(/\s+([,.!?;:])/g, '$1');
}

function extractContext(text: string): string {
  const match = text.match(/\bajuste\s+(?:no|na|em|do|da)\s+(.+?)(?=\s+(?:eu\s+)?(?:tenho que|preciso|devo|necessito|vou ter que)\b|[.!?]|$)/i);
  return normalizeTaskTextForAssistant(match?.[1] || '');
}

function extractAfterLastObligation(text: string): string {
  let lastMatch: RegExpExecArray | null = null;
  OBLIGATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OBLIGATION_RE.exec(text)) !== null) {
    lastMatch = match;
  }
  if (!lastMatch) return '';
  return text.slice(lastMatch.index + lastMatch[0].length);
}

function stripAddTaskPrefix(text: string): string {
  return text
    .replace(/^\s*(?:por favor,?\s*)?/i, '')
    .replace(/^\s*(?:adicion(?:a|e|ar)|cri(?:a|e|ar)|registr(?:a|e|ar)|inclu(?:a|ir)|coloca|coloque)\s+/i, '')
    .replace(/^\s*(?:uma\s+)?(?:nova\s+)?(?:tarefa|task|afazer|pend[êe]ncia)\s*/i, '');
}

function hasAmbiguousReference(text: string): boolean {
  return /\b(isso|essa|esse|dessa|desse|nisso|nele|nela|aquele|aquela|[úu]ltim[oa])\b/i.test(text);
}

function inferPriority(text: string): Priority {
  const normalized = normalizeForMatching(text);
  if (/\b(urgente|alta prioridade|prioridade alta|importante|critico|critica|pra ontem|para ontem)\b/.test(normalized)) return 'high';
  if (/\b(baixa prioridade|prioridade baixa|sem pressa|quando der|quando puder|sem urgencia)\b/.test(normalized)) return 'low';
  return 'medium';
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

function stripDateAndTimeText(input: string): string {
  const monthDatePatterns = [
    new RegExp(`\\b(?:dia\\s+)?\\d{1,2}\\s+de\\s+(?:${MONTH_ALTERNATION})(?:\\s+de\\s+\\d{2,4})?\\b`, 'gi'),
    new RegExp(`\\b(?:tod[oa]\\s+)?(?:${MONTH_ALTERNATION})\\s+(?:dia\\s+)?\\d{1,2}(?:\\s+de\\s+\\d{2,4})?\\b`, 'gi')
  ];

  let text = cleanSpaces(input);
  for (const pattern of monthDatePatterns) {
    text = text.replace(pattern, '');
  }

  return text
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, '')
    .replace(/\bdepois\s+de\s+amanh(?:a|ã)(?=\s|$)/gi, '')
    .replace(/\bamanh(?:a|ã)(?=\s|$)/gi, '')
    .replace(/\bhoje\b/gi, '')
    .replace(/\bsemana\s+que\s+vem\b/gi, '')
    .replace(/\bpr[oó]xima\s+semana\b/gi, '')
    .replace(/\bm[eê]s\s+que\s+vem\b/gi, '')
    .replace(/\bpr[oó]ximo\s+m[eê]s\b/gi, '')
    .replace(/\b(?:tod[ao]s?\s+(?:as\s+|os\s+)?|pr[oó]xim[ao]\s+|nes[st]a\s+|na\s+|no\s+)?(?:domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:s\b|\s*-?\s*feiras?)?(?:\s+que\s+vem)?\b(?!\s+(?:tarefa|tarefas|op[çc][ãa]o|op[çc][õo]es|vez|parte|etapa|chamada)\b)/gi, '')
    .replace(/\b(?:toda\s+semana|todas\s+as\s+semanas|semanalmente|semanal)\b/gi, '')
    .replace(/(?:\b(?:as|das|a\s+partir\s+d[ae]s?)|às)\s+([01]?\d|2[0-3])(?:[:h][0-5]\d|\s*(?:hs?|horas?))?\b/gi, '')
    .replace(/\b([01]?\d|2[0-3])[:h][0-5]\d\b/g, '')
    .replace(/\b([01]?\d|2[0-3])\s*(?:hs|horas?)\b/gi, '')
    .replace(/\b([01]?\d|2[0-3])h\b/gi, '')
    .replace(/\s+([,.!?;:])/g, '$1');
}

export function extractTimeRange(input: string): { startTime?: string; endTime?: string } {
  if (ALL_DAY_RE.test(input)) return {};
  const text = normalizeForMatching(input);
  const found: { index: number; length: number; value: string }[] = [];

  const collect = (pattern: RegExp, hourGroup: number, minuteGroup?: number) => {
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      const hour = Number(match[hourGroup]);
      const minute = minuteGroup && match[minuteGroup] ? match[minuteGroup] : '00';
      found.push({ index, length: match[0].length, value: `${pad2(hour)}:${minute}` });
    }
  };

  // "9:30" / "9h30"
  collect(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/g, 1, 2);
  // "14h" / "14 hs" / "9 horas"
  collect(/\b([01]?\d|2[0-3])\s*(?:hs?|horas?)(?![0-9\w])/g, 1);
  // "as 14" / "das 9" - only when clearly a time and not part of a date
  collect(/\b(?:as|das)\s+([01]?\d|2[0-3])\b(?!\s*(?:de|do|da|dia)\b)(?![/:h0-9-])/g, 1);

  found.sort((a, b) => a.index - b.index);
  const times: string[] = [];
  let lastEnd = -1;
  for (const entry of found) {
    if (entry.index < lastEnd) continue;
    lastEnd = entry.index + entry.length;
    if (!times.length || times[times.length - 1] !== entry.value) times.push(entry.value);
  }

  return {
    startTime: times[0],
    endTime: times[1]
  };
}

function inferBirthdayTitle(input: string): string {
  const text = cleanSpaces(input);
  if (/\bmeu|minha\b/i.test(text) && BIRTHDAY_RE.test(text)) return 'Meu aniversário';

  const owner = text.match(/\banivers[aá]rio\s+(?:da|do|de)\s+(.+?)(?=\s+(?:[ée]\s+)?(?:dia|\d{1,2}[/-])\b|[.!?]|$)/i)?.[1];
  if (owner) return sentenceCase(`Aniversário de ${owner}`);

  return 'Aniversário';
}

function inferReliableBirthdayTitle(input: string): string {
  const text = cleanSpaces(input);
  if (/\bmeu\s+(?:anivers(?:a|á)rio|niver)\b/i.test(text) || /\b(?:anivers(?:a|á)rio|niver)\s+meu\b/i.test(text)) {
    return 'Meu aniversário';
  }

  const ownerStop = `acontece|ocorre|fica|cai|todo|toda|dia|em|no|na|é|e|${MONTH_ALTERNATION}|\\d{1,2}\\b|\\d{1,2}[/-]`;
  const ownerPattern = new RegExp(
    `\\b(?:anivers(?:a|á)rio|niver)\\s+(?:da|do|de)\\s+(.+?)(?=\\s+(?:${ownerStop})\\b|[.!?]|$)`,
    'i'
  );
  const owner = text.match(ownerPattern)?.[1];
  if (owner) return sentenceCase(`Aniversário de ${owner}`);

  return inferBirthdayTitle(input);
}

function parseDeterministicCalendarEvent(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input);
  if (!text) return null;

  if (!BIRTHDAY_RE.test(text)) return null;

  const dateKey = extractDateKeyFromText(text);
  if (!dateKey) return null;

  const title = inferReliableBirthdayTitle(text);
  if (!title) return null;

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

function extractGenericEventTitle(input: string): string {
  const withoutDate = stripDateAndTimeText(input);
  const stripped = withoutDate
    .replace(/^\s*(?:por favor,?\s*)?/i, '')
    .replace(/^\s*(?:adicion(?:a|e|ar)|cri(?:a|e|ar)|registr(?:a|e|ar)|inclu(?:a|ir)|coloca|coloque|marca|marque|marcar|agenda|agende|agendar)\s+/i, '')
    .replace(/^\s*(?:um\s+|uma\s+)?(?:novo\s+|nova\s+)?(?:evento|compromisso|agenda)\s*/i, '')
    .replace(/\b(?:no|na|ao|aos|para|pra|em|de|do|da|[aà]s?)\s*$/i, '');
  return sentenceCase(stripped);
}

function inferEventRecurrence(text: string): 'none' | 'weekly' | 'monthly' | 'yearly' {
  if (WEEKLY_RE.test(text)) return 'weekly';
  if (MONTHLY_RE.test(text)) return 'monthly';
  if (RECURRING_RE.test(text)) return 'yearly';
  return 'none';
}

function parseDeterministicGenericCalendarEvent(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input);
  const hasCreateVerb = ADD_TASK_RE.test(text) || /\b(agenda|agende|agendar|marca|marque|marcar)\s+(?:um\s+|uma\s+)?(?:novo\s+|nova\s+)?(?:evento|compromisso)\b/i.test(text);
  if (!hasCreateVerb || !/\b(evento|compromisso|agenda)\b/i.test(text)) return null;
  if (BIRTHDAY_RE.test(text)) return null;

  const dateKey = extractDateKeyFromText(text);
  if (!dateKey) return null;

  const title = extractGenericEventTitle(text);
  if (!title) return null;

  const times = extractTimeRange(text);
  return {
    function: {
      name: 'add_calendar_event',
      arguments: {
        title,
        dateKey,
        ...(times.startTime ? { startTime: times.startTime } : {}),
        ...(times.endTime ? { endTime: times.endTime } : {}),
        recurrence: inferEventRecurrence(text),
        color: 'neutral'
      }
    }
  };
}

function parseDeterministicAppointmentNoun(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input).replace(/^\s*(?:por favor,?\s*)?/i, '');
  if (!EVENT_NOUN_START_RE.test(text)) return null;
  if (BIRTHDAY_RE.test(text) || TASK_RE.test(text) || EVENT_RE.test(text) || DELETE_RE.test(text)) return null;

  const dateKey = extractDateKeyFromText(text);
  if (!dateKey) return null;

  const title = sentenceCase(stripDateAndTimeText(text).replace(/\b(?:no|na|em|de|do|da|[aà]s?)\s*$/i, ''));
  if (!title) return null;

  const times = extractTimeRange(text);
  return {
    function: {
      name: 'add_calendar_event',
      arguments: {
        title,
        dateKey,
        ...(times.startTime ? { startTime: times.startTime } : {}),
        ...(times.endTime ? { endTime: times.endTime } : {}),
        recurrence: inferEventRecurrence(text),
        color: 'neutral'
      }
    }
  };
}

function parseDeterministicDeleteCalendarEvents(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input);
  if (!DELETE_RE.test(text) || !EVENT_RE.test(text)) return null;
  if (TASK_RE.test(text)) return null;

  const dateKey = extractDateKeyFromText(text);
  if (!dateKey) return null;

  return {
    function: {
      name: 'delete_calendar_events',
      arguments: {
        dateKey,
        ...(RECURRING_RE.test(text) || WEEKLY_RE.test(text) || MONTHLY_RE.test(text) ? { recurring: true } : {}),
        ...(BIRTHDAY_RE.test(text) ? { title: 'aniversário' } : {})
      }
    }
  };
}

function parseDeterministicListCalendarEvents(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input);
  if (!text || DELETE_RE.test(text) || ADD_TASK_RE.test(text)) return null;

  const normalized = normalizeForMatching(text);
  // "o que tenho que fazer" asks about tasks, not events.
  if (/\btenho que\b|\bque fazer\b/.test(normalized)) return null;

  const mentionsEvents = /\b(evento|eventos|agenda|calend(?:a|á)rio|compromisso|compromissos)\b/i.test(text);
  const dateKey = extractDateKeyFromText(text);
  const asksWhatIsThere = WHAT_DO_I_HAVE_RE.test(normalized);

  if (!(mentionsEvents && (LIST_VERB_RE.test(text) || asksWhatIsThere)) && !(asksWhatIsThere && dateKey)) return null;
  if (TASK_RE.test(text)) return null;

  return {
    function: {
      name: 'list_calendar_events',
      arguments: dateKey ? { dateKey } : {}
    }
  };
}

function parseDeterministicListTasks(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input);
  if (!text || DELETE_RE.test(text) || ADD_TASK_RE.test(text)) return null;
  if (!LIST_VERB_RE.test(text) || !TASK_RE.test(text)) return null;
  return { function: { name: 'list_tasks', arguments: {} } };
}

function parseDeterministicNavigation(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input);
  if (!text || !NAVIGATE_RE.test(text)) return null;
  if (DELETE_RE.test(text) || ADD_TASK_RE.test(text) || TASK_RE.test(text) || EVENT_RE.test(text)) return null;

  const normalized = normalizeForMatching(text);
  if (/\bhoje\b/.test(normalized)) {
    return { function: { name: 'go_to_today', arguments: {} } };
  }

  const dateKey = extractDateKeyFromText(text);
  if (!dateKey) return null;
  return { function: { name: 'go_to_date', arguments: { dateKey } } };
}

function findLatestUserIndex(messages: AssistantMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index;
  }
  return -1;
}

function findPreviousAssistantMessage(messages: AssistantMessage[], beforeIndex: number): AssistantMessage | null {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant') return message;
  }
  return null;
}

function assistantAskedForBirthdayConfirmation(message: AssistantMessage | null): boolean {
  if (!message || message.actions?.some((action) => action.tool === 'add_calendar_event' && action.ok)) return false;
  return /\b(recorrente|recorr[êe]ncia|hor[aá]rio|dia inteiro|o dia todo|gostaria)\b/i.test(message.content);
}

function findRecentBirthdayRequest(messages: AssistantMessage[], beforeIndex: number): string {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    if (BIRTHDAY_RE.test(message.content) && extractDateKeyFromText(message.content)) return message.content;
  }
  return '';
}

function isAffirmative(text: string): boolean {
  return /^(sim|s|isso|pode|pode sim|correto|confirmo|confirmado|ok|beleza)\b/i.test(cleanSpaces(text));
}

function buildTaskFromRequest(input: string): string {
  const text = cleanSpaces(input);
  const context = extractContext(text);
  const obligation = normalizeTaskTextForAssistant(extractAfterLastObligation(text));

  if (obligation) {
    const hasContext = context && obligation.toLowerCase().includes(context.toLowerCase());
    return sentenceCase(hasContext || !context ? obligation : `${obligation} no ${context}`);
  }

  return sentenceCase(normalizeTaskTextForAssistant(stripAddTaskPrefix(text)));
}

export function parseDeterministicAssistantToolCall(input: string): AssistantToolCall | null {
  const text = cleanSpaces(input);
  if (!text) return null;

  const deleteCalendarCall = parseDeterministicDeleteCalendarEvents(text);
  if (deleteCalendarCall) return deleteCalendarCall;

  const calendarCall = parseDeterministicCalendarEvent(text);
  if (calendarCall) return calendarCall;

  const genericCalendarCall = parseDeterministicGenericCalendarEvent(text);
  if (genericCalendarCall) return genericCalendarCall;

  const appointmentCall = parseDeterministicAppointmentNoun(text);
  if (appointmentCall) return appointmentCall;

  const listEventsCall = parseDeterministicListCalendarEvents(text);
  if (listEventsCall) return listEventsCall;

  const listTasksCall = parseDeterministicListTasks(text);
  if (listTasksCall) return listTasksCall;

  const navigationCall = parseDeterministicNavigation(text);
  if (navigationCall) return navigationCall;

  const looksLikeAddTask =
    (ADD_TASK_RE.test(text) && TASK_RE.test(text)) ||
    /^(tenho que|preciso|devo|necessito|vou ter que)\b/i.test(text);

  if (!looksLikeAddTask) return null;

  // Loose references need the model and conversation context. Deterministically
  // creating "Fazer isso" would bypass the flow that should ask or resolve from history.
  if (hasAmbiguousReference(text)) return null;

  const taskText = buildTaskFromRequest(text);
  if (!taskText) return null;

  return {
    function: {
      name: 'add_task',
      arguments: {
        text: taskText,
        priority: inferPriority(text)
      }
    }
  };
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

function matchTasksByQuery(
  tasks: AssistantContextTask[],
  query: string,
  strongOnly = false
): AssistantContextTask[] {
  if (query.length < 3) return [];
  const strong = tasks.filter((task) => normalizeForMatching(task.text).includes(query));
  if (strong.length || strongOnly) return strong;
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

  // Task creation phrases stay in the add_task flow unless the user explicitly
  // asks to mark an existing task as completed or change its priority.
  const looksLikeAddTask =
    (ADD_TASK_RE.test(text) && TASK_RE.test(text)) ||
    /^(tenho que|preciso|devo|necessito|vou ter que)\b/i.test(text);
  const hasMutationHint =
    COMPLETED_STATE_RE.test(text) || PRIORITY_WORD_RE.test(text) || PRIORITY_SHORTCUT_RE.test(text);
  if (looksLikeAddTask && !hasMutationHint) return null;

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

const EVENT_UPDATE_VERB_RE = /\b(muda|mudar|mude|altera|alterar|altere|adia|adiar|adie|remarca|remarcar|remarque|transfere|transferir|transfira|troca|trocar|troque)\b/i;

function extractEventQuery(input: string): string {
  const withoutDates = stripDateAndTimeText(input);
  return normalizeForMatching(withoutDates)
    .replace(/\b(remove|remova|remover|apaga|apague|apagar|deleta|delete|deletar|exclui|exclua|excluir|tira|tire|tirar|cancela|cancele|cancelar|muda|mudar|mude|altera|alterar|altere|adia|adiar|adie|remarca|remarcar|remarque|transfere|transferir|transfira|troca|trocar|troque)\b/g, ' ')
    .replace(/\b(evento|eventos|compromisso|compromissos|calendario|agenda|horario|hora|data|dia)\b/g, ' ')
    .replace(/\b(o|a|os|as|um|uma|meu|minha|do|da|de|em|no|na|para|pra|pro|que|por favor|pf)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeEventsById(events: AssistantContextEvent[]): AssistantContextEvent[] {
  const byId = new Map<string, AssistantContextEvent>();
  for (const event of events) {
    if (!byId.has(event.id)) byId.set(event.id, event);
  }
  return [...byId.values()];
}

function matchEventsByQuery(events: AssistantContextEvent[], query: string): AssistantContextEvent[] {
  if (query.length < 3) return [];
  const unique = dedupeEventsById(events);
  const strong = unique.filter((event) => normalizeForMatching(event.title).includes(query));
  if (strong.length) return strong;
  return unique.filter((event) => fuzzyIncludes(event.title, query));
}

function describeEventChoiceLabel(event: AssistantContextEvent): string {
  const dateKey = event.baseDateKey || event.dateKey;
  return `${event.title} (${dateKey}${event.startTime ? ` ${event.startTime}` : ''})`;
}

function findRecentEventActionId(messages: AssistantMessage[]): string {
  const eventTools = new Set(['add_calendar_event', 'update_calendar_event']);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant' || !Array.isArray(message.actions)) continue;
    for (let actionIndex = message.actions.length - 1; actionIndex >= 0; actionIndex -= 1) {
      const action = message.actions[actionIndex];
      if (action.ok && action.itemId && eventTools.has(action.tool)) return action.itemId;
    }
  }
  return '';
}

/**
 * "apaga a reunião", "remove o evento consulta" - deletion by title, without a date.
 * With a date, delegate to delete_calendar_events, which filters by occurrence.
 */
function parseDeleteByTitleIntent(
  input: string,
  snapshot: AssistantContextSnapshot,
  events: AssistantContextEvent[],
  messages: AssistantMessage[]
): DeterministicAssistantIntent | null {
  const text = cleanSpaces(input);
  if (!text || !DELETE_RE.test(text)) return null;
  // "tenho que remover X" is task creation, not deletion.
  if (/^(tenho que|preciso|devo|necessito|vou ter que)\b/i.test(text)) return null;
  const normalized = normalizeForMatching(text);
  if (TASK_RE.test(normalized)) return null;

  const dateKey = extractDateKeyFromText(text);
  const query = extractEventQuery(text);

  if (dateKey) {
    if (EVENT_RE.test(text)) return null;
    if (!query) return null;
    return {
      kind: 'tool_call',
      call: { function: { name: 'delete_calendar_events', arguments: { dateKey, title: query } } }
    };
  }

  const eventMatches = matchEventsByQuery(events, query);
  // Without a domain keyword, a task can also be the target.
  const taskMatches = EVENT_RE.test(text)
    ? []
    : matchTasksByQuery(snapshot.tasks || [], query, true);

  if (eventMatches.length + taskMatches.length > 1) {
    const choices: AssistantPendingChoice[] = [
      ...taskMatches.slice(0, 3).map((task) => ({
        label: `Tarefa: ${task.text}`,
        call: { function: { name: 'delete_task', arguments: { id: task.id } } }
      })),
      ...eventMatches.slice(0, 3).map((event) => ({
        label: `Evento: ${describeEventChoiceLabel(event)}`,
        call: { function: { name: 'delete_calendar_event', arguments: { id: event.id } } }
      }))
    ];
    return buildChoiceIntent(choices, 'Encontrei mais de um item com esse nome. Qual devo apagar?');
  }
  if (eventMatches.length === 1) {
    return {
      kind: 'tool_call',
      call: { function: { name: 'delete_calendar_event', arguments: { id: eventMatches[0].id } } }
    };
  }
  if (taskMatches.length === 1) {
    return {
      kind: 'tool_call',
      call: { function: { name: 'delete_task', arguments: { id: taskMatches[0].id } } }
    };
  }

  if (PRONOUN_REFERENCE_RE.test(normalized) && EVENT_RE.test(text)) {
    const recentId = findRecentEventActionId(messages);
    const referenced = recentId ? dedupeEventsById(events).find((event) => event.id === recentId) : undefined;
    if (referenced) {
      return {
        kind: 'tool_call',
        call: { function: { name: 'delete_calendar_event', arguments: { id: referenced.id } } }
      };
    }
  }
  if (EVENT_RE.test(text) && !query) {
    return { kind: 'question', content: 'Qual evento devo apagar? Diga o título ou a data dele.' };
  }
  return null;
}

/**
 * "muda a consulta para 15h", "adia a reunião para sexta" - rescheduling by title.
 */
function parseEventRescheduleIntent(
  input: string,
  events: AssistantContextEvent[],
  messages: AssistantMessage[]
): DeterministicAssistantIntent | null {
  const text = cleanSpaces(input);
  if (!text || !EVENT_UPDATE_VERB_RE.test(text)) return null;
  const normalized = normalizeForMatching(text);
  if (TASK_RE.test(normalized) || DELETE_RE.test(text)) return null;

  const dateKey = extractDateKeyFromText(text);
  const times = extractTimeRange(text);
  if (!dateKey && !times.startTime) return null;

  const patch = {
    ...(dateKey ? { dateKey } : {}),
    ...(times.startTime ? { startTime: times.startTime } : {}),
    ...(times.endTime ? { endTime: times.endTime } : {})
  };

  const query = extractEventQuery(text);
  const matches = matchEventsByQuery(events, query);
  if (matches.length === 1) {
    return {
      kind: 'tool_call',
      call: { function: { name: 'update_calendar_event', arguments: { id: matches[0].id, ...patch } } }
    };
  }
  if (matches.length > 1) {
    return buildChoiceIntent(
      matches.slice(0, 4).map((event) => ({
        label: describeEventChoiceLabel(event),
        call: { function: { name: 'update_calendar_event', arguments: { id: event.id, ...patch } } }
      })),
      'Encontrei mais de um evento com esse nome. Qual devo remarcar?'
    );
  }

  if (PRONOUN_REFERENCE_RE.test(normalized) || (EVENT_RE.test(text) && !query)) {
    const recentId = findRecentEventActionId(messages);
    const referenced = recentId ? dedupeEventsById(events).find((event) => event.id === recentId) : undefined;
    if (referenced) {
      return {
        kind: 'tool_call',
        call: { function: { name: 'update_calendar_event', arguments: { id: referenced.id, ...patch } } }
      };
    }
    if (EVENT_RE.test(text)) {
      return { kind: 'question', content: 'Qual evento devo remarcar? Diga o título dele.' };
    }
  }
  return null;
}

export function parseDeterministicAssistantToolCallFromConversation(
  messages: AssistantMessage[]
): AssistantToolCall | null {
  const latestIndex = findLatestUserIndex(messages);
  const latest = latestIndex >= 0 ? messages[latestIndex].content : '';
  const direct = parseDeterministicAssistantToolCall(latest);
  if (direct) return direct;

  if (!isAffirmative(latest)) return null;

  const previousAssistant = findPreviousAssistantMessage(messages, latestIndex);
  if (!assistantAskedForBirthdayConfirmation(previousAssistant)) return null;

  const previous = findRecentBirthdayRequest(messages, latestIndex);
  if (!previous || !BIRTHDAY_RE.test(previous)) return null;

  return parseDeterministicCalendarEvent(`${previous} recorrente dia inteiro`);
}

export function resolveDeterministicAssistantIntent(
  messages: AssistantMessage[],
  snapshot?: AssistantContextSnapshot | null,
  options: DeterministicIntentOptions = {}
): DeterministicAssistantIntent | null {
  const latestIndex = findLatestUserIndex(messages);
  const latest = latestIndex >= 0 ? messages[latestIndex].content : '';
  const events = options.events || [];

  if (snapshot) {
    const taskIntent = parseTaskReferenceIntent(latest, snapshot, messages);
    if (taskIntent) return taskIntent;

    const rescheduleIntent = parseEventRescheduleIntent(latest, events, messages);
    if (rescheduleIntent) return rescheduleIntent;

    const deleteIntent = parseDeleteByTitleIntent(latest, snapshot, events, messages);
    if (deleteIntent) return deleteIntent;
  }

  const conversationCall = parseDeterministicAssistantToolCallFromConversation(messages);
  if (conversationCall) return { kind: 'tool_call', call: conversationCall };

  return null;
}

export function parseDeterministicAssistantTextResponse(input: string): string | null {
  const text = cleanSpaces(input).toLowerCase();
  if (/^(oi|olá|ola|hi|hello|bom dia|boa tarde|boa noite)[!.?]*$/.test(text)) {
    return 'Olá. Posso criar tarefas, listar o que existe no dia visível, marcar itens como concluídos e ajustar eventos do calendário.';
  }
  return null;
}
