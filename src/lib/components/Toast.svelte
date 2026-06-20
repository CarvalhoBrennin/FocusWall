<script>
  import { toast, dismissToast, setToastHover } from '../stores/ui-store.js';
  import { t } from '../i18n/index.js';
</script>

<div class="toast-container" role="status" aria-live="polite">
  {#if $toast}
    <div
      class="toast"
      role="group"
      onmouseenter={() => setToastHover(true)}
      onmouseleave={() => setToastHover(false)}
    >
      <span class="toast-message">{$toast.message}</span>
      {#if $toast.undoCallback}
        <button
          type="button"
          class="toast-undo"
          onclick={() => $toast.undoCallback?.()}
        >
          {$t('toast.undo')}
        </button>
      {/if}
      <button
        type="button"
        class="toast-close"
        aria-label={$t('toast.dismiss')}
        onclick={dismissToast}
      >
        ×
      </button>
    </div>
  {/if}
</div>
