<script>
  import {
    viewOffsetDays,
    currentDateKey,
    setViewOffset,
    data,
    visibleTasks
  } from '../stores/app-store.js';
  import { panelTab, setPanelTab } from '../stores/ui-store.js';
  // import { opencodeSessionActive } from '../stores/ui-store.js';
  import { VIEW, CONFIG } from '../config.js';
  import { formatters } from '../config.js';
  import { parseDateKey, parseMonthKey, addDays, normalizeMonthKey } from '../utils/state.js';

  $: tasks = $visibleTasks || [];
  $: total = tasks.length;
  $: done = tasks.filter((task) => task.completed).length;
  $: pending = Math.max(0, total - done);
  $: visibleDate = addDays(parseDateKey($currentDateKey), $viewOffsetDays);
  $: historyLabel =
    $viewOffsetDays === VIEW.TODAY
      ? 'Hoje'
      : $viewOffsetDays === VIEW.YESTERDAY
        ? 'Ontem'
        : formatters.historyDate.format(visibleDate);
  $: executionHeadline =
    $viewOffsetDays === VIEW.TODAY ? 'Painel de execução' : 'Arquivo de execução';
  // $: opencodeHeadline = $opencodeSessionActive ? 'OpenCode' : 'Escolher repositório';
  // $: opencodeKicker = $opencodeSessionActive ? 'Sessão ativa' : 'Workspace';
  $: calendarMonthKey =
    normalizeMonthKey($data.ui?.calendarMonth) || $currentDateKey.slice(0, 7);
  $: calendarKicker = formatters.monthYear.format(parseMonthKey(calendarMonthKey));
  // opencode: : $panelTab === 'opencode' ? opencodeHeadline :
  $: headline =
    $panelTab === 'calendar'
      ? 'Calendário'
      : $panelTab === 'files'
        ? 'Arquivos'
        : $panelTab === 'system'
          ? 'Sistema'
          : executionHeadline;
  // opencode: : $panelTab === 'opencode' ? opencodeKicker :
  $: kicker =
    $panelTab === 'calendar'
      ? calendarKicker
      : $panelTab === 'files'
        ? 'Desktop'
        : $panelTab === 'system'
          ? 'Desempenho'
          : historyLabel;

  $: historySpanDays =
    $panelTab === 'calendar' ? CONFIG.HISTORY_RETENTION_DAYS : CONFIG.HISTORY_VIEW_DAYS;
  $: canGoPrev = $viewOffsetDays > -(historySpanDays - 1);
  $: canGoNext = $viewOffsetDays < VIEW.TODAY;
</script>

<header class="task-header">
  <div class="task-header-copy">
    <div class="task-heading">
      <div>
        <p class="task-kicker">{kicker}</p>
        <h1 id="tasks-title">{headline}</h1>
      </div>
    </div>

    <div class="panel-tabs" role="tablist" aria-label="Modo do painel">
      <button
        class="panel-tab"
        class:is-active={$panelTab === 'execution'}
        type="button"
        role="tab"
        aria-selected={$panelTab === 'execution'}
        aria-controls="execution-panel"
        onclick={() => setPanelTab('execution')}
      >
        Execução
      </button>
      <!-- OpenCode tab oculto temporariamente
      <button
        class="panel-tab"
        class:is-active={$panelTab === 'opencode'}
        type="button"
        role="tab"
        aria-selected={$panelTab === 'opencode'}
        aria-controls="opencode-panel"
        onclick={() => setPanelTab('opencode')}
      >
        OpenCode
      </button>
      -->
      <button
        class="panel-tab"
        class:is-active={$panelTab === 'calendar'}
        type="button"
        role="tab"
        aria-selected={$panelTab === 'calendar'}
        aria-controls="calendar-panel"
        onclick={() => setPanelTab('calendar')}
      >
        Calendário
      </button>
      <button
        class="panel-tab"
        class:is-active={$panelTab === 'files'}
        type="button"
        role="tab"
        aria-selected={$panelTab === 'files'}
        aria-controls="files-panel"
        onclick={() => setPanelTab('files')}
      >
        Arquivos
      </button>
      <button
        class="panel-tab"
        class:is-active={$panelTab === 'system'}
        type="button"
        role="tab"
        aria-selected={$panelTab === 'system'}
        aria-controls="system-panel"
        onclick={() => setPanelTab('system')}
      >
        Sistema
      </button>
    </div>
  </div>

  <div
    class="history-nav"
    class:is-dormant={$panelTab !== 'execution' && $panelTab !== 'calendar'}
    aria-label="Histórico rápido"
    aria-hidden={$panelTab !== 'execution' && $panelTab !== 'calendar'}
  >
    <button
      class="nav-button"
      type="button"
      aria-label="Dia anterior"
      disabled={($panelTab !== 'execution' && $panelTab !== 'calendar') || !canGoPrev}
      tabindex={$panelTab === 'execution' || $panelTab === 'calendar' ? 0 : -1}
      onclick={() =>
        setViewOffset($viewOffsetDays - 1, {
          maxHistoryDays: $panelTab === 'calendar' ? CONFIG.HISTORY_RETENTION_DAYS : undefined
        })}
    >
      &lt;
    </button>
    <span class="history-label">{historyLabel}</span>
    <button
      class="nav-button"
      type="button"
      aria-label="Dia seguinte"
      disabled={($panelTab !== 'execution' && $panelTab !== 'calendar') || !canGoNext}
      tabindex={$panelTab === 'execution' || $panelTab === 'calendar' ? 0 : -1}
      onclick={() =>
        setViewOffset($viewOffsetDays + 1, {
          maxHistoryDays: $panelTab === 'calendar' ? CONFIG.HISTORY_RETENTION_DAYS : undefined
        })}
    >
      &gt;
    </button>
  </div>
</header>

<style>
  .task-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .task-heading > div {
    flex: 1;
    min-width: 0;
  }

  .history-nav.is-dormant {
    visibility: hidden;
    pointer-events: none;
  }
</style>
