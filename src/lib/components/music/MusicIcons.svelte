<script>
  let { name = 'play', size = 20, filled = false } = $props();
</script>

{#if name === 'play'}
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5.8 19 12 8 18.2Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" />
  </svg>
{:else if name === 'pause'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M8.5 6v12M15.5 6v12" />
  </svg>
{:else if name === 'previous'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" aria-hidden="true">
    <path d="M6 5v14M18.5 6.5 9 12l9.5 5.5Z" />
  </svg>
{:else if name === 'next'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" aria-hidden="true">
    <path d="M18 5v14M5.5 6.5 15 12l-9.5 5.5Z" />
  </svg>
{:else if name === 'shuffle'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M4 7h3.5c4.7 0 4.3 10 9 10H20" />
    <path d="m17 14 3 3-3 3" />
    <path d="M4 17h3.5c1.6 0 2.6-1.2 3.4-2.7" />
    <path d="M13.2 9.5C14 8.1 15 7 16.5 7H20" />
    <path d="m17 4 3 3-3 3" />
  </svg>
{:else if name === 'repeat'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M7 7h10l3 3-3 3" />
    <path d="M17 17H7l-3-3 3-3" />
  </svg>
{:else if name === 'volume'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true">
    <path d="M5 10h4l4-4v12l-4-4H5Z" />
    <path d="M16 9c1.2 1.6 1.2 4.4 0 6M19 6c2.4 3.3 2.4 8.7 0 12" />
  </svg>
{:else if name === 'muted'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true">
    <path d="M5 10h4l4-4v12l-4-4H5Z" />
    <path d="m17 9 4 6M21 9l-4 6" />
  </svg>
{:else if name === 'refresh'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M19 8V4l-3 3a7 7 0 1 0 1.9 7" />
  </svg>
{:else if name === 'search'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="5.5" />
    <path d="m15 15 4 4" />
  </svg>
{:else if name === 'settings'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
    <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
    <path d="M19.2 13.3v-2.6l-2-.6a7.3 7.3 0 0 0-.8-1.8l1-1.9-1.8-1.8-1.9 1a7.3 7.3 0 0 0-1.8-.8l-.6-2H8.7l-.6 2a7.3 7.3 0 0 0-1.8.8l-1.9-1-1.8 1.8 1 1.9a7.3 7.3 0 0 0-.8 1.8l-2 .6v2.6l2 .6a7.3 7.3 0 0 0 .8 1.8l-1 1.9 1.8 1.8 1.9-1a7.3 7.3 0 0 0 1.8.8l.6 2h2.6l.6-2a7.3 7.3 0 0 0 1.8-.8l1.9 1 1.8-1.8-1-1.9a7.3 7.3 0 0 0 .8-1.8Z" />
  </svg>
{:else if name === 'logout'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M10 5H5v14h5M13 8l4 4-4 4M17 12H9" />
  </svg>
{/if}
