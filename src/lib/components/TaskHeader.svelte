<script>
  import {
    viewOffsetDays,
    currentDateKey,
    setViewOffset,
    data,
    visibleTasks
  } from '../stores/app-store.js';
  import { panelTab, setPanelTab, opencodeSessionActive } from '../stores/ui-store.js';
  import { VIEW, CONFIG } from '../config.js';
  import { formatters } from '../config.js';
  import { parseDateKey, addDays } from '../utils/state.js';

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
  $: opencodeHeadline = $opencodeSessionActive ? 'Terminal OpenCode' : 'Escolher repositório';
  $: opencodeKicker = $opencodeSessionActive ? 'Sessão ativa' : 'Workspace';
  $: calendarMonth = $data.ui?.calendarMonth || $currentDateKey.slice(0, 7);
  $: calendarKicker = formatters.monthYear.format(parseDateKey(`${calendarMonth}-01`));
  $: headline =
    $panelTab === 'calendar'
      ? 'Calendário'
      : $panelTab === 'opencode'
        ? opencodeHeadline
        : $panelTab === 'files'
          ? 'Arquivos'
          : executionHeadline;
  $: kicker =
    $panelTab === 'calendar'
      ? calendarKicker
      : $panelTab === 'opencode'
        ? opencodeKicker
        : $panelTab === 'files'
          ? 'Desktop'
          : historyLabel;

  $: canGoPrev = $viewOffsetDays > -(CONFIG.HISTORY_VIEW_DAYS - 1);
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
    </div>
  </div>

  <div
    class="history-nav"
    class:is-dormant={$panelTab !== 'execution'}
    aria-label="Histórico rápido"
    aria-hidden={$panelTab !== 'execution'}
  >
    <button
      class="nav-button"
      type="button"
      aria-label="Dia anterior"
      disabled={$panelTab !== 'execution' || !canGoPrev}
      tabindex={$panelTab === 'execution' ? 0 : -1}
      onclick={() => setViewOffset($viewOffsetDays - 1)}
    >
      &lt;
    </button>
    <span class="history-label">{historyLabel}</span>
    <button
      class="nav-button"
      type="button"
      aria-label="Dia seguinte"
      disabled={$panelTab !== 'execution' || !canGoNext}
      tabindex={$panelTab === 'execution' ? 0 : -1}
      onclick={() => setViewOffset($viewOffsetDays + 1)}
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
