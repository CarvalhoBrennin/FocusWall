<script>
  import {
    viewOffsetDays,
    currentDateKey,
    setViewOffset,
    data,
    visibleTasks
  } from '../stores/app-store.js';
  import { panelTab, setPanelTab } from '../stores/ui-store.js';
  import { VIEW, CONFIG } from '../config.js';
  import { formatters } from '../config.js';
  import { parseDateKey, parseMonthKey, addDays, normalizeMonthKey } from '../utils/state.js';
  import { t } from '../i18n/index.js';
  import { getVisiblePanelTabs } from '../features.js';

  const tabs = getVisiblePanelTabs();

  $: tasks = $visibleTasks || [];
  $: total = tasks.length;
  $: done = tasks.filter((task) => task.completed).length;
  $: pending = Math.max(0, total - done);
  $: visibleDate = addDays(parseDateKey($currentDateKey), $viewOffsetDays);
  $: historyLabel =
    $viewOffsetDays === VIEW.TODAY
      ? $t('tasks.today')
      : $viewOffsetDays === VIEW.YESTERDAY
        ? $t('tasks.yesterday')
        : formatters.historyDate.format(visibleDate);
  $: executionHeadline =
    $viewOffsetDays >= VIEW.TODAY ? $t('tasks.executionPanel') : $t('tasks.executionArchive');
  $: calendarMonthKey =
    normalizeMonthKey($data.ui?.calendarMonth) || $currentDateKey.slice(0, 7);
  $: calendarKicker = formatters.monthYear.format(parseMonthKey(calendarMonthKey));
  $: headline =
    $panelTab === 'calendar'
      ? $t('tasks.calendar')
      : $panelTab === 'files'
        ? $t('tasks.files')
        : $panelTab === 'system'
          ? $t('tasks.system')
          : $panelTab === 'radar'
            ? $t('tasks.radar')
            : $panelTab === 'media'
              ? $t('tasks.media')
              : $panelTab === 'assistant'
                ? $t('tasks.assistant')
                : $panelTab === 'neural'
                  ? $t('tasks.neural')
                  : $panelTab === 'opencode'
                    ? $t('tasks.opencode')
                    : $panelTab === 'vivarium'
                      ? $t('tasks.vivarium')
                      : executionHeadline;
  $: kicker =
    $panelTab === 'calendar'
      ? calendarKicker
      : $panelTab === 'files'
        ? $t('tasks.desktop')
        : $panelTab === 'system'
          ? $t('tasks.performance')
          : $panelTab === 'radar'
            ? $t('tasks.currentContext')
            : $panelTab === 'media'
              ? $t('tasks.nowPlaying')
              : $panelTab === 'assistant'
                ? $t('tasks.operator')
                : $panelTab === 'neural'
                  ? $t('tasks.knowledge')
                  : historyLabel;

  $: historySpanDays =
    $panelTab === 'calendar' ? CONFIG.HISTORY_RETENTION_DAYS : CONFIG.HISTORY_VIEW_DAYS;
  $: canGoPrev = $viewOffsetDays > -(historySpanDays - 1);
  $: canGoNext = $viewOffsetDays < CONFIG.FUTURE_VIEW_DAYS;

  function handleTabKeydown(event, tabId) {
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    setPanelTab(tabs[nextIndex].id);
    document.getElementById(`${tabs[nextIndex].id}-tab`)?.focus();
  }
</script>

<header class="task-header">
  <div class="task-header-copy">
    <div class="task-heading">
      <div>
        <p class="task-kicker">{kicker}</p>
        <h1 id="tasks-title">{headline}</h1>
      </div>
    </div>

    <div
      class="panel-tabs"
      role="tablist"
      aria-label={$t('tasks.panelMode')}
    >
      {#each tabs as tab (tab.id)}
        <button
          id="{tab.id}-tab"
          class="panel-tab"
          class:is-active={$panelTab === tab.id}
          type="button"
          role="tab"
          aria-selected={$panelTab === tab.id}
          aria-controls={tab.panelId}
          tabindex={$panelTab === tab.id ? 0 : -1}
          onclick={() => setPanelTab(tab.id)}
          onkeydown={(event) => handleTabKeydown(event, tab.id)}
        >
          {$t(tab.labelKey)}
        </button>
      {/each}
    </div>
  </div>

  <div
    class="history-nav"
    class:is-dormant={$panelTab !== 'execution' && $panelTab !== 'calendar'}
    aria-label={$t('tasks.historyNav')}
    aria-hidden={$panelTab !== 'execution' && $panelTab !== 'calendar'}
  >
    <button
      class="nav-button"
      type="button"
      aria-label={$t('tasks.prevDay')}
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
      aria-label={$t('tasks.nextDay')}
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
    width: 0;
    min-width: 0;
    max-width: 0;
    padding-inline: 0;
    gap: 0;
    border-width: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }

  .history-nav.is-dormant .history-label,
  .history-nav.is-dormant .nav-button {
    display: none;
  }
</style>
