<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import FilesSidebar from './FilesSidebar.svelte';
  import FilesToolbar from './FilesToolbar.svelte';
  import FilesList from './FilesList.svelte';
  import { data, setFilesLastPath } from '../../stores/app-store.js';
  import { showToast } from '../../stores/ui-store.js';
  import { isTauri } from '../../utils/tauri.js';
  import { ensureAbsolutePath } from '../../utils/path.js';
  import {
    getWellKnownFolders,
    readDirectory,
    openPath,
    pickFolder,
    filterEntries,
    sortEntries,
    rememberFilesPath,
    loadFilesFavorites,
    loadFilesRecents,
    toggleFilesFavorite,
    isFilesFavorite
  } from '../../services/files.js';

  let currentPath = $state('');
  let rawEntries = $state([]);
  let places = $state([]);
  let favorites = $state(loadFilesFavorites());
  let recents = $state(loadFilesRecents());
  let loading = $state(true);
  let errorMsg = $state(null);
  let searchQuery = $state('');
  /** @type {'name' | 'date' | 'size'} */
  let sortBy = $state('name');
  let showHidden = $state(false);

  const displayEntries = $derived(
    sortEntries(filterEntries(rawEntries, searchQuery), sortBy)
  );
  const isFavorite = $derived(isFilesFavorite(currentPath, favorites));

  onMount(() => {
    if (!isTauri()) {
      errorMsg = 'Explorador de arquivos disponível apenas no app desktop (Tauri).';
      loading = false;
      return;
    }
    loadInitial();
  });

  async function loadInitial() {
    try {
      places = await getWellKnownFolders();
      const saved = get(data).ui?.filesLastPath;
      if (saved && ensureAbsolutePath(saved)) {
        await readDir(saved);
        return;
      }
      const desktop = places.find((place) => place.id === 'desktop');
      await readDir(desktop?.path || places[0]?.path || '');
    } catch (err) {
      reportError(err, 'Não foi possível iniciar o explorador.');
      loading = false;
    }
  }

  function reportError(err, fallback) {
    const msg = String(err?.message || err || fallback);
    errorMsg = msg;
    showToast(msg);
  }

  async function readDir(path) {
    const absolute = ensureAbsolutePath(path);
    if (!absolute) return;
    loading = true;
    errorMsg = null;
    try {
      rawEntries = await readDirectory(absolute, showHidden);
      currentPath = absolute;
      rememberFilesPath(absolute);
      recents = loadFilesRecents();
      await setFilesLastPath(path);
    } catch (err) {
      reportError(err, 'Não foi possível ler esta pasta.');
    } finally {
      loading = false;
    }
  }

  async function handleNavigate(path) {
    await readDir(path);
  }

  async function handleOpen(path) {
    try {
      await openPath(path);
    } catch (err) {
      reportError(err, 'Não foi possível abrir o item.');
    }
  }

  async function handlePickFolder() {
    try {
      const picked = await pickFolder(currentPath || null);
      if (picked) await readDir(picked);
    } catch (err) {
      reportError(err, 'Não foi possível abrir o seletor de pastas.');
    }
  }

  async function handleOpenExplorer() {
    if (!currentPath) return;
    try {
      await openPath(currentPath);
    } catch (err) {
      reportError(err, 'Não foi possível abrir no Explorer.');
    }
  }

  function handleToggleFavorite() {
    favorites = toggleFilesFavorite(currentPath);
    showToast(
      isFilesFavorite(currentPath, favorites)
        ? 'Pasta adicionada aos favoritos.'
        : 'Pasta removida dos favoritos.'
    );
  }

  async function handleToggleHidden(checked) {
    showHidden = checked;
    if (currentPath) await readDir(currentPath);
  }

  async function handleRefresh() {
    if (currentPath) await readDir(currentPath);
  }
</script>

<div class="files-panel">
  {#if loading && !currentPath}
    <p class="files-status">Carregando explorador…</p>
  {:else if errorMsg && !currentPath}
    <p class="files-error" role="alert">{errorMsg}</p>
  {:else}
    <div class="files-explorer">
      <FilesSidebar
        {places}
        {favorites}
        {recents}
        {currentPath}
        onNavigate={handleNavigate}
      />

      <div class="files-main">
        <FilesToolbar
          {currentPath}
          {searchQuery}
          {sortBy}
          {showHidden}
          {isFavorite}
          onNavigate={handleNavigate}
          onSearchChange={(value) => (searchQuery = value)}
          onSortChange={(value) => (sortBy = value)}
          onToggleHidden={handleToggleHidden}
          onRefresh={handleRefresh}
          onPickFolder={handlePickFolder}
          onOpenExplorer={handleOpenExplorer}
          onToggleFavorite={handleToggleFavorite}
        />

        {#if errorMsg}
          <p class="files-inline-error" role="alert">{errorMsg}</p>
        {/if}

        <FilesList
          entries={displayEntries}
          {searchQuery}
          onNavigate={handleNavigate}
          onOpen={handleOpen}
        />

        <footer class="files-footer">
          <span>
            {displayEntries.length} item{displayEntries.length === 1 ? '' : 's'}
            {#if searchQuery.trim()}
              (filtrado)
            {/if}
          </span>
          {#if loading}
            <span class="files-footer-loading">Atualizando…</span>
          {/if}
        </footer>
      </div>
    </div>
  {/if}
</div>

<style>
  .files-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .files-explorer {
    display: grid;
    grid-template-columns: minmax(11rem, 13.5rem) minmax(0, 1fr);
    gap: 0.65rem;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .files-main {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .files-status,
  .files-error {
    margin: auto;
    padding: 1.5rem 1rem;
    text-align: center;
    font-size: 0.88rem;
  }

  .files-status {
    color: var(--light-muted);
    font-weight: 700;
  }

  .files-error {
    max-width: 28rem;
    border: 1px solid rgba(181, 92, 80, 0.24);
    background: rgba(181, 92, 80, 0.08);
    color: var(--danger);
    line-height: 1.45;
  }

  .files-inline-error {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border: 1px solid rgba(181, 92, 80, 0.2);
    background: rgba(181, 92, 80, 0.06);
    color: var(--danger);
    font-size: 0.82rem;
  }

  .files-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.35rem 0.15rem 0.1rem;
    color: var(--light-soft);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .files-footer-loading {
    color: var(--accent-strong);
  }

  @media (max-width: 920px) {
    .files-explorer {
      grid-template-columns: 1fr;
    }

    .files-sidebar {
      max-height: 10rem;
    }
  }
</style>
