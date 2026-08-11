<script>
  import { onDestroy, onMount } from 'svelte';
  import { extractAlbumPalette } from '../../utils/album-palette.js';
  import { t, formatMessage } from '../../i18n/index.js';
  import {
    clampTrackIndex,
    musicQueueKey,
    resolveTrackAtPlayerIndex
  } from './player-queue.js';
  import MusicIcons from './MusicIcons.svelte';

  let {
    active = true,
    compact = false,
    playRequest = null,
    onTrackChange = () => {}
  } = $props();

  let host = $state(null);
  let stageEl = $state(null);
  let player = null;
  let playerReady = $state(false);
  let playing = $state(false);
  let buffering = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(70);
  let muted = $state(false);
  let shuffle = $state(false);
  let loop = $state(false);
  let currentTrack = $state(null);
  let currentQueueIndex = $state(-1);
  let playerErrorMessage = $state('');
  let playerErrorCode = $state(0);
  let playerErrorRecovering = $state(false);

  let lastRequestToken = -1;
  let fallbackQueueKey = '';
  let progressTimer = 0;
  let errorSkipTimer = 0;
  let paletteRequestId = 0;
  let failedSkipCount = 0;
  let destroyed = false;

  function portal(node) {
    const placeholder = document.createComment('focuswall-youtube-mini-player');
    node.replaceWith(placeholder);
    document.body.appendChild(node);

    return {
      destroy() {
        node.remove();
        placeholder.remove();
      }
    };
  }

  const progressPercent = $derived(duration > 0 ? Math.min(100, Math.max(0, currentTime / duration * 100)) : 0);
  const queueLength = $derived(playRequest?.tracks?.length || 0);
  const displayQueueIndex = $derived(
    currentQueueIndex >= 0
      ? currentQueueIndex
      : clampTrackIndex(playRequest?.startIndex ?? 0, queueLength)
  );
  const playerStateLabel = $derived(
    !playRequest?.tracks?.length
      ? $t('music.playerWaiting')
      : buffering
        ? $t('music.playerLoading')
        : playing
          ? $t('music.playerPlaying')
          : playerReady
            ? $t('music.playerPaused')
            : $t('music.playerConnecting')
  );
  const canGoNext = $derived.by(() => {
    if (!playerReady || !queueLength) return false;
    if (queueLength === 1) return loop;
    if (shuffle || loop) return true;
    const index = currentLinearQueueIndex();
    return index >= 0 && index < queueLength - 1;
  });

  function formatTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function ensureYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (window.__focuswallYouTubeApiPromise) return window.__focuswallYouTubeApiPromise;

    window.__focuswallYouTubeApiPromise = new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = 0;

      const resolveApi = (api) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(api);
      };

      const rejectApi = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        window.__focuswallYouTubeApiPromise = null;
        reject(error);
      };

      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousReady === 'function') previousReady();
        if (window.YT?.Player) resolveApi(window.YT);
        else rejectApi(new Error($t('music.playerApiInitFailed')));
      };

      const existing = document.querySelector('script[data-focuswall-youtube-api="true"]');
      if (existing) {
        timeoutId = window.setTimeout(() => {
          rejectApi(new Error($t('music.playerLoadTimeout')));
        }, 15000);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.focuswallYoutubeApi = 'true';
      script.onerror = () => {
        script.remove();
        rejectApi(new Error($t('music.playerLoadFailed')));
      };

      timeoutId = window.setTimeout(() => {
        script.remove();
        rejectApi(new Error($t('music.playerLoadTimeout')));
      }, 15000);

      document.head.appendChild(script);
    });

    return window.__focuswallYouTubeApiPromise;
  }

  function reportPlayerError(message, recovering = false, code = 0) {
    playerErrorMessage = message;
    playerErrorCode = Number(code) || 0;
    playerErrorRecovering = Boolean(message) && recovering;
  }

  function clearDynamicPalette() {
    if (!stageEl) return;
    stageEl.style.removeProperty('--music-live-accent');
  }

  async function syncDynamicPalette(coverSrc) {
    const requestId = ++paletteRequestId;
    if (!coverSrc || !stageEl) {
      clearDynamicPalette();
      return;
    }

    const palette = await extractAlbumPalette(coverSrc);
    if (destroyed || requestId !== paletteRequestId || !stageEl?.isConnected) return;

    if (!palette.ambientReady) {
      clearDynamicPalette();
      return;
    }

    stageEl.style.setProperty('--music-live-accent', palette.accent);
  }

  function resolveCurrentTrack() {
    if (!player || !playRequest?.tracks?.length) return null;

    if (isFallbackQueue()) {
      return currentTrack || playRequest.tracks[currentQueueIndex] || null;
    }

    try {
      const playlist = player.getPlaylist?.() || [];
      const index = Number(player.getPlaylistIndex?.() ?? -1);
      if (Number.isInteger(index) && index >= 0) {
        currentQueueIndex = index;
        const resolved = resolveTrackAtPlayerIndex(playRequest.tracks, playlist, index);
        if (resolved) return resolved;
      }
    } catch {
      // O iframe pode estar trocando de vídeo. Mantemos a faixa conhecida até o próximo snapshot.
    }

    return currentTrack || playRequest.tracks[clampTrackIndex(playRequest.startIndex, playRequest.tracks.length)] || null;
  }

  function syncSnapshot() {
    if (!playerReady || !player) return;

    try {
      currentTime = Number(player.getCurrentTime?.() || 0);
      duration = Number(player.getDuration?.() || 0);
      const nextTrack = resolveCurrentTrack();

      if (nextTrack?.playlistItemId !== currentTrack?.playlistItemId) {
        currentTrack = nextTrack;
        onTrackChange(nextTrack);
      }
    } catch {
      // A próxima amostragem reconcilia o estado após a troca de vídeo.
    }
  }

  function startProgressTimer() {
    window.clearInterval(progressTimer);
    if (!active) return;
    progressTimer = window.setInterval(syncSnapshot, 350);
  }

  function stopProgressTimer() {
    window.clearInterval(progressTimer);
    progressTimer = 0;
  }

  function currentQueueKey() {
    return musicQueueKey(playRequest?.playlistId, playRequest?.tracks || []);
  }

  function isFallbackQueue() {
    return Boolean(fallbackQueueKey) && fallbackQueueKey === currentQueueKey();
  }

  function adjacentFallbackIndex(direction) {
    const tracks = playRequest?.tracks || [];
    if (!tracks.length) return -1;

    const baseIndex = currentLinearQueueIndex();
    if (baseIndex < 0) return -1;

    if (shuffle && tracks.length > 1) {
      let randomIndex = baseIndex;
      while (randomIndex === baseIndex) {
        randomIndex = Math.floor(Math.random() * tracks.length);
      }
      return randomIndex;
    }

    let nextIndex = baseIndex + direction;
    if (nextIndex < 0 || nextIndex >= tracks.length) {
      if (!loop) return -1;
      nextIndex = (nextIndex + tracks.length) % tracks.length;
    }
    return nextIndex;
  }

  function loadFallbackTrack(index, autoplay = true) {
    if (!playerReady || !player || !playRequest?.tracks?.length) return false;

    const safeIndex = clampTrackIndex(index, playRequest.tracks.length);
    const track = playRequest.tracks[safeIndex];
    if (safeIndex < 0 || !track?.videoId) {
      reportPlayerError($t('music.playerInvalidTrack'));
      return false;
    }

    currentQueueIndex = safeIndex;
    currentTrack = track;
    currentTime = 0;
    duration = 0;
    playing = false;
    buffering = autoplay;
    reportPlayerError('');
    onTrackChange(track);

    try {
      if (autoplay) player.loadVideoById(track.videoId, 0);
      else player.cueVideoById(track.videoId, 0);
      return true;
    } catch (error) {
      buffering = false;
      reportPlayerError(error?.message || $t('music.playerTrackLoadFailed'));
      return false;
    }
  }

  function handleStateChange(event) {
    const state = event?.data;
    const ytState = window.YT?.PlayerState;

    playing = state === ytState?.PLAYING;
    buffering = state === ytState?.BUFFERING;

    if (playing) {
      failedSkipCount = 0;
      reportPlayerError('');
    }

    if (state === ytState?.ENDED && isFallbackQueue()) {
      playing = false;
      buffering = false;
      window.clearTimeout(errorSkipTimer);
      errorSkipTimer = window.setTimeout(() => {
        if (destroyed || !playerReady || !player || !isFallbackQueue()) return;
        const nextIndex = adjacentFallbackIndex(1);
        if (nextIndex >= 0) loadFallbackTrack(nextIndex, true);
      }, 100);
    }

    syncSnapshot();
  }

  function skipUnavailableTrack(message) {
    const maxSkips = Math.min(3, Math.max(0, queueLength - 1));
    const linearIndex = currentLinearQueueIndex();
    const atLinearQueueEnd = !shuffle && !loop && linearIndex >= queueLength - 1;
    if (!player || maxSkips <= 0 || failedSkipCount >= maxSkips || atLinearQueueEnd) {
      buffering = false;
      reportPlayerError(message);
      return;
    }

    failedSkipCount += 1;
    reportPlayerError(`${message} ${$t('music.playerSkippingNext')}`, true);
    window.clearTimeout(errorSkipTimer);

    errorSkipTimer = window.setTimeout(() => {
      if (!playerReady || !player || destroyed) return;
      try {
        if (isFallbackQueue()) {
          const nextIndex = adjacentFallbackIndex(1);
          if (nextIndex < 0 || !loadFallbackTrack(nextIndex, true)) reportPlayerError(message);
        } else {
          player.nextVideo();
        }
      } catch {
        reportPlayerError(message);
      }
    }, 260);
  }

  function handlePlayerError(event) {
    const code = Number(event?.data || 0);

    if (code === 2) {
      if (!isFallbackQueue() && currentTrack?.videoId && playRequest?.tracks?.length) {
        fallbackQueueKey = currentQueueKey();
        reportPlayerError($t('music.playerQueueFallback'), true);
        window.clearTimeout(errorSkipTimer);
        errorSkipTimer = window.setTimeout(() => {
          if (playerReady && player && !destroyed && isFallbackQueue()) {
            loadFallbackTrack(currentLinearQueueIndex(), true);
          }
        }, 120);
      } else {
        skipUnavailableTrack($t('music.playerRejectedTrack'));
      }
      return;
    }

    if (code === 101 || code === 150) {
      skipUnavailableTrack($t('music.playerEmbedBlocked'));
      return;
    }

    if (code === 100) {
      skipUnavailableTrack($t('music.playerUnavailableTrack'));
      return;
    }

    const message = code === 153
      ? $t('music.playerIdentityRejected')
      : $t('music.playerGenericError');

    reportPlayerError(message, false, code);
  }

  async function createPlayer() {
    if (!host || player || destroyed) return;

    const YT = await ensureYouTubeApi();
    if (destroyed || !host) return;

    const playerVars = {
      controls: 0,
      playsinline: 1,
      rel: 0,
      iv_load_policy: 3
    };

    if (window.location.origin?.startsWith('http')) {
      playerVars.origin = window.location.origin;
    }

    const mountNode = document.createElement('div');
    mountNode.className = 'music-video-mount';
    host.replaceChildren(mountNode);

    player = new YT.Player(mountNode, {
      width: '100%',
      height: '100%',
      playerVars,
      events: {
        onReady: (event) => {
          playerReady = true;
          event.target.setVolume(volume);
          if (active) startProgressTimer();
          applyPlayRequest();
        },
        onStateChange: handleStateChange,
        onError: handlePlayerError,
        onAutoplayBlocked: () => {
          buffering = false;
          playing = false;
          reportPlayerError($t('music.playerAutoplayBlocked'), true);
        }
      }
    });
  }

  function applyPlayRequest() {
    if (!playerReady || !player || !playRequest?.tracks?.length) return;
    if (playRequest.token === lastRequestToken) return;

    const safeIndex = clampTrackIndex(playRequest.startIndex, playRequest.tracks.length);
    if (safeIndex < 0) return;

    const nextQueueKey = musicQueueKey(playRequest.playlistId, playRequest.tracks);

    lastRequestToken = playRequest.token;
    window.clearTimeout(errorSkipTimer);
    failedSkipCount = 0;

    currentQueueIndex = safeIndex;
    currentTime = 0;
    duration = 0;
    reportPlayerError('');

    currentTrack = playRequest.tracks[safeIndex] || null;
    onTrackChange(currentTrack);

    try {
      // Keep the queue in FocusWall instead of delegating it to YouTube.
      // This avoids playlist API failures and keeps navigation deterministic.
      fallbackQueueKey = nextQueueKey;
      loadFallbackTrack(safeIndex, playRequest.autoplay !== false);
    } catch (error) {
      fallbackQueueKey = '';
      reportPlayerError(error?.message || $t('music.playerQueueLoadFailed'));
    }
  }

  function togglePlayback() {
    if (!playerReady || !player) return;

    try {
      if (playing) {
        player.pauseVideo();
      } else {
        reportPlayerError('');
        player.playVideo();
      }
    } catch (error) {
      reportPlayerError(error?.message || $t('music.playerControlFailed'));
    }
  }

  function currentLinearQueueIndex() {
    const tracks = playRequest?.tracks || [];
    if (!tracks.length) return -1;

    const currentIndex = currentTrack?.playlistItemId
      ? tracks.findIndex((track) => track.playlistItemId === currentTrack.playlistItemId)
      : -1;
    if (currentIndex >= 0) return currentIndex;
    if (currentQueueIndex >= 0) return clampTrackIndex(currentQueueIndex, tracks.length);
    return clampTrackIndex(playRequest?.startIndex ?? 0, tracks.length);
  }

  function previous() {
    if (!playerReady || !player) return;

    window.clearTimeout(errorSkipTimer);
    reportPlayerError('');
    currentTime = 0;

    const linearIndex = currentLinearQueueIndex();
    if (!shuffle && !loop && linearIndex <= 0) {
      buffering = false;
      try {
        player.seekTo(0, true);
      } catch (error) {
        reportPlayerError(error?.message || $t('music.playerRestartFailed'));
      }
      return;
    }

    buffering = true;
    try {
      if (isFallbackQueue()) {
        const previousIndex = adjacentFallbackIndex(-1);
        if (previousIndex < 0 || !loadFallbackTrack(previousIndex, true)) {
          buffering = false;
          player.seekTo(0, true);
        }
      } else {
        player.previousVideo();
      }
    } catch (error) {
      buffering = false;
      reportPlayerError(error?.message || $t('music.playerPreviousFailed'));
    }
  }

  function next() {
    if (!playerReady || !player) return;

    window.clearTimeout(errorSkipTimer);
    reportPlayerError('');
    currentTime = 0;

    const linearIndex = currentLinearQueueIndex();
    if (!shuffle && !loop && linearIndex >= queueLength - 1) {
      buffering = false;
      reportPlayerError($t('music.playerQueueEnd'));
      return;
    }

    buffering = true;
    try {
      if (isFallbackQueue()) {
        const nextIndex = adjacentFallbackIndex(1);
        if (nextIndex < 0 || !loadFallbackTrack(nextIndex, true)) {
          buffering = false;
          reportPlayerError($t('music.playerQueueEnd'));
        }
      } else {
        player.nextVideo();
      }
    } catch (error) {
      buffering = false;
      reportPlayerError(error?.message || $t('music.playerNextFailed'));
    }
  }

  function seek(event) {
    if (!playerReady || !player) return;
    const value = Number(event.currentTarget.value || 0);
    currentTime = value;

    try {
      player.seekTo(value, true);
    } catch (error) {
      reportPlayerError(error?.message || $t('music.playerSeekFailed'));
    }
  }

  function updateVolume(event) {
    const value = Math.max(0, Math.min(100, Number(event.currentTarget.value || 0)));
    volume = value;
    muted = value === 0;

    if (!playerReady || !player) return;
    try {
      if (muted) player.mute();
      else {
        player.unMute();
        player.setVolume(value);
      }
    } catch (error) {
      reportPlayerError(error?.message || $t('music.playerVolumeFailed'));
    }
  }

  function toggleMute() {
    if (!playerReady || !player) return;

    try {
      if (muted || player.isMuted?.()) {
        player.unMute();
        if (volume === 0) {
          volume = 35;
          player.setVolume(volume);
        }
        muted = false;
      } else {
        player.mute();
        muted = true;
      }
    } catch (error) {
      reportPlayerError(error?.message || $t('music.playerMuteFailed'));
    }
  }

  function toggleShuffle() {
    shuffle = !shuffle;

    reportPlayerError('');
  }

  function toggleLoop() {
    loop = !loop;

    reportPlayerError('');
  }

  function retryPlayer() {
    playerErrorMessage = '';
    playerErrorRecovering = false;
    playerReady = false;
    lastRequestToken = -1;
    window.clearTimeout(errorSkipTimer);

    try {
      player?.destroy?.();
    } catch {
      // O iframe pode já ter sido removido pelo WebView.
    }

    player = null;
    createPlayer().catch((error) => reportPlayerError(error?.message || $t('music.playerLoadFailedShort')));
  }

  $effect(() => {
    playRequest?.token;
    applyPlayRequest();
  });

  $effect(() => {
    active;
    playerReady;
    if (active && playerReady) {
      syncSnapshot();
      startProgressTimer();
    } else if (!active) {
      stopProgressTimer();
    }
  });

  $effect(() => {
    stageEl;
    active;
    const coverSrc = currentTrack?.thumbnailUrl || null;
    if (!active) {
      clearDynamicPalette();
      return;
    }
    void syncDynamicPalette(coverSrc);
  });

  onMount(() => {
    createPlayer().catch((error) => reportPlayerError(error?.message || String(error)));
  });

    onDestroy(() => {
    destroyed = true;
    paletteRequestId += 1;
    stopProgressTimer();
    window.clearTimeout(errorSkipTimer);
    clearDynamicPalette();

    try {
      player?.destroy?.();
    } catch {
      // no-op
    }

    player = null;
  });
</script>
<div
  class="music-player-stage"
  class:is-playing={playing}
  class:is-compact={compact}
  bind:this={stageEl}
>
  <div class="music-player-ambient" aria-hidden="true">
    {#if currentTrack?.thumbnailUrl}
      <img src={currentTrack.thumbnailUrl} alt="" referrerpolicy="no-referrer" />
    {/if}
  </div>

  <div class="music-player-grid">
    <section class="music-visual-column" aria-label={$t('music.videoLabel')}>
      <div class="music-player-section-label">
        <span>{$t('music.youtubeBrand')}</span>
        <span>{queueLength ? `${Math.max(0, displayQueueIndex) + 1} / ${queueLength}` : '-- / --'}</span>
      </div>

      <div class="music-video-frame" role="region" aria-label={$t('music.officialPlayerLabel')}>
        <div class="music-video-host-shell" class:is-hidden={!playRequest?.tracks?.length}>
          <div class="music-video-host" bind:this={host}></div>
        </div>

        {#if !playRequest?.tracks?.length}
          <div class="music-video-empty">
            <span class="music-video-mark" aria-hidden="true"><MusicIcons name="play" size={24} /></span>
            <strong>{$t('music.noTrackSelected')}</strong>
            <p>{$t('music.noTrackSelectedBody')}</p>
          </div>
        {/if}

        {#if playRequest?.tracks?.length && !playerReady && !playerErrorMessage}
          <div class="music-video-status" role="status">
            <span class="music-loader" aria-hidden="true"></span>
            <strong>{$t('music.preparingPlayer')}</strong>
            <span>{$t('music.connectingPlayer')}</span>
          </div>
        {/if}

        {#if playerErrorMessage && !playerErrorRecovering}
          <div class="music-video-status music-video-status--error" role="alert">
            <span class="music-error-code">PLAYER{playerErrorCode ? ` ${playerErrorCode}` : ''}</span>
            <strong>{$t('music.playbackFailed')}</strong>
            <span>{playerErrorMessage}</span>
            <button type="button" onclick={retryPlayer}>{$t('music.retry')}</button>
          </div>
        {/if}
      </div>
    </section>

    <section class="music-transport" aria-label={$t('music.playbackControls')}>
      <div class="music-transport-topline">
        <div class="music-play-state">
          <span class="music-play-state-dot" aria-hidden="true"></span>
          <span>{playerStateLabel}</span>
        </div>
        {#if playerErrorMessage && playerErrorRecovering}
          <span class="music-player-inline-notice" role="status">{playerErrorMessage}</span>
        {/if}
        <span class="music-queue-counter">
          {queueLength ? `${String(Math.max(0, displayQueueIndex) + 1).padStart(2, '0')} / ${String(queueLength).padStart(2, '0')}` : '-- / --'}
        </span>
      </div>

      <div class="music-now-playing-summary">
        <div class="music-now-playing-art" aria-hidden="true">
          {#if currentTrack?.thumbnailUrl}
            <img src={currentTrack.thumbnailUrl} alt="" referrerpolicy="no-referrer" />
          {:else}
            <span>YT</span>
          {/if}
        </div>

        <div class="music-now-playing-copy">
          <p class="music-eyebrow">{$t('music.nowPlaying')}</p>
          <h2>{currentTrack?.title || $t('music.selectTrack')}</h2>
          <p class="music-now-playing-artist">{currentTrack?.artist || $t('music.youtubeBrand')}</p>
          <p class="music-now-playing-source">{playRequest?.playlistTitle || $t('music.noActivePlayback')}</p>
        </div>
      </div>

      <div class="music-progress-block">
        <input
          class="music-progress"
          type="range"
          min="0"
          max={Math.max(1, duration)}
          step="1"
          value={currentTime}
          aria-label={$t('music.trackPosition')}
          aria-valuetext={formatMessage($t('music.progressA11y'), { current: formatTime(currentTime), duration: formatTime(duration) })}
          style={`--music-progress:${progressPercent}%`}
          oninput={seek}
          disabled={!playerReady || duration <= 0}
        />
        <div class="music-progress-meta" aria-hidden="true">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div class="music-controls-block">
        <button
          class="music-mode-button"
          class:is-active={shuffle}
          type="button"
          onclick={toggleShuffle}
          aria-label={$t('music.toggleShuffle')}
          aria-pressed={shuffle}
          title={$t('music.shuffle')}
        >
          <MusicIcons name="shuffle" size={17} />
        </button>

        <div class="music-main-controls">
          <button
            class="music-skip-button"
            type="button"
            onclick={previous}
            disabled={!playerReady || !queueLength}
            aria-label={$t('music.previousTrack')}
            title={$t('music.previous')}
          >
            <MusicIcons name="previous" size={21} />
          </button>

          <button
            class="music-play-button"
            type="button"
            onclick={togglePlayback}
            disabled={!playerReady || !queueLength}
            aria-label={playing ? $t('music.pause') : $t('music.play')}
            title={playing ? $t('music.pause') : $t('music.play')}
          >
            <MusicIcons name={playing ? 'pause' : 'play'} size={23} filled={!playing} />
          </button>

          <button
            class="music-skip-button"
            type="button"
            onclick={next}
            disabled={!canGoNext}
            aria-label={$t('music.nextTrack')}
            title={$t('music.next')}
          >
            <MusicIcons name="next" size={21} />
          </button>
        </div>

        <button
          class="music-mode-button"
          class:is-active={loop}
          type="button"
          onclick={toggleLoop}
          aria-label={$t('music.toggleLoop')}
          aria-pressed={loop}
          title={$t('music.repeatQueue')}
        >
          <MusicIcons name="repeat" size={17} />
        </button>
      </div>

      <div class="music-volume-row">
        <button class="music-volume-button" type="button" onclick={toggleMute} aria-label={muted ? $t('music.unmute') : $t('music.mute')}>
          <MusicIcons name={muted ? 'muted' : 'volume'} size={17} />
        </button>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={muted ? 0 : volume}
          aria-label={$t('music.volume')}
          aria-valuetext={`${muted ? 0 : volume}%`}
          style={`--music-volume:${muted ? 0 : volume}%`}
          oninput={updateVolume}
        />
        <span>{String(muted ? 0 : volume).padStart(2, '0')}%</span>
      </div>
    </section>
  </div>

  <div
    use:portal
    class="music-mini-portal"
    class:is-visible={compact && Boolean(playRequest?.tracks?.length)}
    aria-hidden={compact && playRequest?.tracks?.length ? undefined : 'true'}
    inert={compact && playRequest?.tracks?.length ? undefined : true}
    role="region"
    aria-label={$t('music.miniPlayerLabel')}
  >
    <div class="music-mini-art" aria-hidden="true">
      {#if currentTrack?.thumbnailUrl}
        <img src={currentTrack.thumbnailUrl} alt="" referrerpolicy="no-referrer" />
      {:else}
        <MusicIcons name="play" size={15} />
      {/if}
    </div>

    <div class="music-mini-console">
      <div class="music-mini-topline">
        <span class="music-mini-brand">{$t('music.youtubeBrand')}</span>
        <span class="music-mini-kicker">{playerStateLabel} · {displayQueueIndex >= 0 ? `${displayQueueIndex + 1}/${queueLength}` : '--/--'}</span>
      </div>

      <div class="music-mini-copy">
        <strong>{currentTrack?.title || $t('music.miniIdleTitle')}</strong>
        <small>{currentTrack?.artist || $t('music.youtubeBrand')} · {playerStateLabel}</small>
        <span>{playRequest?.playlistTitle || $t('music.noActivePlayback')}</span>
      </div>

      {#if playerErrorMessage}
        <span class="music-mini-error" class:is-recovering={playerErrorRecovering} role="status">{playerErrorMessage}</span>
      {/if}

      <div class="music-mini-meta">
        <div class="music-mini-progress" aria-hidden="true" style={`--music-progress:${progressPercent}%`}></div>
        <div class="music-mini-time" aria-hidden="true">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div class="music-mini-actions">
        <button
          class="music-mini-button"
          type="button"
          onclick={previous}
          disabled={!playerReady || !queueLength}
          aria-label={$t('music.previousTrack')}
          title={$t('music.previousTrack')}
        >
          <MusicIcons name="previous" size={16} />
        </button>
        <button
          class="music-mini-button music-mini-button--primary"
          type="button"
          onclick={togglePlayback}
          disabled={!playerReady || !queueLength}
          aria-label={playing ? $t('music.pause') : $t('music.play')}
          title={playing ? $t('music.pause') : $t('music.play')}
        >
          <MusicIcons name={playing ? 'pause' : 'play'} size={16} filled={!playing} />
        </button>
        <button
          class="music-mini-button"
          type="button"
          onclick={next}
          disabled={!canGoNext}
          aria-label={$t('music.nextTrack')}
          title={$t('music.nextTrack')}
        >
          <MusicIcons name="next" size={16} />
        </button>
        <span class="music-mini-actions-divider" aria-hidden="true"></span>
        <button class="music-mini-button" type="button" onclick={toggleMute} aria-label={muted ? $t('music.unmute') : $t('music.mute')} title={muted ? $t('music.unmute') : $t('music.mute')}>
          <MusicIcons name={muted ? 'muted' : 'volume'} size={16} />
        </button>
      </div>
    </div>
  </div>
</div>
