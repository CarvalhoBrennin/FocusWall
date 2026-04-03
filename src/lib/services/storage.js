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
      setLaunchOnStartup: (enabled) => tauriInvoke('set_launch_on_startup', { enabled }),
      syncLaunchOnStartup: () => tauriInvoke('sync_launch_on_startup'),
      setWindowLayer: (layer) => tauriInvoke('set_window_layer', { layer }),
      setCloseToTray: (enabled) => tauriInvoke('set_close_to_tray', { enabled }),
      setAutoHideOnBlur: (enabled) => tauriInvoke('set_auto_hide_on_blur', { enabled })
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
        } catch {}
        return Promise.resolve();
      },
      getAppDataPath: () => Promise.resolve(''),
      getLaunchOnStartup: () => Promise.resolve(false),
      setLaunchOnStartup: () => Promise.resolve(false),
      syncLaunchOnStartup: () => Promise.resolve(false),
      setWindowLayer: () => Promise.resolve(false),
      setCloseToTray: () => Promise.resolve(false),
      setAutoHideOnBlur: () => Promise.resolve(false)
    };
