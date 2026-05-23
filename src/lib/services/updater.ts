import { isTauri } from '../utils/tauri.js';

/** Updater disabled until signing keys are configured (see docs/UPDATER.md). */
const UPDATER_ENABLED = false;

export async function checkForUpdates(): Promise<{ available: boolean; version?: string; error?: string }> {
  if (!UPDATER_ENABLED || !isTauri()) {
    return { available: false, error: 'disabled' };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update) {
      return { available: true, version: update.version };
    }
    return { available: false };
  } catch (err) {
    return { available: false, error: String((err as Error)?.message || err) };
  }
}

export async function installUpdate(): Promise<boolean> {
  if (!UPDATER_ENABLED || !isTauri()) return false;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return false;
    await update.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
    return true;
  } catch {
    return false;
  }
}
