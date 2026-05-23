import { writable, derived, get } from 'svelte/store';
import type { LocaleId } from '../types/app.js';
import { translate, LOCALE_OPTIONS, type MessageKey } from './messages.js';

export { LOCALE_OPTIONS };
export type { MessageKey };

export const locale = writable<LocaleId>('pt-BR');

export const t = derived(locale, ($locale) => {
  return (key: MessageKey) => translate($locale, key);
});

export function setLocale(next: LocaleId) {
  locale.set(next);
}

export function msg(key: MessageKey): string {
  return translate(get(locale), key);
}
