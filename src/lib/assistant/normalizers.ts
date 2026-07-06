import type { AssistantToolArguments } from '../types/assistant.js';

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'marco',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
];

const MONTH_PATTERN = MONTH_NAMES.join('|');

export function cleanAssistantText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function sentenceCase(value: string): string {
  const text = cleanAssistantText(value);
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function getStringArg(args: AssistantToolArguments, name: string): string {
  return typeof args[name] === 'string' ? cleanAssistantText(args[name]) : '';
}

export function isBirthdayText(value: string): boolean {
  return /\b(anivers[aá]rio|aniversario|niver)\b/i.test(value);
}

function normalizeBirthdayOwnerPreposition(preposition: string, owner: string): string {
  const normalizedOwner = cleanAssistantText(owner);
  if (!normalizedOwner) return '';
  if (preposition === 'de') {
    if (/^minha\b/i.test(normalizedOwner)) return `da ${normalizedOwner}`;
    if (/^meu\b/i.test(normalizedOwner)) return `do ${normalizedOwner}`;
  }
  return `${preposition} ${normalizedOwner}`;
}

export function stripDateAndTimeFragments(value: string): string {
  let text = cleanAssistantText(value);
  const datePatterns = [
    new RegExp(`\\b(?:dia\\s+)?\\d{1,2}\\s+de\\s+(?:${MONTH_PATTERN})(?:\\s+de\\s+\\d{2,4})?\\b`, 'gi'),
    new RegExp(`\\b(?:${MONTH_PATTERN})\\s+(?:dia\\s+)?\\d{1,2}(?:\\s+de\\s+\\d{2,4})?\\b`, 'gi'),
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
    /\b(?:hoje|amanh[ãa]|depois de amanh[ãa]|semana que vem|pr[oó]xima semana|m[eê]s que vem|pr[oó]ximo m[eê]s)\b/gi,
    /\b(?:todo ano|todos os anos|anual|anualmente|recorrente|recorr[êe]ncia|todo m[eê]s|mensal|mensalmente|toda semana|semanal|semanalmente)\b/gi,
    /(?:\b(?:as|às|das|a partir d[ae]s?)\s+)([01]?\d|2[0-3])(?:[:h][0-5]\d|\s*(?:hs?|horas?))?\b/gi,
    /\b([01]?\d|2[0-3])[:h][0-5]\d\b/g,
    /\b([01]?\d|2[0-3])\s*(?:hs|horas?)\b/gi,
    /\b([01]?\d|2[0-3])h\b/gi
  ];

  for (const pattern of datePatterns) {
    text = text.replace(pattern, ' ');
  }

  return cleanAssistantText(text).replace(/\s+([,.!?;:])/g, '$1');
}

export function extractBirthdayTitleFromText(sourceText: string): string {
  const source = cleanAssistantText(sourceText);
  if (!source || !isBirthdayText(source)) return '';

  if (/\bmeu\s+(?:anivers[aá]rio|aniversario|niver)\b/i.test(source) ||
      /\b(?:anivers[aá]rio|aniversario|niver)\s+meu\b/i.test(source)) {
    return 'Meu aniversário';
  }

  const stopWords = [
    'e',
    'é',
    'eh',
    'fica',
    'acontece',
    'ocorre',
    'cai',
    'todo',
    'toda',
    'todos',
    'todas',
    'dia',
    'em',
    'no',
    'na',
    'para',
    'pra',
    'recorrente',
    'anual',
    ...MONTH_NAMES
  ].join('|');

  const ownerPattern = new RegExp(
    `\\b(?:anivers[aá]rio|aniversario|niver)\\s+(da|do|de)\\s+(.+?)(?=\\s+(?:${stopWords})(?:\\s|$)|\\s+\\d{1,2}(?:[/-]|\\s+de\\s+)|[.!?]|$)`,
    'i'
  );
  const match = source.match(ownerPattern);
  if (!match) return '';

  const preposition = match[1].toLowerCase();
  const owner = cleanAssistantText(match[2]).replace(/^(?:o|a|os|as)\s+/i, '');
  if (!owner) return '';
  return sentenceCase(`Aniversário ${normalizeBirthdayOwnerPreposition(preposition, owner)}`);
}

function removeCommandFragments(value: string): string {
  return cleanAssistantText(value)
    .replace(/^\s*(?:por favor,?\s*)?/i, '')
    .replace(/^\s*(?:adicion(?:a|e|ar)|cri(?:a|e|ar)|registr(?:a|e|ar)|inclu(?:a|ir)|coloca|coloque|marca|marque|marcar|agenda|agende|agendar)\s+/i, '')
    .replace(/^\s*(?:um\s+|uma\s+)?(?:novo\s+|nova\s+)?(?:evento|compromisso|agenda)\s*/i, '');
}

function removeTrailingWeakWords(value: string): string {
  let text = cleanAssistantText(value);
  const trailingWeakWord = /\s+(?:e|é|eh|fica|acontece|ocorre|cai|dia|em|no|na|para|pra|recorrente|anual)\.?$/i;
  while (trailingWeakWord.test(text)) {
    text = text.replace(trailingWeakWord, '').trim();
  }
  return text;
}

export function sanitizeCalendarTitle(rawTitle: string, sourceText = ''): string {
  const inferredBirthdayTitle = extractBirthdayTitleFromText(sourceText);
  if (inferredBirthdayTitle) return inferredBirthdayTitle;

  let title = cleanAssistantText(rawTitle);
  title = removeCommandFragments(title);
  title = stripDateAndTimeFragments(title);
  title = title.replace(/\b(?:no|na|ao|aos|para|pra|em|de|do|da|às|as)\s*$/i, '');
  title = removeTrailingWeakWords(title);

  if (isBirthdayText(title)) {
    title = title
      .replace(/\banivers[aá]rio\s+de\s+minha\b/i, 'Aniversário da minha')
      .replace(/\banivers[aá]rio\s+de\s+meu\b/i, 'Aniversário do meu')
      .replace(/\bniver\b/i, 'Aniversário');
  }

  return sentenceCase(title);
}

export function hasSuspiciousCalendarTitle(title: string): boolean {
  const text = cleanAssistantText(title);
  if (!text || text.length < 3) return true;
  if (/(?:^|\s)(?:e|é|eh|fica|acontece|ocorre|cai|dia|em|no|na|para|pra)\.?$/i.test(text)) return true;
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(text)) return true;
  if (new RegExp(`\\b\\d{1,2}\\s+de\\s+(?:${MONTH_PATTERN})\\b`, 'i').test(text)) return true;
  return false;
}
