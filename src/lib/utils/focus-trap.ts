const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type FocusTrapOptions = {
  onEscape?: () => void;
  initialFocus?: HTMLElement | null;
};

export function trapFocus(container: HTMLElement, options: FocusTrapOptions = {}) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  function getFocusable() {
    return [...container.querySelectorAll(FOCUSABLE)].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null
    );
  }

  function focusFirst() {
    const focusable = getFocusable();
    const target =
      options.initialFocus && focusable.includes(options.initialFocus)
        ? options.initialFocus
        : focusable[0];
    target?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      options.onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = getFocusable();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!(active instanceof HTMLElement) || !focusable.includes(active)) {
      e.preventDefault();
      first.focus();
      return;
    }

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  requestAnimationFrame(() => focusFirst());
  container.addEventListener('keydown', handleKeydown);

  return () => {
    container.removeEventListener('keydown', handleKeydown);
    previousFocus?.focus();
  };
}
