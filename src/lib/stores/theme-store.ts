import { writable, get } from 'svelte/store';
import type { ThemeId } from '../types/app.js';

export const theme = writable<ThemeId>('dark');

export const THEME_OPTIONS: { id: ThemeId; labelKey: 'theme.dark' | 'theme.light' | 'theme.olive' }[] = [
  { id: 'dark', labelKey: 'theme.dark' },
  { id: 'light', labelKey: 'theme.light' },
  { id: 'olive', labelKey: 'theme.olive' }
];

function isThemeId(value: unknown): value is ThemeId {
  return value === 'dark' || value === 'light' || value === 'olive';
}

export function applyTheme(next: ThemeId) {
  const resolved = isThemeId(next) ? next : 'dark';
  theme.set(resolved);

  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved === 'light' ? 'light' : 'dark';

  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = resolved === 'light' ? 'light dark' : 'dark light';
  }
}

export function initThemeFromState(saved?: ThemeId) {
  applyTheme(saved ?? get(theme));
}
