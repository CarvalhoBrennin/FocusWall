<script>
  import { onMount } from 'svelte';
  import { setPreferredMonitorPreference } from '../stores/app-store.js';
  import { tauriInvoke } from '../utils/tauri.js';
  import { isTauri } from '../utils/tauri.js';
  import { t } from '../i18n/index.js';
  import { get } from 'svelte/store';

  let monitors = $state([]);
  let currentMonitor = $state(null);
  let selectedMonitor = $state(null);
  let loading = $state(true);
  let errorMsg = $state(null);

  onMount(async () => {
    if (!isTauri()) {
      errorMsg = get(t)('monitor.browserUnavailable');
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
    const type = monitor.isPrimary ? get(t)('monitor.primary') : '';
    return `${monitor.name ?? get(t)('monitor.unknown')} - ${resolution}${type}`;
  }
</script>

<div class="monitor-selector">
  <p class="eyebrow monitor-selector-title">{$t('monitor.title')}</p>
  
  {#if loading}
    <p class="monitor-loading">{$t('monitor.loading')}</p>
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
            <span class="monitor-current">{$t('monitor.current')}</span>
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
    border: 1px solid var(--control-border-soft);
    border-radius: 0;
    cursor: pointer;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-fast);
    background:
      linear-gradient(180deg, var(--glare-soft), var(--glare-faint));
    box-shadow:
      inset 0 1px 0 var(--glare-soft),
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
    background: var(--control-border-strong);
  }

  .monitor-option::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(135deg, var(--glare-soft), transparent 52%);
    opacity: 0.85;
    z-index: 0;
  }

  .monitor-option:hover {
    transform: translateY(-1px);
    border-color: var(--control-border-strong);
    box-shadow: 0 18px 26px var(--shadow-color);
  }

  .monitor-option.selected {
    border-color: var(--control-border-strong);
    background:
      linear-gradient(135deg, var(--accent-soft), var(--field-bg));
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
    border: 1px solid var(--success-soft);
    background: var(--success-soft);
    color: var(--success);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
