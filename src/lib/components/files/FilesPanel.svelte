<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import FilesToolbar from './FilesToolbar.svelte';
  import FilesList from './FilesList.svelte';
  import { data, setFilesLastPath } from '../../stores/app-store.js';
  import { isTauri, tauriInvoke } from '../../utils/tauri.js';

  let currentPath = $state('');
  let entries = $state([]);
  let loading = $state(true);
  let errorMsg = $state(null);

  onMount(() => {
    if (!isTauri()) {
      errorMsg = 'API de arquivos indisponível no modo navegador.';
      loading = false;
      return;
    }
    loadInitialPath();
  });

  async function loadInitialPath() {
    try {
      const saved = get(data).ui?.filesLastPath;
      if (saved) {
        await readDir(saved);
        return;
      }
      currentPath = await tauriInvoke('get_desktop_path');
      await readDir(currentPath);
    } catch (err) {
      const msg = String(err.message || err);
      if (msg.includes('get_desktop_path') || msg.includes('not allowed')) {
        errorMsg = 'Permissão negada para acessar arquivos. Recompile com "npm run tauri:build" e abra via abrir-dashboard.bat.';
      } else {
        errorMsg = msg;
      }
      loading = false;
    }
  }

  async function readDir(path) {
    loading = true;
    errorMsg = null;
    try {
      entries = await tauriInvoke('read_directory', { path });
      currentPath = path;
      await setFilesLastPath(path);
    } catch (err) {
      errorMsg = String(err.message || err);
    } finally {
      loading = false;
    }
  }

  async function handleNavigate(path) {
    await readDir(path);
  }

  async function handleOpen(path) {
    try {
      await tauriInvoke('open_file', { path });
    } catch (err) {
      errorMsg = String(err.message || err);
    }
  }
</script>

<div class="files-panel">
  {#if loading && entries.length === 0}
    <p class="files-status">Carregando...</p>
  {:else if errorMsg}
    <p class="files-error">{errorMsg}</p>
  {:else}
    <FilesToolbar {currentPath} onNavigate={handleNavigate} />
    <FilesList {entries} onNavigate={handleNavigate} onOpen={handleOpen} />

    {#if loading}
      <p class="files-status">Carregando...</p>
    {/if}
  {/if}
</div>

<style>
  .files-panel {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .files-status {
    margin: auto;
    padding: 1.5rem 1rem;
    color: var(--light-muted);
    font-size: 0.88rem;
    font-weight: 700;
    text-align: center;
  }

  .files-error {
    margin: auto;
    padding: 1rem 1.25rem;
    max-width: 28rem;
    border: 1px solid rgba(181, 92, 80, 0.24);
    background: rgba(181, 92, 80, 0.08);
    color: var(--danger);
    font-size: 0.88rem;
    line-height: 1.45;
    text-align: center;
  }
</style>
