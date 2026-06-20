<script>
  import CalendarDayCell from './CalendarDayCell.svelte';
  import { getLocalDateKey } from '../../utils/state.js';

  let {
    monthKey,
    selectedDateKey,
    todayDateKey,
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
      moveSelection(+1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-7);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(7);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(selectedDateKey);
    }
  }
</script>

<div class="calendar-grid-shell" onkeydown={handleGridKeydown}>
  <div class="calendar-weekdays" role="row" id="calendar-weekdays">
    {#each weekdays as weekday}
      <span class="calendar-weekday" role="columnheader">{weekday}</span>
    {/each}
  </div>

  <div
    class="calendar-grid"
    role="grid"
    aria-labelledby="calendar-weekdays"
  >
    {#each cells as cell (cell.dateKey)}
      <CalendarDayCell
        dateKey={cell.dateKey}
        day={cell.day}
        outsideMonth={cell.outsideMonth}
        today={cell.dateKey === todayDateKey}
        selected={cell.dateKey === selectedDateKey}
        onSelect={onSelect}
      />
    {/each}
  </div>
</div>
