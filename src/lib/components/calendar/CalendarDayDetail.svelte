<script>
  import { data, visibleDateKey, visibleTasks } from '../../stores/app-store.js';
  import { setPanelTab } from '../../stores/ui-store.js';
  import { eventsByDate } from '../../stores/calendar-store.js';
  import { formatters } from '../../config.js';
  import { parseDateKey } from '../../utils/state.js';

  let { dateKey } = $props();

  const isExecutionDay = $derived(dateKey === $visibleDateKey);
  const tasks = $derived(
    isExecutionDay
      ? ($visibleTasks || [])
      : (Array.isArray($data.tasksByDate?.[dateKey]) ? $data.tasksByDate[dateKey] : [])
  );
  const events = $derived($eventsByDate[dateKey] ?? []);

  const dateLabel = $derived(formatters.longDate.format(parseDateKey(dateKey)));
  const taskPending = $derived(tasks.filter((t) => !t.completed).length);
  const taskCompleted = $derived(tasks.filter((t) => t.completed).length);

  function formatEventTime(event) {
    if (event.startTime && event.endTime) return `${event.startTime} – ${event.endTime}`;
    if (event.startTime) return event.startTime;
    return 'Dia inteiro';
  }
</script>

<aside class="calendar-day-detail" aria-label="Detalhes do dia">
  <div class="calendar-detail-header">
    <div>
      <p class="calendar-detail-kicker">
        {isExecutionDay ? 'Mesmo dia do painel de execução' : 'Tarefas salvas neste dia'}
      </p>
      <h2>{dateLabel}</h2>
    </div>
  </div>

  <section class="calendar-events-section" aria-label="Eventos do dia">
    <div class="calendar-task-section-head">
      <h3 class="calendar-task-section-title">Eventos</h3>
      {#if events.length > 0}
        <span class="calendar-task-section-meta">{events.length}</span>
      {/if}
    </div>

    {#if events.length === 0}
      <p class="calendar-empty-copy">Nenhum evento neste dia.</p>
    {:else}
      <ul class="calendar-event-list">
        {#each events as event (event.id)}
          <li
            class="calendar-event-item"
            data-color={event.color === 'neutral' ? undefined : event.color}
          >
            <div class="calendar-event-main">
              <span class="calendar-event-time">{formatEventTime(event)}</span>
              <p class="calendar-event-title">{event.title}</p>
              {#if event.notes}
                <p>{event.notes}</p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="calendar-task-section" aria-label="Tarefas do painel de execução">
    <div class="calendar-task-section-head">
      <h3 class="calendar-task-section-title">Tarefas</h3>
      {#if tasks.length > 0}
        <span class="calendar-task-section-meta">
          {#if taskPending > 0}
            {taskPending} pend.
          {/if}
          {#if taskCompleted > 0}
            {#if taskPending > 0} · {/if}
            {taskCompleted} ok
          {/if}
        </span>
      {/if}
    </div>

    {#if tasks.length === 0}
      <p class="calendar-empty-copy">Nenhuma tarefa neste dia no painel de execução.</p>
    {:else}
      <ul class="calendar-task-preview" aria-label="Tarefas do painel de execução">
        {#each tasks as task (task.id)}
          <li class="calendar-task-preview-item" class:is-done={task.completed}>
            <span
              class="calendar-task-preview-state"
              data-priority={task.priority || 'medium'}
              data-completed={task.completed ? 'true' : 'false'}
              aria-hidden="true"
            ></span>
            <span class="calendar-task-preview-text">{task.text}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <button
      type="button"
      class="ghost-button calendar-task-link"
      aria-label="Editar tarefas no painel de execução"
      onclick={() => setPanelTab('execution')}
    >
      Editar tarefas no painel de execução
    </button>
  </section>
</aside>

<style>
  .calendar-event-title {
    margin: 0;
    color: var(--light-strong);
    font-family: var(--font-display);
    font-size: 0.92rem;
    font-weight: 800;
    line-height: 1.25;
  }
</style>
