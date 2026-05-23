import { writable, get } from 'svelte/store';
import type { ThemeId } from '../types/app.js';

export const theme = writable<ThemeId>('dark');

export const THEME_OPTIONS: { id: ThemeId; labelKey: 'theme.dark' | 'theme.light' | 'theme.olive' }[] = [
  { id: 'dark', labelKey: 'theme.dark' },
  { id: 'light', labelKey: 'theme.light' },
  { id: 'olive', labelKey: 'theme.olive' }
];

export function applyTheme(next: ThemeId) {
  theme.set(next);
  document.documentElement.dataset.theme = next;
}

export function initThemeFromState(saved?: ThemeId) {
  applyTheme(saved ?? get(theme));
}
