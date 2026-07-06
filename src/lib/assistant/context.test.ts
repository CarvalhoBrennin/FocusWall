import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../utils/state.js';
import { createAssistantContextSnapshot } from './context.js';

describe('createAssistantContextSnapshot', () => {
  it('summarizes visible tasks and calendar events', () => {
    const state = createDefaultState();
    state.tasksByDate['2026-07-01'] = [
      {
        id: 'task-1',
        text: 'Revisar PR',
        completed: false,
        pinned: true,
        priority: 'high',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 'task-2',
        text: 'Enviar nota',
        completed: true,
        pinned: false,
        priority: 'medium',
        createdAt: '',
        updatedAt: ''
      }
    ];
    state.calendarEvents = [
      {
        id: 'event-2',
        title: 'Depois',
        dateKey: '2026-07-01',
        startTime: '15:00',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 'event-1',
        title: 'Antes',
        dateKey: '2026-07-01',
        startTime: '09:00',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 'event-other',
        title: 'Outro dia',
        dateKey: '2026-07-02',
        createdAt: '',
        updatedAt: ''
      }
    ];

    const snapshot = createAssistantContextSnapshot(state, '2026-07-01', 0);

    expect(snapshot.taskCounts).toEqual({ total: 2, completed: 1, pending: 1, pinned: 1 });
    expect(snapshot.tasks.map((task) => task.id)).toEqual(['task-1', 'task-2']);
    expect(snapshot.eventsToday.map((event) => event.id)).toEqual(['event-1', 'event-2']);
  });

  it('includes recurring calendar event occurrences on the visible date', () => {
    const state = createDefaultState();
    state.calendarEvents = [
      {
        id: 'event-birthday',
        title: 'Aniversário',
        dateKey: '2020-07-03',
        recurrence: 'yearly',
        createdAt: '',
        updatedAt: ''
      }
    ];

    const snapshot = createAssistantContextSnapshot(state, '2026-07-03', 0);

    expect(snapshot.eventsToday).toHaveLength(1);
    expect(snapshot.eventsToday[0]?.id).toBe('event-birthday');
    expect(snapshot.eventsToday[0]?.dateKey).toBe('2026-07-03');
    expect(snapshot.eventsToday[0]?.baseDateKey).toBe('2020-07-03');
    expect(snapshot.eventsToday[0]?.occurrenceDateKey).toBe('2026-07-03');
    expect(snapshot.eventsToday[0]?.recurrence).toBe('yearly');
  });
});
