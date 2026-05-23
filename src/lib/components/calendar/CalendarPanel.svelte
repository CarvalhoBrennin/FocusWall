<script>
  import CalendarMonthGrid from './CalendarMonthGrid.svelte';
  import CalendarDayDetail from './CalendarDayDetail.svelte';
  import { data, currentDateKey } from '../../stores/app-store.js';
  import { setCalendarMonth, calendarMonth } from '../../stores/calendar-store.js';
  import { formatters } from '../../config.js';
  import { getLocalDateKey, parseDateKey } from '../../utils/state.js';

  let { active = false } = $props();

  let selectedDateKey = $state(getLocalDateKey(new Date()));

  function getMonthKey(dateKey) {
    return dateKey.slice(0, 7);
  }

  function parseMonthKey(monthKey) {
    return parseDateKey(`${monthKey}-01`);
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

  function groupEvents(events) {
    const grouped = {};
    for (const event of events || []) {
      if (!grouped[event.dateKey]) grouped[event.dateKey] = [];
      grouped[event.dateKey].push(event);
    }
    for (const dateKey of Object.keys(grouped)) {
      grouped[dateKey].sort((left, right) => {
        const leftTime = left.startTime || '';
        const rightTime = right.startTime || '';
        if (!leftTime && rightTime) return -1;
        if (leftTime && !rightTime) return 1;
        return leftTime.localeCompare(rightTime) || left.title.localeCompare(right.title, 'pt-BR');
      });
    }
    return grouped;
  }

  function countTasks(tasksByDate) {
    const counts = {};
    for (const [dateKey, tasks] of Object.entries(tasksByDate || {})) {
      counts[dateKey] = Array.isArray(tasks) ? tasks.length : 0;
    }
    return counts;
  }

  const todayDateKey = $derived($currentDateKey);
  const displayedMonthKey = $derived($calendarMonth || getMonthKey(todayDateKey));
  const displayedMonthLabel = $derived(formatters.monthYear.format(parseMonthKey(displayedMonthKey)));
  const eventsByDate = $derived(groupEvents($data.calendarEvents));
  const taskCountsByDate = $derived(countTasks($data.tasksByDate));
  const selectedEvents = $derived(eventsByDate[selectedDateKey] || []);
  const selectedTaskCount = $derived(taskCountsByDate[selectedDateKey] || 0);

  $effect(() => {
    if (!active) return;

    const monthKey = $calendarMonth || getMonthKey(todayDateKey);
    if (!$calendarMonth) {
      setCalendarMonth(monthKey);
    }
    if (getMonthKey(selectedDateKey) !== monthKey) {
      selectedDateKey = getClampedDateInMonth(monthKey, selectedDateKey);
    }
  });

  $effect(() => {
    if (!active) return;

    function handleKeydown(e) {
      if (e.target?.matches?.('input, textarea, select')) return;
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
    selectedDateKey = dateKey;
    const monthKey = getMonthKey(dateKey);
    if (monthKey !== displayedMonthKey) {
      setCalendarMonth(monthKey);
    }
  }

  function navigateMonth(delta) {
    const monthKey = shiftMonth(displayedMonthKey, delta);
    selectedDateKey = getClampedDateInMonth(monthKey, selectedDateKey);
    setCalendarMonth(monthKey);
  }

  function goToToday() {
    selectedDateKey = todayDateKey;
    setCalendarMonth(getMonthKey(todayDateKey));
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
      onclick={goToToday}
    >
      Hoje
    </button>
  </div>

  <div class="calendar-body">
    <CalendarMonthGrid
      monthKey={displayedMonthKey}
      {selectedDateKey}
      {todayDateKey}
      {eventsByDate}
      {taskCountsByDate}
      onSelect={selectDate}
    />
    <CalendarDayDetail
      dateKey={selectedDateKey}
      events={selectedEvents}
      taskCount={selectedTaskCount}
    />
  </div>
</section>
