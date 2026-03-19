import { CONFIG } from '../config.js';
import { createDefaultState, normalizeState } from '../utils/state.js';

const isTauri = typeof window !== 'undefined' && window.__TAURI__?.core != null;
const tauriInvoke = isTauri ? window.__TAURI__.core.invoke.bind(window.__TAURI__.core) : null;

export const storage = isTauri && tauriInvoke
  ? {
      mode: 'tauri',
      loadState: () => tauriInvoke('load_state'),
      saveState: (s) => tauriInvoke('save_state', { state: normalizeState(s) }),
      getAppDataPath: () => tauriInvoke('get_app_data_path'),
      getLaunchOnStartup: () => tauriInvoke('get_launch_on_startup'),
      setLaunchOnStartup: (enabled) => tauriInvoke('set_launch_on_startup', { enabled })
    }
  : {
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
        } catch {
          /* preview only */
        }
        return Promise.resolve();
      },
      getAppDataPath: () => Promise.resolve(''),
      getLaunchOnStartup: () => Promise.resolve(false),
      setLaunchOnStartup: () => Promise.resolve(false)
    };
