<script>
  import { onMount } from 'svelte';

  const isTauri = typeof window !== 'undefined' && window.__TAURI__?.core != null;
  const tauriInvoke = isTauri ? window.__TAURI__.core.invoke.bind(window.__TAURI__.core) : null;

  let monitors = [];
  let currentMonitor = null;
  let selectedMonitor = null;
  let loading = true;
  let errorMsg = null;

  onMount(async () => {
    if (!tauriInvoke) {
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
      await tauriInvoke('save_monitor_preference', { monitorIndex });
    } catch (err) {
      errorMsg = String(err.message || err);
    }
  }

  function getMonitorDisplayName(monitor) {
    const resolution = `${monitor.width}x${monitor.height}`;
    const type = monitor.isPrimary ? ' (Principal)' : '';
    return `${monitor.name} - ${resolution}${type}`;
  }
</script>

<div class="monitor-selector">
  <h3 class="monitor-selector-title">Display</h3>
  
  {#if loading}
    <div class="monitor-loading">
      <p>Carregando monitores...</p>
    </div>
  {:else if errorMsg}
    <div class="monitor-error">
      <p>{errorMsg}</p>
    </div>
  {:else}
    <div class="monitor-list">
      {#each monitors as monitor}
        <label class="monitor-option" class:selected={selectedMonitor === monitor.index}>
          <input
            type="radio"
            name="monitor"
            value={monitor.index}
            checked={selectedMonitor === monitor.index}
            on:change={handleMonitorChange}
          />
          <div class="monitor-info">
            <span class="monitor-name">{getMonitorDisplayName(monitor)}</span>
            {#if currentMonitor && currentMonitor.index === monitor.index}
              <span class="monitor-current">Atual</span>
            {/if}
          </div>
        </label>
      {/each}
    </div>
  {/if}
</div>

<style>
  .monitor-selector {
    padding: 16px 0;
  }

  .monitor-selector-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--light-main);
    margin: 0 0 16px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .monitor-loading {
    padding: 12px;
    text-align: center;
    color: var(--light-muted);
    font-size: 13px;
  }

  .monitor-error {
    padding: 12px;
    text-align: center;
    color: var(--danger);
    font-size: 13px;
  }

  .monitor-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .monitor-option {
    display: flex;
    align-items: center;
    padding: 12px;
    border: 1px solid var(--surface-dark-border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--surface-dark);
  }

  .monitor-option:hover {
    background: var(--surface-dark-strong);
    border-color: var(--accent-soft);
  }

  .monitor-option.selected {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .monitor-option input[type="radio"] {
    margin: 0 12px 0 0;
    accent-color: var(--accent);
  }

  .monitor-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
  }

  .monitor-name {
    color: var(--light-main);
    font-size: 14px;
  }

  .monitor-current {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--success-soft);
    color: var(--success);
    border-radius: 4px;
    font-weight: 500;
  }
</style>
