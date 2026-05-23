import { CONFIG } from '../config.js';
import { createDefaultState, normalizeState } from '../utils/state.js';
import { isTauri, tauriInvoke, refreshTauriDetection } from '../utils/tauri.js';

function createBrowserStorage() {
  return {
    mode: 'browser',
    loadState: () => {
      try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        return Promise.resolve(raw ? JSON.parse(raw) : createDefaultState());
      } catch {
        return Promise.resolve(createDefaultState());
      }
    },
    saveState: (s) => {
      try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(normalizeState(s)));
      } catch (err) {
        if (err?.name === 'QuotaExceededError') {
          console.warn('[storage] QuotaExceededError — dados não salvos no navegador.');
          return Promise.reject(new Error('Armazenamento local cheio. Libere espaço ou use o app desktop.'));
        }
        console.warn('[storage] Falha ao salvar:', err);
        return Promise.reject(err);
      }
      return Promise.resolve();
    },
    getAppDataPath: () => Promise.resolve(''),
    getLaunchOnStartup: () => Promise.resolve(false),
    setLaunchOnStartup: () => Promise.resolve(false),
    syncLaunchOnStartup: () => Promise.resolve(false)
  };
}

function createTauriStorage() {
  return {
    mode: 'tauri',
    loadState: () => tauriInvoke('load_state'),
    saveState: (s) => tauriInvoke('save_state', { state: normalizeState(s) }),
    getAppDataPath: () => tauriInvoke<string>('get_app_data_path'),
    getLaunchOnStartup: () => tauriInvoke('get_launch_on_startup'),
    setLaunchOnStartup: (enabled) => tauriInvoke('set_launch_on_startup', { enabled }),
    syncLaunchOnStartup: () => tauriInvoke('sync_launch_on_startup')
  };
}

function resolveStorage() {
  refreshTauriDetection();
  if (isTauri()) return createTauriStorage();
  return createBrowserStorage();
}

export const storage = resolveStorage();

if (typeof window !== 'undefined' && storage.mode === 'browser') {
  requestAnimationFrame(() => {
    if (refreshTauriDetection()) {
      Object.assign(storage, createTauriStorage());
    }
  });
}
