import { get } from 'svelte/store';
import { data, persistStateDebounced } from '../stores/app-store.js';
import type { AppState } from '../types/app.js';
import { ensureAbsolutePath } from '../utils/path.js';
import { tauriInvoke } from '../utils/tauri.js';
import { pickProjectDir, folderLabel } from './opencode.js';

const LEGACY_FAVORITES_KEY = 'focuswall-files-favorites';
const LEGACY_RECENTS_KEY = 'focuswall-files-recents';
const MAX_RECENTS = 10;
const MAX_FAVORITES = 12;

export type FileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  modifiedAt: string;
  extension: string;
};

/** Normalize entries from Tauri (camelCase) or legacy snake_case. */
export function normalizeFileEntry(entry: Record<string, unknown>): FileEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const path = typeof entry.path === 'string' ? entry.path : '';
  const name = typeof entry.name === 'string' ? entry.name : '';
  if (!path || !name) return null;

  const isDir = Boolean(entry.isDir ?? entry.is_dir);
  const absolutePath = ensureAbsolutePath(path) || path;
  return {
    name,
    path: absolutePath,
    isDir,
    sizeBytes: Number(entry.sizeBytes ?? entry.size_bytes) || 0,
    modifiedAt: String(entry.modifiedAt ?? entry.modified_at ?? ''),
    extension: String(entry.extension ?? '')
  };
}

export type WellKnownFolder = {
  id: string;
  label: string;
  path: string;
};

export type FilesSort = 'name' | 'date' | 'size';

function readLegacyPathList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function clearLegacyPathList(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function getUiPaths($data: AppState) {
  return {
    favorites: Array.isArray($data.ui?.filesFavorites) ? $data.ui.filesFavorites : [],
    recents: Array.isArray($data.ui?.filesRecents) ? $data.ui.filesRecents : []
  };
}

function updateUiPaths(mutator: (lists: { favorites: string[]; recents: string[] }) => {
  favorites: string[];
  recents: string[];
}) {
  const $data = get(data);
  const current = getUiPaths($data);
  const nextLists = mutator(current);
  data.set({
    ...$data,
    ui: {
      ...$data.ui,
      filesFavorites: nextLists.favorites,
      filesRecents: nextLists.recents
    }
  });
  persistStateDebounced();
  return nextLists;
}

/** One-time import from legacy localStorage keys into dashboard state. */
export function migrateLegacyFilesLists() {
  const $data = get(data);
  const { favorites, recents } = getUiPaths($data);
  const legacyFavorites = favorites.length ? [] : readLegacyPathList(LEGACY_FAVORITES_KEY);
  const legacyRecents = recents.length ? [] : readLegacyPathList(LEGACY_RECENTS_KEY);
  if (!legacyFavorites.length && !legacyRecents.length) return;

  data.set({
    ...$data,
    ui: {
      ...$data.ui,
      filesFavorites: favorites.length ? favorites : legacyFavorites.slice(0, MAX_FAVORITES),
      filesRecents: recents.length ? recents : legacyRecents.slice(0, MAX_RECENTS)
    }
  });
  persistStateDebounced();
  if (legacyFavorites.length) clearLegacyPathList(LEGACY_FAVORITES_KEY);
  if (legacyRecents.length) clearLegacyPathList(LEGACY_RECENTS_KEY);
}

export function loadFilesFavorites(): string[] {
  return getUiPaths(get(data)).favorites;
}

export function loadFilesRecents(): string[] {
  return getUiPaths(get(data)).recents;
}

export function rememberFilesPath(path: string) {
  if (!path?.trim()) return;
  const trimmed = ensureAbsolutePath(path) || path.trim();
  updateUiPaths(({ favorites, recents }) => ({
    favorites,
    recents: [trimmed, ...recents.filter((item) => item !== trimmed)].slice(0, MAX_RECENTS)
  }));
}

export function toggleFilesFavorite(path: string): string[] {
  if (!path?.trim()) return loadFilesFavorites();
  const trimmed = ensureAbsolutePath(path) || path.trim();
  let nextFavorites: string[] = [];
  updateUiPaths(({ favorites, recents }) => {
    nextFavorites = favorites.includes(trimmed)
      ? favorites.filter((item) => item !== trimmed)
      : [trimmed, ...favorites].slice(0, MAX_FAVORITES);
    return { favorites: nextFavorites, recents };
  });
  return nextFavorites;
}

export function isFilesFavorite(path: string, favorites = loadFilesFavorites()) {
  const trimmed = ensureAbsolutePath(path) || path.trim();
  return favorites.includes(trimmed);
}

export async function getWellKnownFolders(): Promise<WellKnownFolder[]> {
  return tauriInvoke<WellKnownFolder[]>('get_well_known_folders');
}

export async function readDirectory(path: string, includeHidden = false): Promise<FileEntry[]> {
  const absolute = ensureAbsolutePath(path);
  if (!absolute) {
    throw new Error('Caminho inválido.');
  }
  const raw = await tauriInvoke<Record<string, unknown>[]>('read_directory', {
    path: absolute,
    includeHidden
  });
  return (Array.isArray(raw) ? raw : [])
    .map((item) => normalizeFileEntry(item))
    .filter((item): item is FileEntry => item !== null);
}

export async function openPath(path: string) {
  const absolute = ensureAbsolutePath(path);
  if (!absolute) {
    throw new Error('Caminho inválido.');
  }
  return tauriInvoke('open_file', { path: absolute });
}

export async function pickFolder(defaultPath: string | null = null) {
  return pickProjectDir(defaultPath);
}

export function filterEntries(entries: FileEntry[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((entry) => entry.name.toLowerCase().includes(q));
}

export function sortEntries(entries: FileEntry[], sortBy: FilesSort) {
  const dirs = entries.filter((entry) => entry.isDir);
  const files = entries.filter((entry) => !entry.isDir);

  const compare = (left: FileEntry, right: FileEntry) => {
    if (sortBy === 'size') {
      return (right.sizeBytes || 0) - (left.sizeBytes || 0);
    }
    if (sortBy === 'date') {
      return (right.modifiedAt || '').localeCompare(left.modifiedAt || '', 'pt-BR');
    }
    return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
  };

  dirs.sort(compare);
  files.sort(compare);
  return [...dirs, ...files];
}

export function toSidebarLabel(path: string) {
  return folderLabel(path) || path;
}
