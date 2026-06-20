import { invoke, isTauri as apiIsTauri } from '@tauri-apps/api/core';

/** @type {boolean | null} */
let cachedIsTauri = null;

/**
 * Detect Tauri runtime (cached after first call).
 * @returns {boolean}
 */
export function isTauri() {
  if (cachedIsTauri !== null) return cachedIsTauri;
  cachedIsTauri = apiIsTauri();
  return cachedIsTauri;
}

/** Re-check Tauri availability (e.g. after delayed API init). */
export function refreshTauriDetection() {
  cachedIsTauri = apiIsTauri();
  return cachedIsTauri;
}

/**
 * @template T
 * @param {string} cmd
 * @param {Record<string, unknown>} [args]
 * @returns {Promise<T>}
 */
export function tauriInvoke<T = unknown>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isTauri()) {
    return Promise.reject(new Error(`Comando Tauri indisponível: ${cmd}`));
  }
  return invoke<T>(cmd, args);
}
