import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  getVisibleDateKey,
  currentDateKey,
  viewOffsetDays,
  data,
  mergePersistedState,
  assertLoadableRawState,
  resolveBootstrapViewOffset,
  setExecutionDateForDateKey,
  setViewOffset
} from './app-store.js';
import { createDefaultState } from '../utils/state.js';
import { VIEW } from '../config.js';

describe('getVisibleDateKey', () => {
  it('offsets from the current date key', () => {
    expect(getVisibleDateKey('2026-06-15', 0)).toBe('2026-06-15');
    expect(getVisibleDateKey('2026-06-15', -1)).toBe('2026-06-14');
    expect(getVisibleDateKey('2026-06-15', -2)).toBe('2026-06-13');
  });
});

describe('future date navigation', () => {
  beforeEach(() => {
    currentDateKey.set('2026-06-20');
    viewOffsetDays.set(0);
    data.set(createDefaultState());
  });

  it('selects future dates from the calendar', () => {
    setExecutionDateForDateKey('2026-06-25');

    expect(get(viewOffsetDays)).toBe(5);
    expect(getVisibleDateKey(get(currentDateKey), get(viewOffsetDays))).toBe('2026-06-25');
  });

  it('allows next-day navigation beyond today', () => {
    setViewOffset(1);

    expect(get(viewOffsetDays)).toBe(1);
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

describe('assertLoadableRawState', () => {
  it('accepts nullish and valid payloads', () => {
    expect(() => assertLoadableRawState(null)).not.toThrow();
    expect(() => assertLoadableRawState({ tasksByDate: {} })).not.toThrow();
  });

  it('rejects non-objects and malformed tasksByDate', () => {
    expect(() => assertLoadableRawState('bad')).toThrow(/inválido/i);
    expect(() => assertLoadableRawState([])).toThrow(/inválido/i);
    expect(() => assertLoadableRawState({ tasksByDate: null })).toThrow(/inválido/i);
    expect(() => assertLoadableRawState({ tasksByDate: [] })).toThrow(/inválido/i);
  });
});

describe('resolveBootstrapViewOffset', () => {
  it('restores offset when base date matches today', () => {
    expect(resolveBootstrapViewOffset('2026-06-20', -2, '2026-06-20')).toBe(-2);
  });

  it('restores future offset when base date matches today', () => {
    expect(resolveBootstrapViewOffset('2026-06-20', 5, '2026-06-20')).toBe(5);
  });

  it('resets offset when base date differs', () => {
    expect(resolveBootstrapViewOffset('2026-06-19', -2, '2026-06-20')).toBe(VIEW.TODAY);
  });

  it('ignores non-integer offsets', () => {
    expect(resolveBootstrapViewOffset('2026-06-20', -1.5, '2026-06-20')).toBe(VIEW.TODAY);
  });
});
