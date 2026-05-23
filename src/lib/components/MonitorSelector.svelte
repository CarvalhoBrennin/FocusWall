<script>
  import { onMount } from 'svelte';
  import { setPreferredMonitorPreference } from '../stores/app-store.js';
  import { tauriInvoke } from '../utils/tauri.js';
  import { isTauri } from '../utils/tauri.js';

  let monitors = $state([]);
  let currentMonitor = $state(null);
  let selectedMonitor = $state(null);
  let loading = $state(true);
  let errorMsg = $state(null);

  onMount(async () => {
    if (!isTauri()) {
      errorMsg = 'API de monitor indisponível no modo navegador.';
      loading = false;
      return;
    }

    try {
      const [availableMonitors, current] = await Promise.all([
        tauriInvoke('get_available_monitors'),
        tauriInvoke('get_current_monitor')
      ]);
      
      monitors = availableMonitors;
      currentMonitor = current;
      selectedMonitor = current.index;
    } catch (err) {
      console.warn('Monitor API erro:', err);
      errorMsg = String(err.message || err);
    } finally {
      loading = false;
    }
  });

  async function handleMonitorChange(event) {
    const monitorIndex = parseInt(event.target.value);
    selectedMonitor = monitorIndex;
    
    try {
      await tauriInvoke('move_to_monitor', { monitorIndex });
      await setPreferredMonitorPreference(monitorIndex);
    } catch (err) {
      errorMsg = String(err.message || err);
    }
  }

  function getMonitorDisplayName(monitor) {
    const resolution = `${monitor.width ?? '?'}x${monitor.height ?? '?'}`;
    const type = monitor.isPrimary ? ' (Principal)' : '';
    return `${monitor.name ?? 'Monitor'} - ${resolution}${type}`;
  }
</script>

<div class="monitor-selector">
  <p class="eyebrow monitor-selector-title">Monitor</p>
  
  {#if loading}
    <p class="monitor-loading">Carregando monitores...</p>
  {:else if errorMsg}
    <p class="monitor-error">{errorMsg}</p>
  {:else}
    <div class="monitor-list">
      {#each monitors as monitor}
        <label class="monitor-option" class:selected={selectedMonitor === monitor.index}>
          <input
            type="radio"
            name="monitor"
            value={monitor.index}
            checked={selectedMonitor === monitor.index}
            onchange={handleMonitorChange}
          />
          <span class="monitor-name">{getMonitorDisplayName(monitor)}</span>
          {#if currentMonitor && currentMonitor.index === monitor.index}
            <span class="monitor-current">Atual</span>
          {/if}
        </label>
      {/each}
    </div>
  {/if}
</div>

<style>
  .monitor-selector {
    padding: var(--space-3) 0;
  }

  .monitor-selector-title {
    color: var(--light-soft);
    margin-bottom: var(--space-3);
  }

  .monitor-loading,
  .monitor-error {
    padding: var(--space-3);
    text-align: center;
    font-size: 0.88rem;
  }

  .monitor-loading {
    color: var(--light-muted);
  }

  .monitor-error {
    color: var(--danger);
  }

  .monitor-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .monitor-option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.95rem 1rem 0.95rem 1.35rem;
    border: 1px solid rgba(241, 236, 236, 0.08);
    border-radius: 0;
    cursor: pointer;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-fast);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.022));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      var(--shadow-xs);
    isolation: isolate;
  }

  .monitor-option::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.8rem;
    bottom: 0.8rem;
    width: 3px;
    border-radius: 0;
    background: rgba(241, 236, 236, 0.18);
  }

  .monitor-option::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), transparent 52%);
    opacity: 0.85;
    z-index: 0;
  }

  .monitor-option:hover {
    transform: translateY(-1px);
    border-color: rgba(207, 206, 205, 0.22);
    box-shadow: 0 18px 26px rgba(0, 0, 0, 0.14);
  }

  .monitor-option.selected {
    border-color: rgba(207, 206, 205, 0.28);
    background:
      linear-gradient(135deg, rgba(207, 206, 205, 0.12), rgba(10, 10, 10, 0.9));
  }

  .monitor-option.selected::before {
    background: var(--accent);
  }

  .monitor-option input[type="radio"] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .monitor-name {
    position: relative;
    z-index: 1;
    flex: 1;
    color: var(--light-main);
    font-size: 0.92rem;
    font-weight: 800;
  }

  .monitor-current {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 1.75rem;
    padding: 0.2rem 0.62rem;
    border-radius: 0;
    border: 1px solid rgba(91, 140, 91, 0.2);
    background: rgba(91, 140, 91, 0.12);
    color: var(--success);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
