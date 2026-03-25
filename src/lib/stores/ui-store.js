import { writable } from 'svelte/store';

export const toast = writable(null);
export const modal = writable(null);
export const settingsModal = writable(null);

let toastTimeoutId = null;

export function showToast(message, undoCallback) {
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
  toast.set({ message, undoCallback });
  toastTimeoutId = setTimeout(() => {
    toastTimeoutId = null;
    toast.set(null);
  }, 4000);
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
