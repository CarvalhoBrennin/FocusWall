import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { getVisibleDateKey, currentDateKey, viewOffsetDays, data, mergePersistedState } from './app-store.js';
import { createDefaultState } from '../utils/state.js';

describe('getVisibleDateKey', () => {
  it('offsets from the current date key', () => {
    expect(getVisibleDateKey('2026-06-15', 0)).toBe('2026-06-15');
    expect(getVisibleDateKey('2026-06-15', -1)).toBe('2026-06-14');
    expect(getVisibleDateKey('2026-06-15', -2)).toBe('2026-06-13');
  });
});

describe('mergePersistedState', () => {
  beforeEach(() => {
    currentDateKey.set('2026-06-20');
    viewOffsetDays.set(-2);
    data.set(createDefaultState());
  });

  it('syncs navigation fields from stores into persisted ui', () => {
    const merged = mergePersistedState(get(data));
    expect(merged.ui.lastViewedBaseDate).toBe('2026-06-20');
    expect(merged.ui.viewOffsetDays).toBe(-2);
  });
});
