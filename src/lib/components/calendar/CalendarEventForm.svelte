<script>
  import { normalizeCalendarTitle, normalizeDateKey, normalizeTimeValue } from '../../utils/state.js';

  let {
    event = null,
    dateKey,
    onSave = () => {},
    onCancel = () => {}
  } = $props();

  let title = $state('');
  let formDateKey = $state('');
  let startTime = $state('');
  let endTime = $state('');
  let notes = $state('');
  let color = $state('neutral');
  let error = $state('');

  const colors = [
    { value: 'neutral', label: 'Neutra' },
    { value: 'accent', label: 'Destaque' },
    { value: 'success', label: 'Concluído' },
    { value: 'danger', label: 'Crítico' }
  ];

  $effect(() => {
    title = event?.title || '';
    formDateKey = event?.dateKey || dateKey;
    startTime = event?.startTime || '';
    endTime = event?.endTime || '';
    notes = event?.notes || '';
    color = event?.color || 'neutral';
    error = '';
  });

  const canSave = $derived(normalizeCalendarTitle(title).length > 0);

  async function handleSubmit(e) {
    e.preventDefault();
    const normalizedTitle = normalizeCalendarTitle(title);
    const normalizedDateKey = normalizeDateKey(formDateKey);
    const normalizedStart = normalizeTimeValue(startTime);
    const normalizedEnd = normalizeTimeValue(endTime);

    if (!normalizedTitle) {
      error = 'Informe um título.';
      return;
    }
    if (!normalizedDateKey) {
      error = 'Informe uma data válida.';
      return;
    }
    if (startTime && !normalizedStart) {
      error = 'Hora inicial inválida.';
      return;
    }
    if (endTime && !normalizedEnd) {
      error = 'Hora final inválida.';
      return;
    }
    if (normalizedStart && normalizedEnd && normalizedEnd < normalizedStart) {
      error = 'A hora final precisa ser depois da inicial.';
      return;
    }

    const saved = await onSave({
      title: normalizedTitle,
      dateKey: normalizedDateKey,
      startTime: normalizedStart || undefined,
      endTime: normalizedEnd || undefined,
      notes: notes.trim().slice(0, 500) || undefined,
      color
    });

    if (!saved) {
      error = 'Não foi possível salvar o evento.';
    }
  }
</script>

<form class="calendar-event-form" aria-label={event ? 'Editar evento' : 'Novo evento'} onsubmit={handleSubmit}>
  <div class="calendar-form-row">
    <label class="calendar-field">
      <span>Título</span>
      <input
        type="text"
        maxlength={120}
        autocomplete="off"
        bind:value={title}
        placeholder="Nome do evento"
      />
    </label>
  </div>

  <div class="calendar-form-grid">
    <label class="calendar-field">
      <span>Data</span>
      <input type="date" bind:value={formDateKey} />
    </label>
    <label class="calendar-field">
      <span>Início</span>
      <input type="time" bind:value={startTime} />
    </label>
    <label class="calendar-field">
      <span>Fim</span>
      <input type="time" bind:value={endTime} />
    </label>
  </div>

  <label class="calendar-field">
    <span>Notas</span>
    <textarea maxlength={500} rows="3" bind:value={notes} placeholder="Detalhes rápidos"></textarea>
  </label>

  <div class="calendar-color-group" role="radiogroup" aria-label="Cor do evento">
    {#each colors as option}
      <label class="calendar-color-option" data-color={option.value}>
        <input type="radio" name="event-color" value={option.value} bind:group={color} />
        <span>{option.label}</span>
      </label>
    {/each}
  </div>

  {#if error}
    <p class="calendar-form-error" role="alert">{error}</p>
  {/if}

  <div class="calendar-form-actions">
    <button type="button" class="ghost-button" onclick={onCancel}>Cancelar</button>
    <button type="submit" class="primary-button" disabled={!canSave}>
      {event ? 'Salvar' : 'Criar'}
    </button>
  </div>
</form>
