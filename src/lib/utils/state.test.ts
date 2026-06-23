import { describe, expect, it } from 'vitest';
import {
  normalizeState,
  normalizeTaskText,
  getLocalDateKey,
  parseMonthKey,
  getMonthKeyFromDateKey
} from './state.js';

describe('state utils', () => {
  it('normalizes empty input to default state', () => {
    const state = normalizeState(null);
    expect(state.version).toBeGreaterThan(0);
    expect(state.tasksByDate).toEqual({});
    expect(state.ui.filesLastPath).toBe('');
    expect(state.neuralNotes).toEqual([]);
    expect(state.ui.lastNeuralNoteId).toBeNull();
  });

  it('preserves and normalizes neural notes inside the app state', () => {
    const state = normalizeState({
      neuralNotes: [
        {
          id: 'n1',
          title: '  Mapa Mental  ',
          content: 'Ver [[Projeto Alpha]].',
          createdAt: '2026-06-23T12:00:00.000Z',
          updatedAt: '2026-06-23T12:00:00.000Z'
        }
      ]
    });
    expect(state.neuralNotes).toHaveLength(1);
    expect(state.neuralNotes[0]?.title).toBe('Mapa Mental');
    expect(state.neuralNotes[0]?.content).toBe('Ver [[Projeto Alpha]].');
  });

  it('trims and limits task text', () => {
    expect(normalizeTaskText('  hello   world  ')).toBe('hello world');
  });

  it('formats local date keys', () => {
    const key = getLocalDateKey(new Date('2026-05-22T15:30:00'));
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses month keys in local time (June, not May)', () => {
    const june = parseMonthKey('2026-06');
    expect(june.getMonth()).toBe(5);
    expect(june.getFullYear()).toBe(2026);
    expect(getMonthKeyFromDateKey('2026-06-15')).toBe('2026-06');
  });
});
