<script>
  import { isTauri } from '../../utils/tauri.js';
  import {
    connectYouTubeMusic,
    getMusicAuthStatus,
    listYouTubePlaylistItems,
    listYouTubePlaylists
  } from '../../services/youtube-music.js';
  import { musicSettingsRevision } from '../../stores/ui-store.js';
  import { t } from '../../i18n/index.js';
  import { clampTrackIndex } from './player-queue.js';
  import MusicIcons from './MusicIcons.svelte';
  import PlaylistTrackSidebar from './PlaylistTrackSidebar.svelte';
  import YouTubePlayer from './YouTubePlayer.svelte';
  import './music.css';

  let { active = false } = $props();

  let auth = $state({ configured: false, clientSecretConfigured: false, authenticated: false, clientId: '', authInProgress: false });
  let loadingAuth = $state(true);
  let connecting = $state(false);
  let playlistsLoading = $state(false);
  let tracksLoading = $state(false);
  let errorMessage = $state('');
  let infoMessage = $state('');
  let playlists = $state([]);
  let selectedPlaylist = $state(null);
  let tracks = $state([]);
  let currentTrack = $state(null);
  let playlistQuery = $state('');
  let playSequence = 0;
  let playRequest = $state(null);
  let musicView = $state('library');
  let authLoaded = $state(false);
  let lastAuthSettingsRevision = -1;

  let authRequestSequence = 0;
  let playlistsRequestSequence = 0;
  let tracksRequestSequence = 0;

  const desktop = isTauri();
  const filteredPlaylists = $derived.by(() => {
    const query = playlistQuery.trim().toLocaleLowerCase();
    if (!query) return playlists;
    return playlists.filter((playlist) => playlist.title?.toLocaleLowerCase().includes(query));
  });

  function playlistCountLabel(count) {
    return `${count} ${$t(count === 1 ? 'music.playlist' : 'music.playlists')}`;
  }

  function trackCountLabel(count) {
    return `${count} ${$t(count === 1 ? 'music.track' : 'music.tracks')}`;
  }

  async function loadAuthStatus({ showLoading = false } = {}) {
    const requestId = ++authRequestSequence;
    if (!desktop) {
      loadingAuth = false;
      authLoaded = true;
      return;
    }

    if (showLoading) loadingAuth = true;
    errorMessage = '';
    infoMessage = '';
    try {
      const nextAuth = await getMusicAuthStatus();
      if (requestId !== authRequestSequence) return;

      auth = nextAuth;
      if (auth.authenticated) void refreshPlaylists();
    } catch (error) {
      if (requestId === authRequestSequence) {
        errorMessage = error?.message || String(error);
      }
    } finally {
      if (requestId === authRequestSequence) {
        loadingAuth = false;
        authLoaded = true;
      }
    }
  }

  async function connect() {
    authRequestSequence += 1;
    connecting = true;
    errorMessage = '';
    infoMessage = $t('music.authorizationBrowser');

    try {
      auth = await connectYouTubeMusic();
      infoMessage = $t('music.accountConnected');
      await refreshPlaylists();
    } catch (error) {
      infoMessage = '';
      errorMessage = error?.message || String(error);
    } finally {
      connecting = false;
    }
  }

  async function refreshPlaylists() {
    const requestId = ++playlistsRequestSequence;
    playlistsLoading = true;
    errorMessage = '';

    try {
      const nextPlaylists = await listYouTubePlaylists();
      if (requestId !== playlistsRequestSequence) return;

      playlists = nextPlaylists;
      if (selectedPlaylist) {
        selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylist.id) || null;
        if (!selectedPlaylist) {
          tracksRequestSequence += 1;
          tracks = [];
          tracksLoading = false;
          musicView = 'library';
        }
      }
    } catch (error) {
      if (requestId === playlistsRequestSequence) {
        errorMessage = error?.message || String(error);
      }
    } finally {
      if (requestId === playlistsRequestSequence) playlistsLoading = false;
    }
  }

  async function selectPlaylist(playlist) {
    if (!playlist?.id) return;

    const requestId = ++tracksRequestSequence;
    const playlistId = playlist.id;
    selectedPlaylist = playlist;
    musicView = 'playlist';
    tracksLoading = true;
    tracks = [];
    errorMessage = '';

    try {
      const nextTracks = await listYouTubePlaylistItems(playlistId);
      if (requestId !== tracksRequestSequence || selectedPlaylist?.id !== playlistId) return;

      tracks = nextTracks;
    } catch (error) {
      if (requestId === tracksRequestSequence && selectedPlaylist?.id === playlistId) {
        tracks = [];
        errorMessage = error?.message || String(error);
      }
    } finally {
      if (requestId === tracksRequestSequence && selectedPlaylist?.id === playlistId) {
        tracksLoading = false;
      }
    }
  }

  function startPlayback(index = 0, autoplay = true) {
    if (!tracks.length) return;

    const safeIndex = clampTrackIndex(index, tracks.length);
    if (safeIndex < 0) return;

    currentTrack = tracks[safeIndex];
    playRequest = {
      token: ++playSequence,
      playlistId: selectedPlaylist?.id || '',
      playlistTitle: selectedPlaylist?.title || '',
      // Keep one immutable queue reference; cloning thousands of tracks delays the first play.
      tracks,
      startIndex: safeIndex,
      autoplay
    };
  }

  function backToLibrary() {
    musicView = 'library';
  }

  function handleTrackChange(track) {
    currentTrack = track;
  }


  $effect(() => {
    const settingsRevision = $musicSettingsRevision;
    if (!active || (authLoaded && settingsRevision === lastAuthSettingsRevision)) return;

    lastAuthSettingsRevision = settingsRevision;
    void loadAuthStatus({ showLoading: !authLoaded });
  });
</script>

<div class="music-panel-root" role="region" aria-label={$t('music.panelLabel')}>
  {#if !desktop}
    <section class="music-state-shell">
      <div class="music-state-card">
        <div class="music-state-icon" aria-hidden="true"><MusicIcons name="play" size={22} /></div>
        <p class="music-eyebrow">{$t('music.desktopEyebrow')}</p>
        <h2>{$t('music.desktopTitle')}</h2>
        <p>{$t('music.desktopBody')}</p>
      </div>
    </section>
  {:else if loadingAuth}
    <section class="music-state-shell" aria-live="polite">
      <div class="music-state-card music-state-card--loading">
        <span class="music-loader" aria-hidden="true"></span>
        <p class="music-eyebrow">{$t('music.syncingEyebrow')}</p>
        <h2>{$t('music.syncingTitle')}</h2>
        <p>{$t('music.syncingBody')}</p>
      </div>
    </section>
  {:else if !auth.configured || !auth.clientSecretConfigured}
    <section class="music-state-shell">
      <div class="music-state-card">
        <div class="music-state-icon" aria-hidden="true"><MusicIcons name="settings" size={22} /></div>
        <p class="music-eyebrow">{$t('music.configurationEyebrow')}</p>
        <h2>{$t('music.configurationTitle')}</h2>
        <p>{$t('music.configurationBody')}</p>
      </div>
    </section>
  {:else if !auth.authenticated}
    <section class="music-state-shell">
      <div class="music-state-card">
        <div class="music-state-icon" aria-hidden="true"><MusicIcons name="play" size={22} filled /></div>
        <p class="music-eyebrow">{$t('music.youtubeEyebrow')}</p>
        <h2>{$t('music.connectTitle')}</h2>
        <p>{$t('music.connectBody')}</p>
        <button class="music-primary-action" type="button" onclick={connect} disabled={connecting}>
          {connecting ? $t('music.connecting') : $t('music.connectAction')}
        </button>
      </div>
    </section>
  {:else}
    <div class="music-workspace">
      {#if musicView === 'library'}
        <section class="music-library-view" aria-label={$t('music.libraryLabel')}>
          <header class="music-page-header music-library-header">
            <div class="music-page-heading">
              <p class="music-eyebrow">{$t('music.youtubeEyebrow')}</p>
              <div class="music-title-row">
                <h2>{$t('music.libraryTitle')}</h2>
                <span class="music-count-pill">{playlists.length}</span>
                <span class="music-connection-badge"><span aria-hidden="true"></span>{$t('music.connected')}</span>
              </div>
              <p>{$t('music.librarySubtitle')}</p>
            </div>

            <div class="music-library-actions">
              <label class="music-search-field" for="music-playlist-search">
                <span class="music-search-icon" aria-hidden="true"><MusicIcons name="search" size={14} /></span>
                <input
                  id="music-playlist-search"
                  type="search"
                  bind:value={playlistQuery}
                  placeholder={$t('music.searchPlaylists')}
                  aria-label={$t('music.searchPlaylists')}
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <button
                class="music-icon-button"
                type="button"
                onclick={refreshPlaylists}
                disabled={playlistsLoading}
                aria-label={$t('music.refreshPlaylists')}
                title={$t('music.refreshPlaylists')}
              >
                <MusicIcons name="refresh" size={17} />
              </button>
            </div>
          </header>

          <div class="music-library-content">
            {#if playlistsLoading}
              <div class="music-list-state" aria-live="polite">
                <span class="music-loader music-loader--small" aria-hidden="true"></span>
                <div><strong>{$t('music.libraryRefreshing')}</strong><span>{$t('music.libraryRefreshingBody')}</span></div>
              </div>
            {:else if !playlists.length}
              <div class="music-list-state">
                <div><strong>{$t('music.libraryEmpty')}</strong><span>{$t('music.libraryEmptyBody')}</span></div>
              </div>
            {:else if !filteredPlaylists.length}
              <div class="music-list-state">
                <div><strong>{$t('music.searchEmpty')}</strong><span>{$t('music.searchEmptyBody')}</span></div>
              </div>
            {:else}
              <div class="music-library-summary" aria-hidden="true">
                <span>{playlistCountLabel(filteredPlaylists.length)}</span>
                {#if playlistQuery.trim()}<span>{$t('music.filteredResult')}</span>{/if}
              </div>
              <div class="music-playlist-grid">
                {#each filteredPlaylists as playlist (playlist.id)}
                  <button
                    type="button"
                    class="music-playlist-card"
                    class:is-selected={selectedPlaylist?.id === playlist.id}
                    onclick={() => selectPlaylist(playlist)}
                    aria-label={`${$t('music.openPlaylist')}: ${playlist.title}`}
                  >
                    <span class="music-playlist-art">
                      {#if playlist.thumbnailUrl}
                        <img src={playlist.thumbnailUrl} alt="" loading="lazy" referrerpolicy="no-referrer" />
                      {:else}
                        <span class="music-art-fallback" aria-hidden="true">YT</span>
                      {/if}
                      <span class="music-playlist-art-shade" aria-hidden="true"></span>
                      <span class="music-playlist-play" aria-hidden="true"><MusicIcons name="play" size={18} filled /></span>
                    </span>
                    <span class="music-playlist-copy">
                      <strong>{playlist.title}</strong>
                      <small>{trackCountLabel(playlist.itemCount)}</small>
                    </span>
                    <span class="music-card-arrow" aria-hidden="true">↗</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </section>
      {:else}
        <section class="music-playlist-view" aria-label={$t('music.selectedPlaylistLabel')}>
          <header class="music-page-header music-page-header--playlist">
            <button class="music-back-button" type="button" onclick={backToLibrary} aria-label={$t('music.backToLibrary')}>
              <span aria-hidden="true">←</span>
              <span>{$t('music.libraryTitle')}</span>
            </button>

            <div class="music-playlist-heading-wrap">
              <span class="music-playlist-header-art" aria-hidden="true">
                {#if selectedPlaylist?.thumbnailUrl}
                  <img src={selectedPlaylist.thumbnailUrl} alt="" referrerpolicy="no-referrer" />
                {:else}
                  <span>YT</span>
                {/if}
              </span>
              <div class="music-page-heading music-page-heading--playlist">
                <p class="music-eyebrow">{$t('music.playlistEyebrow')}</p>
                <h2 title={selectedPlaylist?.title || $t('music.playlist')}>{selectedPlaylist?.title || $t('music.playlist')}</h2>
                <p>{tracksLoading ? $t('music.loadingTracks') : trackCountLabel(tracks.length)}</p>
              </div>
            </div>

            <div class="music-header-actions">
              {#if tracks.length}
                <button class="music-primary-action music-primary-action--compact" type="button" onclick={() => startPlayback(0)}>
                  <MusicIcons name="play" size={15} filled />
                  <span>{$t('music.playAll')}</span>
                </button>
              {/if}
              <button
                class="music-icon-button"
                type="button"
                onclick={() => selectPlaylist(selectedPlaylist)}
                disabled={tracksLoading}
                aria-label={$t('music.refreshTracks')}
                title={$t('music.refreshTracks')}
              >
                <MusicIcons name="refresh" size={17} />
              </button>
            </div>
          </header>

          <div class="music-playlist-body">
            <PlaylistTrackSidebar
              playlistTitle={selectedPlaylist?.title}
              {tracks}
              currentTrack={playRequest?.playlistId === selectedPlaylist?.id ? currentTrack : null}
              loading={tracksLoading}
              onSelect={startPlayback}
            />
            <div class="music-player-column" aria-hidden="true"></div>
          </div>
        </section>
      {/if}

      {#if musicView === 'playlist' || playRequest?.tracks?.length}
        <div
          class="music-player-persistent"
          class:is-mini={!active || musicView === 'library'}
          aria-hidden={!active || musicView === 'library'}
          inert={!active || musicView === 'library'}
        >
          <YouTubePlayer
            active={active}
            compact={!active || musicView === 'library'}
            {playRequest}
            onTrackChange={handleTrackChange}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if errorMessage}
    <div class="music-message music-message--error" class:is-above-mini={active && musicView === 'library' && Boolean(playRequest?.tracks?.length)} role="alert">
      <span class="music-message-code">ERR</span>
      <span>{errorMessage}</span>
      <button type="button" onclick={() => errorMessage = ''} aria-label={$t('music.dismissMessage')}>×</button>
    </div>
  {:else if infoMessage}
    <div class="music-message" class:is-above-mini={active && musicView === 'library' && Boolean(playRequest?.tracks?.length)} role="status">
      <span class="music-message-code">OK</span>
      <span>{infoMessage}</span>
      <button type="button" onclick={() => infoMessage = ''} aria-label={$t('music.dismissMessage')}>×</button>
    </div>
  {/if}
</div>
