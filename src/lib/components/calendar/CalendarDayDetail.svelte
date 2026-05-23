<script>
  import CalendarEventForm from './CalendarEventForm.svelte';
  import {
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    jumpToExecutionForDate
  } from '../../stores/calendar-store.js';
  import { showConfirmModal, showToast } from '../../stores/ui-store.js';
  import { formatters } from '../../config.js';
  import { parseDateKey } from '../../utils/state.js';

  let {
    dateKey,
    events = [],
    taskCount = 0
  } = $props();

  let formOpen = $state(false);
  let editingEvent = $state(null);

  const dateLabel = $derived(formatters.longDate.format(parseDateKey(dateKey)));

  $effect(() => {
    dateKey;
    formOpen = false;
    editingEvent = null;
  });

  function formatEventTime(event) {
    if (!event.startTime) return 'Dia inteiro';
    return event.endTime ? `${event.startTime} - ${event.endTime}` : event.startTime;
  }

  function openNewForm() {
    editingEvent = null;
    formOpen = true;
  }

  function openEditForm(event) {
    editingEvent = event;
    formOpen = true;
  }

  function closeForm() {
    formOpen = false;
    editingEvent = null;
  }

  async function saveEvent(payload) {
    if (editingEvent) {
      if (await updateCalendarEvent(editingEvent.id, payload)) {
        showToast('Evento atualizado');
        closeForm();
        return true;
      }
      return false;
    }

    if (await addCalendarEvent(payload)) {
      showToast('Evento criado');
      closeForm();
      return true;
    }
    return false;
  }

  function confirmDelete(event) {
    showConfirmModal({
      title: 'Excluir evento',
      body: `Excluir "${event.title}" do calendário?`,
      confirmLabel: 'Excluir',
      confirmDanger: true,
      onConfirm: async () => {
        if (await deleteCalendarEvent(event.id)) {
          showToast('Evento excluído');
        }
      }
    });
  }
</script>

<aside class="calendar-day-detail" aria-label="Detalhes do dia">
  <div class="calendar-detail-header">
    <div>
      <p class="calendar-detail-kicker">Dia selecionado</p>
      <h2>{dateLabel}</h2>
    </div>
    <button type="button" class="ghost-button calendar-compact-button calendar-new-event-button" onclick={openNewForm}>
      Novo evento
    </button>
  </div>

  <button type="button" class="ghost-button calendar-task-link" onclick={() => jumpToExecutionForDate(dateKey)}>
    Ver tarefas deste dia
    {#if taskCount > 0}
      <span>{taskCount}</span>
    {/if}
  </button>

  {#if formOpen}
    <CalendarEventForm
      event={editingEvent}
      {dateKey}
      onSave={saveEvent}
      onCancel={closeForm}
    />
  {/if}

  <div class="calendar-event-list" aria-live="polite">
    {#if events.length === 0}
      <p class="calendar-empty-copy">Nenhum evento neste dia.</p>
    {:else}
      {#each events as event (event.id)}
        <article class="calendar-event-item" data-color={event.color || 'neutral'}>
          <div class="calendar-event-main">
            <span class="calendar-event-time">{formatEventTime(event)}</span>
            <h3>{event.title}</h3>
            {#if event.notes}
              <p>{event.notes}</p>
            {/if}
          </div>
          <div class="calendar-event-actions">
            <button type="button" class="ghost-button" aria-label={`Editar ${event.title}`} onclick={() => openEditForm(event)}>
              Editar
            </button>
            <button type="button" class="ghost-button danger-button" aria-label={`Excluir ${event.title}`} onclick={() => confirmDelete(event)}>
              Excluir
            </button>
          </div>
        </article>
      {/each}
    {/if}
  </div>
</aside>
