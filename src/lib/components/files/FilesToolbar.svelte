<script>
  import { buildPathSegments, parentDirectory } from '../../utils/path.js';

  const {
    currentPath,
    searchQuery = '',
    sortBy = 'name',
    showHidden = false,
    isFavorite = false,
    onNavigate,
    onSearchChange = () => {},
    onSortChange = () => {},
    onToggleHidden = () => {},
    onRefresh = () => {},
    onPickFolder = () => {},
    onOpenExplorer = () => {},
    onToggleFavorite = () => {}
  } = $props();

  const segments = $derived(buildPathSegments(currentPath));
  const parentPath = $derived(parentDirectory(currentPath));
</script>

<div class="files-toolbar">
  <div class="files-toolbar-row files-toolbar-row--primary">
    <div class="files-crumbline">
      {#if parentPath}
        <button
          class="files-back-btn"
          type="button"
          aria-label="Voltar para pasta pai"
          title="Pasta anterior"
          onclick={() => onNavigate(parentPath)}
        >
          &lt;
        </button>
      {/if}

      <div class="files-crumbs" title={currentPath}>
        {#each segments as seg, index (seg.path)}
          {#if index > 0}
            <span class="files-crumb-sep" aria-hidden="true">/</span>
          {/if}
          {#if seg.isLast}
            <span class="files-crumb files-crumb--current">{seg.name}</span>
          {:else}
            <button
              class="files-crumb"
              type="button"
              onclick={() => onNavigate(seg.path)}
            >
              {seg.name}
            </button>
          {/if}
        {/each}
      </div>
    </div>

    <div class="files-toolbar-actions">
      <button
        class="files-icon-btn"
        type="button"
        class:is-active={isFavorite}
        disabled={!currentPath}
        aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        title={isFavorite ? 'Remover favorito' : 'Favoritar pasta'}
        onclick={onToggleFavorite}
      >
        {isFavorite ? '★' : '☆'}
      </button>
      <button
        class="files-icon-btn"
        type="button"
        aria-label="Atualizar lista"
        title="Atualizar"
        onclick={onRefresh}
      >
        ↻
      </button>
      <button class="ghost-button files-action-btn" type="button" onclick={onPickFolder}>
        Explorar…
      </button>
      <button class="ghost-button files-action-btn" type="button" onclick={onOpenExplorer}>
        No Explorer
      </button>
    </div>
  </div>

  <div class="files-toolbar-row files-toolbar-row--secondary">
    <label class="files-search-wrap">
      <span class="sr-only">Buscar nesta pasta</span>
      <input
        class="files-search"
        type="search"
        placeholder="Buscar arquivo ou pasta…"
        autocomplete="off"
        spellcheck="false"
        value={searchQuery}
        oninput={(e) => onSearchChange(e.currentTarget.value)}
      />
    </label>

    <label class="files-sort-wrap">
      <span class="files-sort-label">Ordenar</span>
      <select
        class="files-sort"
        value={sortBy}
        onchange={(e) => onSortChange(e.currentTarget.value)}
      >
        <option value="name">Nome</option>
        <option value="date">Data</option>
        <option value="size">Tamanho</option>
      </select>
    </label>

    <label class="files-hidden-toggle">
      <input
        type="checkbox"
        checked={showHidden}
        onchange={(e) => onToggleHidden(e.currentTarget.checked)}
      />
      <span>Ocultos</span>
    </label>
  </div>
</div>

<style>
  .files-toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--control-border-soft);
    background:
      linear-gradient(180deg, var(--glare-soft), var(--glare-faint)),
      var(--panel-bg-soft);
    flex-shrink: 0;
  }

  .files-toolbar-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .files-toolbar-row--primary {
    justify-content: space-between;
  }

  .files-toolbar-row--secondary {
    flex-wrap: wrap;
  }

  .files-crumbline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex: 1;
  }

  .files-back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    flex-shrink: 0;
    border: 1px solid var(--control-border-strong);
    border-radius: 0;
    background: var(--field-bg);
    color: var(--light-main);
    font: inherit;
    font-size: 0.95rem;
    font-weight: 800;
    cursor: pointer;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .files-back-btn:hover {
    transform: translateY(-1px);
    border-color: rgba(207, 206, 205, 0.28);
    background: var(--field-bg-hover);
  }

  .files-crumbs {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-width: 0;
    overflow: hidden;
  }

  .files-crumb-sep {
    color: var(--light-soft);
    font-size: 0.88rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .files-crumb {
    display: inline-flex;
    align-items: center;
    padding: 0.22rem 0.35rem;
    border: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--light-muted);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .files-crumb:hover {
    color: var(--light-main);
    background: var(--control-bg);
  }

  .files-crumb--current {
    color: var(--light-strong);
    font-weight: 800;
    cursor: default;
    font-family: var(--font-display);
    font-size: 0.78rem;
  }

  .files-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .files-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.2rem;
    min-height: 2.2rem;
    padding: 0.35rem;
    border: 1px solid var(--control-border-strong);
    border-radius: 0;
    background: var(--field-bg);
    color: var(--light-main);
    font: inherit;
    font-size: 1rem;
    cursor: pointer;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .files-icon-btn:hover {
    transform: translateY(-1px);
    border-color: rgba(207, 206, 205, 0.28);
    background: var(--field-bg-hover);
  }

  .files-icon-btn.is-active {
    color: var(--accent-gold);
    border-color: rgba(183, 177, 177, 0.28);
  }

  .files-action-btn {
    min-height: 2.2rem;
    padding: 0.4rem 0.7rem;
    font-size: 0.76rem;
    white-space: nowrap;
  }

  .files-search-wrap {
    display: flex;
    flex: 1;
    min-width: 10rem;
  }

  .files-search {
    width: 100%;
    min-height: 2.2rem;
    padding: 0.45rem 0.65rem;
    border: 1px solid var(--control-border-strong);
    border-radius: 0;
    background: var(--field-bg);
    color: var(--light-main);
    font: inherit;
    font-size: 0.84rem;
    font-weight: 600;
  }

  .files-search:focus {
    outline: none;
    border-color: rgba(207, 206, 205, 0.32);
    background: var(--field-bg-hover);
  }

  .files-sort-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .files-sort-label {
    color: var(--light-soft);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .files-sort {
    min-height: 2.2rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--control-border-strong);
    border-radius: 0;
    background: var(--field-bg);
    color: var(--light-main);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .files-hidden-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--light-muted);
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
  }

  .files-hidden-toggle input {
    accent-color: var(--accent);
  }
</style>
