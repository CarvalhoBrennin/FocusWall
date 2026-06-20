import { tauriInvoke, isTauri } from '../utils/tauri.js';

const RECENTS_KEY = 'focuswall-opencode-recents';
const MAX_RECENTS = 8;

export type OpenCodeServerInfo = {
  baseUrl: string;
  cwd: string;
  version: string;
};

export type OpenCodeSessionInfo = {
  id?: string;
  sessionID?: string;
  title?: string | null;
  time?: {
    created?: number;
    updated?: number;
  };
};

export type OpenCodeMessageInfo = {
  id?: string;
  role?: 'user' | 'assistant' | 'system';
  time?: {
    created?: number;
    completed?: number | null;
  };
  error?: unknown;
};

export type OpenCodeMessagePart = {
  type?: 'text' | 'tool' | 'step-start' | 'step-finish';
  text?: string;
};

export type OpenCodeMessage = {
  info?: OpenCodeMessageInfo;
  parts?: OpenCodeMessagePart[];
};

export type OpenCodeDiffResult = {
  value?: string;
  diff?: string;
  data?: string;
};

export type OpenCodeFileStatusResult = {
  value?: { path: string; state: string }[];
  files?: { path: string; state: string }[];
  data?: { path: string; state: string }[];
};

type OpenCodeListEnvelope<T> = {
  data?: T[];
  value?: T[];
};

type ProjectDirEntry = {
  name: string;
  path: string;
  isGit: boolean;
};

export function loadOpencodeRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch (err) {
    console.warn('OpenCode: falha ao carregar recentes do localStorage', err);
    return [];
  }
}

export function rememberOpencodeDir(path: string): void {
  if (!path) return;
  const trimmed = path.trim();
  if (!trimmed) return;

  const next = [trimmed, ...loadOpencodeRecents().filter((item) => item !== trimmed)].slice(
    0,
    MAX_RECENTS
  );
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('OpenCode: falha ao salvar recentes no localStorage', err);
  }
}

export async function searchProjectDirs(
  query = '',
  limit = 24
): Promise<ProjectDirEntry[]> {
  return tauriInvoke<ProjectDirEntry[]>('search_project_dirs', { query, limit });
}

export async function pickProjectDir(
  defaultPath: string | null = null
): Promise<string | null> {
  const selected = await tauriInvoke<string | null>('pick_project_directory', {
    defaultPath: defaultPath || null
  });
  return typeof selected === 'string' ? selected : null;
}

export function folderLabel(path: string): string {
  if (!path) return '';
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

export async function resolveOpenCodeCommand(): Promise<{
  program: string;
  args: string[];
  resolvedPath: string;
}> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  return tauriInvoke('resolve_opencode_command');
}

export async function validateProjectDirectory(path: string): Promise<string> {
  if (!isTauri()) {
    throw new Error('Validacao de diretorio so esta disponivel no desktop (Tauri).');
  }
  return tauriInvoke('validate_project_directory', { path });
}

export async function startOpenCodeServer(path: string): Promise<OpenCodeServerInfo> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  return tauriInvoke<OpenCodeServerInfo>('start_opencode_server', { path });
}

export async function stopOpenCodeServer(): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await tauriInvoke('stop_opencode_server');
}

function unwrapList<T>(response: T[] | OpenCodeListEnvelope<T>): T[] {
  if (Array.isArray(response)) return response;
  if (response?.data) return response.data;
  if (response?.value) return response.value;
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    console.warn('OpenCode: formato de resposta inesperado (esperava data[] ou value[])', Object.keys(response));
  }
  return [];
}

export async function listOpenCodeSessions(path: string): Promise<OpenCodeSessionInfo[]> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  const response = await tauriInvoke<
    OpenCodeSessionInfo[] | OpenCodeListEnvelope<OpenCodeSessionInfo>
  >('list_opencode_sessions', { path });
  return unwrapList(response);
}

export async function createOpenCodeSession(
  path: string,
  title: string | null = null
): Promise<OpenCodeSessionInfo> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  return tauriInvoke<OpenCodeSessionInfo>('create_opencode_session', { path, title });
}

export async function getOpenCodeMessages(sessionId: string): Promise<OpenCodeMessage[]> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  const response = await tauriInvoke<OpenCodeMessage[] | OpenCodeListEnvelope<OpenCodeMessage>>(
    'get_opencode_messages',
    { sessionId }
  );
  return unwrapList(response);
}

export async function sendOpenCodePrompt(sessionId: string, text: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  await tauriInvoke('send_opencode_prompt', { sessionId, text });
}

export async function abortOpenCodeSession(sessionId: string): Promise<unknown> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  return tauriInvoke('abort_opencode_session', { sessionId });
}

export async function getOpenCodeSessionStatus(): Promise<Record<string, unknown>> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  return tauriInvoke<Record<string, unknown>>('get_opencode_session_status');
}

export async function getOpenCodeDiff(
  sessionId: string,
  messageId: string | null = null
): Promise<OpenCodeDiffResult> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  return tauriInvoke<OpenCodeDiffResult>('get_opencode_diff', { sessionId, messageId });
}

export async function getOpenCodeFileStatus(path: string): Promise<OpenCodeFileStatusResult> {
  if (!isTauri()) {
    throw new Error('OpenCode so esta disponivel no desktop (Tauri).');
  }
  return tauriInvoke<OpenCodeFileStatusResult>('get_opencode_file_status', { path });
}

/** @deprecated Use resolveOpenCodeCommand() for explicit CLI detection. */
export async function checkOpenCodeAvailable(): Promise<boolean> {
  try {
    await resolveOpenCodeCommand();
    return true;
  } catch {
    return false;
  }
}
