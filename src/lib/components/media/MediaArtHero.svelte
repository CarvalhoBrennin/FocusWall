<script>
  import MediaIcons from './icons/MediaIcons.svelte';
  import MediaTrackSkeleton from './MediaTrackSkeleton.svelte';
  import { classifyCover, isVideoCover } from '../../utils/cover-art.js';

  let {
    coverSrc = null,
    ghostCoverSrc = null,
    appName = '',
    title = '',
    trackKey = 'empty',
    reducedMotion = false,
    isPlaying = false,
    coverWidth = 0,
    coverHeight = 0,
    coverLoading = false,
    coverUpgrading = false,
    onCoverLoad = () => {}
  } = $props();

  let rootEl = $state(null);
  let containerSide = $state(480);
  let imageLoaded = $state(false);
  let loadedSrc = $state(null);
  let coverImgEl = $state(null);

  const classification = $derived(classifyCover(coverWidth, coverHeight, containerSide));
  const isVideo = $derived(isVideoCover(coverWidth, coverHeight));
  const isHdLayout = $derived(Boolean(coverSrc) && classification.hd && !isVideo);
  const kenBurns = $derived(
    isPlaying && !reducedMotion && isHdLayout && imageLoaded && !coverLoading
  );
  const showShimmer = $derived(
    coverLoading || coverUpgrading || (Boolean(coverSrc) && !imageLoaded)
  );
  const maxForegroundSide = $derived(
    isVideo
      ? `${Math.round(containerSide * 0.96)}px`
      : `${Math.round(classification.maxForegroundSide)}px`
  );

  $effect(() => {
    const node = rootEl;
    if (!node) return;

    const measure = () => {
      containerSide = Math.max(node.clientWidth, node.clientHeight, 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });

  $effect(() => {
    coverSrc;
    coverImgEl;
    if (coverSrc !== loadedSrc) {
      imageLoaded = false;
    }
    const node = coverImgEl;
    if (node?.complete && node.naturalWidth > 0 && coverSrc) {
      handleImageLoad(coverSrc);
    }
  });

  function handleImageLoad(src) {
    if (!src || loadedSrc === src) return;
    loadedSrc = src;
    imageLoaded = true;
    onCoverLoad();
  }
</script>

<div
  bind:this={rootEl}
  class="media-art-cinematic"
  class:media-art-cinematic--hd={isHdLayout && imageLoaded}
  class:media-art-cinematic--lowres={(!isHdLayout && coverSrc && imageLoaded) || isVideo}
  class:media-art-cinematic--video={isVideo && coverSrc && imageLoaded}
  class:media-art-cinematic--playing={kenBurns}
  class:media-art-cinematic--settling={showShimmer}
>
  <div class="media-art-cinematic-glow" aria-hidden="true"></div>

  {#if ghostCoverSrc}
    <div
      class="media-art-cinematic-ghost"
      style:background-image={`url("${ghostCoverSrc}")`}
      aria-hidden="true"
    ></div>
  {/if}

  {#if coverSrc}
    {#if isHdLayout}
      <div
        class="media-art-cinematic-fill media-art-cinematic-fill--hd"
        class:media-art-cinematic-fill--visible={imageLoaded}
        style:background-image={`url("${coverSrc}")`}
        aria-hidden="true"
      ></div>
      <img
        bind:this={coverImgEl}
        class="media-art-cinematic-image media-cover-reveal"
        class:media-cover-reveal--visible={imageLoaded}
        src={coverSrc}
        alt="Capa de {title || 'faixa'}"
        decoding="async"
        fetchpriority="high"
        draggable="false"
        onload={() => handleImageLoad(coverSrc)}
      />
    {:else}
      <div
        class="media-art-cinematic-fill"
        class:media-art-cinematic-fill--visible={imageLoaded}
        style:background-image={`url("${coverSrc}")`}
        aria-hidden="true"
      ></div>
      <div class="media-art-cinematic-foreground">
        <img
          bind:this={coverImgEl}
          class="media-art-cinematic-image--contain media-cover-reveal"
          class:media-art-cinematic-image--video={isVideo}
          class:media-cover-reveal--visible={imageLoaded}
          src={coverSrc}
          alt="Capa de {title || 'faixa'}"
          style:--cover-max-side={maxForegroundSide}
          decoding="async"
          fetchpriority="high"
          draggable="false"
          onload={() => handleImageLoad(coverSrc)}
        />
      </div>
    {/if}
  {:else if !ghostCoverSrc && !coverLoading}
    <div class="media-art-cinematic-placeholder" aria-hidden="true">
      <MediaIcons name="note" size={56} />
      <span class="media-art-cinematic-placeholder-label">{appName || 'Sem capa'}</span>
    </div>
  {/if}

  {#if showShimmer}
    <MediaTrackSkeleton variant="overlay" {reducedMotion} />
    <div class="media-art-cinematic-shimmer" class:media-skeleton--static={reducedMotion} aria-hidden="true"></div>
  {/if}

  <div class="media-art-cinematic-scrim" aria-hidden="true"></div>
  <div class="media-art-cinematic-vignette" aria-hidden="true"></div>
</div>
