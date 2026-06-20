<script>
  let { name = 'play', size = 20, filled = false } = $props();
</script>

{#if name === 'skipPrevious'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M6 6v12" />
    <path d="M18 6L10 12l8 6V6z" />
  </svg>
{:else if name === 'play'}
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    {#if filled}
      <path d="M8 6l12 6-12 6V6z" fill="currentColor" stroke="none" />
    {:else}
      <path d="M8 6l12 6-12 6V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" />
    {/if}
  </svg>
{:else if name === 'pause'}
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    {#if filled}
      <path d="M8 6h3v12H8V6zm5 0h3v12h-3V6z" fill="currentColor" stroke="none" />
    {:else}
      <path d="M8 6v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" />
      <path d="M16 6v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" />
    {/if}
  </svg>
{:else if name === 'skipNext'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M18 6v12" />
    <path d="M6 6l8 6-8 6V6z" />
  </svg>
{:else if name === 'note'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M9 18V5l10-2v13" />
    <path d="M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M16 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
  </svg>
{:else if name === 'monitor'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M4 5h16v11H4V5z" />
    <path d="M8 20h8" />
    <path d="M12 16v4" />
  </svg>
{/if}
