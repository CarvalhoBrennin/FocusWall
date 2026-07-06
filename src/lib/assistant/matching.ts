/**
 * Text matching helpers shared by the assistant deterministic layer and tools.
 * All comparisons are accent-insensitive and tolerate small typos.
 */

export function normalizeMatchText(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Normalization for title comparison: treats "niver" as "aniversario". */
export function normalizeComparableTitle(value: string): string {
  return normalizeMatchText(value).replace(/\bniver\b/g, 'aniversario');
}

/**
 * Damerau-Levenshtein (optimal string alignment): transpositions count as one
 * edit, covering the most common typo shape ("liete" -> "leite").
 */
export function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let beforePrevious = new Array(right.length + 1);
  let previous = new Array(right.length + 1);
  let current = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) previous[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
    }
    [beforePrevious, previous, current] = [previous, current, beforePrevious];
  }
  return previous[right.length];
}

/** Maximum tolerated distance for treating two tokens as equivalent. */
function typoBudget(length: number): number {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

export function tokensRoughlyEqual(left: string, right: string): boolean {
  if (left === right) return true;
  const budget = typoBudget(Math.min(left.length, right.length));
  if (!budget) return false;
  if (Math.abs(left.length - right.length) > budget) return false;
  return levenshteinDistance(left, right) <= budget;
}

function toTokens(value: string): string[] {
  return normalizeMatchText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

/**
 * True when all relevant query tokens appear in the text, with small typo
 * tolerance.
 */
export function fuzzyIncludes(text: string, query: string): boolean {
  const normalizedText = normalizeMatchText(text);
  const normalizedQuery = normalizeMatchText(query);
  if (!normalizedQuery) return false;
  if (normalizedText.includes(normalizedQuery)) return true;

  const queryTokens = toTokens(normalizedQuery);
  if (!queryTokens.length) return false;
  const textTokens = toTokens(normalizedText);
  return queryTokens.every((queryToken) =>
    textTokens.some((textToken) => textToken.includes(queryToken) || tokensRoughlyEqual(textToken, queryToken))
  );
}

/** Whole-title similarity (0..1) for duplicate detection. */
export function titleSimilarity(left: string, right: string): number {
  const a = normalizeComparableTitle(left);
  const b = normalizeComparableTitle(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

export function titlesRoughlyEqual(left: string, right: string): boolean {
  return titleSimilarity(left, right) >= 0.85;
}
