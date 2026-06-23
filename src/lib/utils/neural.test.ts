import { describe, expect, it } from 'vitest';
import {
  buildLocalGraph,
  countNeuralLinks,
  countOrphanNotes,
  findUnlinkedMentionIndex,
  findMentionMatch,
  getCurrentNoteUnlinkedMentions,
  getLinkedBacklinks,
  getUnlinkedBacklinks,
  linkFirstUnlinkedMention,
  filterNeuralNotes,
  insertWikiLink,
  normalizeNoteKey,
  parseWikiLinks,
  stripWikiLinks,
  rewriteWikiLinkTargets
} from './neural.js';

const now = '2026-06-23T12:00:00.000Z';
const note = (id: string, title: string, content: string) => ({ id, title, content, createdAt: now, updatedAt: now });

describe('neural utils', () => {
  it('parses wikilinks with aliases, subpaths and dedupes targets', () => {
    const links = parseWikiLinks('Ver [[Projeto Alpha#Resumo]] e [[Projeto Alpha|Alpha]]. Depois [[Pesquisa|Fonte]].');
    expect(links).toHaveLength(2);
    expect(links[0]?.target).toBe('Projeto Alpha');
    expect(links[0]?.subpath).toBe('#Resumo');
    expect(links[0]?.alias).toBeUndefined();
    expect(links[1]?.target).toBe('Pesquisa');
    expect(links[1]?.alias).toBe('Fonte');
  });

  it('normalizes title keys without accents and case', () => {
    expect(normalizeNoteKey(' Ciência de Dados ')).toBe('ciencia de dados');
  });

  it('strips wikilinks to their visible text while keeping plain targets without aliases', () => {
    expect(stripWikiLinks('Ler [[Projeto Alpha#Resumo|este resumo]] e [[Bloco^abc]].')).toBe('Ler este resumo e Bloco.');
  });

  it('finds linked and unlinked backlinks, including mixed notes with both types', () => {
    const target = note('a', 'Sistema Neural', 'Base');
    const linked = note('b', 'Roadmap', 'Implementar [[Sistema Neural]].');
    const unlinked = note('c', 'Ideia', 'Sistema Neural pode virar segundo cérebro.');
    const mixed = note('d', 'Resumo', 'Citou [[Sistema Neural]] e também Sistema Neural sem link.');
    const notes = [target, linked, unlinked, mixed];

    expect(getLinkedBacklinks(target, notes).map((item) => item.note.id)).toEqual(['b', 'd']);
    expect(getUnlinkedBacklinks(target, notes).map((item) => item.note.id)).toEqual(['c', 'd']);
  });

  it('detects unlinked mentions in current note, even when the note also has a resolved link', () => {
    const current = note('a', 'Sprint', 'Validar [[Arquitetura]] e citar arquitetura novamente. Pesquisar Obsidian.');
    const architecture = note('b', 'Arquitetura', '');
    const obsidian = note('c', 'Obsidian', '');
    expect(getCurrentNoteUnlinkedMentions(current, [current, architecture, obsidian]).map((item) => item.title)).toEqual([
      'Arquitetura',
      'Obsidian'
    ]);
  });

  it('ignores mentions inside fenced and inline code when linking', () => {
    expect(findUnlinkedMentionIndex('Use `Sistema Neural` helper', 'Sistema Neural')).toBe(-1);
    expect(findUnlinkedMentionIndex('```\nSistema Neural\n```', 'Sistema Neural')).toBe(-1);
    expect(linkFirstUnlinkedMention('Ver `Sistema Neural` e Sistema Neural solto.', 'Sistema Neural')).toBe(
      'Ver `Sistema Neural` e [[Sistema Neural]] solto.'
    );
  });

  it('inserts wikilinks and preserves selected text as an alias when linking to another note', () => {
    expect(insertWikiLink('Conectar alpha ao mapa.', 9, 14, 'Projeto Alpha')).toBe('Conectar [[Projeto Alpha|alpha]] ao mapa.');
    expect(insertWikiLink('Conectar Projeto Alpha ao mapa.', 9, 22, 'Projeto Alpha')).toBe('Conectar [[Projeto Alpha]] ao mapa.');
  });

  it('converts first unlinked mention to wikilink', () => {
    expect(linkFirstUnlinkedMention('Projeto Alpha está em revisão.', 'Projeto Alpha')).toBe(
      '[[Projeto Alpha]] está em revisão.'
    );
  });

  it('uses the matched substring length when converting mentions with different casing', () => {
    expect(findMentionMatch('cite PROJETO alpha note', 'Projeto Alpha')).toEqual({ index: 5, length: 13 });
    expect(linkFirstUnlinkedMention('cite PROJETO alpha note', 'Projeto Alpha')).toBe('cite [[Projeto Alpha]] note');
  });

  it('does not convert mentions that only appear inside existing wikilinks or aliases', () => {
    expect(linkFirstUnlinkedMention('Ver [[Roadmap|Projeto Alpha]] antes de revisar.', 'Projeto Alpha')).toBe(
      'Ver [[Roadmap|Projeto Alpha]] antes de revisar.'
    );
    expect(linkFirstUnlinkedMention('Ver [[Roadmap|Projeto Alpha]]; Projeto Alpha está solto.', 'Projeto Alpha')).toBe(
      'Ver [[Roadmap|Projeto Alpha]]; [[Projeto Alpha]] está solto.'
    );
  });

  it('keeps searches aware of hidden wikilink targets even when aliases are visible', () => {
    const hiddenTarget = note('a', 'Diário', 'Ver [[Projeto Alpha|este resumo]].');
    expect(filterNeuralNotes([hiddenTarget], 'Projeto Alpha').map((item) => item.id)).toEqual(['a']);
  });

  it('rewrites wikilinks when note title changes while preserving aliases and subpaths', () => {
    expect(rewriteWikiLinkTargets('Ver [[Ideia antiga#Resumo|atalho]] e [[Outro]].', 'Ideia antiga', 'Ideia nova')).toBe(
      'Ver [[Ideia nova#Resumo|atalho]] e [[Outro]].'
    );
  });

  it('builds local graph around active note with outgoing, incoming and unresolved links', () => {
    const active = note('a', 'Alpha', 'Depende de [[Beta]] e [[Delta]].');
    const beta = note('b', 'Beta', '');
    const gamma = note('c', 'Gamma', 'Referencia [[Alpha]].');
    const graph = buildLocalGraph(active, [active, beta, gamma]);

    expect(graph.nodes.map((node) => node.title).sort()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    expect(graph.nodes.find((node) => node.title === 'Delta')?.missing).toBe(true);
    expect(graph.edges).toContainEqual({ sourceId: 'a', targetId: 'b' });
    expect(graph.edges).toContainEqual({ sourceId: 'c', targetId: 'a' });
    expect(graph.edges.some((edge) => edge.sourceId === 'a' && edge.targetId.startsWith('missing:'))).toBe(true);
  });

  it('counts links and orphan notes efficiently', () => {
    const alpha = note('a', 'Alpha', '[[Beta]]');
    const beta = note('b', 'Beta', '');
    const orphan = note('c', 'Orphan', 'Texto solto.');
    const notes = [alpha, beta, orphan];

    expect(countNeuralLinks(notes)).toBe(1);
    expect(countOrphanNotes(notes)).toBe(1);
    expect(countOrphanNotes([alpha, beta])).toBe(0);
  });
});
