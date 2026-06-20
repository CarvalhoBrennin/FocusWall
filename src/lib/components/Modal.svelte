<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { modal } from '../stores/ui-store.js';
  import { trapFocus } from '../utils/focus-trap.js';
  import { t } from '../i18n/index.js';

  let overlayEl = $state(null);
  let confirmButtonEl = $state(null);

  function closeModal() {
    const m = get(modal);
    m?.onCancel?.();
    modal.set(null);
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget && $modal) {
      closeModal();
    }
  }

  onMount(() => {
    return () => {};
  });

  $effect(() => {
    if (!$modal || !overlayEl) return;

    return trapFocus(overlayEl, {
      initialFocus: confirmButtonEl,
      onEscape: closeModal
    });
  });
</script>

{#if $modal}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_click_events_have_key_events -->
  <div
    bind:this={overlayEl}
    class="modal-overlay is-open"
    aria-hidden="false"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
    onclick={handleOverlayClick}
  >
    <div class="modal">
      <h2 id="modal-title" class="modal-title">{$modal.title}</h2>
      <p class="modal-body">{$modal.body}</p>
      <div class="modal-actions">
        <button
          type="button"
          class="ghost-button modal-cancel"
          onclick={closeModal}
        >
          {$t('modal.cancel')}
        </button>
        <button
          bind:this={confirmButtonEl}
          type="button"
          class="primary-button modal-confirm"
          class:danger-button={$modal.confirmDanger}
          onclick={() => $modal.onConfirm?.()}
        >
          {$modal.confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
