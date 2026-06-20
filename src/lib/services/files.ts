import { tauriInvoke } from '../utils/tauri.js';
import { ensureAbsolutePath } from '../utils/path.js';
import { pickProjectDir, folderLabel } from './opencode.js';

const FAVORITES_KEY = 'focuswall-files-favorites';
const RECENTS_KEY = 'focuswall-files-recents';
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

function readPathList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writePathList(key: string, paths: string[]) {
  localStorage.setItem(key, JSON.stringify(paths));
}

export function loadFilesFavorites(): string[] {
  return readPathList(FAVORITES_KEY);
}

export function loadFilesRecents(): string[] {
  return readPathList(RECENTS_KEY);
}

export function rememberFilesPath(path: string) {
  if (!path?.trim()) return;
  const trimmed = ensureAbsolutePath(path) || path.trim();
  const next = [trimmed, ...loadFilesRecents().filter((item) => item !== trimmed)].slice(
    0,
    MAX_RECENTS
  );
  writePathList(RECENTS_KEY, next);
}

export function toggleFilesFavorite(path: string): string[] {
  if (!path?.trim()) return loadFilesFavorites();
  const trimmed = ensureAbsolutePath(path) || path.trim();
  const current = loadFilesFavorites();
  const next = current.includes(trimmed)
    ? current.filter((item) => item !== trimmed)
    : [trimmed, ...current].slice(0, MAX_FAVORITES);
  writePathList(FAVORITES_KEY, next);
  return next;
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
