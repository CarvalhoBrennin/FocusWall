<script>
  import { fileIconBadge } from '../../utils/file-icons.js';

  const { kind, color, size = 20 } = $props();

  const badge = $derived(fileIconBadge(kind));
  const isFolder = $derived(kind.startsWith('folder'));
</script>

<span
  class="file-icon"
  class:is-folder={isFolder}
  style:--file-icon-color={color}
  style:width="{size}px"
  style:height="{size}px"
  aria-hidden="true"
>
  <svg class="file-icon-svg" viewBox="0 0 24 24" width={size} height={size}>
    {#if isFolder}
      <path
        class="file-icon-shape"
        d="M4 6.5A2 2 0 0 1 6 4.5h5.2l1.3 1.5H18a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5Z"
        fill="currentColor"
      />
      <path
        class="file-icon-tab"
        d="M6 4.5h5.2l1.3 1.5H18v2H6V4.5Z"
        fill="var(--file-icon-tab, rgba(0,0,0,0.22))"
      />
    {:else if kind === 'image'}
      <rect class="file-icon-shape" x="4" y="5" width="16" height="14" rx="1.5" fill="currentColor" />
      <circle cx="9" cy="10" r="1.6" fill="var(--panel-bg-soft, #1a1a1a)" />
      <path
        d="M4 16l4.5-4 3 2.5L14 11l6 8H4z"
        fill="var(--panel-bg-soft, #1a1a1a)"
        opacity="0.85"
      />
    {:else if kind === 'video' || kind === 'audio'}
      <path
        class="file-icon-shape"
        d="M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5Z"
        fill="currentColor"
      />
      {#if kind === 'video'}
        <path d="M11 9.5l5 3-5 3v-6Z" fill="var(--panel-bg-soft, #1a1a1a)" />
      {:else}
        <path
          d="M9 10.5v3M12 9v6M15 11v2"
          stroke="var(--panel-bg-soft, #1a1a1a)"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      {/if}
    {:else if kind === 'pdf'}
      <path
        class="file-icon-shape"
        d="M7 3.5h7l4 4v13a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z"
        fill="currentColor"
      />
      <path d="M14 3.5v4.5H18.5" fill="none" stroke="var(--panel-bg-soft)" stroke-width="1.2" />
      <text x="8" y="16" font-size="5" font-weight="800" fill="var(--panel-bg-soft)">PDF</text>
    {:else if kind === 'archive'}
      <path
        class="file-icon-shape"
        d="M6 4h12v3H6V4Zm0 4h12v2H6V8Zm0 3h12v9H6v-9Z"
        fill="currentColor"
      />
    {:else}
      <path
        class="file-icon-shape"
        d="M7 3.5h7.2L18 7.3V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z"
        fill="currentColor"
      />
      <path
        d="M14 3.5v4h4"
        fill="none"
        stroke="var(--file-icon-fold, rgba(0,0,0,0.25))"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      {#if badge}
        <text
          x="12"
          y="15.5"
          text-anchor="middle"
          font-size={badge.length > 3 ? '4.2' : '5.2'}
          font-weight="800"
          fill="var(--panel-bg-soft, #141414)"
          font-family="ui-monospace, monospace"
        >{badge}</text>
      {/if}
    {/if}
  </svg>
</span>

<style>
  .file-icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    color: var(--file-icon-color);
    filter: drop-shadow(0 0 10px color-mix(in srgb, var(--file-icon-color) 35%, transparent));
  }

  .file-icon.is-folder {
    --file-icon-tab: color-mix(in srgb, var(--file-icon-color) 55%, #000);
  }

  .file-icon-svg {
    display: block;
  }

  .file-icon-shape {
    opacity: 0.95;
  }
</style>
