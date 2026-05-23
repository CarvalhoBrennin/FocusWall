import { CONFIG } from '../config.js';
import { tauriInvoke } from '../utils/tauri.js';
import { normalizePath } from '../utils/path.js';

const RECENTS_KEY = 'focuswall-opencode-recents';
const MAX_RECENTS = 8;

const INVALID_PATH_CHARS = /[\x00-\x1f"<>|&^%]/;

export function loadOpencodeRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberOpencodeDir(path) {
  if (!path) return;
  const trimmed = path.trim();
  if (!trimmed) return;

  const next = [trimmed, ...loadOpencodeRecents().filter((item) => item !== trimmed)].slice(
    0,
    MAX_RECENTS
  );
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

export async function searchProjectDirs(query = '', limit = 24) {
  return tauriInvoke('search_project_dirs', { query, limit });
}

export async function pickProjectDir(defaultPath = null) {
  const selected = await tauriInvoke('pick_project_directory', {
    defaultPath: defaultPath || null
  });

  return typeof selected === 'string' ? selected : null;
}

export function folderLabel(path) {
  if (!path) return '';
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function validateSpawnCwd(cwd) {
  if (!cwd || typeof cwd !== 'string') {
    throw new Error('Diretório de trabalho inválido.');
  }
  const trimmed = cwd.trim();
  if (!trimmed) {
    throw new Error('Diretório de trabalho inválido.');
  }
  if (INVALID_PATH_CHARS.test(trimmed)) {
    throw new Error('Caminho contém caracteres não permitidos.');
  }
  return normalizePath(trimmed).replace(/\//g, '\\');
}

/** @param {{ cols: number, rows: number, cwd: string }} options */
export async function spawnOpenCode({ cols, rows, cwd }) {
  const safeCwd = validateSpawnCwd(cwd);
  const { spawn } = await import('tauri-pty');

  return spawn('cmd.exe', ['/d', '/s', '/c', 'opencode'], {
    cols,
    rows,
    cwd: safeCwd
  });
}

export async function checkOpenCodeAvailable() {
  try {
    const { spawn } = await import('tauri-pty');
    const probe = spawn('cmd.exe', ['/d', '/s', '/c', 'where opencode'], { cols: 80, rows: 8 });
    return new Promise((resolve) => {
      let output = '';
      probe.onData((data) => {
        output += data;
      });
      probe.onExit(({ exitCode }) => {
        resolve(exitCode === 0 && output.trim().length > 0);
      });
    });
  } catch {
    return false;
  }
}
