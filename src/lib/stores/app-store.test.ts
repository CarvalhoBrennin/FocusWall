import { describe, expect, it } from 'vitest';
import { getVisibleDateKey } from './app-store.js';

describe('getVisibleDateKey', () => {
  it('offsets from the current date key', () => {
    expect(getVisibleDateKey('2026-06-15', 0)).toBe('2026-06-15');
    expect(getVisibleDateKey('2026-06-15', -1)).toBe('2026-06-14');
    expect(getVisibleDateKey('2026-06-15', -2)).toBe('2026-06-13');
  });
});
