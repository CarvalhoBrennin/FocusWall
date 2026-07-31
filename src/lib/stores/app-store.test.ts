import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
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
  setRadarLocation,
  setRadarCategories,
  addTask,
  getTasksByDate,
  setViewOffset
} from './app-store.js';
import { createDefaultState } from '../utils/state.js';
import { CONFIG, VIEW } from '../config.js';
import { storage } from '../services/storage.js';
import { addCalendarEvent, setCalendarMonth } from './calendar-store.js';
import { addNeuralNote } from './neural-store.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

describe('Radar preferences persistence', () => {
  beforeEach(() => {
    currentDateKey.set('2026-07-29');
    viewOffsetDays.set(0);
    data.set(createDefaultState());
  });

  it('publishes normalized preferences only after persistence succeeds', async () => {
    const save = vi.spyOn(storage, 'saveState').mockResolvedValue(undefined);
    const result = await setRadarLocation({
      id: 'sp',
      name: '  São   Paulo ',
      admin1: ' São Paulo ',
      country: ' Brasil ',
      countryCode: 'br',
      latitude: -23.5505,
      longitude: -46.6333,
      timezone: 'America/Sao_Paulo'
    });

    expect(result).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(get(data).radarPreferences.location?.name).toBe('São Paulo');
    expect(get(data).radarPreferences.location?.countryCode).toBe('BR');
  });



  it('serializes Radar and task mutations without losing either change', async () => {
    vi.useFakeTimers();
    let resolveFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const save = vi.spyOn(storage, 'saveState')
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValue(undefined);

    const locationPromise = setRadarLocation({
      id: 'sp',
      name: 'São Paulo',
      admin1: 'São Paulo',
      country: 'Brasil',
      countryCode: 'BR',
      latitude: -23.5505,
      longitude: -46.6333,
      timezone: 'America/Sao_Paulo'
    });
    const taskPromise = addTask('Revisar Radar', 'high', '2026-07-29');

    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    resolveFirst();

    const [locationSaved, taskId] = await Promise.all([locationPromise, taskPromise]);
    expect(locationSaved).toBe(true);
    expect(taskId).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(2);
    expect(get(data).radarPreferences.location?.id).toBe('sp');
    expect(getTasksByDate(get(data), '2026-07-29').map((task) => task.text)).toContain('Revisar Radar');
  });


  it('serializes Radar, calendar and neural mutations without cross-domain data loss', async () => {
    vi.useFakeTimers();
    let resolveFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const save = vi.spyOn(storage, 'saveState')
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValue(undefined);

    const locationPromise = setRadarLocation({
      id: 'sp', name: 'São Paulo', admin1: 'São Paulo', country: 'Brasil', countryCode: 'BR',
      latitude: -23.5505, longitude: -46.6333, timezone: 'America/Sao_Paulo'
    });
    const eventPromise = addCalendarEvent({ title: 'Revisão Radar', dateKey: '2026-07-29' });
    const notePromise = addNeuralNote({ title: 'Radar', content: 'Validação concluída.' });

    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    resolveFirst();

    const [locationSaved, eventId, noteId] = await Promise.all([locationPromise, eventPromise, notePromise]);
    expect(locationSaved).toBe(true);
    expect(eventId).toBeTruthy();
    expect(noteId).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(3);
    const finalState = get(data);
    expect(finalState.radarPreferences.location?.id).toBe('sp');
    expect(finalState.calendarEvents.some((event) => event.id === eventId)).toBe(true);
    expect(finalState.neuralNotes.some((note) => note.id === noteId)).toBe(true);
    vi.clearAllTimers();
  });

  it('preserves optimistic UI changes made while a Radar save is in flight', async () => {
    vi.useFakeTimers();
    let resolveFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const save = vi.spyOn(storage, 'saveState')
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValue(undefined);

    const locationPromise = setRadarLocation({
      id: 'sp',
      name: 'São Paulo',
      admin1: 'São Paulo',
      country: 'Brasil',
      countryCode: 'BR',
      latitude: -23.5505,
      longitude: -46.6333,
      timezone: 'America/Sao_Paulo'
    });

    await Promise.resolve();
    setCalendarMonth('2026-08');
    expect(get(data).ui.calendarMonth).toBe('2026-08');

    resolveFirst();
    expect(await locationPromise).toBe(true);
    expect(get(data).radarPreferences.location?.id).toBe('sp');
    expect(get(data).ui.calendarMonth).toBe('2026-08');

    await vi.advanceTimersByTimeAsync(CONFIG.SAVE_DEBOUNCE_MS);
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(2);
    const persistedAfterDebounce = save.mock.calls[1]?.[0];
    expect(persistedAfterDebounce?.radarPreferences.location?.id).toBe('sp');
    expect(persistedAfterDebounce?.ui.calendarMonth).toBe('2026-08');
  });

  it('merges concurrent Radar preference mutations in queue order', async () => {
    const save = vi.spyOn(storage, 'saveState').mockResolvedValue(undefined);
    const location = setRadarLocation({
      id: 'lisbon',
      name: 'Lisboa',
      admin1: 'Lisboa',
      country: 'Portugal',
      countryCode: 'PT',
      latitude: 38.7223,
      longitude: -9.1393,
      timezone: 'Europe/Lisbon'
    });
    const categories = setRadarCategories(['development']);

    expect(await location).toBe(true);
    expect(await categories).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(get(data).radarPreferences).toMatchObject({
      location: { id: 'lisbon' },
      enabledCategories: ['development']
    });
  });
  it('keeps the previous state when persistence fails', async () => {
    vi.spyOn(storage, 'saveState').mockRejectedValue(new Error('disk unavailable'));
    const before = get(data);
    const result = await setRadarLocation({
      id: 'lisbon',
      name: 'Lisboa',
      admin1: 'Lisboa',
      country: 'Portugal',
      countryCode: 'PT',
      latitude: 38.7223,
      longitude: -9.1393,
      timezone: 'Europe/Lisbon'
    });

    expect(result).toBe(false);
    expect(get(data)).toEqual(before);
  });
});
