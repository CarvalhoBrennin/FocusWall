<script>
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import SystemOverview from './SystemOverview.svelte';
  import SystemAppsList from './SystemAppsList.svelte';
  import { paused } from '../../stores/app-store.js';
  import { isTauri } from '../../utils/tauri.js';
  import {
    startSystemMetricsPolling,
    stopSystemMetricsPolling
  } from '../../services/system-metrics.js';

  let { active = false } = $props();

  let snapshot = $state(null);
  let loading = $state(true);
  let errorMsg = $state(null);

  onMount(() => {
    if (!isTauri()) {
      errorMsg = 'Métricas do sistema disponíveis apenas no app desktop (Tauri).';
      loading = false;
    }
  });

  onDestroy(() => {
    stopSystemMetricsPolling();
  });

  $effect(() => {
    if (!isTauri()) return;
    active;
    $paused;
    syncPolling();
  });

  function syncPolling() {
    const isActive = active && !get(paused);
    if (!isActive) {
      stopSystemMetricsPolling();
      return;
    }

    startSystemMetricsPolling({
      getActive: () => active && !get(paused),
      getPaused: () => get(paused),
      onData: (data) => {
        snapshot = data;
        loading = false;
        errorMsg = null;
      },
      onError: (message) => {
        errorMsg = message;
        loading = false;
      }
    });
  }
</script>

<div class="system-panel">
  {#if errorMsg && !snapshot}
    <p class="system-error" role="alert">{errorMsg}</p>
  {:else if loading && !snapshot}
    <p class="system-status" aria-live="polite">Coletando métricas…</p>
  {:else if snapshot}
    <div class="system-panel-stack">
      <SystemOverview {snapshot} />
      <SystemAppsList apps={snapshot.apps} />
    </div>
    {#if errorMsg}
      <p class="system-inline-error" role="alert">{errorMsg}</p>
    {/if}
  {/if}
</div>

<style>
  .system-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
    height: 100%;
  }

  .system-panel-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 0;
    overflow: auto;
    padding-right: 0.15rem;
  }

  .system-status,
  .system-error {
    margin: 0;
    padding: 1.25rem 1rem;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .system-status {
    color: var(--light-soft);
  }

  .system-error {
    color: var(--danger, #c45c5c);
    border: 1px solid var(--control-border);
    background: var(--control-bg);
  }

  .system-inline-error {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--danger, #c45c5c);
  }

  .system-panel-stack::-webkit-scrollbar {
    width: 6px;
  }

  .system-panel-stack::-webkit-scrollbar-thumb {
    background: var(--control-border);
  }
</style>
