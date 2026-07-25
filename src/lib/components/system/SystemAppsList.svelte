<script>
  import { formatMessage, t } from '../../i18n/index.js';
  import { formatBytes, formatPercent, formatRate } from '../../services/system-metrics.js';

  let { processes = [], totalProcessCount = processes.length, processesTruncated = false } = $props();

  let query = $state('');
  let sortKey = $state('cpuPercent');
  let sortDirection = $state('desc');

  const visibleProcesses = $derived.by(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = normalizedQuery
      ? processes.filter((process) =>
          `${process.name} ${process.exe} ${process.pid}`
            .toLocaleLowerCase()
            .includes(normalizedQuery)
        )
      : [...processes];

    return filtered.sort((left, right) => {
      let result = 0;
      if (sortKey === 'name') {
        result = left.name.localeCompare(right.name);
      } else if (sortKey === 'disk') {
        result =
          left.readBytesPerSecond +
          left.writeBytesPerSecond -
          (right.readBytesPerSecond + right.writeBytesPerSecond);
      } else {
        result = Number(left[sortKey] ?? 0) - Number(right[sortKey] ?? 0);
      }
      return sortDirection === 'asc' ? result : -result;
    });
  });

  function toggleSort(nextKey) {
    if (sortKey === nextKey) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortKey = nextKey;
    sortDirection = nextKey === 'name' ? 'asc' : 'desc';
  }

  function ariaSort(key) {
    if (key !== sortKey) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  function sortMarker(key) {
    if (key !== sortKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  const processCountLabel = $derived(
    processesTruncated
      ? formatMessage($t('system.processCountLimited'), {
          shown: processes.length,
          total: totalProcessCount
        })
      : formatMessage($t('system.processCount'), { count: visibleProcesses.length })
  );
</script>

<section class="system-processes" aria-label={$t('system.processes')}>
  <header class="system-processes-head">
    <div>
      <p class="system-processes-kicker">{$t('system.activity')}</p>
      <h3>{$t('system.processes')}</h3>
      <span>{processCountLabel}</span>
      {#if processesTruncated}
        <small id="system-process-search-scope">{$t('system.processSearchScope')}</small>
      {/if}
    </div>
    <label class="system-process-search">
      <span class="sr-only">{$t('system.searchProcesses')}</span>
      <span aria-hidden="true">⌕</span>
      <input
        type="search"
        bind:value={query}
        placeholder={$t('system.searchPlaceholder')}
        autocomplete="off"
        aria-describedby={processesTruncated ? 'system-process-search-scope' : undefined}
      />
    </label>
  </header>

  {#if visibleProcesses.length === 0}
    <p class="system-processes-empty">{$t('system.noProcesses')}</p>
  {:else}
    <div class="system-processes-table-wrap">
      <table class="system-processes-table">
        <thead>
          <tr>
            <th scope="col" aria-sort={ariaSort('name')}>
              <button type="button" onclick={() => toggleSort('name')}>
                {$t('system.process')}{sortMarker('name')}
              </button>
            </th>
            <th scope="col">{$t('system.type')}</th>
            <th scope="col" aria-sort={ariaSort('pid')}>
              <button type="button" onclick={() => toggleSort('pid')}>
                PID{sortMarker('pid')}
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('cpuPercent')}>
              <button type="button" onclick={() => toggleSort('cpuPercent')}>
                CPU{sortMarker('cpuPercent')}
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('memoryBytes')}>
              <button type="button" onclick={() => toggleSort('memoryBytes')}>
                {$t('system.memory')}{sortMarker('memoryBytes')}
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('disk')}>
              <button type="button" onclick={() => toggleSort('disk')}>
                {$t('system.disk')}{sortMarker('disk')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {#each visibleProcesses as process (process.pid)}
            <tr>
              <td>
                <span class="system-process-name">{process.name}</span>
                <span class="system-process-exe">{process.exe}</span>
              </td>
              <td>
                <span
                  class="system-process-type"
                  class:system-process-type--system={process.isSystem}
                >
                  {process.isSystem ? $t('system.systemProcess') : $t('system.application')}
                </span>
              </td>
              <td class="system-process-number">{process.pid}</td>
              <td class="system-process-number system-process-number--cpu">
                {formatPercent(process.cpuPercent)}
              </td>
              <td class="system-process-number">{formatBytes(process.memoryBytes)}</td>
              <td class="system-process-number">
                {formatRate(process.readBytesPerSecond + process.writeBytesPerSecond)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .system-processes {
    display: flex;
    flex-direction: column;
    min-height: 16rem;
    border: 1px solid var(--control-border-soft);
    background: var(--panel-bg-soft);
  }

  .system-processes-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.8rem 0.9rem;
    border-bottom: 1px solid var(--control-border-soft);
    background: linear-gradient(90deg, var(--glare-faint), transparent);
  }

  .system-processes-head > div {
    min-width: 0;
  }

  .system-processes-kicker {
    margin: 0 0 0.1rem;
    color: var(--light-soft);
    font-size: 0.56rem;
    font-weight: 850;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .system-processes-head h3 {
    display: inline;
    margin: 0;
    color: var(--light-strong);
    font-size: 0.9rem;
    font-weight: 780;
  }

  .system-processes-head > div > span {
    margin-left: 0.5rem;
    color: var(--light-soft);
    font-size: 0.65rem;
    font-weight: 700;
  }

  .system-processes-head > div > small {
    display: block;
    margin-top: 0.28rem;
    color: var(--light-soft);
    font-size: 0.6rem;
    font-weight: 650;
  }

  .system-process-search {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: min(17rem, 42%);
    padding: 0 0.6rem;
    border: 1px solid var(--control-border);
    background: var(--control-bg);
    color: var(--light-soft);
  }

  .system-process-search:focus-within {
    border-color: var(--accent-soft);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .system-process-search input {
    width: 100%;
    min-width: 0;
    padding: 0.5rem 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--light-strong);
    font: inherit;
    font-size: 0.72rem;
    font-weight: 650;
  }

  .system-processes-table-wrap {
    overflow: visible;
  }

  .system-processes-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
  }

  .system-processes-table th {
    position: sticky;
    z-index: 2;
    top: 0;
    padding: 0;
    border-bottom: 1px solid var(--control-border);
    background: var(--panel-bg);
    color: var(--light-soft);
    font-size: 0.59rem;
    font-weight: 850;
    letter-spacing: 0.07em;
    text-align: left;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .system-processes-table th button {
    width: 100%;
    padding: 0.52rem 0.65rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-align: inherit;
    text-transform: inherit;
    cursor: pointer;
  }

  .system-processes-table th:not(:first-child),
  .system-processes-table td:not(:first-child) {
    text-align: right;
  }

  .system-processes-table th:nth-child(2),
  .system-processes-table td:nth-child(2) {
    text-align: left;
  }

  .system-processes-table td {
    padding: 0.52rem 0.65rem;
    border-bottom: 1px solid var(--control-border-soft);
    color: var(--light-strong);
    font-weight: 650;
    vertical-align: middle;
  }

  .system-processes-table tbody tr:hover {
    background: var(--glare-faint);
  }

  .system-process-name,
  .system-process-exe {
    display: block;
    max-width: 22rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .system-process-name {
    font-weight: 780;
  }

  .system-process-exe {
    margin-top: 0.12rem;
    color: var(--light-soft);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.6rem;
  }

  .system-process-type {
    display: inline-block;
    padding: 0.2rem 0.35rem;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--control-border));
    color: var(--accent-soft);
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .system-process-type--system {
    border-color: var(--control-border);
    color: var(--light-soft);
  }

  .system-process-number {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .system-process-number--cpu {
    color: var(--accent-soft);
  }

  .system-processes-empty {
    margin: auto;
    padding: 2rem 1rem;
    color: var(--light-soft);
    font-size: 0.76rem;
    font-weight: 700;
    text-align: center;
  }

  @media (max-width: 760px) {
    .system-processes-head {
      align-items: stretch;
      flex-direction: column;
    }

    .system-process-search {
      width: auto;
    }

    .system-processes-table-wrap {
      overflow-x: auto;
    }

    .system-processes-table th:nth-child(2),
    .system-processes-table td:nth-child(2),
    .system-processes-table th:nth-child(3),
    .system-processes-table td:nth-child(3) {
      display: none;
    }
  }
</style>
