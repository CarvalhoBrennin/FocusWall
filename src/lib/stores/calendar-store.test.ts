import { describe, expect, it } from 'vitest';
import { buildCalendarDayTasks, buildDayTasksFromList, sortCalendarEvents, buildEventsByDate } from './calendar-store.js';

describe('buildDayTasksFromList', () => {
  it('matches execution panel task list', () => {
    const bundle = buildDayTasksFromList([
      {
        id: 'a',
        text: 'Done',
        completed: true,
        pinned: false,
        priority: 'medium',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 'b',
        text: 'Todo',
        completed: false,
        pinned: false,
        priority: 'high',
        createdAt: '',
        updatedAt: ''
      }
    ]);

    expect(bundle.stats).toEqual({ total: 2, completed: 1, pending: 1 });
    expect(bundle.markers).toHaveLength(2);
  });
});

describe('buildCalendarDayTasks', () => {
  it('includes completed and pending markers', () => {
    const overlay = buildCalendarDayTasks({
      '2026-05-22': [
        {
          id: 'a',
          text: 'Done',
          completed: true,
          pinned: false,
          priority: 'medium',
          createdAt: '',
          updatedAt: ''
        },
        {
          id: 'b',
          text: 'Todo',
          completed: false,
          pinned: false,
          priority: 'high',
          createdAt: '',
          updatedAt: ''
        }
      ]
    });

    const day = overlay['2026-05-22'];
    expect(day?.stats).toEqual({ total: 2, completed: 1, pending: 1 });
    expect(day?.markers).toHaveLength(2);
    expect(day?.markers[0]?.completed).toBe(true);
    expect(day?.markers[1]?.completed).toBe(false);
  });
});

describe('sortCalendarEvents', () => {
  it('sorts all-day events before timed events', () => {
    const sorted = sortCalendarEvents([
      { id: '1', title: 'Timed', dateKey: '2026-06-01', startTime: '10:00', createdAt: '', updatedAt: '' },
      { id: '2', title: 'All day', dateKey: '2026-06-01', createdAt: '', updatedAt: '' }
    ]);
    expect(sorted[0]?.title).toBe('All day');
    expect(sorted[1]?.title).toBe('Timed');
  });
});

describe('buildEventsByDate', () => {
  it('groups events by date key', () => {
    const grouped = buildEventsByDate([
      { id: '1', title: 'A', dateKey: '2026-06-01', createdAt: '', updatedAt: '' },
      { id: '2', title: 'B', dateKey: '2026-06-02', createdAt: '', updatedAt: '' },
      { id: '3', title: 'C', dateKey: '2026-06-01', startTime: '09:00', createdAt: '', updatedAt: '' }
    ]);
    expect(grouped['2026-06-01']).toHaveLength(2);
    expect(grouped['2026-06-02']).toHaveLength(1);
    expect(grouped['2026-06-01']?.[0]?.title).toBe('A');
  });
});
