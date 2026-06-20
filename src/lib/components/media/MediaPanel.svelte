<script>
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { paused } from '../../stores/app-store.js';
  import { isTauri } from '../../utils/tauri.js';
  import {
    fetchMediaArtwork,
    fetchMediaSnapshot,
    interpolateMediaPosition,
    mediaCoverSrc,
    mediaProgressPercent,
    skipMediaNext,
    skipMediaPrevious,
    startMediaSessionPolling,
    stopMediaSessionPolling,
    toggleMediaPlayback
  } from '../../services/media-session.js';
  import {
    mediaTrackKey,
    resetAlbumPalette,
    cancelAlbumPaletteSchedule,
    scheduleAlbumPalette
  } from '../../utils/album-palette.js';
  import {
    artworkToResolvedCover,
    clearCoverArtCache,
    rememberResolvedCover
  } from '../../utils/cover-art.js';
  import MediaNowPlaying from './MediaNowPlaying.svelte';
  import MediaEmptyState from './MediaEmptyState.svelte';
  import './media.css';

  const SETTLE_MIN_MS = 180;
  const SETTLE_MAX_MS = 4000;

  const BOOT_SNAPSHOT = {
    available: true,
    source: 'smtc',
    title: '',
    artist: '',
    album: '',
    appName: '',
    sourceAppId: '',
    isPlaying: false,
    canPlay: false,
    canPause: false,
    canNext: false,
    canPrevious: false,
    positionMs: 0,
    durationMs: 0
  };

  let { active = false } = $props();

  let snapshot = $state(null);
  let loading = $state(true);
  let errorMsg = $state(null);
  let controlBusy = $state(false);
  let syncedAt = $state(0);
  let displayPositionMs = $state(0);
  let tickRaf = 0;
  let sceneEl = $state(null);
  let reducedMotion = $state(false);
  let paletteInk = $state('light');
  let displayCoverSrc = $state(null);
  let displayCoverWidth = $state(0);
  let displayCoverHeight = $state(0);
  let coverResolveId = 0;
  let coverDebounceTimer = 0;
  let lastArtworkFetchKey = '';
  let lastCoverFingerprint = '';
  let lastDisplayTrackKey = '';

  let artworkFetchInFlight = $state(false);
  let coverImageReady = $state(false);
  let settledTrackKey = $state('');
  let ghostCoverSrc = $state(null);
  /** @type {'boot' | 'meta' | 'cover' | 'ready'} */
  let settlePhase = $state('boot');
  let settleStartedAt = 0;
  let settleTimeoutId = 0;
  let settleMinTimeoutId = 0;
  let pendingReveal = $state(false);

  let confirmedTrackKey = $state('');
  let rawKeyPrev = '';
  let rawKeyStreak = 0;

  const smtcCoverSrc = $derived(mediaCoverSrc(snapshot));
  const displayPercent = $derived(
    mediaProgressPercent(displayPositionMs, snapshot?.durationMs ?? 0)
  );
  const trackKey = $derived(mediaTrackKey(snapshot));
  const coverFingerprint = $derived(
    `${trackKey}|${snapshot?.coverArtWidth ?? 0}|${snapshot?.coverArtHeight ?? 0}`
  );
  const stateKind = $derived.by(() => {
    if (errorMsg && !snapshot) return 'error';
    if (loading && !snapshot) return 'loading';
    if (snapshot?.available) return 'playing';
    if (snapshot?.source === 'unsupported') return 'unsupported';
    return 'empty';
  });
  const showCinematicScene = $derived(
    stateKind === 'loading' || stateKind === 'playing'
  );
  const isSettling = $derived(settlePhase !== 'ready');
  const coverLoading = $derived(isSettling || (Boolean(displayCoverSrc) && !coverImageReady));
  const coverUpgrading = $derived(artworkFetchInFlight && coverImageReady);
  const sceneSnapshot = $derived(
    stateKind === 'loading' ? BOOT_SNAPSHOT : snapshot ?? BOOT_SNAPSHOT
  );

  onMount(() => {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isTauri()) {
      loading = false;
      snapshot = {
        available: false,
        source: 'unsupported',
        title: '',
        artist: '',
        album: '',
        appName: '',
        sourceAppId: '',
        isPlaying: false,
        canPlay: false,
        canPause: false,
        canNext: false,
        canPrevious: false,
        positionMs: 0,
        durationMs: 0
      };
      settlePhase = 'ready';
      return;
    }

    syncPolling();
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    stopMediaSessionPolling();
    cancelAnimationFrame(tickRaf);
    window.clearTimeout(coverDebounceTimer);
    window.clearTimeout(settleTimeoutId);
    window.clearTimeout(settleMinTimeoutId);
    cancelAlbumPaletteSchedule();
    window.removeEventListener('keydown', handleKeydown);
    resetAlbumPalette(sceneEl);
    clearCoverArtCache();
  });

  function clearSettleTimers() {
    window.clearTimeout(settleTimeoutId);
    window.clearTimeout(settleMinTimeoutId);
  }

  function forceReveal() {
    pendingReveal = false;
    settlePhase = 'ready';
    settledTrackKey = trackKey;
    ghostCoverSrc = null;
    if (displayCoverSrc && !coverImageReady) {
      coverImageReady = true;
    }
    clearSettleTimers();
  }

  function tryReveal() {
    if (!pendingReveal || settlePhase === 'ready') return;

    const elapsed = performance.now() - settleStartedAt;
    const coverDone = coverImageReady || !displayCoverSrc;
    if (!coverDone || elapsed < SETTLE_MIN_MS) return;

    pendingReveal = false;
    settlePhase = 'ready';
    settledTrackKey = trackKey;
    ghostCoverSrc = null;
    clearSettleTimers();
  }

  function beginSettling(preserveGhost) {
    if (preserveGhost && displayCoverSrc) {
      ghostCoverSrc = displayCoverSrc;
    } else if (!displayCoverSrc) {
      ghostCoverSrc = null;
    }

    coverImageReady = false;
    pendingReveal = true;
    settlePhase = stateKind === 'loading' ? 'boot' : 'cover';
    settleStartedAt = performance.now();
    clearSettleTimers();

    settleMinTimeoutId = window.setTimeout(() => {
      tryReveal();
    }, SETTLE_MIN_MS);

    settleTimeoutId = window.setTimeout(() => {
      forceReveal();
    }, SETTLE_MAX_MS);
  }

  function handleCoverLoad() {
    coverImageReady = true;
    tryReveal();
  }

  $effect(() => {
    if (!isTauri()) return;
    active;
    $paused;
    syncPolling();
  });

  $effect(() => {
    if (!snapshot?.available || !snapshot.isPlaying || !active || get(paused)) {
      cancelAnimationFrame(tickRaf);
      tickRaf = 0;
      if (snapshot) displayPositionMs = snapshot.positionMs;
      return;
    }

    snapshot.positionMs;
    syncedAt;

    const loop = () => {
      displayPositionMs = interpolateMediaPosition(snapshot, syncedAt);
      tickRaf = requestAnimationFrame(loop);
    };

    tickRaf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(tickRaf);
  });

  $effect(() => {
    const key = confirmedTrackKey;
    if (!key || key === 'empty') return;

    if (settledTrackKey && key !== settledTrackKey) {
      beginSettling(true);
    } else if (!settledTrackKey && snapshot?.available && settlePhase === 'boot') {
      beginSettling(false);
    }
  });

  $effect(() => {
    if (!snapshot?.available) {
      window.clearTimeout(coverDebounceTimer);
      displayCoverSrc = null;
      displayCoverWidth = 0;
      displayCoverHeight = 0;
      lastCoverFingerprint = '';
      lastArtworkFetchKey = '';
      lastDisplayTrackKey = '';
      ghostCoverSrc = null;
      coverImageReady = false;
      settledTrackKey = '';
      confirmedTrackKey = '';
      rawKeyPrev = '';
      rawKeyStreak = 0;
      pendingReveal = false;
      settlePhase = 'boot';
      clearSettleTimers();
      return;
    }

    const fingerprint = coverFingerprint;
    const thumbSrc = smtcCoverSrc;
    const key = trackKey;

    if (key !== lastDisplayTrackKey) {
      lastDisplayTrackKey = key;
      if (thumbSrc) {
        displayCoverSrc = thumbSrc;
        displayCoverWidth = snapshot.coverArtWidth ?? 0;
        displayCoverHeight = snapshot.coverArtHeight ?? 0;
        coverImageReady = false;
      }
      lastCoverFingerprint = fingerprint;
    } else if (fingerprint !== lastCoverFingerprint) {
      lastCoverFingerprint = fingerprint;
      if (thumbSrc) {
        displayCoverSrc = thumbSrc;
        displayCoverWidth = snapshot.coverArtWidth ?? 0;
        displayCoverHeight = snapshot.coverArtHeight ?? 0;
        coverImageReady = false;
      }
    }

    if (fingerprint === lastArtworkFetchKey) return;
    lastArtworkFetchKey = fingerprint;

    window.clearTimeout(coverDebounceTimer);
    const requestId = ++coverResolveId;
    const snapshotAtRequest = snapshot;
    artworkFetchInFlight = true;

    coverDebounceTimer = window.setTimeout(() => {
      void fetchMediaArtwork(snapshotAtRequest)
        .then((artwork) => {
          if (requestId !== coverResolveId) return;
          const resolved = artworkToResolvedCover(artwork);
          rememberResolvedCover(snapshotAtRequest, resolved);
          if (resolved.src) {
            displayCoverSrc = resolved.src;
            displayCoverWidth = resolved.width || snapshotAtRequest.coverArtWidth || 0;
            displayCoverHeight = resolved.height || snapshotAtRequest.coverArtHeight || 0;
            coverImageReady = false;
          }
        })
        .catch(() => {
          if (requestId !== coverResolveId) return;
        })
        .finally(() => {
          if (requestId !== coverResolveId) return;
          artworkFetchInFlight = false;
          tryReveal();
        });
    }, 300);

    return () => {
      window.clearTimeout(coverDebounceTimer);
    };
  });

  $effect(() => {
    if (!active || !snapshot?.available) {
      resetAlbumPalette(sceneEl);
      paletteInk = 'light';
      return;
    }

    if (isSettling) return;

    const paletteSrc = displayCoverSrc ?? ghostCoverSrc;
    if (!paletteSrc) return;

    scheduleAlbumPalette(sceneEl, paletteSrc, (palette) => {
      paletteInk = palette.ink;
    });
  });

  function applySnapshot(data) {
    if (
      !data.coverArtBase64 &&
      snapshot?.coverArtBase64 &&
      mediaTrackKey(snapshot) === mediaTrackKey(data) &&
      data.coverArtWidth === snapshot.coverArtWidth &&
      data.coverArtHeight === snapshot.coverArtHeight
    ) {
      data = {
        ...data,
        coverArtBase64: snapshot.coverArtBase64,
        coverArtMime: snapshot.coverArtMime
      };
    }

    snapshot = data;
    syncedAt = performance.now();
    displayPositionMs = data.positionMs;
    loading = false;
    errorMsg = null;
    confirmTrackKey(data);
  }

  function confirmTrackKey(data) {
    const key = mediaTrackKey(data);
    if (key === rawKeyPrev) {
      rawKeyStreak += 1;
    } else {
      rawKeyPrev = key;
      rawKeyStreak = 1;
    }

    if (
      confirmedTrackKey === '' ||
      key === confirmedTrackKey ||
      data.isPlaying ||
      rawKeyStreak >= 2
    ) {
      confirmedTrackKey = key;
    }
  }

  function syncPolling() {
    const isActive = active && !get(paused);
    if (!isActive) {
      stopMediaSessionPolling();
      return;
    }

    startMediaSessionPolling({
      getActive: () => active && !get(paused),
      getPaused: () => get(paused),
      onData: applySnapshot,
      onError: (message) => {
        errorMsg = message;
        loading = false;
      }
    });
  }

  async function runControl(action) {
    if (controlBusy || !snapshot?.available) return;
    controlBusy = true;
    try {
      await action();
      applySnapshot(await fetchMediaSnapshot());
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      controlBusy = false;
    }
  }

  function handleKeydown(event) {
    if (!active || !snapshot?.available || controlBusy) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      void runControl(() => toggleMediaPlayback());
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (snapshot.canNext) void runControl(() => skipMediaNext());
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (snapshot.canPrevious) void runControl(() => skipMediaPrevious());
    }
  }
</script>

<div class="media-panel-root">
  {#if showCinematicScene}
    <section
      class="media-scene"
      class:is-active={active}
      class:media-scene--settling={isSettling}
      data-media-ink={paletteInk}
      aria-label="A tocar agora"
      aria-busy={isSettling}
      bind:this={sceneEl}
    >
      <div class="media-ambient-grain" aria-hidden="true"></div>

      <MediaNowPlaying
        snapshot={sceneSnapshot}
        coverSrc={displayCoverSrc}
        {ghostCoverSrc}
        coverWidth={displayCoverWidth}
        coverHeight={displayCoverHeight}
        {trackKey}
        {displayPositionMs}
        {displayPercent}
        controlBusy={controlBusy}
        {reducedMotion}
        skeleton={stateKind === 'loading'}
        {settlePhase}
        {coverLoading}
        {coverUpgrading}
        onCoverLoad={handleCoverLoad}
        onPrevious={() => runControl(() => skipMediaPrevious())}
        onToggle={() => runControl(() => toggleMediaPlayback())}
        onNext={() => runControl(() => skipMediaNext())}
      />
    </section>
  {:else if stateKind === 'unsupported'}
    <MediaEmptyState variant="unsupported" {reducedMotion} />
  {:else if stateKind === 'error'}
    <MediaEmptyState variant="error" message={errorMsg ?? 'Erro desconhecido.'} {reducedMotion} />
  {:else}
    <MediaEmptyState variant="empty" {reducedMotion} />
  {/if}

  {#if errorMsg && snapshot}
    <p class="media-inline-error" role="alert">{errorMsg}</p>
  {/if}
</div>
