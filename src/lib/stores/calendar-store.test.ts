import { describe, expect, it } from 'vitest';
import { buildCalendarDayTasks, buildDayTasksFromList } from './calendar-store.js';

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
