import type { NeuralBacklink, NeuralGraphEdge, NeuralGraphNode, NeuralLink, NeuralMention, NeuralNote } from '../types/app.js';

/** Pattern source for wikilinks — use {@link replaceWikiLinks} or {@link matchWikiLinks} to avoid shared `lastIndex` state. */
export const WIKI_LINK_PATTERN = /\[\[([^\]\n]+)\]\]/g;

export const MISSING_GRAPH_NODE_PREFIX = 'missing:';
export const MAX_NOTE_TITLE_LENGTH = 96;
export const MAX_NOTE_CONTENT_LENGTH = 20000;

export interface MentionMatch {
  index: number;
  length: number;
}

export function normalizeNeuralTitle(title: unknown): string {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOTE_TITLE_LENGTH);
}

export function normalizeNeuralContent(content: unknown): string {
  return String(content || '').slice(0, MAX_NOTE_CONTENT_LENGTH);
}

export function normalizeNoteKey(value: unknown): string {
  return normalizeNeuralTitle(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function replaceWikiLinks(
  content: unknown,
  replacer: (match: string, rawTarget: string, offset: number, source: string) => string
): string {
  return String(content || '').replace(WIKI_LINK_PATTERN, replacer);
}

export function matchWikiLinks(content: unknown): RegExpMatchArray[] {
  return [...String(content || '').matchAll(WIKI_LINK_PATTERN)];
}

export function stripWikiLinks(content: unknown): string {
  return replaceWikiLinks(content, (_match, rawTarget) => {
    const parsed = parseWikiLinkTarget(String(rawTarget || ''));
    return parsed.alias || parsed.target || '';
  });
}

export function removeWikiLinks(content: unknown): string {
  return replaceWikiLinks(content, () => ' ');
}

export function maskWikiLinks(content: unknown): string {
  return replaceWikiLinks(content, (match) => ' '.repeat(match.length));
}

export function maskCodeRegions(content: unknown): string {
  return String(content || '')
    .replace(/```[\s\S]*?```/g, (match) => ' '.repeat(match.length))
    .replace(/`[^`\n]+`/g, (match) => ' '.repeat(match.length));
}

export function maskMentionSearchContent(content: unknown): string {
  return maskCodeRegions(maskWikiLinks(content));
}

export function parseWikiLinks(content: unknown): NeuralLink[] {
  const links: NeuralLink[] = [];
  const seen = new Set<string>();

  for (const match of matchWikiLinks(content)) {
    const raw = String(match[1] || '').trim();
    const parsed = parseWikiLinkTarget(raw);
    if (!parsed.target) continue;
    const key = normalizeNoteKey(parsed.target);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      target: parsed.target,
      alias: parsed.alias,
      subpath: parsed.subpath,
      raw,
      index: match.index ?? 0
    });
  }

  return links;
}

export function normalizeNeuralNote(note: unknown, fallbackCreatedAt = new Date().toISOString()): NeuralNote | null {
  if (!note || typeof note !== 'object') return null;
  const candidate = note as Partial<NeuralNote>;
  const title = normalizeNeuralTitle(candidate.title);
  if (!title) return null;
  const createdAt = isValidIsoString(candidate.createdAt) ? candidate.createdAt! : fallbackCreatedAt;
  const updatedAt = isValidIsoString(candidate.updatedAt) ? candidate.updatedAt! : createdAt;

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createNeuralId(),
    title,
    content: normalizeNeuralContent(candidate.content),
    createdAt,
    updatedAt
  };
}

export function normalizeNeuralNotes(notes: unknown): NeuralNote[] {
  if (!Array.isArray(notes)) return [];
  const usedIds = new Set<string>();
  const usedTitles = new Set<string>();
  const normalized: NeuralNote[] = [];

  for (const raw of notes) {
    const note = normalizeNeuralNote(raw);
    if (!note) continue;

    let id = note.id;
    while (usedIds.has(id)) id = createNeuralId();
    const key = normalizeNoteKey(note.title);
    let title = note.title;
    if (usedTitles.has(key)) {
      let suffix = 2;
      while (usedTitles.has(normalizeNoteKey(`${note.title} ${suffix}`))) suffix += 1;
      title = `${note.title} ${suffix}`;
    }

    usedIds.add(id);
    usedTitles.add(normalizeNoteKey(title));
    normalized.push({ ...note, id, title });
  }

  return sortNeuralNotes(normalized);
}

export function sortNeuralNotes(notes: NeuralNote[], locale = 'pt-BR'): NeuralNote[] {
  return [...(notes || [])].sort((left, right) =>
    left.title.localeCompare(right.title, locale, { sensitivity: 'base' }) ||
    left.createdAt.localeCompare(right.createdAt)
  );
}

export function createNeuralId(): string {
  return 'note-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function buildNeuralIndexes(notes: NeuralNote[]) {
  const byId = new Map<string, NeuralNote>();
  const byKey = new Map<string, NeuralNote>();
  const outgoingById = new Map<string, NeuralLink[]>();

  for (const note of notes || []) {
    byId.set(note.id, note);
    byKey.set(normalizeNoteKey(note.title), note);
  }

  for (const note of notes || []) {
    outgoingById.set(note.id, parseWikiLinks(note.content));
  }

  return { byId, byKey, outgoingById };
}

export function countNeuralLinks(notes: NeuralNote[]): number {
  const indexes = buildNeuralIndexes(notes);
  let total = 0;
  for (const note of notes || []) {
    total += indexes.outgoingById.get(note.id)?.length || 0;
  }
  return total;
}

export function countOrphanNotes(notes: NeuralNote[]): number {
  if (!notes.length) return 0;
  const indexes = buildNeuralIndexes(notes);
  const incomingIds = new Set<string>();

  for (const note of notes) {
    for (const link of indexes.outgoingById.get(note.id) || []) {
      const target = indexes.byKey.get(normalizeNoteKey(link.target));
      if (target) incomingIds.add(target.id);
    }
  }

  let orphans = 0;
  for (const note of notes) {
    const hasOutgoing = (indexes.outgoingById.get(note.id)?.length || 0) > 0;
    const hasIncoming = incomingIds.has(note.id);
    if (!hasOutgoing && !hasIncoming) orphans += 1;
  }
  return orphans;
}

export function getOutgoingReferences(note: NeuralNote | null | undefined, notes: NeuralNote[]): NeuralMention[] {
  if (!note) return [];
  const { byKey } = buildNeuralIndexes(notes);
  return parseWikiLinks(note.content).map((link) => ({
    note: byKey.get(normalizeNoteKey(link.target)) || null,
    title: link.target,
    linked: Boolean(byKey.get(normalizeNoteKey(link.target))),
    index: link.index
  }));
}

export function getLinkedBacklinks(note: NeuralNote | null | undefined, notes: NeuralNote[]): NeuralBacklink[] {
  if (!note) return [];
  const activeKey = normalizeNoteKey(note.title);
  return (notes || [])
    .filter((candidate) => candidate.id !== note.id)
    .flatMap((candidate) =>
      parseWikiLinks(candidate.content)
        .filter((link) => normalizeNoteKey(link.target) === activeKey)
        .map((link) => ({
          note: candidate,
          linked: true,
          excerpt: buildExcerpt(candidate.content, link.index, note.title)
        }))
    );
}

export function getUnlinkedBacklinks(note: NeuralNote | null | undefined, notes: NeuralNote[]): NeuralBacklink[] {
  if (!note) return [];
  return (notes || [])
    .filter((candidate) => candidate.id !== note.id)
    .map((candidate) => ({ candidate, match: findUnlinkedMentionMatch(candidate.content, note.title) }))
    .filter(({ match }) => match !== null)
    .map(({ candidate, match }) => ({
      note: candidate,
      linked: false,
      excerpt: buildExcerpt(candidate.content, match!.index, note.title)
    }));
}

export function getCurrentNoteUnlinkedMentions(note: NeuralNote | null | undefined, notes: NeuralNote[]): NeuralMention[] {
  if (!note) return [];
  return (notes || [])
    .filter((candidate) => candidate.id !== note.id)
    .map((candidate) => ({ candidate, match: findUnlinkedMentionMatch(note.content, candidate.title) }))
    .filter(({ match }) => match !== null)
    .map(({ candidate, match }) => ({ note: candidate, title: candidate.title, linked: false, index: match!.index }));
}

export function hasUnlinkedMention(content: unknown, title: unknown): boolean {
  return findUnlinkedMentionMatch(content, title) !== null;
}

export function findUnlinkedMentionMatch(content: unknown, title: unknown): MentionMatch | null {
  return findMentionMatch(maskMentionSearchContent(content), title);
}

export function findUnlinkedMentionIndex(content: unknown, title: unknown): number {
  return findUnlinkedMentionMatch(content, title)?.index ?? -1;
}

export function findMentionMatch(content: unknown, title: unknown): MentionMatch | null {
  const cleanContent = String(content || '');
  const cleanTitle = normalizeNeuralTitle(title);
  if (!cleanTitle) return null;
  const escaped = escapeRegExp(cleanTitle);
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'iu');
  const match = cleanContent.match(re);
  if (!match || typeof match.index !== 'number' || typeof match[2] !== 'string') return null;
  return {
    index: match.index + (match[1]?.length || 0),
    length: match[2].length
  };
}

export function findMentionIndex(content: unknown, title: unknown): number {
  return findMentionMatch(content, title)?.index ?? -1;
}

export function buildExcerpt(content: unknown, index = 0, highlight = '', emptyLabel = '…'): string {
  const plain = stripWikiLinks(content).replace(/\s+/g, ' ').trim();
  if (!plain) return emptyLabel;
  const mentionIndex = highlight ? findMentionIndex(plain, highlight) : -1;
  const safeIndex = Math.max(0, Math.min(mentionIndex >= 0 ? mentionIndex : index, plain.length));
  const start = Math.max(0, safeIndex - 64);
  const end = Math.min(plain.length, safeIndex + Math.max(64, normalizeNeuralTitle(highlight).length + 32));
  return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
}

export function insertWikiLink(content: string, cursorStart: number, cursorEnd: number, title = '') {
  const source = String(content || '');
  const selected = normalizeNeuralTitle(source.slice(cursorStart, cursorEnd));
  const target = normalizeNeuralTitle(title || selected || 'Nova nota');
  const shouldUseAlias = Boolean(title && selected && normalizeNoteKey(selected) !== normalizeNoteKey(target));
  const link = shouldUseAlias ? `[[${target}|${selected}]]` : `[[${target}]]`;
  return source.slice(0, cursorStart) + link + source.slice(cursorEnd);
}

export function linkFirstUnlinkedMention(content: string, title: string): string {
  const source = String(content || '');
  const match = findUnlinkedMentionMatch(source, title);
  if (!match) return source;
  const safeTitle = normalizeNeuralTitle(title);
  return source.slice(0, match.index) + `[[${safeTitle}]]` + source.slice(match.index + match.length);
}

export function rewriteWikiLinkTargets(content: string, oldTitle: string, nextTitle: string): string {
  const oldKey = normalizeNoteKey(oldTitle);
  const cleanNext = normalizeNeuralTitle(nextTitle);
  if (!oldKey || !cleanNext) return content;
  return replaceWikiLinks(content, (match, rawTarget) => {
    const raw = String(rawTarget || '').trim();
    const parsed = parseWikiLinkTarget(raw);
    if (normalizeNoteKey(parsed.target) !== oldKey) return match;
    const suffix = parsed.subpath || '';
    return parsed.alias ? `[[${cleanNext}${suffix}|${parsed.alias}]]` : `[[${cleanNext}${suffix}]]`;
  });
}

export function buildLocalGraph(activeNote: NeuralNote | null | undefined, notes: NeuralNote[]) {
  if (!activeNote) return { nodes: [] as NeuralGraphNode[], edges: [] as NeuralGraphEdge[] };

  const indexes = buildNeuralIndexes(notes);
  const activeId = activeNote.id;
  const included = new Set<string>([activeId]);
  const edgeMap = new Map<string, NeuralGraphEdge>();

  function addEdge(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const key = `${sourceId}->${targetId}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { sourceId, targetId });
    included.add(sourceId);
    included.add(targetId);
  }

  for (const link of indexes.outgoingById.get(activeId) || []) {
    const target = indexes.byKey.get(normalizeNoteKey(link.target));
    if (target) {
      addEdge(activeId, target.id);
    } else {
      const missingId = getMissingGraphNodeId(link.target);
      if (!indexes.byId.has(missingId)) {
        indexes.byId.set(missingId, {
          id: missingId,
          title: link.target,
          content: '',
          createdAt: activeNote.createdAt,
          updatedAt: activeNote.updatedAt
        });
      }
      addEdge(activeId, missingId);
    }
  }

  for (const candidate of notes || []) {
    if (candidate.id === activeId) continue;
    for (const link of indexes.outgoingById.get(candidate.id) || []) {
      const target = indexes.byKey.get(normalizeNoteKey(link.target));
      if (target?.id === activeId) addEdge(candidate.id, activeId);
    }
  }

  const nodes = [...included]
    .map((id) => indexes.byId.get(id))
    .filter(Boolean)
    .map((note) => {
      const degree = [...edgeMap.values()].filter((edge) => edge.sourceId === note!.id || edge.targetId === note!.id).length;
      return {
        id: note!.id,
        title: note!.title,
        active: note!.id === activeId,
        degree,
        missing: note!.id.startsWith(MISSING_GRAPH_NODE_PREFIX)
      };
    });

  return { nodes, edges: [...edgeMap.values()] };
}

export function filterNeuralNotes(notes: NeuralNote[], query: string): NeuralNote[] {
  const q = normalizeNoteKey(query);
  if (!q) return sortNeuralNotes(notes);
  return sortNeuralNotes((notes || []).filter((note) => {
    const linkTargets = parseWikiLinks(note.content).map((link) => `${link.target} ${link.alias || ''}`).join(' ');
    return (
      normalizeNoteKey(note.title).includes(q) ||
      normalizeNoteKey(stripWikiLinks(note.content)).includes(q) ||
      normalizeNoteKey(linkTargets).includes(q)
    );
  }));
}

export function getMissingGraphNodeId(title: string): string {
  return MISSING_GRAPH_NODE_PREFIX + normalizeNoteKey(title);
}

function parseWikiLinkTarget(rawTarget: string) {
  const raw = String(rawTarget || '').trim();
  const pipeIndex = raw.indexOf('|');
  const targetWithSubpath = pipeIndex >= 0 ? raw.slice(0, pipeIndex).trim() : raw;
  const alias = pipeIndex >= 0 ? normalizeNeuralTitle(raw.slice(pipeIndex + 1)) : undefined;
  const subpathIndex = targetWithSubpath.search(/[#^]/);
  const targetPart = subpathIndex >= 0 ? targetWithSubpath.slice(0, subpathIndex) : targetWithSubpath;
  const subpath = subpathIndex >= 0 ? targetWithSubpath.slice(subpathIndex).trim() : '';

  return {
    target: normalizeNeuralTitle(targetPart),
    alias: alias || undefined,
    subpath
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidIsoString(v: unknown): boolean {
  return typeof v === 'string' && v !== '' && !Number.isNaN(new Date(v).getTime());
}
