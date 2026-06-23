import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { data, currentDateKey, viewOffsetDays } from './app-store.js';
import { updateNeuralNote } from './neural-store.js';
import { createDefaultState } from '../utils/state.js';

const now = '2026-06-23T12:00:00.000Z';
const note = (id: string, title: string, content: string) => ({ id, title, content, createdAt: now, updatedAt: now });

function createMemoryLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size;
    }
  };
}

describe('neural store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryLocalStorage());
    currentDateKey.set('2026-06-23');
    viewOffsetDays.set(0);
    data.set(createDefaultState());
  });

  it('rewrites wikilinks inside the renamed note and other notes', async () => {
    data.set({
      ...createDefaultState(),
      neuralNotes: [
        note('alpha', 'Alpha', 'Self-reference [[Alpha]] and [[Alpha#Resumo|alias]].'),
        note('beta', 'Beta', 'Depends on [[Alpha]].')
      ]
    });

    await expect(updateNeuralNote('alpha', { title: 'Omega' })).resolves.toBe(true);

    const notes = get(data).neuralNotes;
    expect(notes.find((item) => item.id === 'alpha')?.content).toBe(
      'Self-reference [[Omega]] and [[Omega#Resumo|alias]].'
    );
    expect(notes.find((item) => item.id === 'beta')?.content).toBe('Depends on [[Omega]].');
  });
});
