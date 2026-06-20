import { writable } from 'svelte/store';
import { CONFIG } from '../config.js';
import { VIVARIUM_ENABLED } from '../features.js';

export const toast = writable(null);
export const modal = writable(null);
export const settingsModal = writable(null);
export const panelTab = writable('execution');
export const opencodeSessionActive = writable(false);

/** @param {'execution' | 'opencode' | 'calendar' | 'files' | 'system' | 'media' | 'vivarium'} tab */
export function setPanelTab(tab) {
  if (tab === 'vivarium' && !VIVARIUM_ENABLED) {
    panelTab.set('execution');
    return;
  }
  if (
    tab === 'execution' ||
    tab === 'opencode' ||
    tab === 'calendar' ||
    tab === 'files' ||
    tab === 'system' ||
    tab === 'media' ||
    (tab === 'vivarium' && VIVARIUM_ENABLED)
  ) {
    panelTab.set(tab);
  }
}

/** @param {boolean} active */
export function setOpencodeSessionActive(active) {
  opencodeSessionActive.set(active);
}

let toastTimeoutId = null;
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

export function showToast(message, undoCallback) {
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

export function showSettingsModal() {
  settingsModal.set(true);
}

export function hideSettingsModal() {
  settingsModal.set(null);
}
