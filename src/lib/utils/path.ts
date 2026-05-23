/** Windows-aware path helpers for the Files panel. */

export function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

export function toWindowsPath(path) {
  return normalizePath(path).replace(/\//g, '\\');
}

export function splitPathParts(path) {
  const normalized = normalizePath(path);
  if (!normalized) return [];
  return normalized.split('/').filter(Boolean);
}

export function buildPathSegments(fullPath) {
  const parts = splitPathParts(fullPath);
  if (parts.length === 0) return [];

  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    let segPath;
    if (i === 0 && /^[A-Za-z]:$/.test(parts[0])) {
      segPath = `${parts[0]}\\`;
    } else if (/^[A-Za-z]:$/.test(parts[0])) {
      segPath = `${parts[0]}\\${parts.slice(1, i + 1).join('\\')}`;
    } else {
      segPath = parts.slice(0, i + 1).join('\\');
    }

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
  const parts = splitPathParts(fullPath);
  if (parts.length <= 1) return null;

  if (parts.length === 2 && /^[A-Za-z]:$/.test(parts[0])) {
    return `${parts[0]}\\`;
  }

  const parentParts = parts.slice(0, -1);
  if (/^[A-Za-z]:$/.test(parentParts[0])) {
    return `${parentParts[0]}\\${parentParts.slice(1).join('\\')}`;
  }

  return parentParts.join('\\');
}
