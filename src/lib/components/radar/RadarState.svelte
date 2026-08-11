<script lang="ts">
  let { title, body = '', actionLabel = '', onaction = () => {} } = $props<{
    title: string;
    body?: string;
    actionLabel?: string;
    onaction?: () => void;
  }>();
</script>

<div class="radar-state" aria-live="polite">
  <h3>{title}</h3>
  {#if body}<p>{body}</p>{/if}
  {#if actionLabel}<button type="button" class="radar-button" onclick={onaction}>{actionLabel}</button>{/if}
</div>
