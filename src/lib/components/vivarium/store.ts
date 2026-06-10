import { writable } from 'svelte/store';
import type { HudSnapshot } from './core/types.js';
import { loadVivariumSeed } from './core/rng.js';

const HUD_VISIBLE_KEY = 'focuswall.vivarium.hudVisible';

function loadHudVisible(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const saved = localStorage.getItem(HUD_VISIBLE_KEY);
  if (saved === '0') return false;
  if (saved === '1') return true;
  return true;
}

export const vivariumSeed = writable(loadVivariumSeed());
export const vivariumHudVisible = writable(loadHudVisible());
export const vivariumSnapshot = writable<HudSnapshot>({
  flora: 0,
  fauna: 0,
  cycle: 'day',
  humidity: 0,
  event: 'idle',
  seed: '0000',
  dayPhase: 0.5
});
export const vivariumScreensaver = writable(false);

export function setVivariumHudVisible(visible: boolean): void {
  vivariumHudVisible.set(visible);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(HUD_VISIBLE_KEY, visible ? '1' : '0');
  }
}
