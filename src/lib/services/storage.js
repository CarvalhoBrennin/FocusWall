import { CONFIG } from '../config.js';
import { createDefaultState, normalizeState } from '../utils/state.js';

import { ALLOWED_COMMANDS, invokeCommand, isTauriRuntime } from './tauri-api.js';

const isTauri = isTauriRuntime();

export const storage = isTauri
  ? {
      mode: 'tauri',
      loadState: () => invokeCommand(ALLOWED_COMMANDS.LOAD_STATE),
      saveState: (s) => invokeCommand(ALLOWED_COMMANDS.SAVE_STATE, { state: normalizeState(s) }),
      getAppDataPath: () => invokeCommand(ALLOWED_COMMANDS.GET_APP_DATA_PATH),
      getLaunchOnStartup: () => invokeCommand(ALLOWED_COMMANDS.GET_LAUNCH_ON_STARTUP),
      setLaunchOnStartup: (enabled) => invokeCommand(ALLOWED_COMMANDS.SET_LAUNCH_ON_STARTUP, { enabled }),
      syncLaunchOnStartup: () => invokeCommand(ALLOWED_COMMANDS.SYNC_LAUNCH_ON_STARTUP)
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
      syncLaunchOnStartup: () => Promise.resolve(false)
    };
