<script>
  import { formatters } from '../../config.js';
  import { parseDateKey } from '../../utils/state.js';
  import { visibleDateKey, visibleTasks } from '../../stores/app-store.js';
  import {
    calendarDayTasks,
    buildDayTasksFromList,
    getCalendarDayTasks
  } from '../../stores/calendar-store.js';

  const MAX_TASK_MARKERS = 4;

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

  const taskTotal = $derived(taskStats.total ?? 0);
  const taskPending = $derived(taskStats.pending ?? 0);
  const taskCompleted = $derived(taskStats.completed ?? 0);
  const allTasksDone = $derived(taskTotal > 0 && taskCompleted === taskTotal);

  const visibleTaskMarkers = $derived(taskMarkers.slice(0, MAX_TASK_MARKERS));
  const taskMarkersExtra = $derived(Math.max(0, taskTotal - visibleTaskMarkers.length));
  const hasTaskMarkers = $derived(taskTotal > 0 && visibleTaskMarkers.length > 0);

  const label = $derived(
    `${formatters.longDate.format(parseDateKey(dateKey))}${taskTotal > 0 ? `, ${taskTotal} ${taskTotal === 1 ? 'tarefa' : 'tarefas'}` : ''}${taskCompleted > 0 ? `, ${taskCompleted} concluída(s)` : ''}`
  );
</script>

<button
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

  {#if hasTaskMarkers}
    <span class="calendar-day-markers" aria-hidden="true">
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
</button>
