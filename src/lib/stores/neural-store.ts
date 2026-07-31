import { derived, get, writable } from 'svelte/store';
import { msg } from '../i18n/index.js';
import { storage } from '../services/storage.js';
import { enqueueStatePersistence } from '../services/state-persistence.js';
import type { AppState, NeuralNote } from '../types/app.js';
import {
  buildLocalGraph,
  countNeuralLinks,
  countOrphanNotes,
  filterNeuralNotes,
  getCurrentNoteUnlinkedMentions,
  getLinkedBacklinks,
  getOutgoingReferences,
  getUnlinkedBacklinks,
  normalizeNeuralContent,
  normalizeNeuralNote,
  normalizeNeuralTitle,
  normalizeNoteKey,
  rewriteWikiLinkTargets,
  sortNeuralNotes,
  createNeuralId
} from '../utils/neural.js';
import {
  appDataPath,
  data,
  mergePersistedState,
  persistStateDebounced,
  publishPersistedDomain,
  setAppStatus
} from './app-store.js';

export const selectedNeuralNoteId = writable<string | null>(null);

let neuralMutationQueue: Promise<void> = Promise.resolve();

function enqueueNeuralMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = neuralMutationQueue.then(operation, operation);
  neuralMutationQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
export const neuralSearchQuery = writable('');

export const neuralNotes = derived(data, ($data) => sortNeuralNotes($data.neuralNotes || [], $data.ui?.locale));

export const filteredNeuralNotes = derived(
  [neuralNotes, neuralSearchQuery],
  ([$notes, $query]) => filterNeuralNotes($notes, $query)
);

export const selectedNeuralNote = derived(
  [neuralNotes, selectedNeuralNoteId],
  ([$notes, $selectedId]) => {
    if (!$notes.length) return null;
    return $notes.find((note) => note.id === $selectedId) || $notes[0] || null;
  }
);

export const neuralStats = derived(neuralNotes, ($notes) => ({
  notes: $notes.length,
  links: countNeuralLinks($notes),
  orphanNotes: countOrphanNotes($notes)
}));

export const selectedNeuralLinks = derived(
  [selectedNeuralNote, neuralNotes],
  ([$note, $notes]) => getOutgoingReferences($note, $notes)
);

export const selectedNeuralLinkedBacklinks = derived(
  [selectedNeuralNote, neuralNotes],
  ([$note, $notes]) => getLinkedBacklinks($note, $notes)
);

export const selectedNeuralUnlinkedBacklinks = derived(
  [selectedNeuralNote, neuralNotes],
  ([$note, $notes]) => getUnlinkedBacklinks($note, $notes)
);

export const selectedNeuralUnlinkedMentions = derived(
  [selectedNeuralNote, neuralNotes],
  ([$note, $notes]) => getCurrentNoteUnlinkedMentions($note, $notes)
);

export const selectedNeuralGraph = derived(
  [selectedNeuralNote, neuralNotes],
  ([$note, $notes]) => buildLocalGraph($note, $notes)
);

function getNotes(state: AppState): NeuralNote[] {
  return Array.isArray(state.neuralNotes) ? state.neuralNotes : [];
}

function withNeuralUi(state: AppState): AppState {
  return {
    ...state,
    ui: {
      ...state.ui,
      lastNeuralNoteId: get(selectedNeuralNoteId)
    }
  };
}

async function saveNeuralState(nextNotes: NeuralNote[], success: string, failure: string): Promise<boolean> {
  return enqueueStatePersistence(async () => {
    const latest = get(data);
    const persisted = mergePersistedState(withNeuralUi({ ...latest, neuralNotes: nextNotes }));
    try {
      await storage.saveState(persisted);
      publishPersistedDomain((current) =>
        withNeuralUi({ ...current, neuralNotes: nextNotes })
      );
      setAppStatus(success, 'live', get(appDataPath));
      return true;
    } catch {
      setAppStatus(failure, 'error', get(appDataPath));
      return false;
    }
  });
}

export function ensureNeuralSelection() {
  const notes = get(neuralNotes);
  const $data = get(data);
  if (!notes.length) {
    selectedNeuralNoteId.set(null);
    return;
  }
  let selectedId = get(selectedNeuralNoteId) || $data.ui.lastNeuralNoteId;
  if (!selectedId || !notes.some((note) => note.id === selectedId)) {
    selectedId = notes[0].id;
  }
  selectedNeuralNoteId.set(selectedId);
  if ($data.ui.lastNeuralNoteId !== selectedId) {
    data.set({ ...$data, ui: { ...$data.ui, lastNeuralNoteId: selectedId } });
    persistStateDebounced();
  }
}

export function selectNeuralNote(id: string | null) {
  selectedNeuralNoteId.set(id);
  const $data = get(data);
  if ($data.ui.lastNeuralNoteId !== id) {
    data.set({ ...$data, ui: { ...$data.ui, lastNeuralNoteId: id } });
    persistStateDebounced();
  }
}

export function addNeuralNote(seed: Partial<NeuralNote> = {}): Promise<string | null> {
  return enqueueNeuralMutation(async () => {
    const $data = get(data);
    const notes = getNotes($data);
    const now = new Date().toISOString();
    const title = createUniqueTitle(notes, normalizeNeuralTitle(seed.title) || msg('neural.defaultNoteTitle'));
    const note = normalizeNeuralNote({
      id: createNeuralId(),
      title,
      content: normalizeNeuralContent(seed.content || ''),
      createdAt: now,
      updatedAt: now
    });
    if (!note) return null;

    const nextNotes = sortNeuralNotes([...notes, note], $data.ui?.locale);
    const ok = await saveNeuralState(nextNotes, msg('neural.status.saved'), msg('neural.status.saveFailedAdd'));
    if (ok) selectNeuralNote(note.id);
    return ok ? note.id : null;
  });
}

export function updateNeuralNote(id: string, patch: Partial<NeuralNote>): Promise<boolean> {
  return enqueueNeuralMutation(async () => {
    const $data = get(data);
    const notes = getNotes($data);
    const current = notes.find((note) => note.id === id);
    if (!current) return false;

    const requestedTitle = 'title' in patch ? normalizeNeuralTitle(patch.title) : current.title;
    if (!requestedTitle) return false;
    const nextTitle = createUniqueTitle(notes.filter((note) => note.id !== id), requestedTitle);
    const titleChanged = normalizeNoteKey(current.title) !== normalizeNoteKey(nextTitle);
    const now = new Date().toISOString();

    const nextNotes = notes.map((note) => {
      const baseContent = note.id === id && 'content' in patch ? normalizeNeuralContent(patch.content) : note.content;
      const content = titleChanged ? rewriteWikiLinkTargets(baseContent, current.title, nextTitle) : baseContent;

      if (note.id === id) {
        return { ...note, title: nextTitle, content, updatedAt: now };
      }
      if (content !== note.content) return { ...note, content, updatedAt: now };
      return note;
    });

    return saveNeuralState(
      sortNeuralNotes(nextNotes, $data.ui?.locale),
      msg('neural.status.updated'),
      msg('neural.status.saveFailedUpdate')
    );
  });
}

export function deleteNeuralNote(id: string): Promise<boolean> {
  return enqueueNeuralMutation(async () => {
    const $data = get(data);
    const notes = getNotes($data);
    const target = notes.find((note) => note.id === id);
    if (!target) return false;

    const nextNotes = notes.filter((note) => note.id !== id);
    const ok = await saveNeuralState(
      nextNotes,
      msg('neural.status.deleted'),
      msg('neural.status.saveFailedDelete')
    );
    if (ok) {
      const currentSelected = get(selectedNeuralNoteId);
      if (currentSelected === id) selectNeuralNote(nextNotes[0]?.id || null);
    }
    return ok;
  });
}

export function createUniqueTitle(notes: NeuralNote[], desiredTitle: string): string {
  const base = normalizeNeuralTitle(desiredTitle) || msg('neural.defaultNoteTitle');
  const used = new Set((notes || []).map((note) => normalizeNoteKey(note.title)));
  if (!used.has(normalizeNoteKey(base))) return base;
  let suffix = 2;
  while (used.has(normalizeNoteKey(`${base} ${suffix}`))) suffix += 1;
  return `${base} ${suffix}`;
}
