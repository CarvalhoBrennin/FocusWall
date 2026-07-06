import { describe, expect, it } from 'vitest';
import {
  buildCalendarDayTasks,
  buildDayTasksFromList,
  buildEventsByDate,
  calendarEventOccursOnDate,
  getEventOccurrencesForDate,
  sortCalendarEvents
} from './calendar-store.js';

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

  it('expands recurring events for requested dates', () => {
    const grouped = buildEventsByDate(
      [
        { id: '1', title: 'Aniversário', dateKey: '2024-06-10', recurrence: 'yearly', createdAt: '', updatedAt: '' },
        { id: '2', title: 'Fechamento', dateKey: '2026-01-15', recurrence: 'monthly', createdAt: '', updatedAt: '' }
      ],
      'pt-BR',
      ['2026-06-10', '2026-06-15', '2026-06-20']
    );

    expect(grouped['2026-06-10']?.[0]?.title).toBe('Aniversário');
    expect(grouped['2026-06-10']?.[0]?.occurrenceDateKey).toBe('2026-06-10');
    expect(grouped['2026-06-15']?.[0]?.title).toBe('Fechamento');
    expect(grouped['2026-06-20']).toBeUndefined();
  });
});

describe('recurring calendar events', () => {
  it('matches yearly and monthly recurrence rules', () => {
    expect(
      calendarEventOccursOnDate(
        { id: '1', title: 'Aniversário', dateKey: '2020-08-22', recurrence: 'yearly', createdAt: '', updatedAt: '' },
        '2026-08-22'
      )
    ).toBe(true);
    expect(
      calendarEventOccursOnDate(
        { id: '1', title: 'Aniversário', dateKey: '2020-08-22', recurrence: 'yearly', createdAt: '', updatedAt: '' },
        '2026-08-23'
      )
    ).toBe(false);
    expect(
      calendarEventOccursOnDate(
        { id: '2', title: 'Relatório', dateKey: '2026-01-05', recurrence: 'monthly', createdAt: '', updatedAt: '' },
        '2026-12-05'
      )
    ).toBe(true);
  });

  it('matches weekly recurrence on the same weekday, never before the start date', () => {
    // 2026-07-06 é uma segunda-feira.
    const weekly = { id: '3', title: 'Treino', dateKey: '2026-07-06', recurrence: 'weekly' as const, createdAt: '', updatedAt: '' };

    expect(calendarEventOccursOnDate(weekly, '2026-07-06')).toBe(true);
    expect(calendarEventOccursOnDate(weekly, '2026-07-13')).toBe(true);
    expect(calendarEventOccursOnDate(weekly, '2026-07-14')).toBe(false);
    expect(calendarEventOccursOnDate(weekly, '2026-06-29')).toBe(false);
  });

  it('returns occurrences with the visible date', () => {
    const events = getEventOccurrencesForDate('2026-12-25', [
      { id: '1', title: 'Natal', dateKey: '2020-12-25', recurrence: 'yearly', createdAt: '', updatedAt: '' }
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.occurrenceDateKey).toBe('2026-12-25');
    expect(events[0]?.recurrence).toBe('yearly');
  });


  it('does not expand recurring events before their original date', () => {
    expect(
      calendarEventOccursOnDate(
        { id: '1', title: 'Aniversário', dateKey: '2026-08-22', recurrence: 'yearly', createdAt: '', updatedAt: '' },
        '2025-08-22'
      )
    ).toBe(false);
    expect(
      calendarEventOccursOnDate(
        { id: '2', title: 'Fechamento', dateKey: '2026-07-15', recurrence: 'monthly', createdAt: '', updatedAt: '' },
        '2026-06-15'
      )
    ).toBe(false);
  });

  it('preserves the stored date key while exposing occurrenceDateKey for recurring events', () => {
    const events = getEventOccurrencesForDate('2026-12-25', [
      { id: '1', title: 'Natal', dateKey: '2020-12-25', recurrence: 'yearly', createdAt: '', updatedAt: '' }
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.dateKey).toBe('2020-12-25');
    expect(events[0]?.occurrenceDateKey).toBe('2026-12-25');
  });
});
