<script>
  /** @type {'art' | 'info' | 'full' | 'overlay'} */
  let {
    variant = 'full',
    reducedMotion = false,
    showAlbum = true,
    class: className = ''
  } = $props();
</script>

{#if variant === 'art' || variant === 'full' || variant === 'overlay'}
  <div
    class="media-skeleton-art {className}"
    class:media-skeleton-art--overlay={variant === 'overlay'}
    class:media-skeleton--static={reducedMotion}
    aria-hidden="true"
  ></div>
{/if}

{#if variant === 'info' || variant === 'full'}
  <div
    class="media-skeleton-lines {className}"
    class:media-skeleton--static={reducedMotion}
    aria-hidden="true"
  >
    <span class="media-skeleton-line media-skeleton-line--kicker"></span>
    <span class="media-skeleton-line media-skeleton-line--title"></span>
    <span class="media-skeleton-line media-skeleton-line--artist"></span>
    {#if showAlbum}
      <span class="media-skeleton-line media-skeleton-line--album"></span>
    {/if}
  </div>
{/if}
