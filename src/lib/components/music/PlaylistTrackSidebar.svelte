<script>
  import { tick } from 'svelte';
  import { t } from '../../i18n/index.js';
  import MusicIcons from './MusicIcons.svelte';

  const ROW_HEIGHT = 60;
  const OVERSCAN = 7;

  let {
    playlistTitle = '',
    tracks = [],
    currentTrack = null,
    loading = false,
    onSelect = () => {}
  } = $props();

  let query = $state('');
  let listEl = $state(null);
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let lastCurrentTrackId = '';
  let lastQuery = '';

  const filteredRows = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => {
        if (!normalized) return true;
        return `${track.title || ''} ${track.artist || ''}`.toLocaleLowerCase().includes(normalized);
      });
  });

  const startRow = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
  const visibleRowCount = $derived(Math.max(1, Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2));
  const endRow = $derived(Math.min(filteredRows.length, startRow + visibleRowCount));
  const visibleRows = $derived(filteredRows.slice(startRow, endRow));
  const virtualHeight = $derived(filteredRows.length * ROW_HEIGHT);
  const rowOffset = $derived(startRow * ROW_HEIGHT);

  function updateViewport() {
    if (!listEl) return;
    viewportHeight = listEl.clientHeight;
    scrollTop = listEl.scrollTop;
  }

  function handleScroll(event) {
    scrollTop = event.currentTarget.scrollTop;
  }

  async function focusVirtualRow(index) {
    if (!listEl || !filteredRows.length) return;
    const targetIndex = Math.max(0, Math.min(filteredRows.length - 1, index));
    const rowTop = targetIndex * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewportTop = listEl.scrollTop;
    const viewportBottom = viewportTop + listEl.clientHeight;

    if (rowTop < viewportTop || rowBottom > viewportBottom) {
      const centeredTop = Math.max(0, rowTop - Math.max(0, (listEl.clientHeight - ROW_HEIGHT) / 2));
      listEl.scrollTop = centeredTop;
      scrollTop = centeredTop;
      await tick();
    }

    listEl.querySelector(`[data-virtual-row="${targetIndex}"]`)?.focus();
  }

  function handleRowKeydown(event, index) {
    let targetIndex = null;
    if (event.key === 'ArrowDown') targetIndex = index + 1;
    else if (event.key === 'ArrowUp') targetIndex = index - 1;
    else if (event.key === 'Home') targetIndex = 0;
    else if (event.key === 'End') targetIndex = filteredRows.length - 1;
    if (targetIndex === null) return;

    event.preventDefault();
    void focusVirtualRow(targetIndex);
  }

  $effect(() => {
    if (!listEl) return;
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(listEl);
    return () => observer.disconnect();
  });

  $effect(() => {
    const nextQuery = query;
    if (nextQuery === lastQuery) return;
    lastQuery = nextQuery;
    scrollTop = 0;
    if (listEl) listEl.scrollTop = 0;
  });

  $effect(() => {
    const currentId = currentTrack?.playlistItemId || '';
    if (!currentId || currentId === lastCurrentTrackId || !listEl) return;
    lastCurrentTrackId = currentId;

    const index = filteredRows.findIndex(({ track }) => track.playlistItemId === currentId);
    if (index < 0) return;

    const rowTop = index * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewportTop = listEl.scrollTop;
    const viewportBottom = viewportTop + listEl.clientHeight;
    if (rowTop < viewportTop || rowBottom > viewportBottom) {
      const nextTop = Math.max(0, rowTop - ROW_HEIGHT * 2);
      listEl.scrollTo({ top: nextTop, behavior: 'auto' });
      scrollTop = nextTop;
    }
  });
</script>

<aside class="music-track-sidebar" aria-label={$t('music.queueLabel')}>
  <header class="music-track-sidebar-header">
    <div class="music-track-sidebar-heading">
      <p class="music-eyebrow">{$t('music.queueEyebrow')}</p>
      <h3>{playlistTitle || $t('music.playlist')}</h3>
    </div>
    <span class="music-track-count">
      {query.trim() ? `${filteredRows.length}/${tracks.length}` : String(tracks.length).padStart(2, '0')}
    </span>
  </header>

  {#if !loading && tracks.length}
    <label class="music-track-search" for="music-track-search">
      <span aria-hidden="true"><MusicIcons name="search" size={13} /></span>
      <input
        id="music-track-search"
        type="search"
        bind:value={query}
        placeholder={$t('music.searchTracks')}
        aria-label={$t('music.searchTracks')}
        autocomplete="off"
        spellcheck="false"
      />
    </label>
  {/if}

  {#if loading}
    <div class="music-list-state music-list-state--sidebar" aria-live="polite">
      <span class="music-loader music-loader--small" aria-hidden="true"></span>
      <div><strong>{$t('music.loadingTracks')}</strong><span>{$t('music.loadingTracksBody')}</span></div>
    </div>
  {:else if !tracks.length}
    <div class="music-list-state music-list-state--sidebar">
      <div><strong>{$t('music.emptyPlaylist')}</strong><span>{$t('music.emptyPlaylistBody')}</span></div>
    </div>
  {:else if !filteredRows.length}
    <div class="music-list-state music-list-state--sidebar">
      <div><strong>{$t('music.trackSearchEmpty')}</strong><span>{$t('music.trackSearchEmptyBody')}</span></div>
    </div>
  {:else}
    <div class="music-track-list" bind:this={listEl} onscroll={handleScroll}>
      <div class="music-track-virtualizer" style={`height:${virtualHeight}px`}>
        <div class="music-track-window" style={`transform:translateY(${rowOffset}px)`}>
          {#each visibleRows as row, windowIndex (row.track.playlistItemId)}
            <button
              class="music-track-row"
              class:is-current={currentTrack?.playlistItemId === row.track.playlistItemId}
              type="button"
              onclick={() => onSelect(row.index)}
              onkeydown={(event) => handleRowKeydown(event, startRow + windowIndex)}
              data-virtual-row={startRow + windowIndex}
              aria-label={`${$t('music.playTrack')}: ${row.track.title} — ${row.track.artist}`}
              aria-current={currentTrack?.playlistItemId === row.track.playlistItemId ? 'true' : undefined}
            >
              <span class="music-track-index">{String(row.index + 1).padStart(2, '0')}</span>
              <span class="music-track-thumb">
                {#if row.track.thumbnailUrl}
                  <img src={row.track.thumbnailUrl} alt="" loading="lazy" referrerpolicy="no-referrer" />
                {:else}
                  <span aria-hidden="true">YT</span>
                {/if}
              </span>
              <span class="music-track-copy">
                <strong>{row.track.title}</strong>
                <small>{row.track.artist}</small>
              </span>
              <span class="music-track-action" aria-hidden="true">
                {#if currentTrack?.playlistItemId === row.track.playlistItemId}
                  <span class="music-equalizer"><i></i><i></i><i></i></span>
                {:else}
                  <span>▶</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</aside>
