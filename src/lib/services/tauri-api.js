import { invoke } from '@tauri-apps/api/core';

const ALLOWED_COMMANDS = Object.freeze({
  LOAD_STATE: 'load_state',
  SAVE_STATE: 'save_state',
  GET_APP_DATA_PATH: 'get_app_data_path',
  GET_LAUNCH_ON_STARTUP: 'get_launch_on_startup',
  SET_LAUNCH_ON_STARTUP: 'set_launch_on_startup',
  SYNC_LAUNCH_ON_STARTUP: 'sync_launch_on_startup',
  GET_AVAILABLE_MONITORS: 'get_available_monitors',
  GET_CURRENT_MONITOR: 'get_current_monitor',
  MOVE_TO_MONITOR: 'move_to_monitor',
  SAVE_MONITOR_PREFERENCE: 'save_monitor_preference'
});

const ALLOWED_COMMAND_SET = new Set(Object.values(ALLOWED_COMMANDS));

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function invokeCommand(command, payload) {
  if (!ALLOWED_COMMAND_SET.has(command)) {
    throw new Error(`Comando Tauri não permitido: ${command}`);
  }
  return invoke(command, payload);
}

export { ALLOWED_COMMANDS };
