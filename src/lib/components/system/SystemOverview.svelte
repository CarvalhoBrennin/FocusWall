<script>
  import MetricBar from './MetricBar.svelte';
  import { t } from '../../i18n/index.js';
  import {
    formatBytes,
    formatFrequency,
    formatPercent,
    formatRate,
    formatTemperature,
    formatUptime
  } from '../../services/system-metrics.js';

  let { snapshot } = $props();

  const primaryDisk = $derived(snapshot.disks[0] ?? null);
  const primaryNetwork = $derived(snapshot.network[0] ?? null);
  const primaryGpu = $derived(snapshot.gpus[0] ?? null);
  const networkDown = $derived(
    snapshot.network.reduce((total, adapter) => total + adapter.downloadBytesPerSecond, 0)
  );
  const networkUp = $derived(
    snapshot.network.reduce((total, adapter) => total + adapter.uploadBytesPerSecond, 0)
  );
  const diskRead = $derived(
    snapshot.disks.reduce((total, disk) => total + disk.readBytesPerSecond, 0)
  );
  const diskWrite = $derived(
    snapshot.disks.reduce((total, disk) => total + disk.writeBytesPerSecond, 0)
  );
</script>

<section class="system-overview" aria-label={$t('system.overview')}>
  <div class="system-health-grid">
    <MetricBar
      label={$t('system.cpu')}
      value={formatPercent(snapshot.cpu.usagePercent)}
      percent={snapshot.cpu.usagePercent}
      detail={`${formatFrequency(snapshot.cpu.frequencyMhz)} · ${snapshot.cpu.logicalCores} ${$t('system.logicalProcessors')}`}
    />
    <MetricBar
      label={$t('system.memory')}
      value={formatPercent(snapshot.memory.usagePercent)}
      percent={snapshot.memory.usagePercent}
      detail={`${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(snapshot.memory.totalBytes)}`}
      tone="cool"
    />
    <MetricBar
      label={$t('system.disk')}
      value={primaryDisk ? formatPercent(primaryDisk.usagePercent) : $t('system.unavailable')}
      percent={primaryDisk?.usagePercent ?? null}
      detail={primaryDisk?.mountPoint ?? $t('system.noData')}
      tone="warm"
    />
    <MetricBar
      label={$t('system.network')}
      value={primaryNetwork ? formatRate(networkDown) : $t('system.unavailable')}
      percent={null}
      detail={
        primaryNetwork
          ? `${$t('system.upload')}: ${formatRate(networkUp)}`
          : $t('system.noData')
      }
      tone="olive"
    />
    <MetricBar
      label={$t('system.gpu')}
      value={primaryGpu ? formatPercent(primaryGpu.usagePercent) : $t('system.unavailable')}
      percent={primaryGpu?.usagePercent ?? null}
      detail={primaryGpu?.name ?? $t('system.noData')}
      tone="violet"
    />
  </div>

  <div class="system-detail-grid">
    <article class="system-detail-card system-detail-card--wide">
      <header class="system-detail-head">
        <div>
          <p class="system-detail-kicker">{$t('system.hardware')}</p>
          <h3>{$t('system.processor')}</h3>
        </div>
        <span class="system-detail-code">CPU</span>
      </header>
      <strong class="system-detail-hero">{snapshot.cpu.name}</strong>
      <dl class="system-stat-grid">
        <div>
          <dt>{$t('system.frequency')}</dt>
          <dd>{formatFrequency(snapshot.cpu.frequencyMhz)}</dd>
        </div>
        <div>
          <dt>{$t('system.physicalCores')}</dt>
          <dd>{snapshot.cpu.physicalCores || $t('system.unavailable')}</dd>
        </div>
        <div>
          <dt>{$t('system.logicalProcessors')}</dt>
          <dd>{snapshot.cpu.logicalCores || $t('system.unavailable')}</dd>
        </div>
        <div>
          <dt>{$t('system.availableMemory')}</dt>
          <dd>{formatBytes(snapshot.memory.availableBytes)}</dd>
        </div>
      </dl>
    </article>

    <article class="system-detail-card">
      <header class="system-detail-head">
        <div>
          <p class="system-detail-kicker">{$t('system.storage')}</p>
          <h3>{$t('system.disks')}</h3>
        </div>
        <span class="system-detail-code">{snapshot.disks.length}</span>
      </header>
      {#if snapshot.disks.length}
        <div class="system-resource-list">
          {#each snapshot.disks as disk (disk.mountPoint)}
            <div class="system-resource-row">
              <div>
                <strong>{disk.mountPoint}</strong>
                <span>{disk.name || disk.fileSystem}</span>
              </div>
              <div class="system-resource-value">
                <strong>{formatPercent(disk.usagePercent)}</strong>
                <span>{formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)}</span>
              </div>
            </div>
          {/each}
        </div>
        <div class="system-io-strip">
          <span>{$t('system.read')} <strong>{formatRate(diskRead)}</strong></span>
          <span>{$t('system.write')} <strong>{formatRate(diskWrite)}</strong></span>
        </div>
      {:else}
        <p class="system-empty-inline">{$t('system.noDiskData')}</p>
      {/if}
    </article>

    <article class="system-detail-card">
      <header class="system-detail-head">
        <div>
          <p class="system-detail-kicker">{$t('system.connectivity')}</p>
          <h3>{$t('system.network')}</h3>
        </div>
        <span class="system-detail-code">NET</span>
      </header>
      {#if primaryNetwork}
        <strong class="system-detail-hero system-detail-hero--compact">{primaryNetwork.adapter}</strong>
        <dl class="system-stat-grid system-stat-grid--two">
          <div>
            <dt>{$t('system.download')}</dt>
            <dd>{formatRate(networkDown)}</dd>
          </div>
          <div>
            <dt>{$t('system.upload')}</dt>
            <dd>{formatRate(networkUp)}</dd>
          </div>
        </dl>
      {:else}
        <p class="system-empty-inline">{$t('system.noNetworkData')}</p>
      {/if}
    </article>

    <article class="system-detail-card">
      <header class="system-detail-head">
        <div>
          <p class="system-detail-kicker">{$t('system.graphics')}</p>
          <h3>{$t('system.gpu')}</h3>
        </div>
        <span class="system-detail-code">GPU</span>
      </header>
      {#if primaryGpu}
        <strong class="system-detail-hero system-detail-hero--compact">{primaryGpu.name}</strong>
        <dl class="system-stat-grid system-stat-grid--two">
          <div>
            <dt>{$t('system.usage')}</dt>
            <dd>{formatPercent(primaryGpu.usagePercent)}</dd>
          </div>
          <div>
            <dt>{$t('system.dedicatedMemory')}</dt>
            <dd>{formatBytes(primaryGpu.memoryTotalBytes)}</dd>
          </div>
        </dl>
      {:else}
        <p class="system-empty-inline">{$t('system.noGpuData')}</p>
      {/if}
    </article>

    <article class="system-detail-card">
      <header class="system-detail-head">
        <div>
          <p class="system-detail-kicker">{$t('system.machine')}</p>
          <h3>{$t('system.operatingSystem')}</h3>
        </div>
        <span class="system-detail-code">OS</span>
      </header>
      <strong class="system-detail-hero system-detail-hero--compact">{snapshot.system.osName}</strong>
      <dl class="system-stat-grid system-stat-grid--two">
        <div>
          <dt>{$t('system.uptime')}</dt>
          <dd>{formatUptime(snapshot.system.uptimeSeconds)}</dd>
        </div>
        <div>
          <dt>{$t('system.totalMemory')}</dt>
          <dd>{formatBytes(snapshot.memory.totalBytes)}</dd>
        </div>
      </dl>
    </article>

    <article class="system-detail-card">
      <header class="system-detail-head">
        <div>
          <p class="system-detail-kicker">{$t('system.sensors')}</p>
          <h3>{$t('system.temperatures')}</h3>
        </div>
        <span class="system-detail-code">°C</span>
      </header>
      <dl class="system-temperature-grid">
        <div>
          <dt>{$t('system.cpu')}</dt>
          <dd>{formatTemperature(snapshot.temperature.cpuCelsius)}</dd>
        </div>
        <div>
          <dt>{$t('system.gpu')}</dt>
          <dd>{formatTemperature(primaryGpu?.temperatureCelsius ?? snapshot.temperature.gpuCelsius)}</dd>
        </div>
      </dl>
    </article>
  </div>
</section>

<style>
  .system-overview {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .system-health-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    border: 1px solid var(--control-border-soft);
    background: var(--control-border-soft);
    box-shadow: var(--shadow-xs);
    overflow: hidden;
  }

  .system-health-grid :global(.metric-card:last-child) {
    border-right: 0;
  }

  .system-detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .system-detail-card {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    min-width: 0;
    padding: 0.9rem;
    border: 1px solid var(--control-border-soft);
    background:
      linear-gradient(145deg, var(--glare-faint), transparent 55%),
      var(--panel-bg-soft);
    box-shadow: inset 0 1px 0 var(--glare-faint);
  }

  .system-detail-card--wide {
    grid-column: 1 / -1;
  }

  .system-detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .system-detail-kicker {
    margin: 0 0 0.15rem;
    color: var(--light-soft);
    font-size: 0.58rem;
    font-weight: 850;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .system-detail-head h3 {
    margin: 0;
    color: var(--light-strong);
    font-size: 0.9rem;
    font-weight: 750;
  }

  .system-detail-code {
    padding: 0.25rem 0.35rem;
    border: 1px solid var(--control-border);
    color: var(--accent-soft);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .system-detail-hero {
    overflow: hidden;
    color: var(--light-strong);
    font-size: 1rem;
    font-weight: 750;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .system-detail-hero--compact {
    font-size: 0.86rem;
  }

  .system-stat-grid,
  .system-temperature-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.55rem;
    margin: 0;
  }

  .system-stat-grid--two,
  .system-temperature-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .system-stat-grid > div,
  .system-temperature-grid > div {
    min-width: 0;
    padding-top: 0.55rem;
    border-top: 1px solid var(--control-border-soft);
  }

  dt {
    color: var(--light-soft);
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  dd {
    margin: 0.2rem 0 0;
    overflow: hidden;
    color: var(--light-strong);
    font-size: 0.78rem;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .system-temperature-grid dd {
    font-size: 1.25rem;
  }

  .system-resource-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .system-resource-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--control-border-soft);
  }

  .system-resource-row > div {
    min-width: 0;
  }

  .system-resource-row strong,
  .system-resource-row span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .system-resource-row strong {
    color: var(--light-strong);
    font-size: 0.74rem;
  }

  .system-resource-row span {
    margin-top: 0.12rem;
    color: var(--light-soft);
    font-size: 0.62rem;
  }

  .system-resource-value {
    flex: 0 0 auto;
    max-width: 55%;
    text-align: right;
  }

  .system-io-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    color: var(--light-soft);
    font-size: 0.64rem;
    font-weight: 700;
  }

  .system-io-strip strong {
    color: var(--light-strong);
  }

  .system-empty-inline {
    margin: auto 0;
    color: var(--light-soft);
    font-size: 0.75rem;
    font-weight: 650;
  }

  @media (max-width: 1100px) {
    .system-health-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .system-stat-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .system-detail-grid {
      grid-template-columns: 1fr;
    }

    .system-detail-card--wide {
      grid-column: auto;
    }
  }
</style>
