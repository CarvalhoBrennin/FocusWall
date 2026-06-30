<script>
  import MetricBar from './MetricBar.svelte';
  import { formatTemp } from '../../services/system-metrics.js';

  const { snapshot } = $props();
</script>

<section class="system-overview" aria-label="Visão geral do sistema">
  <div class="system-overview-grid">
    <MetricBar
      label="CPU"
      percent={snapshot.metrics.cpuPercent}
      detail={snapshot.hardware.cpuName}
    />
    <MetricBar
      label="RAM"
      percent={snapshot.metrics.memoryPercent}
      detail="{snapshot.metrics.memoryUsedMb} / {snapshot.metrics.memoryTotalMb} MB"
      warnAt={90}
    />
  </div>

  <div class="system-chips">
    <div class="system-chip">
      <span class="system-chip-label">CPU temp</span>
      <span class="system-chip-value">{formatTemp(snapshot.temperature.cpuCelsius)}</span>
    </div>
    <div class="system-chip">
      <span class="system-chip-label">GPU temp</span>
      <span class="system-chip-value">{formatTemp(snapshot.temperature.gpuCelsius)}</span>
    </div>
    <div class="system-chip system-chip--wide">
      <span class="system-chip-label">Sistema</span>
      <span class="system-chip-value">{snapshot.hardware.osName}</span>
    </div>
  </div>
</section>

<style>
  .system-overview {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid var(--control-border-soft);
    background:
      linear-gradient(180deg, var(--glare-soft), var(--glare-faint)),
      var(--panel-bg-soft);
    box-shadow: inset 0 1px 0 var(--glare-soft), var(--shadow-xs);
  }

  .system-overview-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .system-chips {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .system-chip {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--control-border);
    background: var(--control-bg);
  }

  .system-chip--wide {
    grid-column: 1 / -1;
  }

  .system-chip-label {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--light-soft);
  }

  .system-chip-value {
    font-size: 0.86rem;
    font-weight: 800;
    color: var(--light-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Compactação ≤1100px centralizada em responsive.css (.system-overview) para
     evitar divergência scoped vs global no mesmo breakpoint. */
</style>
