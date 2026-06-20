<script>
  import MediaArtHero from './MediaArtHero.svelte';
  import MediaStatusBadge from './MediaStatusBadge.svelte';
  import MediaEqualizer from './MediaEqualizer.svelte';
  import MediaMarquee from './MediaMarquee.svelte';
  import MediaProgress from './MediaProgress.svelte';
  import MediaControls from './MediaControls.svelte';
  import MediaTrackSkeleton from './MediaTrackSkeleton.svelte';

  let {
    snapshot,
    coverSrc = null,
    ghostCoverSrc = null,
    coverWidth = 0,
    coverHeight = 0,
    trackKey = 'empty',
    displayPositionMs = 0,
    displayPercent = 0,
    controlBusy = false,
    reducedMotion = false,
    skeleton = false,
    settlePhase = 'ready',
    coverLoading = false,
    coverUpgrading = false,
    onCoverLoad = () => {},
    onPrevious = () => {},
    onToggle = () => {},
    onNext = () => {}
  } = $props();

  const isReady = $derived(skeleton ? false : settlePhase === 'ready');
  const showInfoSkeleton = $derived(skeleton || !isReady);
  const showAlbumLine = $derived(Boolean(snapshot?.album?.trim()) || skeleton);
</script>

<div class="media-art-panel">
  <MediaArtHero
    {coverSrc}
    {ghostCoverSrc}
    appName={snapshot?.appName ?? ''}
    title={snapshot?.title ?? ''}
    {trackKey}
    {reducedMotion}
    isPlaying={snapshot?.isPlaying ?? false}
    {coverWidth}
    {coverHeight}
    {coverLoading}
    {coverUpgrading}
    {onCoverLoad}
  />
</div>

<div class="media-info-panel">
  <div class="media-info-panel-bg" aria-hidden="true"></div>
  <div class="media-info-mesh" aria-hidden="true"></div>
  <div class="media-info-scrim" aria-hidden="true"></div>

  <div
    class="media-info-content"
    class:media-info-content--masked={showInfoSkeleton}
    class:media-text-reveal={isReady && !reducedMotion}
  >
    {#if showInfoSkeleton}
      <div class="media-info-skeleton-overlay" aria-hidden="true">
        <MediaTrackSkeleton variant="info" {reducedMotion} showAlbum={showAlbumLine} />
      </div>
    {/if}

    <div class="media-info-content-live" class:media-info-content-live--hidden={showInfoSkeleton}>
      <div class="media-info-kicker-row">
        <p class="media-kicker">{snapshot?.appName ?? ''}</p>
        <MediaStatusBadge isPlaying={snapshot?.isPlaying ?? false} />
        {#if snapshot?.isPlaying}
          <MediaEqualizer active={!reducedMotion} />
        {/if}
      </div>

      <h2 class="media-title-display" aria-live={isReady ? 'polite' : 'off'}>
        {#if isReady}
          <MediaMarquee
            class="media-title-marquee"
            text={snapshot?.title ?? ''}
            {reducedMotion}
          />
        {:else}
          <span class="media-title-marquee media-title-marquee--placeholder">&nbsp;</span>
        {/if}
      </h2>

      <p class="media-artist">{snapshot?.artist ?? ''}</p>
      {#if snapshot?.album}
        <p class="media-album">{snapshot.album}</p>
      {/if}
    </div>
  </div>

  <div
    class="media-stage-transport"
    class:media-stage-transport--dimmed={showInfoSkeleton && !skeleton}
  >
    <MediaProgress
      positionMs={displayPositionMs}
      durationMs={snapshot?.durationMs ?? 0}
      percent={displayPercent}
      isPlaying={snapshot?.isPlaying ?? false}
    />
    <MediaControls
      isPlaying={snapshot?.isPlaying ?? false}
      canPlay={snapshot?.canPlay ?? false}
      canPause={snapshot?.canPause ?? false}
      canNext={snapshot?.canNext ?? false}
      canPrevious={snapshot?.canPrevious ?? false}
      busy={controlBusy}
      {onPrevious}
      {onToggle}
      {onNext}
    />
  </div>
</div>
