<script>
  import { toSidebarLabel } from '../../services/files.js';

  const {
    places = [],
    favorites = [],
    recents = [],
    currentPath = '',
    onNavigate = () => {}
  } = $props();
</script>

<aside class="files-sidebar" aria-label="Locais e favoritos">
  <section class="files-sidebar-section">
    <h3 class="files-sidebar-title">Locais</h3>
    <ul class="files-sidebar-list">
      {#each places as place (place.id)}
        <li>
          <button
            type="button"
            class="files-sidebar-item"
            class:is-active={currentPath === place.path}
            title={place.path}
            onclick={() => onNavigate(place.path)}
          >
            <span class="files-sidebar-icon" aria-hidden="true">◆</span>
            <span class="files-sidebar-label">{place.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>

  {#if favorites.length > 0}
    <section class="files-sidebar-section">
      <h3 class="files-sidebar-title">Favoritos</h3>
      <ul class="files-sidebar-list">
        {#each favorites as path (path)}
          <li>
            <button
              type="button"
              class="files-sidebar-item"
              class:is-active={currentPath === path}
              title={path}
              onclick={() => onNavigate(path)}
            >
              <span class="files-sidebar-icon files-sidebar-icon--star" aria-hidden="true">★</span>
              <span class="files-sidebar-label">{toSidebarLabel(path)}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if recents.length > 0}
    <section class="files-sidebar-section">
      <h3 class="files-sidebar-title">Recentes</h3>
      <ul class="files-sidebar-list">
        {#each recents as path (path)}
          <li>
            <button
              type="button"
              class="files-sidebar-item"
              class:is-active={currentPath === path}
              title={path}
              onclick={() => onNavigate(path)}
            >
              <span class="files-sidebar-icon" aria-hidden="true">↩</span>
              <span class="files-sidebar-label">{toSidebarLabel(path)}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</aside>

<style>
  .files-sidebar {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
    overflow-y: auto;
    padding: 0.55rem 0.5rem;
    border: 1px solid var(--control-border-soft);
    background:
      linear-gradient(180deg, var(--glare-soft), var(--glare-faint)),
      var(--panel-bg-soft);
  }

  .files-sidebar-section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .files-sidebar-title {
    margin: 0;
    padding: 0 0.25rem;
    color: var(--light-soft);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .files-sidebar-list {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .files-sidebar-item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: 100%;
    padding: 0.42rem 0.45rem;
    border: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--light-muted);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .files-sidebar-item:hover,
  .files-sidebar-item.is-active {
    color: var(--light-strong);
    border-color: var(--control-border-soft);
    background: var(--control-bg);
  }

  .files-sidebar-item.is-active {
    border-color: rgba(207, 206, 205, 0.22);
  }

  .files-sidebar-icon {
    flex-shrink: 0;
    width: 1rem;
    text-align: center;
    color: var(--accent-strong);
    font-size: 0.72rem;
  }

  .files-sidebar-icon--star {
    color: var(--accent-gold);
  }

  .files-sidebar-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .files-sidebar::-webkit-scrollbar {
    width: 6px;
  }

  .files-sidebar::-webkit-scrollbar-thumb {
    background: var(--surface-dark-border);
  }
</style>
