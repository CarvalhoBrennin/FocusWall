<script>
  import { onDestroy, untrack } from 'svelte';
  import {
    folderLabel,
    loadOpencodeRecents,
    pickProjectDir,
    rememberOpencodeDir,
    searchProjectDirs
  } from '../services/opencode.js';
  import { showToast } from '../stores/ui-store.js';

  /** @type {{ active?: boolean, onStart?: (path: string) => void }} */
  let { active = false, onStart = () => {} } = $props();

  let query = $state('');
  let selectedPath = $state('');
  let recents = $state(loadOpencodeRecents());
  let results = $state([]);
  let searching = $state(false);
  let browsing = $state(false);
  let browseError = $state('');
  let hydrated = $state(false);

  /** @type {ReturnType<typeof setTimeout> | null} */
  let searchTimer = null;
  let searchRequestId = 0;

  function mergeEntries(entries) {
    const map = new Map();

    for (const path of recents) {
      map.set(path, {
        path,
        name: folderLabel(path),
        isGit: false,
        isRecent: true
      });
    }

    for (const entry of entries) {
      map.set(entry.path, {
        path: entry.path,
        name: entry.name,
        isGit: entry.isGit,
        isRecent: recents.includes(entry.path)
      });
    }

    return [...map.values()];
  }

  async function runSearch(value) {
    const requestId = ++searchRequestId;
    searching = true;
    try {
      const found = await searchProjectDirs(value, 24);
      if (requestId !== searchRequestId) return;
      results = mergeEntries(found);
    } catch (err) {
      if (requestId !== searchRequestId) return;
      results = mergeEntries([]);
      showToast(err?.message || 'Falha ao buscar pastas.');
    } finally {
      if (requestId === searchRequestId) {
        searching = false;
      }
    }
  }

  function scheduleSearch(value) {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(value), 220);
  }

  function selectPath(path) {
    selectedPath = path;
    browseError = '';
  }

  async function browseFolder() {
    browsing = true;
    browseError = '';
    try {
      const picked = await pickProjectDir(selectedPath || recents[0] || null);
      if (picked) {
        selectedPath = picked;
        rememberOpencodeDir(picked);
        recents = loadOpencodeRecents();
        scheduleSearch(query);
      }
    } catch (err) {
      browseError = err?.message || 'Não foi possível abrir o seletor de pastas.';
      showToast(browseError);
    } finally {
      browsing = false;
    }
  }

  function startOpenCode() {
    if (!selectedPath) return;
    rememberOpencodeDir(selectedPath);
    onStart(selectedPath);
  }

  function handleSearchInput(event) {
    query = event.currentTarget.value;
    scheduleSearch(query);
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && selectedPath) {
      event.preventDefault();
      startOpenCode();
    }
  }

  $effect(() => {
    if (!active) {
      hydrated = false;
      return;
    }
    if (hydrated) return;

    hydrated = true;
    untrack(() => {
      recents = loadOpencodeRecents();
      if (!selectedPath && recents[0]) {
        selectedPath = recents[0];
      }
      runSearch('');
    });
  });

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
    searchRequestId += 1;
  });
</script>

<section class="opencode-launcher" aria-label="Escolher repositório para o OpenCode">
  <div class="opencode-launcher-copy">
    <h2 class="opencode-launcher-title">Escolha onde iniciar.</h2>
    <p class="opencode-launcher-note">Busque pastas recentes ou abra o seletor nativo do Windows.</p>
  </div>

  <div class="opencode-launcher-toolbar">
    <label class="sr-only" for="opencode-search">Buscar repositório</label>
    <input
      id="opencode-search"
      class="opencode-search"
      type="search"
      placeholder="Buscar por nome de pasta..."
      autocomplete="off"
      spellcheck="false"
      value={query}
      oninput={handleSearchInput}
      onkeydown={handleKeydown}
    />
    <button class="ghost-button" type="button" disabled={browsing} onclick={browseFolder}>
      {browsing ? 'Abrindo...' : 'Escolher pasta'}
    </button>
  </div>

  {#if browseError}
    <p class="opencode-launcher-error" role="alert">{browseError}</p>
  {/if}

  <div class="opencode-launcher-body">
    {#if searching && results.length === 0}
      <p class="opencode-launcher-status">Procurando pastas...</p>
    {:else if results.length === 0}
      <p class="opencode-launcher-status">Nenhuma pasta encontrada. Use "Escolher pasta".</p>
    {:else}
      <ul class="opencode-project-list" aria-label="Pastas disponíveis">
        {#each results as entry (entry.path)}
          <li>
            <button
              class="opencode-project-item"
              class:is-selected={selectedPath === entry.path}
              type="button"
              aria-pressed={selectedPath === entry.path}
              onclick={() => selectPath(entry.path)}
            >
              <span class="opencode-project-name">{entry.name}</span>
              <span class="opencode-project-path">{entry.path}</span>
              <span class="opencode-project-tags">
                {#if entry.isRecent}
                  <span class="opencode-tag">Recente</span>
                {/if}
                {#if entry.isGit}
                  <span class="opencode-tag opencode-tag--git">Git</span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="opencode-launcher-footer">
    <div class="opencode-selected">
      <span class="opencode-selected-label">Pasta selecionada</span>
      <span class="opencode-selected-path">
        {selectedPath || 'Nenhuma pasta selecionada'}
      </span>
    </div>
    <button
      class="primary-button"
      type="button"
      disabled={!selectedPath}
      onclick={startOpenCode}
    >
      Iniciar OpenCode
    </button>
  </footer>
</section>
