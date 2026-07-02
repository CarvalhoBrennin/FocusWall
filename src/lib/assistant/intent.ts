import type { Priority } from '../types/app.js';
import type { AssistantToolCall } from '../types/assistant.js';

const ADD_TASK_RE = /\b(adicion(?:a|e|ar)|cri(?:a|e|ar)|registr(?:a|e|ar)|inclu(?:a|ir)|coloca|coloque)\b/i;
const TASK_RE = /\b(tarefa|task|afazer|pend[êe]ncia)\b/i;
const OBLIGATION_RE = /\b(tenho que|preciso|devo|necessito|vou ter que)\b/gi;

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sentenceCase(value: string): string {
  const text = cleanSpaces(value);
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
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

function inferPriority(text: string): Priority {
  if (/\b(urgente|alta prioridade|prioridade alta|importante|cr[ií]tico|cr[ií]tica)\b/i.test(text)) return 'high';
  if (/\b(baixa prioridade|prioridade baixa|sem pressa|quando der)\b/i.test(text)) return 'low';
  return 'medium';
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

  const looksLikeAddTask =
    (ADD_TASK_RE.test(text) && TASK_RE.test(text)) ||
    /^(tenho que|preciso|devo|necessito|vou ter que)\b/i.test(text);

  if (!looksLikeAddTask) return null;

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

export function parseDeterministicAssistantTextResponse(input: string): string | null {
  const text = cleanSpaces(input).toLowerCase();
  if (/^(oi|olá|ola|hi|hello|bom dia|boa tarde|boa noite)[!.?]*$/.test(text)) {
    return 'Olá. Posso criar tarefas, listar o que existe no dia visível, marcar itens como concluídos e ajustar eventos do calendário.';
  }
  return null;
}
