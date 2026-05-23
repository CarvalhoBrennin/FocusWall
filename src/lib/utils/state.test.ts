import { describe, expect, it } from 'vitest';
import { normalizeState, normalizeTaskText, getLocalDateKey } from './state.js';

describe('state utils', () => {
  it('normalizes empty input to default state', () => {
    const state = normalizeState(null);
    expect(state.version).toBeGreaterThan(0);
    expect(state.tasksByDate).toEqual({});
    expect(state.ui.filesLastPath).toBe('');
  });

  it('trims and limits task text', () => {
    expect(normalizeTaskText('  hello   world  ')).toBe('hello world');
  });

  it('formats local date keys', () => {
    const key = getLocalDateKey(new Date('2026-05-22T15:30:00'));
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
