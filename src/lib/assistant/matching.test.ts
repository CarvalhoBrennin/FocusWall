import { describe, expect, it } from 'vitest';
import {
  fuzzyIncludes,
  levenshteinDistance,
  normalizeComparableTitle,
  titlesRoughlyEqual,
  tokensRoughlyEqual
} from './matching.js';

describe('levenshteinDistance', () => {
  it('counts substitutions, insertions and deletions', () => {
    expect(levenshteinDistance('leite', 'leite')).toBe(0);
    expect(levenshteinDistance('leite', 'leito')).toBe(1);
    expect(levenshteinDistance('leite', 'lete')).toBe(1);
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  it('counts adjacent transpositions as a single edit', () => {
    expect(levenshteinDistance('liete', 'leite')).toBe(1);
    expect(levenshteinDistance('reuniao', 'renuiao')).toBe(1);
  });
});

describe('tokensRoughlyEqual', () => {
  it('tolerates one typo on medium tokens and two on long ones', () => {
    expect(tokensRoughlyEqual('liete', 'leite')).toBe(true);
    expect(tokensRoughlyEqual('contrato', 'contarto')).toBe(true);
    expect(tokensRoughlyEqual('cafe', 'sopa')).toBe(false);
  });

  it('does not fuzz very short tokens', () => {
    expect(tokensRoughlyEqual('ir', 'io')).toBe(false);
  });
});

describe('fuzzyIncludes', () => {
  it('matches accent-free and typo variants', () => {
    expect(fuzzyIncludes('Comprar leite', 'comprar liete')).toBe(true);
    expect(fuzzyIncludes('Reunião com Ana', 'reuniao ana')).toBe(true);
    expect(fuzzyIncludes('Reunião com Ana', 'consulta médica')).toBe(false);
  });
});

describe('titlesRoughlyEqual', () => {
  it('treats niver and aniversario as the same title', () => {
    expect(normalizeComparableTitle('Niver do João')).toBe('aniversario do joao');
    expect(titlesRoughlyEqual('Meu aniversário', 'meu aniversario')).toBe(true);
    expect(titlesRoughlyEqual('Consulta médica', 'Consulta medicaa')).toBe(true);
    expect(titlesRoughlyEqual('Reunião', 'Consulta')).toBe(false);
  });
});
