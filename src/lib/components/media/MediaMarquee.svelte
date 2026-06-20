<script>
  let { text = '', reducedMotion = false, class: className = '' } = $props();

  let containerEl = $state(null);
  let contentEl = $state(null);
  let overflow = $state(false);

  function measureOverflow() {
    const container = containerEl;
    const content = contentEl;
    if (!container || !content) return;
    overflow = content.scrollWidth > container.clientWidth + 2;
  }

  $effect(() => {
    text;
    reducedMotion;
    const container = containerEl;
    const content = contentEl;
    if (!container || !content) return;

    measureOverflow();
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  });
</script>

<div class="media-marquee {className}" bind:this={containerEl}>
  <div
    class="media-marquee-track"
    class:media-marquee-track--scroll={overflow && !reducedMotion}
    bind:this={contentEl}
  >
    <span class="media-marquee-text">{text}</span>
    {#if overflow && !reducedMotion}
      <span class="media-marquee-text media-marquee-text--clone" aria-hidden="true">{text}</span>
    {/if}
  </div>
</div>
