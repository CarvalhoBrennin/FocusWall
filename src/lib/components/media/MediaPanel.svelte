<script>
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { paused } from '../../stores/app-store.js';
  import { isTauri } from '../../utils/tauri.js';
  import {
    fetchMediaArtwork,
    fetchMediaSnapshot,
    mediaCoverSrc,
    mediaProgressPercent,
    positionChangesRender,
    positionFromAnchor,
    reconcilePositionAnchor,
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
    rememberResolvedCover,
    getCachedResolvedCover,
    isEffectivelyHd,
    isVideoCover
  } from '../../utils/cover-art.js';
  import MediaNowPlaying from './MediaNowPlaying.svelte';
  import MediaEmptyState from './MediaEmptyState.svelte';
  import './media.css';

  const SETTLE_MIN_MS = 180;
  const SETTLE_MAX_MS = 4000;
  const COVER_FETCH_DEBOUNCE_MS = 220;
  const LOW_RES_RETRY_DELAYS_MS = [1200, 2400, 4800];
  const BROWSER_APP_HINTS = ['chrome', 'brave', 'msedge', 'edge', 'firefox', 'opera', 'vivaldi', 'chromium'];
  const MIN_PROMOTABLE_VIDEO_WIDTH = 640;
  const MIN_PROMOTABLE_VIDEO_HEIGHT = 360;

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
  /** @type {import('../../services/media-session.js').PositionAnchor | null} */
  let posAnchor = null;
  let posAnchorVersion = $state(0);
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
  let lowResRetryTimer = 0;
  let coverRetryVersion = $state(0);
  let lowResRetryCount = 0;
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
  /** @type {import('../../services/media-session.js').MediaSnapshot | null} */
  let latestSnapshot = null;

  const smtcCoverSrc = $derived(mediaCoverSrc(snapshot));
  const mediaAvailable = $derived(Boolean(snapshot?.available));
  const coverArtWidth = $derived(snapshot?.coverArtWidth ?? 0);
  const coverArtHeight = $derived(snapshot?.coverArtHeight ?? 0);
  const displayPercent = $derived(
    mediaProgressPercent(displayPositionMs, snapshot?.durationMs ?? 0)
  );
  const trackKey = $derived(mediaTrackKey(snapshot));
  const displayTrackKey = $derived(confirmedTrackKey || trackKey);
  const coverFingerprint = $derived(
    `${trackKey}|${snapshot?.coverArtWidth ?? 0}|${snapshot?.coverArtHeight ?? 0}`
  );
  const artworkFetchFingerprint = $derived(`${coverFingerprint}|retry:${coverRetryVersion}`);
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
  const coverLoading = $derived(
    isSettling || artworkFetchInFlight || (Boolean(displayCoverSrc) && !coverImageReady)
  );
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

    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    stopMediaSessionPolling();
    cancelAnimationFrame(tickRaf);
    window.clearTimeout(coverDebounceTimer);
    window.clearTimeout(lowResRetryTimer);
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

  function clearLowResRetry() {
    window.clearTimeout(lowResRetryTimer);
    lowResRetryTimer = 0;
  }

  function isLikelyBrowserSource(sourceAppId = '') {
    const source = sourceAppId.toLowerCase();
    return BROWSER_APP_HINTS.some((hint) => source.includes(hint));
  }

  function scheduleLowResRetry(snap, resolved, promotable) {
    if (!isLikelyBrowserSource(snap?.sourceAppId || '')) return false;
    if (promotable || !resolved?.lowRes) return false;

    const delay = LOW_RES_RETRY_DELAYS_MS[lowResRetryCount];
    if (!delay) return false;

    lowResRetryCount += 1;
    clearLowResRetry();
    lowResRetryTimer = window.setTimeout(() => {
      lowResRetryTimer = 0;
      lastArtworkFetchKey = '';
      coverRetryVersion += 1;
    }, delay);
    return true;
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

  function isPromotableCover(width, height, lowRes = false) {
    if (!width || !height) return !lowRes;
    if (isVideoCover(width, height)) {
      return width >= MIN_PROMOTABLE_VIDEO_WIDTH && height >= MIN_PROMOTABLE_VIDEO_HEIGHT;
    }
    return isEffectivelyHd(width, height) || !lowRes;
  }

  function setDisplayCover(src, width, height) {
    displayCoverSrc = src;
    displayCoverWidth = width || 0;
    displayCoverHeight = height || 0;
    coverImageReady = false;
  }

  function clearDisplayCover() {
    displayCoverSrc = null;
    displayCoverWidth = 0;
    displayCoverHeight = 0;
    coverImageReady = false;
  }

  $effect(() => {
    if (!isTauri()) return;
    active;
    $paused;
    syncPolling();
  });

  $effect(() => {
    if (!snapshot?.available || !snapshot.isPlaying || !active || get(paused)) {
      if (snapshot) displayPositionMs = snapshot.positionMs;
      return;
    }

    // Dependências reativas: re-executa quando a âncora muda (seek/resync) ou
    // quando o snapshot é substituído (troca de faixa / play-pause).
    posAnchorVersion;
    const duration = snapshot.durationMs;
    let running = true;

    /*
     * O loop continua em requestAnimationFrame — é o que mantém a barra colada
     * ao refresh do monitor. O que mudou é que ele só escreve no estado quando o
     * resultado renderizado muda de fato.
     *
     * Antes, cada frame escrevia `displayPositionMs`, e cada escrita recalculava
     * `displayPercent` e atualizava a largura da barra mais os dois textos de
     * tempo — 60 vezes por segundo. Mas a barra tem algumas centenas de pixels:
     * numa faixa de 4 minutos, um passo de 1px equivale a mais de meio segundo de
     * áudio. A esmagadora maioria dessas escritas repintava pixels idênticos.
     *
     * Comparar a posição projetada com a última escrita corta as atualizações
     * reativas em ~30x sem diferença visual nenhuma: a barra ainda avança de um
     * pixel por vez, e o texto de tempo ainda vira no segundo exato.
     */
    const loop = () => {
      if (!running) return;
      const next = positionFromAnchor(posAnchor, duration, true);
      if (positionChangesRender(displayPositionMs, next, duration)) {
        displayPositionMs = next;
      }
      tickRaf = requestAnimationFrame(loop);
    };

    tickRaf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(tickRaf);
      tickRaf = 0;
    };
  });

  $effect(() => {
    const key = confirmedTrackKey;
    if (!key || key === 'empty') return;

    if (settledTrackKey && key !== settledTrackKey) {
      beginSettling(true);
    } else if (!settledTrackKey && mediaAvailable && settlePhase === 'boot') {
      beginSettling(false);
    }
  });

  $effect(() => {
    if (!mediaAvailable) {
      window.clearTimeout(coverDebounceTimer);
      clearLowResRetry();
      displayCoverSrc = null;
      displayCoverWidth = 0;
      displayCoverHeight = 0;
      lastCoverFingerprint = '';
      lastArtworkFetchKey = '';
      coverRetryVersion = 0;
      lowResRetryCount = 0;
      lastDisplayTrackKey = '';
      ghostCoverSrc = null;
      coverImageReady = false;
      settledTrackKey = '';
      confirmedTrackKey = '';
      rawKeyPrev = '';
      rawKeyStreak = 0;
      pendingReveal = false;
      settlePhase = 'boot';
      posAnchor = null;
      displayPositionMs = 0;
      clearSettleTimers();
      return;
    }

    const fingerprint = coverFingerprint;
    const fetchFingerprint = artworkFetchFingerprint;
    const thumbSrc = smtcCoverSrc;
    const key = trackKey;
    const width = coverArtWidth;
    const height = coverArtHeight;
    const thumbPromotable = Boolean(thumbSrc) && isPromotableCover(width, height, true);

    if (key !== lastDisplayTrackKey) {
      lastDisplayTrackKey = key;
      clearLowResRetry();
      coverRetryVersion = 0;
      lowResRetryCount = 0;
      const cached = getCachedResolvedCover(snapshot);
      if (cached?.src && !cached.lowRes) {
        setDisplayCover(cached.src, cached.width || width, cached.height || height);
      } else if (thumbSrc && thumbPromotable) {
        setDisplayCover(thumbSrc, width, height);
      } else {
        clearDisplayCover();
      }
      lastCoverFingerprint = fingerprint;
    } else if (fingerprint !== lastCoverFingerprint) {
      lastCoverFingerprint = fingerprint;
      if (thumbSrc && thumbPromotable) {
        setDisplayCover(thumbSrc, width, height);
      }
    }

    if (fetchFingerprint === lastArtworkFetchKey) return;
    lastArtworkFetchKey = fetchFingerprint;

    window.clearTimeout(coverDebounceTimer);
    const requestId = ++coverResolveId;

    coverDebounceTimer = window.setTimeout(() => {
      const snap = latestSnapshot;
      if (!snap?.available) return;
      artworkFetchInFlight = true;
      void fetchMediaArtwork(snap)
        .then((artwork) => {
          if (requestId !== coverResolveId) return;
          const resolved = artworkToResolvedCover(artwork);
          rememberResolvedCover(snap, resolved);
          const resolvedWidth = resolved.width || snap.coverArtWidth || 0;
          const resolvedHeight = resolved.height || snap.coverArtHeight || 0;
          const promotable = isPromotableCover(resolvedWidth, resolvedHeight, resolved.lowRes);
          const retryScheduled = scheduleLowResRetry(snap, resolved, promotable);

          if (!resolved.lowRes || promotable) {
            lowResRetryCount = 0;
            clearLowResRetry();
          }

          if (resolved.src && (!resolved.lowRes || promotable || (!retryScheduled && !displayCoverSrc))) {
            setDisplayCover(resolved.src, resolvedWidth, resolvedHeight);
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
    }, COVER_FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(coverDebounceTimer);
      coverResolveId += 1;
      artworkFetchInFlight = false;
    };
  });

  $effect(() => {
    if (!active || !mediaAvailable) {
      cancelAlbumPaletteSchedule();
      resetAlbumPalette(sceneEl);
      paletteInk = 'light';
      return;
    }

    if (isSettling) return;

    const paletteSrc = displayCoverSrc ?? ghostCoverSrc;
    if (!paletteSrc) {
      cancelAlbumPaletteSchedule();
      resetAlbumPalette(sceneEl);
      paletteInk = 'light';
      return;
    }

    scheduleAlbumPalette(sceneEl, paletteSrc, (palette) => {
      paletteInk = palette.ink;
    });

    return () => {
      cancelAlbumPaletteSchedule();
    };
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

    latestSnapshot = data;

    const prevSnap = snapshot;
    const trackChanged = !prevSnap || mediaTrackKey(prevSnap) !== mediaTrackKey(data);
    const playStateChanged = !prevSnap || prevSnap.isPlaying !== data.isPlaying;

    snapshot = data;
    reanchorPosition(data, trackChanged, playStateChanged);
    loading = false;
    errorMsg = null;
    confirmTrackKey(data);
  }

  function reanchorPosition(data, trackChanged, playStateChanged) {
    posAnchor = reconcilePositionAnchor(posAnchor, data, {
      trackChanged,
      playStateChanged
    });
    posAnchorVersion += 1;
    displayPositionMs = positionFromAnchor(posAnchor, data.durationMs, data.isPlaying);
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
      rawKeyStreak >= 2 ||
      (Boolean(data.title?.trim()) && rawKeyStreak >= 1)
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

  async function runControl(action, optimistic) {
    if (controlBusy || !snapshot?.available) return;
    controlBusy = true;
    // Atualização otimista: reflete o estado desejado de imediato para o
    // controle não parecer "travado" enquanto o comando faz a ida-e-volta ao
    // SMTC. O snapshot real, ao chegar, corrige qualquer divergência.
    if (optimistic) optimistic();
    try {
      await action();
      applySnapshot(await fetchMediaSnapshot());
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      controlBusy = false;
    }
  }

  function togglePlayback() {
    return runControl(() => toggleMediaPlayback(), () => {
      if (!snapshot) return;
      const pos = Math.round(displayPositionMs);
      posAnchor = { baseMs: pos, atMs: performance.now() };
      posAnchorVersion += 1;
      snapshot = { ...snapshot, isPlaying: !snapshot.isPlaying, positionMs: pos };
    });
  }

  function handleKeydown(event) {
    if (!active || !snapshot?.available || controlBusy) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      if (snapshot.canPlay || snapshot.canPause) void togglePlayback();
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
        trackKey={displayTrackKey}
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
        onToggle={togglePlayback}
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
