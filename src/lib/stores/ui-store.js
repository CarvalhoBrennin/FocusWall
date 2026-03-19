import { writable } from 'svelte/store';

export const toast = writable(/** @type {{ message: string; undoCallback?: () => void } | null} */ (null));
export const modal = writable(
  /** @type {{
   *   title: string;
   *   body: string;
   *   confirmLabel: string;
   *   confirmDanger: boolean;
   *   onConfirm: () => void;
   *   onCancel: () => void;
   * } | null} */
  null
);

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
