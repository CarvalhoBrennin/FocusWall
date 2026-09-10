import { writable } from 'svelte/store';
import { CONFIG } from '../config.js';
import { isPanelTabEnabled } from '../features.js';
import type { PanelTab } from '../types/app.js';

export const toast = writable(null);
export const modal = writable(null);
export type SettingsSection = 'appearance' | 'assistant' | 'media' | 'updates' | 'system' | 'startup' | 'data';

export const settingsModal = writable<{ section: SettingsSection } | null>(null);
export const panelTab = writable<PanelTab>('execution');
export const opencodeSessionActive = writable(false);
export const musicSettingsRevision = writable(0);

export function setPanelTab(tab: PanelTab) {
  if (!isPanelTabEnabled(tab)) {
    panelTab.set('execution');
    return;
  }
  panelTab.set(tab);
}

/** @param {boolean} active */
export function setOpencodeSessionActive(active) {
  opencodeSessionActive.set(active);
}

let toastTimeoutId: ReturnType<typeof setTimeout> | null = null;
let toastHovering = false;

function clearToastTimer() {
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
}

function scheduleToastDismiss() {
  clearToastTimer();
  if (toastHovering) return;
  toastTimeoutId = setTimeout(() => {
    toastTimeoutId = null;
    toast.set(null);
  }, CONFIG.TOAST_TIMEOUT_MS);
}

export function dismissToast() {
  clearToastTimer();
  toast.set(null);
}

export function showToast(message, undoCallback?) {
  clearToastTimer();
  toastHovering = false;
  toast.set({ message, undoCallback });
  scheduleToastDismiss();
}

export function setToastHover(hovering) {
  toastHovering = hovering;
  if (hovering) {
    clearToastTimer();
  } else {
    scheduleToastDismiss();
  }
}

export function showConfirmModal(options) {
  const {
    title = 'Confirmar',
    body = '',
    confirmLabel = 'Confirmar',
    confirmDanger = true,
    onConfirm = () => {},
    onCancel = () => {}
  } = options;

  modal.set({
    title,
    body,
    confirmLabel,
    confirmDanger,
    onConfirm: () => {
      modal.set(null);
      onConfirm();
    },
    onCancel: () => {
      modal.set(null);
      onCancel();
    }
  });
}

export function showSettingsModal(section: SettingsSection = 'appearance') {
  settingsModal.set({ section });
}

export function hideSettingsModal() {
  settingsModal.set(null);
}

export function notifyMusicSettingsChanged() {
  musicSettingsRevision.update((revision) => revision + 1);
}
