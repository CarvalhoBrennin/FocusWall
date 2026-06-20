<script>
  import FileRow from './FileRow.svelte';

  const { entries = [], searchQuery = '', onNavigate, onOpen } = $props();
</script>

<div class="files-list">
  {#if entries.length === 0}
    <p class="files-empty">
      {searchQuery.trim() ? 'Nenhum item corresponde à busca.' : 'Diretório vazio.'}
    </p>
  {:else}
    {#each entries as entry (entry.path)}
      <FileRow
        {entry}
        onclick={(e) => {
          if (e.detail > 1) return;
          if (entry.isDir) onNavigate(entry.path);
          else onOpen(entry.path);
        }}
      />
    {/each}
  {/if}
</div>

<style>
  .files-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.15rem 0.1rem 0.35rem;
  }

  .files-empty {
    margin: auto;
    padding: 1.5rem 1rem;
    color: var(--light-muted);
    font-size: 0.88rem;
    font-weight: 800;
    text-align: center;
    letter-spacing: 0.04em;
  }

  .files-list::-webkit-scrollbar {
    width: 6px;
  }

  .files-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .files-list::-webkit-scrollbar-thumb {
    background: var(--surface-dark-border);
  }

  .files-list::-webkit-scrollbar-thumb:hover {
    background: var(--accent-soft);
  }
</style>
