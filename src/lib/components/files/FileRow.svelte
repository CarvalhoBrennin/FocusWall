<script>
  import FileIcon from './FileIcon.svelte';
  import { resolveFileIcon } from '../../utils/file-icons.js';

  const { entry, onclick } = $props();

  const extension = $derived(entry.extension ?? '');
  const isDir = $derived(!!entry.isDir);
  const sizeBytes = $derived(entry.sizeBytes ?? 0);
  const modifiedAt = $derived(entry.modifiedAt ?? '');
  const name = $derived(entry.name ?? '—');

  const icon = $derived(resolveFileIcon(name, extension, isDir));

  function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  const sizeLabel = $derived(isDir ? '—' : formatSize(sizeBytes));
  const shortTime = $derived(modifiedAt.length > 11
    ? modifiedAt.slice(11)
    : modifiedAt || '—');
</script>

<button
  class="file-row"
  class:is-dir={isDir}
  type="button"
  aria-label={isDir ? `Abrir pasta ${name}, ${icon.label}` : `Abrir arquivo ${name}, ${icon.label}`}
  {onclick}
>
  <span class="file-row-icon">
    <FileIcon kind={icon.kind} color={icon.color} size={22} />
  </span>
  <div class="file-row-body">
    <span class="file-name" style:--file-name-accent={icon.color}>{name}</span>
    <span class="file-meta">
      {#if !isDir}
        <span class="file-ext" style:--file-ext-color={icon.color}>.{extension || '--'}</span>
        <span class="file-size">{sizeLabel}</span>
      {/if}
      <span class="file-date">{shortTime}</span>
    </span>
  </div>
</button>

<style>
  .file-row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 3.2rem;
    padding: 0.6rem 0.75rem 0.6rem 0.85rem;
    border: 1px solid var(--control-border-soft);
    border-radius: 0;
    background:
      linear-gradient(180deg, var(--glare-soft), var(--glare-faint)),
      var(--panel-bg-soft);
    box-shadow:
      inset 0 1px 0 var(--glare-soft),
      var(--shadow-xs);
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-fast);
    isolation: isolate;
  }

  .file-row:hover {
    transform: translateY(-1px);
    border-color: rgba(207, 206, 205, 0.22);
    box-shadow: 0 18px 26px var(--shadow-color);
  }

  .file-row::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 84% 18%, var(--glare-soft), transparent 28%),
      linear-gradient(135deg, var(--glare-faint), transparent 52%);
    opacity: 0.9;
    z-index: 0;
  }

  .file-row-icon {
    position: relative;
    z-index: 1;
  }

  .file-row-body {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
  }

  .file-name {
    color: var(--light-strong);
    font-size: 0.92rem;
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .file-row.is-dir .file-name {
    color: color-mix(in srgb, var(--file-name-accent, var(--accent-strong)) 72%, var(--light-strong));
  }

  .file-row.is-dir .file-name::after {
    content: " ›";
    color: var(--light-soft);
    font-weight: 700;
  }

  .file-row.is-dir:hover .file-name {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .file-meta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .file-ext {
    display: inline-flex;
    align-items: center;
    min-height: 1.55rem;
    padding: 0.12rem 0.45rem;
    border: 1px solid color-mix(in srgb, var(--file-ext-color, var(--control-border)) 45%, var(--control-border));
    background: color-mix(in srgb, var(--file-ext-color, var(--control-bg)) 12%, var(--control-bg));
    color: color-mix(in srgb, var(--file-ext-color, var(--light-soft)) 65%, var(--light-soft));
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-radius: 0;
  }

  .file-size,
  .file-date {
    color: var(--light-soft);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
</style>
