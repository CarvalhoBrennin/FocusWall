<script>
  let {
    size = 52,
    variant = 'dark',
    letter = 'F',
    label = 'FocusWall'
  } = $props();

  const isLight = $derived(variant === 'light');
  const dimension = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<div
  class="focus-reticle-mark"
  class:is-light={isLight}
  style:width={dimension}
  style:height={dimension}
  style:--mark-size={dimension}
  role="img"
  aria-label={label}
>
  <span class="focus-reticle-corner focus-reticle-corner--tl" aria-hidden="true"></span>
  <span class="focus-reticle-corner focus-reticle-corner--tr" aria-hidden="true"></span>
  <span class="focus-reticle-corner focus-reticle-corner--bl" aria-hidden="true"></span>
  <span class="focus-reticle-corner focus-reticle-corner--br" aria-hidden="true"></span>
  {#if letter}
    <span class="focus-reticle-letter" aria-hidden="true">{letter}</span>
  {/if}
</div>
