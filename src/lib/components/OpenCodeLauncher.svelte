<script>
  import { onDestroy, untrack } from 'svelte';
  import {
    folderLabel,
    loadOpencodeRecents,
    pickProjectDir,
    rememberOpencodeDir,
    searchProjectDirs,
    validateProjectDirectory
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
  let starting = $state(false);
  let selectedProjectIndex = $derived(results.findIndex((entry) => entry.path === selectedPath));

  /** @type {ReturnType<typeof setTimeout> | null} */
  let searchTimer = null;
  let searchRequestId = 0;

  function errorMessage(err, fallback) {
    if (typeof err === 'string') return err;
    return err?.message || fallback;
  }

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
      showToast(errorMessage(err, 'Falha ao buscar pastas.'));
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

  async function startOpenCode(path = selectedPath) {
    if (!path || starting) return;

    starting = true;
    try {
      const canonical = await validateProjectDirectory(path);
      selectedPath = canonical;
      rememberOpencodeDir(canonical);
      onStart(canonical);
    } catch (err) {
      showToast(errorMessage(err, 'Falha ao validar diretorio.'));
    } finally {
      starting = false;
    }
  }

  function handleSearchInput(event) {
    query = event.currentTarget.value;
    scheduleSearch(query);
  }

  function handleProjectKeydown(event) {
    const items = [...event.currentTarget.querySelectorAll('.opencode-project-item')];
    const currentIndex = items.indexOf(document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = currentIndex < items.length - 1 ? items[currentIndex + 1] : items[0];
      next?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = currentIndex > 0 ? items[currentIndex - 1] : items[items.length - 1];
      prev?.focus();
    } else if (event.key === 'Enter' && document.activeElement?.closest('.opencode-project-item')) {
      event.preventDefault();
      const path = document.activeElement.dataset.path || '';
      selectPath(path);
      startOpenCode(path);
    }
  }

  function handleKeydown(event) {
    if (event.isComposing || event.key !== 'Enter' || !selectedPath || starting) return;
    event.preventDefault();
    startOpenCode();
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
    <div class="opencode-terminal-line" aria-hidden="true">
      <span>C:\FocusWall&gt;</span>
      <code>opencode serve --hostname 127.0.0.1 --port auto</code>
    </div>
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
      {#if searching}
        <p class="opencode-launcher-searching">Buscando...</p>
      {/if}
      <div
        class="opencode-project-list"
        role="listbox"
        aria-label="Pastas disponiveis"
        aria-activedescendant={selectedProjectIndex >= 0 ? `opencode-project-${selectedProjectIndex}` : undefined}
        tabindex="0"
        onkeydown={handleProjectKeydown}
      >
        {#each results as entry, index (entry.path)}
          <button
            id={`opencode-project-${index}`}
            class="opencode-project-item"
            class:is-selected={selectedPath === entry.path}
            type="button"
            role="option"
            aria-selected={selectedPath === entry.path}
            data-path={entry.path}
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
        {/each}
      </div>
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
      disabled={!selectedPath || starting}
      onclick={() => startOpenCode()}
    >
      {starting ? 'Iniciando...' : 'Iniciar OpenCode'}
    </button>
  </footer>
</section>
