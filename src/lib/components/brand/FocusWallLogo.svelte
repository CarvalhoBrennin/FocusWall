<script>
  let {
    variant = 'dark',
    size = 'md',
    mode = 'wordmark',
    label = 'FocusWall'
  } = $props();

  const isLight = $derived(variant === 'light');
</script>

<div
  class="focuswall-logo focuswall-logo--{size} focuswall-logo--{mode}"
  class:is-light={isLight}
  role="img"
  aria-label={label}
>
  <div class="focuswall-logo__reticle">
    <span class="focus-reticle-corner focus-reticle-corner--tl" aria-hidden="true"></span>
    <span class="focus-reticle-corner focus-reticle-corner--tr" aria-hidden="true"></span>
    <span class="focus-reticle-corner focus-reticle-corner--bl" aria-hidden="true"></span>
    <span class="focus-reticle-corner focus-reticle-corner--br" aria-hidden="true"></span>

    {#if mode === 'mark'}
      <span class="focuswall-logo__mark" aria-hidden="true">F</span>
    {:else}
      <div class="focuswall-logo__wordmark" aria-hidden="true">
        <span class="focuswall-logo__focus">FOCUS</span>
        <span class="focuswall-logo__divider"></span>
        <span class="focuswall-logo__wall">WALL</span>
      </div>
    {/if}
  </div>
</div>
