<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { modal } from '../stores/ui-store.js';

  function handleEscape(e) {
    if (e.key === 'Escape') {
      const m = get(modal);
      if (m) {
        e.preventDefault();
        m.onCancel?.();
        modal.set(null);
      }
    }
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget && $modal) {
      $modal.onCancel?.();
      modal.set(null);
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  });
</script>

{#if $modal}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_click_events_have_key_events -->
  <div
    class="modal-overlay is-open"
    aria-hidden="false"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
    on:click={handleOverlayClick}
  >
    <div class="modal">
      <h2 id="modal-title" class="modal-title">{$modal.title}</h2>
      <p class="modal-body">{$modal.body}</p>
      <div class="modal-actions">
        <button
          type="button"
          class="ghost-button modal-cancel"
          on:click={() => $modal.onCancel?.()}
        >
          Cancelar
        </button>
        <button
          type="button"
          class="primary-button modal-confirm"
          class:danger-button={$modal.confirmDanger}
          on:click={() => $modal.onConfirm?.()}
        >
          {$modal.confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
