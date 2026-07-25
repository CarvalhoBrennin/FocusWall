<script>
  import { onDestroy, onMount } from 'svelte';
  import SystemOverview from './SystemOverview.svelte';
  import SystemAppsList from './SystemAppsList.svelte';
  import SystemSkeleton from './SystemSkeleton.svelte';
  import { locale, msg, t } from '../../i18n/index.js';
  import { paused } from '../../stores/app-store.js';
  import { isTauri } from '../../utils/tauri.js';
  import {
    createSystemSnapshotLoadController
  } from '../../services/system-metrics.js';

  let phase = $state('idle');
  let snapshot = $state(null);
  let errorKey = $state('');
  let mounted = false;
  let startedForCurrentResume = false;
  let unsubscribePaused = null;
  let loadController = null;

  function formatCapturedAt(value, localeId) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return msg('system.unavailable');
    return new Intl.DateTimeFormat(localeId, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  }

  function cancelCurrent() {
    loadController?.cancel();
  }

  async function collectSnapshot() {
    snapshot = null;
    errorKey = '';
    startedForCurrentResume = true;

    if (!isTauri()) {
      phase = 'error';
      errorKey = 'system.desktopOnly';
      return;
    }

    await loadController?.load();
  }

  function retry() {
    startedForCurrentResume = false;
    void collectSnapshot();
  }

  onMount(() => {
    mounted = true;
    loadController = createSystemSnapshotLoadController({
      onLoading: () => {
        if (!mounted) return;
        snapshot = null;
        errorKey = '';
        phase = 'loading';
      },
      onData: (nextSnapshot) => {
        if (!mounted) return;
        snapshot = nextSnapshot;
        phase = nextSnapshot.warnings.length > 0 ? 'partial' : 'ready';
      },
      onError: () => {
        if (!mounted) return;
        phase = 'error';
        errorKey = 'system.loadFailed';
      }
    });
    unsubscribePaused = paused.subscribe((isPaused) => {
      if (!mounted) return;
      if (isPaused) {
        cancelCurrent();
        snapshot = null;
        errorKey = '';
        phase = 'idle';
        startedForCurrentResume = false;
        return;
      }
      if (!startedForCurrentResume) {
        void collectSnapshot();
      }
    });
  });

  onDestroy(() => {
    mounted = false;
    unsubscribePaused?.();
    loadController?.dispose();
    loadController = null;
    snapshot = null;
    phase = 'cancelled';
  });
</script>

<div
  class="system-panel"
  class:system-panel--loading={phase === 'loading'}
  aria-busy={phase === 'loading'}
>
  {#if phase === 'loading'}
    <SystemSkeleton />
  {:else if phase === 'idle'}
    <div class="system-state system-state--paused">
      <span class="system-state-glyph" aria-hidden="true">Ⅱ</span>
      <p class="system-state-kicker">{$t('system.paused')}</p>
      <h2>{$t('system.pausedTitle')}</h2>
      <p>{$t('system.pausedBody')}</p>
    </div>
  {:else if phase === 'error'}
    <div class="system-state system-state--error" role="alert">
      <span class="system-state-glyph" aria-hidden="true">!</span>
      <p class="system-state-kicker">{$t('system.collectionFailed')}</p>
      <h2>{$t('system.errorTitle')}</h2>
      <p>{$t(errorKey || 'system.loadFailed')}</p>
      {#if isTauri()}
        <button class="system-retry-button" type="button" onclick={retry}>
          {$t('system.retry')}
        </button>
      {/if}
    </div>
  {:else if snapshot}
    <div class="system-panel-scroll">
      <div class="system-capture-bar" class:system-capture-bar--partial={phase === 'partial'}>
        <div>
          <span class="system-capture-dot" aria-hidden="true"></span>
          <strong>
            {phase === 'partial' ? $t('system.partialSnapshot') : $t('system.snapshotReady')}
          </strong>
        </div>
        <span>
          {$t('system.capturedAt')} {formatCapturedAt(snapshot.capturedAt, $locale)}
        </span>
      </div>

      {#if phase === 'partial'}
        <details class="system-warning-panel">
          <summary>
            {$t('system.partialDetails')} · {snapshot.warnings.length}
          </summary>
          <ul>
            {#each snapshot.warnings as warning}
              <li>
                {warning === 'disksUnavailable'
                  ? $t('system.noDiskData')
                  : $t('system.loadFailed')}
              </li>
            {/each}
          </ul>
        </details>
      {/if}

      <SystemOverview {snapshot} />
      <SystemAppsList
        processes={snapshot.processes}
        totalProcessCount={snapshot.totalProcessCount}
        processesTruncated={snapshot.processesTruncated}
      />
    </div>
  {/if}
</div>

<style>
  .system-panel {
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .system-panel-scroll {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
    min-height: 0;
    padding-right: 0.12rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--control-border) transparent;
  }

  .system-capture-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.58rem 0.72rem;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--control-border-soft));
    background: color-mix(in srgb, var(--accent) 6%, var(--panel-bg-soft));
    color: var(--light-soft);
    font-size: 0.64rem;
    font-weight: 700;
  }

  .system-capture-bar > div {
    display: flex;
    align-items: center;
    gap: 0.48rem;
  }

  .system-capture-bar strong {
    color: var(--light-strong);
    font-size: 0.66rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .system-capture-bar--partial {
    border-color: color-mix(in srgb, #ba8c66 45%, var(--control-border-soft));
    background: color-mix(in srgb, #ba8c66 7%, var(--panel-bg-soft));
  }

  .system-capture-dot {
    width: 0.42rem;
    height: 0.42rem;
    background: var(--accent);
    box-shadow: 0 0 0.55rem color-mix(in srgb, var(--accent) 55%, transparent);
  }

  .system-capture-bar--partial .system-capture-dot {
    background: #ba8c66;
  }

  .system-warning-panel {
    border: 1px solid color-mix(in srgb, #ba8c66 38%, var(--control-border-soft));
    background: color-mix(in srgb, #ba8c66 5%, var(--panel-bg-soft));
    color: var(--light-soft);
    font-size: 0.68rem;
  }

  .system-warning-panel summary {
    padding: 0.6rem 0.72rem;
    color: var(--light-strong);
    font-weight: 750;
    cursor: pointer;
  }

  .system-warning-panel ul {
    margin: 0;
    padding: 0 1.8rem 0.7rem;
  }

  .system-state {
    display: flex;
    align-items: flex-start;
    flex-direction: column;
    justify-content: center;
    min-height: 17rem;
    height: 100%;
    padding: clamp(1.5rem, 5vw, 4rem);
    border: 1px solid var(--control-border-soft);
    background:
      radial-gradient(circle at 10% 10%, var(--glare-soft), transparent 28%),
      var(--panel-bg-soft);
  }

  .system-state-glyph {
    display: grid;
    width: 2.6rem;
    height: 2.6rem;
    margin-bottom: 1rem;
    place-items: center;
    border: 1px solid var(--control-border);
    color: var(--accent-soft);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 1rem;
    font-weight: 800;
  }

  .system-state--error .system-state-glyph {
    border-color: color-mix(in srgb, var(--danger, #c45c5c) 55%, var(--control-border));
    color: var(--danger, #c45c5c);
  }

  .system-state-kicker {
    margin: 0 0 0.25rem !important;
    color: var(--light-soft) !important;
    font-size: 0.62rem !important;
    font-weight: 850 !important;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .system-state h2 {
    margin: 0;
    color: var(--light-strong);
    font-size: clamp(1.3rem, 2.5vw, 2.2rem);
  }

  .system-state > p:last-of-type {
    max-width: 34rem;
    margin: 0.65rem 0 0;
    color: var(--light-soft);
    font-size: 0.78rem;
    font-weight: 650;
    line-height: 1.55;
  }

  .system-retry-button {
    margin-top: 1rem;
    padding: 0.62rem 0.82rem;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--ink, #10110f);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 800;
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .system-capture-bar {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
