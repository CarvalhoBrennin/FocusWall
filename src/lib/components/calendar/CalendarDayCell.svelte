<script>
  import { formatters } from '../../config.js';
  import { parseDateKey } from '../../utils/state.js';

  let {
    dateKey,
    day,
    outsideMonth = false,
    today = false,
    selected = false,
    events = [],
    taskCount = 0,
    onSelect = () => {}
  } = $props();

  const eventCount = $derived(events.length);
  const markers = $derived(events.slice(0, 3));
  const extraCount = $derived(Math.max(0, eventCount - markers.length));
  const label = $derived(
    `${formatters.longDate.format(parseDateKey(dateKey))}, ${eventCount} ${eventCount === 1 ? 'evento' : 'eventos'}, ${taskCount} ${taskCount === 1 ? 'tarefa' : 'tarefas'}`
  );
</script>

<button
  type="button"
  role="gridcell"
  class="calendar-day"
  class:is-outside-month={outsideMonth}
  class:is-today={today}
  class:is-selected={selected}
  aria-selected={selected}
  aria-label={label}
  tabindex={selected ? 0 : -1}
  onclick={() => onSelect(dateKey)}
>
  <span class="calendar-day-number">{day}</span>

  {#if taskCount > 0}
    <span class="calendar-task-badge" aria-hidden="true">{taskCount}</span>
  {/if}

  {#if eventCount > 0}
    <span class="calendar-day-markers" aria-hidden="true">
      {#each markers as event (event.id)}
        <span class="calendar-event-dot" data-color={event.color || 'neutral'}></span>
      {/each}
      {#if extraCount > 0}
        <span class="calendar-event-extra">+{extraCount}</span>
      {/if}
    </span>
  {/if}
</button>
