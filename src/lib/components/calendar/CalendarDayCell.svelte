<script>
  import { formatters } from '../../config.js';
  import { parseDateKey } from '../../utils/state.js';
  import { visibleDateKey, visibleTasks } from '../../stores/app-store.js';
  import {
    calendarDayTasks,
    buildDayTasksFromList,
    getCalendarDayTasks,
    eventsByDate
  } from '../../stores/calendar-store.js';

  const MAX_TASK_MARKERS = 4;
  const MAX_EVENT_MARKERS = 3;

  let {
    dateKey,
    day,
    outsideMonth = false,
    today = false,
    selected = false,
    onSelect = () => {}
  } = $props();

  const isExecutionDay = $derived(dateKey === $visibleDateKey);
  const dayTasks = $derived(
    isExecutionDay
      ? buildDayTasksFromList($visibleTasks)
      : getCalendarDayTasks($calendarDayTasks, dateKey)
  );
  const taskStats = $derived(dayTasks.stats);
  const taskMarkers = $derived(dayTasks.markers);

  const dayEvents = $derived($eventsByDate[dateKey] ?? []);
  const visibleEventMarkers = $derived(dayEvents.slice(0, MAX_EVENT_MARKERS));
  const eventMarkersExtra = $derived(Math.max(0, dayEvents.length - visibleEventMarkers.length));
  const hasEventMarkers = $derived(dayEvents.length > 0);

  const taskTotal = $derived(taskStats.total ?? 0);
  const taskPending = $derived(taskStats.pending ?? 0);
  const taskCompleted = $derived(taskStats.completed ?? 0);
  const allTasksDone = $derived(taskTotal > 0 && taskCompleted === taskTotal);

  const visibleTaskMarkers = $derived(taskMarkers.slice(0, MAX_TASK_MARKERS));
  const taskMarkersExtra = $derived(Math.max(0, taskTotal - visibleTaskMarkers.length));
  const hasTaskMarkers = $derived(taskTotal > 0 && visibleTaskMarkers.length > 0);

  const label = $derived(
    `${formatters.longDate.format(parseDateKey(dateKey))}${taskTotal > 0 ? `, ${taskTotal} ${taskTotal === 1 ? 'tarefa' : 'tarefas'}` : ''}${taskCompleted > 0 ? `, ${taskCompleted} concluída(s)` : ''}${dayEvents.length > 0 ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}` : ''}`
  );

  let buttonEl = $state(null);
  let wasSelected = $state(false);

  $effect(() => {
    if (selected && !wasSelected && buttonEl) {
      buttonEl.focus({ preventScroll: true });
    }
    wasSelected = selected;
  });
</script>

<button
  bind:this={buttonEl}
  type="button"
  role="gridcell"
  class="calendar-day"
  class:is-outside-month={outsideMonth}
  class:is-today={today}
  class:is-selected={selected}
  class:has-all-tasks-done={allTasksDone}
  aria-selected={selected}
  aria-label={label}
  tabindex={selected ? 0 : -1}
  onclick={() => onSelect(dateKey)}
>
  <span class="calendar-day-number">{day}</span>

  {#if taskTotal > 0}
    <span
      class="calendar-task-badge"
      class:is-all-done={allTasksDone}
      aria-hidden="true"
      title={allTasksDone
        ? `${taskTotal} tarefas concluídas`
        : `${taskPending} pendente(s), ${taskCompleted} concluída(s)`}
    >
      {taskTotal}
    </span>
  {/if}

  {#if hasTaskMarkers || hasEventMarkers}
    <span class="calendar-day-markers" aria-hidden="true">
      {#if hasTaskMarkers}
        <span class="calendar-marker-group">
          {#each visibleTaskMarkers as marker (marker.id)}
            <span
              class="calendar-task-dot"
              data-completed={marker.completed ? 'true' : 'false'}
              data-priority={marker.priority}
            ></span>
          {/each}
          {#if taskMarkersExtra > 0}
            <span class="calendar-marker-extra">+{taskMarkersExtra}</span>
          {/if}
        </span>
      {/if}
      {#if hasEventMarkers}
        <span class="calendar-marker-group calendar-marker-group--events">
          {#each visibleEventMarkers as event (event.id)}
            <span
              class="calendar-event-dot"
              data-color={event.color === 'neutral' ? undefined : event.color}
            ></span>
          {/each}
          {#if eventMarkersExtra > 0}
            <span class="calendar-event-extra">+{eventMarkersExtra}</span>
          {/if}
        </span>
      {/if}
    </span>
  {/if}
</button>
