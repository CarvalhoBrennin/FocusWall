<script>
  import { onDestroy } from 'svelte';
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

  // Crossfade por pré-carregamento.
  //
  // `frontSrc` é a imagem JÁ decodificada e visível; `prevSrc` é a anterior,
  // mantida numa camada de fundo durante a transição. Só promovemos a capa nova
  // quando ela termina de carregar (via `new Image()`), portanto a camada
  // visível nunca fica em branco — elimina o "piscar" ao trocar de faixa e ao
  // subir para a versão HD (que antes zerava a opacidade sobre o fundo escuro).
  let frontSrc = $state(null);
  let frontW = $state(0);
  let frontH = $state(0);
  let prevSrc = $state(null);
  let frontVisible = $state(false);

  let loadedSrc = '';
  /** @type {HTMLImageElement | null} */
  let preloader = null;
  let prevClearTimer = 0;

  const classification = $derived(classifyCover(frontW, frontH, containerSide));
  const isVideo = $derived(isVideoCover(frontW, frontH));
  const isHdLayout = $derived(Boolean(frontSrc) && classification.hd && !isVideo);
  const kenBurns = $derived(
    isPlaying && !reducedMotion && isHdLayout && frontVisible && !coverLoading
  );
  const showShimmer = $derived(
    coverLoading || coverUpgrading || (Boolean(coverSrc) && !frontSrc)
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
    const incoming = coverSrc;
    const width = coverWidth;
    const height = coverHeight;

    if (!incoming) {
      cancelPreload();
      loadedSrc = '';
      frontSrc = null;
      prevSrc = null;
      frontVisible = false;
      return;
    }

    if (incoming === loadedSrc) return;

    cancelPreload();
    const img = new Image();
    preloader = img;

    const promote = () => {
      if (preloader !== img) return;
      preloader = null;
      window.clearTimeout(prevClearTimer);
      // Mantém a capa anterior por baixo durante o crossfade.
      prevSrc = frontSrc;
      frontSrc = incoming;
      frontW = width || img.naturalWidth || 0;
      frontH = height || img.naturalHeight || 0;
      loadedSrc = incoming;
      frontVisible = false;
      // Próximo frame: dispara o fade-in por cima da camada anterior.
      requestAnimationFrame(() => {
        if (loadedSrc === incoming) frontVisible = true;
      });
      // Depois do crossfade, descarta a camada anterior para não vazar nas
      // bordas de capas "contain".
      prevClearTimer = window.setTimeout(() => {
        if (loadedSrc === incoming) prevSrc = null;
      }, 640);
      onCoverLoad();
    };

    img.decoding = 'async';
    img.onload = promote;
    img.onerror = () => {
      if (preloader !== img) return;
      preloader = null;
      // Não troca a imagem visível, mas libera o pipeline de settling do painel.
      onCoverLoad();
    };
    img.src = incoming;
    if (img.complete && img.naturalWidth > 0) promote();
  });

  function cancelPreload() {
    if (preloader) {
      preloader.onload = null;
      preloader.onerror = null;
      preloader = null;
    }
  }

  onDestroy(() => {
    cancelPreload();
    window.clearTimeout(prevClearTimer);
  });
</script>

<div
  bind:this={rootEl}
  class="media-art-cinematic"
  class:media-art-cinematic--hd={isHdLayout}
  class:media-art-cinematic--lowres={(Boolean(frontSrc) && !isHdLayout) || isVideo}
  class:media-art-cinematic--video={isVideo && Boolean(frontSrc)}
  class:media-art-cinematic--playing={kenBurns}
  class:media-art-cinematic--settling={showShimmer}
>
  <div class="media-art-cinematic-glow" aria-hidden="true"></div>

  {#if ghostCoverSrc}
    <div
      class="media-art-cinematic-ghost"
      style:background-image={`url(${JSON.stringify(ghostCoverSrc)})`}
      aria-hidden="true"
    ></div>
  {/if}

  {#if prevSrc}
    <div
      class="media-art-cinematic-prev"
      style:background-image={`url(${JSON.stringify(prevSrc)})`}
      aria-hidden="true"
    ></div>
  {/if}

  {#if frontSrc}
    {#if isHdLayout}
      <div
        class="media-art-cinematic-fill media-art-cinematic-fill--hd"
        class:media-art-cinematic-fill--visible={frontVisible}
        style:background-image={`url(${JSON.stringify(frontSrc)})`}
        aria-hidden="true"
      ></div>
      <img
        class="media-art-cinematic-image media-cover-reveal"
        class:media-cover-reveal--visible={frontVisible}
        src={frontSrc}
        alt="Capa de {title || 'faixa'}"
        decoding="async"
        draggable="false"
      />
    {:else}
      <div
        class="media-art-cinematic-fill"
        class:media-art-cinematic-fill--visible={frontVisible}
        style:background-image={`url(${JSON.stringify(frontSrc)})`}
        aria-hidden="true"
      ></div>
      <div class="media-art-cinematic-foreground">
        <img
          class="media-art-cinematic-image--contain media-cover-reveal"
          class:media-art-cinematic-image--video={isVideo}
          class:media-cover-reveal--visible={frontVisible}
          src={frontSrc}
          alt="Capa de {title || 'faixa'}"
          style:--cover-max-side={maxForegroundSide}
          decoding="async"
          draggable="false"
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
