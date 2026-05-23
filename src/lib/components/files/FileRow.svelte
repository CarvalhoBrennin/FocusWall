<script>
  const { entry, onclick } = $props();

  const docExts = new Set([
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'toml',
    'log', 'rtf', 'odt', 'ods'
  ]);

  const mediaExts = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico',
    'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv',
    'mp3', 'wav', 'flac', 'ogg', 'aac', 'wma'
  ]);

  const codeExts = new Set([
    'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
    'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
    'rb', 'php', 'swift', 'kt', 'scala', 'r', 'lua', 'zig',
    'svelte', 'vue', 'html', 'css', 'scss', 'less',
    'sql', 'sh', 'bat', 'ps1', 'bash', 'zsh',
    'toml', 'yaml', 'yml', 'json', 'xml'
  ]);

  const extension = $derived(entry.extension ?? '');
  const isDir = $derived(!!entry.is_dir);
  const sizeBytes = $derived(entry.size_bytes ?? 0);
  const modifiedAt = $derived(entry.modified_at ?? '');

  const fileType = $derived(isDir
    ? 'dir'
    : codeExts.has(extension)
      ? 'code'
      : docExts.has(extension)
        ? 'doc'
        : mediaExts.has(extension)
          ? 'media'
          : 'other');

  const accentClass = $derived(`file-accent--${fileType}`);

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

<button class="file-row" class:is-dir={isDir} {onclick}>
  <span class="file-accent {accentClass}" aria-hidden="true"></span>
  <div class="file-row-body">
    <span class="file-name">{entry.name ?? '—'}</span>
    <span class="file-meta">
      {#if !isDir}
        <span class="file-ext">.{extension || '--'}</span>
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
    grid-template-columns: 3px minmax(0, 1fr);
    align-items: center;
    gap: 0.85rem;
    width: 100%;
    min-height: 3.2rem;
    padding: 0.6rem 0.75rem 0.6rem 0.85rem;
    border: 1px solid rgba(241, 236, 236, 0.07);
    border-radius: 0;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.022)),
      rgba(10, 10, 10, 0.88);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.03),
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
    box-shadow: 0 18px 26px rgba(0, 0, 0, 0.14);
  }

  .file-row::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 84% 18%, rgba(255, 255, 255, 0.04), transparent 28%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.02), transparent 52%);
    opacity: 0.9;
    z-index: 0;
  }

  .file-accent {
    width: 3px;
    height: 50%;
    border-radius: 0;
  }

  .file-accent--dir {
    background: var(--accent);
    box-shadow: 0 0 16px rgba(207, 206, 205, 0.24);
  }

  .file-accent--doc {
    background: var(--success);
    box-shadow: 0 0 14px rgba(91, 140, 91, 0.22);
  }

  .file-accent--media {
    background: var(--accent-gold);
    box-shadow: 0 0 14px rgba(183, 177, 177, 0.22);
  }

  .file-accent--code {
    background: var(--accent-olive);
    box-shadow: 0 0 14px rgba(75, 70, 70, 0.26);
  }

  .file-accent--other {
    background: var(--light-soft);
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

  .is-dir .file-name {
    color: var(--accent-strong);
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
    border: 1px solid rgba(241, 236, 236, 0.1);
    background: rgba(255, 255, 255, 0.045);
    color: var(--light-soft);
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