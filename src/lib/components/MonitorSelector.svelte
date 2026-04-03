<script>
  import { onMount } from 'svelte';

  import { ALLOWED_COMMANDS, invokeCommand, isTauriRuntime } from '../services/tauri-api.js';

  let monitors = [];
  let currentMonitor = null;
  let selectedMonitor = null;
  let loading = true;
  let errorMsg = null;
  let successMsg = '';

  onMount(async () => {
    if (!isTauriRuntime()) {
      errorMsg = 'API de monitor indisponível no modo navegador.';
      loading = false;
      return;
    }

    await fetchMonitors();
  });

  async function fetchMonitors() {
    loading = true;
    errorMsg = null;
    try {
      const [availableMonitors, current] = await Promise.all([
        invokeCommand(ALLOWED_COMMANDS.GET_AVAILABLE_MONITORS),
        invokeCommand(ALLOWED_COMMANDS.GET_CURRENT_MONITOR)
      ]);

      monitors = availableMonitors;
      currentMonitor = current;
      selectedMonitor = current.index;
    } catch (err) {
      errorMsg = String(err.message || err);
    } finally {
      loading = false;
    }
  }

  async function handleMonitorChange(event) {
    const monitorIndex = parseInt(event.target.value);
    selectedMonitor = monitorIndex;
    successMsg = '';

    try {
      await invokeCommand(ALLOWED_COMMANDS.MOVE_TO_MONITOR, { monitorIndex });
      await invokeCommand(ALLOWED_COMMANDS.SAVE_MONITOR_PREFERENCE, { monitorIndex });
    } catch (err) {
      errorMsg = String(err.message || err);
      onStatus({ type: 'error', message: errorMsg });
    }
  }

  function getMonitorDisplayName(monitor) {
    const resolution = `${monitor.width}x${monitor.height}`;
    const type = monitor.isPrimary ? ' (Principal)' : '';
    return `${monitor.name} - ${resolution}${type}`;
  }
</script>

<div class="monitor-selector" class:compact>
  {#if loading}
    <div class="monitor-loading" role="status" aria-live="polite">
      <p>Carregando monitores...</p>
    </div>
  {:else if errorMsg}
    <div class="monitor-error" role="alert">
      <p>{errorMsg}</p>
      {#if tauriInvoke}
        <button type="button" class="ghost-button" on:click={fetchMonitors}>Tentar novamente</button>
      {/if}
    </div>
  {:else}
    <fieldset class="monitor-list" aria-label="Selecionar monitor">
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
    </fieldset>
  {/if}

  {#if successMsg}
    <p class="monitor-success" role="status" aria-live="polite">{successMsg}</p>
  {/if}
</div>

<style>
  .monitor-selector {
    display: grid;
    gap: 10px;
  }

  .monitor-loading,
  .monitor-error {
    padding: 12px;
    border-radius: 10px;
    background: var(--surface-dark);
    border: 1px solid var(--surface-dark-border);
    font-size: 13px;
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
    gap: 8px;
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
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
    gap: 8px;
  }

  .monitor-name {
    color: var(--light-main);
    font-size: 14px;
  }

  .monitor-current,
  .monitor-success {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .monitor-current {
    background: var(--success-soft);
    color: var(--success);
  }

  .monitor-success {
    justify-self: start;
    background: var(--success-soft);
    color: var(--success);
  }
</style>
