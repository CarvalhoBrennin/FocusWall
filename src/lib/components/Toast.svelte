<script>
  import { toast } from '../stores/ui-store.js';
</script>

<div class="toast-container" role="status" aria-live="polite">
  {#if $toast}
    <div class="toast">
      <span class="toast-message">{$toast.message}</span>
      {#if $toast.undoCallback}
        <button
          type="button"
          class="toast-undo"
          on:click={() => $toast.undoCallback?.()}
        >
          Desfazer
        </button>
      {/if}
    </div>
  {/if}
</div>
