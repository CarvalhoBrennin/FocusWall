<script>
  import {
    viewOffsetDays,
    currentDateKey,
    setViewOffset,
    visibleTasks
  } from '../stores/app-store.js';
  import { VIEW, CONFIG } from '../config.js';
  import { formatters } from '../config.js';
  import { parseDateKey, addDays } from '../utils/state.js';
  import SettingsButton from './SettingsButton.svelte';

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
  $: headline = $viewOffsetDays === VIEW.TODAY ? 'Painel de execução' : 'Arquivo de execução';

  $: canGoPrev = $viewOffsetDays > -(CONFIG.HISTORY_VIEW_DAYS - 1);
  $: canGoNext = $viewOffsetDays < VIEW.TODAY;
</script>

<header class="task-header">
  <div class="task-header-copy">
    <div class="task-heading">
      <div>
        <p class="task-kicker">{historyLabel}</p>
        <h1 id="tasks-title">{headline}</h1>
      </div>
      <SettingsButton />
    </div>
  </div>

  <div class="history-nav" aria-label="Histórico rápido">
    <button
      class="nav-button"
      type="button"
      aria-label="Dia anterior"
      disabled={!canGoPrev}
      on:click={() => setViewOffset($viewOffsetDays - 1)}
    >
      &lt;
    </button>
    <span class="history-label">{historyLabel}</span>
    <button
      class="nav-button"
      type="button"
      aria-label="Dia seguinte"
      disabled={!canGoNext}
      on:click={() => setViewOffset($viewOffsetDays + 1)}
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
    gap: 16px;
  }

  .task-heading > div {
    flex: 1;
    min-width: 0;
  }
</style>
