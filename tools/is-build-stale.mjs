/**
 * Exit 0 = release build is up to date; exit 1 = rebuild needed.
 * Used by abrir-dashboard.bat to skip tauri:build when sources are unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseExe = path.join(root, 'src-tauri', 'target', 'release', 'focus-desktop-dashboard.exe');
const distIndex = path.join(root, 'dist', 'index.html');

const frontendRoots = [
  path.join(root, 'src'),
  path.join(root, 'index.html'),
  path.join(root, 'vite.config.js'),
  path.join(root, 'svelte.config.js'),
  path.join(root, 'tsconfig.json'),
  path.join(root, 'package.json'),
  path.join(root, 'package-lock.json'),
];

const backendRoots = [
  path.join(root, 'src-tauri', 'src'),
  path.join(root, 'src-tauri', 'Cargo.toml'),
  path.join(root, 'src-tauri', 'Cargo.lock'),
  path.join(root, 'src-tauri', 'tauri.conf.json'),
  path.join(root, 'src-tauri', 'capabilities'),
  path.join(root, 'src-tauri', 'icons'),
  path.join(root, 'src-tauri', 'build.rs'),
];

const IGNORE = new Set(['.git', 'node_modules', 'target', 'dist', '.svelte-kit']);

function mtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function newestMtime(paths) {
  let newest = 0;
  const queue = [...paths];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;

    let stat;
    try {
      stat = fs.statSync(current);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const base = path.basename(current);
      if (IGNORE.has(base)) continue;

      let entries;
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        queue.push(path.join(current, entry.name));
      }
      continue;
    }

    if (stat.isFile() && stat.mtimeMs > newest) {
      newest = stat.mtimeMs;
    }
  }

  return newest;
}

function isStale(roots, artifactPath) {
  const artifactTime = mtime(artifactPath);
  if (artifactTime === null) return true;

  const sourceTime = newestMtime(roots);
  return sourceTime > artifactTime;
}

if (!fs.existsSync(releaseExe) || !fs.existsSync(distIndex)) {
  process.exit(1);
}

const feStale = isStale(frontendRoots, distIndex);
const beStale = isStale(backendRoots, releaseExe);

process.exit(feStale || beStale ? 1 : 0);
