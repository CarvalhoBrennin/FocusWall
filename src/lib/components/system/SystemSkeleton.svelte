<script>
  import { t } from '../../i18n/index.js';
</script>

<div class="system-skeleton" aria-hidden="true">
  <div class="system-skeleton-status">
    <span class="system-skeleton-pulse"></span>
    <span class="system-skeleton-line system-skeleton-line--status"></span>
  </div>

  <div class="system-skeleton-health">
    {#each Array(5) as _}
      <div class="system-skeleton-metric">
        <span class="system-skeleton-line system-skeleton-line--label"></span>
        <span class="system-skeleton-line system-skeleton-line--value"></span>
        <span class="system-skeleton-line system-skeleton-line--bar"></span>
      </div>
    {/each}
  </div>

  <div class="system-skeleton-grid">
    {#each Array(4) as _}
      <div class="system-skeleton-card">
        <span class="system-skeleton-line system-skeleton-line--title"></span>
        <span class="system-skeleton-line"></span>
        <span class="system-skeleton-line system-skeleton-line--short"></span>
      </div>
    {/each}
  </div>

  <div class="system-skeleton-table">
    <span class="system-skeleton-line system-skeleton-line--table-title"></span>
    {#each Array(5) as _}
      <span class="system-skeleton-line system-skeleton-line--row"></span>
    {/each}
  </div>
</div>

<p class="sr-only" aria-live="polite">{$t('system.loading')}</p>

<style>
  .system-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    min-height: 100%;
  }

  .system-skeleton-status,
  .system-skeleton-health,
  .system-skeleton-grid,
  .system-skeleton-card,
  .system-skeleton-table,
  .system-skeleton-metric {
    border: 1px solid var(--control-border-soft);
    background: var(--panel-bg-soft);
  }

  .system-skeleton-status {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.65rem 0.8rem;
  }

  .system-skeleton-pulse {
    width: 0.55rem;
    height: 0.55rem;
    flex: 0 0 auto;
    background: var(--accent);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent);
    animation: system-pulse 1.4s ease-out infinite;
  }

  .system-skeleton-health {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 1px;
    overflow: hidden;
    background: var(--control-border-soft);
  }

  .system-skeleton-metric {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    min-height: 8rem;
    padding: 0.9rem;
    border: 0;
  }

  .system-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    padding: 0.65rem;
  }

  .system-skeleton-card {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    min-height: 7.5rem;
    padding: 0.85rem;
  }

  .system-skeleton-table {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.9rem;
  }

  .system-skeleton-line {
    display: block;
    width: 100%;
    height: 0.72rem;
    background:
      linear-gradient(90deg, transparent, var(--glare-soft), transparent),
      var(--control-bg);
    background-size: 220% 100%;
    animation: system-shimmer 1.45s linear infinite;
  }

  .system-skeleton-line--status { width: 12rem; }
  .system-skeleton-line--label { width: 46%; height: 0.55rem; }
  .system-skeleton-line--value { width: 68%; height: 1.65rem; }
  .system-skeleton-line--bar { height: 0.3rem; }
  .system-skeleton-line--title { width: 35%; height: 0.58rem; }
  .system-skeleton-line--short { width: 62%; }
  .system-skeleton-line--table-title { width: 24%; height: 0.85rem; }
  .system-skeleton-line--row { height: 2rem; }

  @keyframes system-shimmer {
    from { background-position: 220% 0; }
    to { background-position: -220% 0; }
  }

  @keyframes system-pulse {
    70% { box-shadow: 0 0 0 0.5rem transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
  }

  @media (max-width: 980px) {
    .system-skeleton-health {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .system-skeleton-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .system-skeleton-line,
    .system-skeleton-pulse {
      animation: none;
    }
  }
</style>
