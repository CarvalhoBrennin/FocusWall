<script>
  import { toast, dismissToast, setToastHover } from '../stores/ui-store.js';
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
          Desfazer
        </button>
      {/if}
      <button
        type="button"
        class="toast-close"
        aria-label="Fechar notificação"
        onclick={dismissToast}
      >
        ×
      </button>
    </div>
  {/if}
</div>
