<script>
  import CalendarMonthGrid from './CalendarMonthGrid.svelte';
  import CalendarDayDetail from './CalendarDayDetail.svelte';
  import { currentDateKey, visibleDateKey, setExecutionDateForDateKey } from '../../stores/app-store.js';
  import {
    setCalendarMonth,
    calendarMonth,
    ensureCalendarMonthInitialized
  } from '../../stores/calendar-store.js';
  import { formatters } from '../../config.js';
  import {
    getLocalDateKey,
    parseMonthKey,
    getMonthKeyFromDateKey
  } from '../../utils/state.js';

  let { active = false } = $props();

  let wasActive = false;
  let detailOpen = $state(false);

  function getMonthKey(dateKey) {
    return getMonthKeyFromDateKey(dateKey);
  }

  function shiftMonth(monthKey, delta) {
    const date = parseMonthKey(monthKey);
    date.setMonth(date.getMonth() + delta);
    return getMonthKey(getLocalDateKey(date));
  }

  function getClampedDateInMonth(monthKey, preferredDateKey) {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return `${monthKey}-01`;
    }
    const preferredDay = Math.max(1, Number(preferredDateKey?.slice(8, 10)) || 1);
    const lastDay = new Date(year, month, 0).getDate();
    const day = Math.min(preferredDay, lastDay);
    return `${monthKey}-${String(day).padStart(2, '0')}`;
  }

  const todayDateKey = $derived($currentDateKey);
  const executionDateKey = $derived($visibleDateKey);
  const displayedMonthKey = $derived($calendarMonth || getMonthKey(todayDateKey));
  const displayedMonthLabel = $derived(formatters.monthYear.format(parseMonthKey(displayedMonthKey)));

  $effect(() => {
    if (active && !wasActive) {
      ensureCalendarMonthInitialized(todayDateKey);
      const monthKey = getMonthKey(executionDateKey);
      if (monthKey && monthKey !== ($calendarMonth || getMonthKey(todayDateKey))) {
        setCalendarMonth(monthKey);
      }
    }
    wasActive = active;
  });

  $effect(() => {
    if (!active) {
      detailOpen = false;
    }
  });

  $effect(() => {
    if (!active || !detailOpen) return;

    function handleKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        detailOpen = false;
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  $effect(() => {
    if (!active) return;

    function handleKeydown(e) {
      if (e.target?.matches?.('input, textarea, select')) return;
      if (e.target?.closest?.('.calendar-grid')) return;
      if (e.key === 'ArrowLeft' && !e.altKey) {
        e.preventDefault();
        navigateMonth(-1);
      } else if (e.key === 'ArrowRight' && !e.altKey) {
        e.preventDefault();
        navigateMonth(1);
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  function selectDate(dateKey) {
    if (detailOpen && dateKey === executionDateKey) {
      detailOpen = false;
      return;
    }

    setExecutionDateForDateKey(dateKey);
    detailOpen = true;
    const monthKey = getMonthKey(dateKey);
    if (monthKey !== displayedMonthKey) {
      setCalendarMonth(monthKey);
    }
  }

  function closeDetail() {
    detailOpen = false;
  }

  function navigateMonth(delta) {
    const monthKey = shiftMonth(displayedMonthKey, delta);
    const dateKey = getClampedDateInMonth(monthKey, executionDateKey);
    setExecutionDateForDateKey(dateKey);
    setCalendarMonth(monthKey);
  }

  function goToToday() {
    setExecutionDateForDateKey(todayDateKey);
    setCalendarMonth(getMonthKey(todayDateKey));
    detailOpen = true;
  }
</script>

<section class="calendar-panel" aria-label="Calendário">
  <div class="calendar-toolbar">
    <div class="history-nav" aria-label="Navegação do mês">
      <button
        class="nav-button"
        type="button"
        aria-label="Mês anterior"
        onclick={() => navigateMonth(-1)}
      >
        &lt;
      </button>
      <span class="history-label">{displayedMonthLabel}</span>
      <button
        class="nav-button"
        type="button"
        aria-label="Próximo mês"
        onclick={() => navigateMonth(1)}
      >
        &gt;
      </button>
    </div>

    <button
      class="calendar-today-button ghost-button"
      type="button"
      aria-label="Ir para hoje"
      onclick={goToToday}
    >
      Hoje
    </button>
  </div>

  <div class="calendar-body">
    <CalendarMonthGrid
      monthKey={displayedMonthKey}
      selectedDateKey={executionDateKey}
      {todayDateKey}
      onSelect={selectDate}
    />
  </div>

  {#if detailOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="calendar-detail-backdrop" onclick={closeDetail} aria-hidden="true"></div>
    <div
      class="calendar-detail-popover"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes do dia selecionado"
    >
      <button
        type="button"
        class="calendar-detail-close ghost-button"
        aria-label="Fechar detalhes do dia"
        onclick={closeDetail}
      >
        ×
      </button>
      <CalendarDayDetail dateKey={executionDateKey} />
    </div>
  {/if}
</section>
