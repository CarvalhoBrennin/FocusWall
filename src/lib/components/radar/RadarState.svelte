<script lang="ts">
  import RadarIcon from './RadarIcon.svelte';
  import type { RadarIconName } from './radar-icons.js';

  let {
    title,
    body = '',
    actionLabel = '',
    onaction = () => {},
    icon = null
  } = $props<{
    title: string;
    body?: string;
    actionLabel?: string;
    onaction?: () => void;
    icon?: RadarIconName | null;
  }>();
</script>

<div class="radar-state" aria-live="polite">
  {#if icon}
    <span class="radar-state-icon"><RadarIcon name={icon} size={22} /></span>
  {/if}
  <div class="radar-state-copy">
    <h3>{title}</h3>
    {#if body}<p>{body}</p>{/if}
  </div>
  {#if actionLabel}<button type="button" class="radar-button" onclick={onaction}>{actionLabel}</button>{/if}
</div>
