<script>
  import { data, visibleDateKey, visibleTasks } from '../../stores/app-store.js';
  import { setPanelTab, showConfirmModal } from '../../stores/ui-store.js';
  import {
    addCalendarEvent,
    deleteCalendarEvent,
    eventsByDate,
    getCalendarEventRecurrenceLabel,
    updateCalendarEvent
  } from '../../stores/calendar-store.js';
  import { formatters } from '../../config.js';
  import { normalizeDateKey, parseDateKey } from '../../utils/state.js';

  let { dateKey } = $props();

  const RECURRENCE_OPTIONS = [
    { value: 'none', label: 'Não repetir' },
    { value: 'yearly', label: 'Todo ano' },
    { value: 'monthly', label: 'Todo mês' },
    { value: 'weekly', label: 'Toda semana' }
  ];

  const COLOR_OPTIONS = [
    { value: 'neutral', label: 'Neutro' },
    { value: 'accent', label: 'Destaque' },
    { value: 'success', label: 'Ok' },
    { value: 'danger', label: 'Alerta' }
  ];

  let formMode = $state('idle');
  let editingEventId = $state('');
  let formError = $state('');
  let form = $state(createEmptyForm(''));

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
  const formTitle = $derived(formMode === 'edit' ? 'Editar evento' : 'Novo evento');
  const editingEvent = $derived(
    editingEventId ? events.find((event) => event.id === editingEventId) ?? null : null
  );
  const editingOccurrenceDateKey = $derived(editingEvent?.occurrenceDateKey || '');
  const isEditingRecurringOccurrence = $derived(
    formMode === 'edit' &&
      editingEvent &&
      editingEvent.recurrence &&
      editingEvent.recurrence !== 'none' &&
      editingOccurrenceDateKey &&
      editingOccurrenceDateKey !== editingEvent.dateKey
  );

  $effect(() => {
    if (formMode === 'idle') {
      form = createEmptyForm(dateKey);
      formError = '';
    }
  });

  function createEmptyForm(targetDateKey) {
    return {
      title: '',
      dateKey: targetDateKey,
      startTime: '',
      endTime: '',
      notes: '',
      color: 'neutral',
      recurrence: 'none'
    };
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function formatEventTime(event) {
    if (event.startTime && event.endTime) return `${event.startTime} – ${event.endTime}`;
    if (event.startTime) return event.startTime;
    return 'Dia inteiro';
  }

  function formatShortDate(dateKey) {
    return formatters.historyDate.format(parseDateKey(dateKey));
  }

  function startCreate() {
    form = createEmptyForm(dateKey);
    editingEventId = '';
    formError = '';
    formMode = 'create';
  }

  function startEdit(event) {
    form = {
      title: event.title || '',
      dateKey: event.dateKey || dateKey,
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      notes: event.notes || '',
      color: event.color || 'neutral',
      recurrence: event.recurrence || 'none'
    };
    editingEventId = event.id;
    formError = '';
    formMode = 'edit';
  }

  function cancelForm() {
    formMode = 'idle';
    editingEventId = '';
    formError = '';
    form = createEmptyForm(dateKey);
  }

  function buildPayload() {
    const title = normalizeText(form.title);
    if (!title) {
      formError = 'Informe um título para o evento.';
      return null;
    }
    const validDateKey = normalizeDateKey(form.dateKey);
    if (!validDateKey) {
      formError = 'Informe uma data válida.';
      return null;
    }
    if (form.startTime && form.endTime && form.endTime < form.startTime) {
      formError = 'O horário final precisa ser depois do início.';
      return null;
    }

    return {
      title,
      dateKey: validDateKey,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      notes: form.notes?.trim() || undefined,
      color: form.color || 'neutral',
      recurrence: form.recurrence || 'none'
    };
  }

  async function submitForm() {
    const payload = buildPayload();
    if (!payload) return;

    const ok =
      formMode === 'edit'
        ? await updateCalendarEvent(editingEventId, payload)
        : Boolean(await addCalendarEvent(payload));

    if (!ok) {
      formError = 'Não foi possível salvar o evento.';
      return;
    }

    cancelForm();
  }

  function confirmDelete(event) {
    const isRecurring = Boolean(event.recurrence && event.recurrence !== 'none');
    showConfirmModal({
      title: isRecurring ? 'Excluir evento recorrente?' : 'Excluir evento?',
      body: isRecurring
        ? `Isso remove "${event.title}" de todas as ocorrências.`
        : `Isso remove "${event.title}" do calendário.`,
      confirmLabel: 'Excluir',
      confirmDanger: true,
      onConfirm: async () => {
        const ok = await deleteCalendarEvent(event.id);
        if (!ok) formError = 'Não foi possível excluir o evento.';
        if (editingEventId === event.id) cancelForm();
      }
    });
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
    <button
      type="button"
      class="ghost-button calendar-new-event-button"
      onclick={startCreate}
      disabled={formMode === 'create'}
    >
      Novo evento
    </button>
  </div>

  {#if formMode !== 'idle'}
    <form class="calendar-event-form" aria-label={formTitle} onsubmit={(event) => { event.preventDefault(); submitForm(); }}>
      <div class="calendar-task-section-head">
        <h3 class="calendar-task-section-title">{formTitle}</h3>
      </div>

      {#if isEditingRecurringOccurrence}
        <p class="calendar-form-hint">
          Editando a série recorrente. A ocorrência visível é {formatShortDate(editingOccurrenceDateKey)};
          a data base salva é {formatShortDate(editingEvent.dateKey)}.
        </p>
      {/if}

      <label class="calendar-field">
        Título
        <input bind:value={form.title} maxlength="120" placeholder="Ex.: Aniversário da Ana" />
      </label>

      <div class="calendar-form-grid calendar-form-grid--event-meta">
        <label class="calendar-field">
          Data
          <input type="date" bind:value={form.dateKey} />
        </label>
        <label class="calendar-field">
          Início
          <input type="time" bind:value={form.startTime} />
        </label>
        <label class="calendar-field">
          Fim
          <input type="time" bind:value={form.endTime} />
        </label>
      </div>

      <label class="calendar-field">
        Repetição
        <select bind:value={form.recurrence}>
          {#each RECURRENCE_OPTIONS as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>

      <label class="calendar-field">
        Observações
        <textarea bind:value={form.notes} maxlength="500" placeholder="Notas curtas, se necessário"></textarea>
      </label>

      <div class="calendar-field">
        Cor
        <div class="calendar-color-group">
          {#each COLOR_OPTIONS as option}
            <label class="calendar-color-option" data-color={option.value === 'neutral' ? undefined : option.value}>
              <input type="radio" bind:group={form.color} value={option.value} />
              <span>{option.label}</span>
            </label>
          {/each}
        </div>
      </div>

      {#if formError}
        <p class="calendar-form-error">{formError}</p>
      {/if}

      <div class="calendar-form-actions">
        <button type="button" class="ghost-button" onclick={cancelForm}>Cancelar</button>
        <button type="submit" class="primary-button">Salvar</button>
      </div>
    </form>
  {/if}

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
              {#if event.recurrence && event.recurrence !== 'none'}
                <span class="calendar-event-recurrence">{getCalendarEventRecurrenceLabel(event.recurrence)}</span>
              {/if}
              {#if event.notes}
                <p>{event.notes}</p>
              {/if}
            </div>
            <div class="calendar-event-actions" aria-label="Ações do evento">
              <button type="button" class="ghost-button" onclick={() => startEdit(event)}>Editar</button>
              <button type="button" class="ghost-button" onclick={() => confirmDelete(event)}>Excluir</button>
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
