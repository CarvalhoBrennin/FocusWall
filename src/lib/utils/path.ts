/** Windows-aware path helpers for the Files panel. */

export function normalizePath(path) {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (raw.startsWith('\\\\')) {
    return raw.replace(/\//g, '\\').replace(/\\+$/, '');
  }
  return raw.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

/** Garante formato absoluto no Windows antes de chamar comandos Tauri (ex.: C: → C:\\). */
export function ensureAbsolutePath(path) {
  const trimmed = String(path || '').trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('\\\\')) {
    return trimmed.replace(/\//g, '\\');
  }

  if (/^[A-Za-z]:$/i.test(trimmed)) {
    return `${trimmed.slice(0, 2)}\\`;
  }

  const normalized = normalizePath(trimmed);
  if (/^[A-Za-z]:$/i.test(normalized)) {
    return `${normalized}\\`;
  }

  if (/^[A-Za-z]:\//i.test(normalized)) {
    return toWindowsPath(normalized);
  }

  return toWindowsPath(trimmed);
}

export function toWindowsPath(path) {
  return normalizePath(path).replace(/\//g, '\\');
}

/** Compara caminhos absolutos (case-insensitive no Windows). */
export function pathsEqual(left, right) {
  const a = ensureAbsolutePath(left);
  const b = ensureAbsolutePath(right);
  if (!a || !b) return a === b;
  return a.toLowerCase() === b.toLowerCase();
}

export function splitPathParts(path) {
  const normalized = normalizePath(path);
  if (!normalized) return [];
  if (normalized.startsWith('\\\\')) {
    return normalized.slice(2).split(/\\+/).filter(Boolean);
  }
  return normalized.split('/').filter(Boolean);
}

export function buildPathSegments(fullPath) {
  const absolute = ensureAbsolutePath(fullPath);
  const parts = splitPathParts(absolute);
  if (parts.length === 0) return [];

  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    let segPath;
    if (/^[A-Za-z]:$/.test(parts[0])) {
      segPath = `${parts[0]}\\${parts.slice(1, i + 1).join('\\')}`;
      if (i === 0) {
        segPath = `${parts[0]}\\`;
      }
    } else if (absolute.startsWith('\\\\')) {
      segPath = `\\\\${parts.slice(0, i + 1).join('\\')}`;
    } else {
      segPath = parts.slice(0, i + 1).join('\\');
    }
    segPath = ensureAbsolutePath(segPath) || segPath;

    const name = parts[i].endsWith(':') ? parts[i].slice(0, -1) : parts[i];
    segments.push({
      name,
      path: segPath,
      isLast: i === parts.length - 1
    });
  }

  return segments;
}

export function parentDirectory(fullPath) {
  const absolute = ensureAbsolutePath(fullPath);
  const parts = splitPathParts(absolute);
  if (parts.length === 0) return null;

  if (/^[A-Za-z]:$/i.test(parts[0]) && parts.length === 1) {
    return null;
  }

  if (parts.length === 2 && /^[A-Za-z]:$/i.test(parts[0])) {
    return `${parts[0]}\\`;
  }

  const parentParts = parts.slice(0, -1);
  if (/^[A-Za-z]:$/i.test(parentParts[0])) {
    return ensureAbsolutePath(`${parentParts[0]}\\${parentParts.slice(1).join('\\')}`);
  }

  if (absolute.startsWith('\\\\')) {
    if (parts.length <= 2) return null;
    return `\\\\${parentParts.join('\\')}`;
  }

  return ensureAbsolutePath(parentParts.join('\\'));
}
