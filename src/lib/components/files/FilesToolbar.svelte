<script>
  import { buildPathSegments, parentDirectory } from '../../utils/path.js';
  import { tauriInvoke } from '../../utils/tauri.js';

  const { currentPath, onNavigate } = $props();

  const segments = $derived(buildPathSegments(currentPath));
  const parentPath = $derived(parentDirectory(currentPath));

  async function openInExplorer() {
    await tauriInvoke('open_file', { path: currentPath });
  }
</script>

<div class="files-toolbar">
  <div class="files-crumbline">
    {#if parentPath}
      <button
        class="files-back-btn"
        type="button"
        aria-label="Voltar para pasta pai"
        onclick={() => onNavigate(parentPath)}
      >
        &lt;
      </button>
    {/if}

    <div class="files-crumbs">
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

  <button
    class="files-explorer-btn ghost-button"
    type="button"
    onclick={openInExplorer}
  >
    Abrir no Explorer
  </button>
</div>

<style>
  .files-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem;
    padding: 0.65rem 0.8rem;
    border: 1px solid rgba(241, 236, 236, 0.08);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.018)),
      rgba(10, 10, 10, 0.62);
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
    border: 1px solid rgba(241, 236, 236, 0.12);
    border-radius: 0;
    background: rgba(255, 255, 255, 0.05);
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
    background: rgba(255, 255, 255, 0.1);
  }

  .files-crumbs {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-width: 0;
    overflow: hidden;
  }

  .files-crumb-sep {
    color: rgba(241, 236, 236, 0.22);
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
    background: rgba(255, 255, 255, 0.05);
  }

  .files-crumb--current {
    color: var(--light-strong);
    font-weight: 800;
    cursor: default;
    font-family: var(--font-display);
    letter-spacing: 0;
    font-size: 0.78rem;
  }

  .files-explorer-btn {
    min-height: 2.35rem;
    padding: 0.45rem 0.8rem;
    font-size: 0.78rem;
    white-space: nowrap;
  }
</style>
