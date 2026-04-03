import { derived } from 'svelte/store';
import { createFormatters } from '../config.js';
import { preferences } from './app-store.js';

export const activeLocale = derived(preferences, ($preferences) => $preferences.locale.code);
export const activeFormatters = derived(activeLocale, ($activeLocale) => createFormatters($activeLocale));
