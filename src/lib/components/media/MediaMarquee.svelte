<script>
  let { text = '', reducedMotion = false, class: className = '' } = $props();

  let containerEl = $state(null);
  let contentEl = $state(null);
  let overflow = $state(false);

  function measureOverflow() {
    const container = containerEl;
    const textEl = contentEl?.querySelector('.media-marquee-text');
    if (!container || !(textEl instanceof HTMLElement) || !text) {
      overflow = false;
      return;
    }

    const style = window.getComputedStyle(textEl);
    const probe = document.createElement('span');
    probe.textContent = text;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'nowrap';
    probe.style.fontFamily = style.fontFamily;
    probe.style.fontSize = style.fontSize;
    probe.style.fontWeight = style.fontWeight;
    probe.style.fontStyle = style.fontStyle;
    probe.style.letterSpacing = style.letterSpacing;
    document.body.appendChild(probe);
    overflow = probe.offsetWidth > container.clientWidth + 2;
    probe.remove();
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

<div
  class="media-marquee {className}"
  bind:this={containerEl}
  title={overflow && !reducedMotion ? text : undefined}
>
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
