<script>
  import CalendarDayCell from './CalendarDayCell.svelte';
  import { getLocalDateKey } from '../../utils/state.js';

  let {
    monthKey,
    selectedDateKey,
    todayDateKey,
    eventsByDate = {},
    taskCountsByDate = {},
    onSelect = () => {}
  } = $props();

  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function buildMonthCells(key) {
    const [year, month] = key.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());

    const cells = [];

    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateKey = getLocalDateKey(date);
      cells.push({
        dateKey,
        day: date.getDate(),
        outsideMonth: date.getMonth() !== month - 1
      });
    }

    return cells;
  }

  const cells = $derived(buildMonthCells(monthKey));

  function moveSelection(delta) {
    const index = cells.findIndex((cell) => cell.dateKey === selectedDateKey);
    if (index === -1) return;
    const next = cells[index + delta];
    if (next) onSelect(next.dateKey);
  }

  function handleGridKeydown(e) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-7);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(7);
    }
  }
</script>

<div class="calendar-grid-shell">
  <div class="calendar-weekdays" aria-hidden="true">
    {#each weekdays as weekday}
      <span class="calendar-weekday">{weekday}</span>
    {/each}
  </div>

  <div
    class="calendar-grid"
    role="grid"
    tabindex="0"
    aria-label="Calendário mensal"
    onkeydown={handleGridKeydown}
  >
    {#each cells as cell (cell.dateKey)}
      <CalendarDayCell
        dateKey={cell.dateKey}
        day={cell.day}
        outsideMonth={cell.outsideMonth}
        today={cell.dateKey === todayDateKey}
        selected={cell.dateKey === selectedDateKey}
        events={eventsByDate[cell.dateKey] || []}
        taskCount={taskCountsByDate[cell.dateKey] || 0}
        onSelect={onSelect}
      />
    {/each}
  </div>
</div>
