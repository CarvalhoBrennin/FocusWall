<script lang="ts">
  import type { RadarIconName } from './radar-icons.js';

  let { name, size = 16 } = $props<{ name: RadarIconName; size?: number }>();
</script>

<svg
  class="radar-icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'location'}
    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="2.4" />
  {:else if name === 'refresh'}
    <path d="M20 6v5h-5" />
    <path d="M4 18v-5h5" />
    <path d="M18.2 9A7 7 0 0 0 6.4 6.4L4 9" />
    <path d="M5.8 15A7 7 0 0 0 17.6 17.6L20 15" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="2.7" />
    <path d="M19 13.7a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V19H9.69v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 5 13.7a1.7 1.7 0 0 0-1.56-1.03H3V9.33h.44A1.7 1.7 0 0 0 5 8.3a1.7 1.7 0 0 0-.34-1.88L4.6 6.36l2.12-2.12.06.06A1.7 1.7 0 0 0 8.66 4a1.7 1.7 0 0 0 1.03-1.56V2.3h4.62v.14A1.7 1.7 0 0 0 15.34 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19 7.66a1.7 1.7 0 0 0 1.56 1.03H21v3.98h-.44A1.7 1.7 0 0 0 19 13.7Z" />
  {:else if name === 'close'}
    <path d="m6 6 12 12M18 6 6 18" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="6" />
    <path d="m16 16 4 4" />
  {:else if name === 'external'}
    <path d="M14 5h5v5M19 5l-8 8" />
    <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  {:else if name === 'humidity'}
    <path d="M12 3s5 5.4 5 9.4a5 5 0 0 1-10 0C7 8.4 12 3 12 3Z" />
    <path d="M9.5 13.2a2.7 2.7 0 0 0 2.7 2.4" />
  {:else if name === 'rain'}
    <path d="M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 8.5 3.3 3.3 0 0 0 7 15Z" />
    <path d="m8 18-1 2M12 18l-1 2M16 18l-1 2" />
  {:else if name === 'wind'}
    <path d="M3 8h11a2.5 2.5 0 1 0-2.3-3.5" />
    <path d="M3 12h15a2.5 2.5 0 1 1-2.3 3.5" />
    <path d="M3 16h7" />
  {:else if name === 'gust'}
    <path d="M4 7h10a2 2 0 1 0-1.7-3" />
    <path d="M4 11h15" />
    <path d="M4 15h11a2.5 2.5 0 1 1-2.2 3.6" />
  {:else if name === 'uv'}
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
  {:else if name === 'pressure'}
    <path d="M5 17a8 8 0 1 1 14 0" />
    <path d="m12 13 3-3" />
    <path d="M8 18h8" />
  {:else if name === 'sunrise'}
    <path d="M4 18h16M6 14a6 6 0 0 1 12 0M12 3v4M5.6 7.6 8 10M18.4 7.6 16 10" />
    <path d="m9 18 3-3 3 3" />
  {:else if name === 'sunset'}
    <path d="M4 18h16M6 14a6 6 0 0 1 12 0M12 3v4M5.6 7.6 8 10M18.4 7.6 16 10" />
    <path d="m9 15 3 3 3-3" />
  {:else if name === 'chevron'}
    <path d="m8 10 4 4 4-4" />
  {/if}
</svg>

