import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Task } from '../types/app.js';
import type { AssistantToolRuntime } from './tools.js';
import { executeAssistantTool, getAssistantToolDefinitions, normalizeToolArguments, previewAssistantTool } from './tools.js';

function createRuntime() {
  let tasks: Task[] = [
    {
      id: 'task-1',
      text: 'Revisar PR',
      completed: false,
      pinned: false,
      priority: 'medium',
      createdAt: '',
      updatedAt: ''
    }
  ];
  let events: CalendarEvent[] = [
    {
      id: 'event-1',
      title: 'Dentista',
      dateKey: '2026-07-01',
      startTime: '14:00',
      createdAt: '',
      updatedAt: ''
    }
  ];
  let navigatedDate = '';
  let wentToday = false;
  /** Tasks stored on dates other than the visible one. */
  const tasksByDate: Record<string, Task[]> = {};

  const runtime: AssistantToolRuntime = {
    getContext: () => ({
      visibleDate: navigatedDate || '2026-07-01',
      viewOffset: 0,
      today: '2026-07-01',
      todayWeekday: 'quarta-feira',
      dateHints: {},
      taskCounts: { total: tasks.length, completed: tasks.filter((task) => task.completed).length, pending: 0, pinned: 0 },
      tasks,
      eventsToday: events
    }),
    getTasks: (dateKey) => (dateKey ? tasksByDate[dateKey] || [] : tasks),
    getCalendarEvents: () => events,
    getEventsForDate: (dateKey) => events.filter((event) => event.dateKey === dateKey),
    addTask: async (text, priority, dateKey) => {
      const id = `task-${tasks.length + Object.values(tasksByDate).flat().length + 1}`;
      const created = {
        id,
        text,
        completed: false,
        pinned: false,
        priority,
        createdAt: '',
        updatedAt: ''
      };
      if (dateKey) tasksByDate[dateKey] = [...(tasksByDate[dateKey] || []), created];
      else tasks = [...tasks, created];
      return id;
    },
    toggleTask: async (id) => {
      tasks = tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task));
    },
    deleteTask: async (id) => {
      tasks = tasks.filter((task) => task.id !== id);
    },
    updateTask: async (id, updater) => {
      tasks = tasks.map((task) => {
        if (task.id !== id) return task;
        const next = { ...task };
        updater(next);
        return next;
      });
    },
    toggleTaskPin: async (id) => {
      tasks = tasks.map((task) => (task.id === id ? { ...task, pinned: !task.pinned } : task));
    },
    addCalendarEvent: async (payload) => {
      const id = `event-${events.length + 1}`;
      events = [
        ...events,
        {
          id,
          title: payload.title || '',
          dateKey: payload.dateKey || '2026-07-01',
          startTime: payload.startTime,
          endTime: payload.endTime,
          notes: payload.notes,
          color: payload.color,
          recurrence: payload.recurrence,
          createdAt: '',
          updatedAt: ''
        }
      ];
      return id;
    },
    updateCalendarEvent: async (id, patch) => {
      let changed = false;
      events = events.map((event) => {
        if (event.id !== id) return event;
        changed = true;
        return { ...event, ...patch };
      });
      return changed;
    },
    deleteCalendarEvent: async (id) => {
      const before = events.length;
      events = events.filter((event) => event.id !== id);
      return events.length !== before;
    },
    deleteCalendarEvents: async (ids) => {
      const wanted = new Set(ids);
      const deleted = events.filter((event) => wanted.has(event.id)).map((event) => event.id);
      events = events.filter((event) => !wanted.has(event.id));
      return deleted;
    },
    goToDate: (dateKey) => {
      navigatedDate = dateKey;
      return navigatedDate;
    },
    goToToday: () => {
      wentToday = true;
      navigatedDate = '2026-07-01';
      return navigatedDate;
    }
  };

  return {
    runtime,
    getTasks: () => tasks,
    getEvents: () => events,
    getNavigatedDate: () => navigatedDate,
    wentToday: () => wentToday
  };
}

describe('assistant tool definitions', () => {
  it('includes task and calendar tools', () => {
    const names = getAssistantToolDefinitions().map((tool) => tool.function.name);
    expect(names).toContain('add_task');
    expect(names).toContain('add_calendar_event');
    expect(names).toContain('delete_calendar_events');
    expect(names).toContain('go_to_today');
    const addEvent = getAssistantToolDefinitions().find((tool) => tool.function.name === 'add_calendar_event');
    expect(addEvent?.function.parameters.properties.recurrence).toBeTruthy();
  });
});

describe('normalizeToolArguments', () => {
  it('accepts JSON strings and objects', () => {
    expect(normalizeToolArguments('{"id":"task-1"}')).toEqual({ id: 'task-1' });
    expect(normalizeToolArguments({ id: 'task-1' })).toEqual({ id: 'task-1' });
    expect(normalizeToolArguments('bad')).toMatchObject({ __focusWallInvalidToolArguments: true });
  });
});

describe('executeAssistantTool', () => {
  it('adds and lists tasks through the runtime', async () => {
    const harness = createRuntime();

    const add = await executeAssistantTool('add_task', { text: 'Comprar leite', priority: 'high' }, harness.runtime);
    const list = await executeAssistantTool('list_tasks', {}, harness.runtime);

    expect(add.ok).toBe(true);
    expect(add.changed).toBe(true);
    expect(harness.getTasks()[1]?.priority).toBe('high');
    expect((list.data as { tasks: Task[] }).tasks).toHaveLength(2);
  });

  it('validates task ids before changing state', async () => {
    const harness = createRuntime();

    const result = await executeAssistantTool('complete_task', { id: 'missing' }, harness.runtime);

    expect(result.ok).toBe(false);
    expect(harness.getTasks()[0]?.completed).toBe(false);
  });

  it('updates task completion, priority and pin state', async () => {
    const harness = createRuntime();

    await executeAssistantTool('complete_task', { id: 'task-1', completed: true }, harness.runtime);
    await executeAssistantTool('set_task_priority', { id: 'task-1', priority: 'low' }, harness.runtime);
    await executeAssistantTool('pin_task', { id: 'task-1', pinned: true }, harness.runtime);

    expect(harness.getTasks()[0]?.completed).toBe(true);
    expect(harness.getTasks()[0]?.priority).toBe('low');
    expect(harness.getTasks()[0]?.pinned).toBe(true);
  });

  it('creates calendar events and navigates dates', async () => {
    const harness = createRuntime();

    const event = await executeAssistantTool(
      'add_calendar_event',
      { title: 'Reunião', dateKey: '2026-07-02', startTime: '10:00' },
      harness.runtime
    );
    const navigated = await executeAssistantTool('go_to_date', { dateKey: '2026-07-02' }, harness.runtime);

    expect(event.ok).toBe(true);
    expect(harness.getEvents()[1]?.title).toBe('Reunião');
    expect(navigated.ok).toBe(true);
    expect(harness.getNavigatedDate()).toBe('2026-07-02');

    const today = await executeAssistantTool('go_to_today', {}, harness.runtime);
    expect(today.ok).toBe(true);
    expect(harness.getNavigatedDate()).toBe('2026-07-01');
    expect(harness.wentToday()).toBe(true);
  });

  it('creates yearly recurring events for birthdays', async () => {
    const harness = createRuntime();

    const event = await executeAssistantTool(
      'add_calendar_event',
      { title: 'Aniversário da Ana', dateKey: '2026-07-03', recurrence: 'yearly' },
      harness.runtime
    );

    expect(event.ok).toBe(true);
    expect(harness.getEvents()[1]?.recurrence).toBe('yearly');
  });

  it('does not duplicate equivalent calendar events', async () => {
    const harness = createRuntime();

    const first = await executeAssistantTool(
      'add_calendar_event',
      { title: 'Meu aniversário', dateKey: '2026-09-05', recurrence: 'yearly' },
      harness.runtime
    );
    const duplicate = await executeAssistantTool(
      'add_calendar_event',
      { title: 'Meu aniversario', dateKey: '2026-09-05', recurrence: 'yearly' },
      harness.runtime
    );

    expect(first.changed).toBe(true);
    expect(duplicate.ok).toBe(true);
    expect(duplicate.changed).toBe(false);
    expect(harness.getEvents()).toHaveLength(2);
  });

  it('deletes recurring calendar events by occurrence date', async () => {
    const harness = createRuntime();

    await executeAssistantTool(
      'add_calendar_event',
      { title: 'Meu aniversário', dateKey: '2026-09-05', recurrence: 'yearly' },
      harness.runtime
    );
    await executeAssistantTool(
      'add_calendar_event',
      { title: 'Reunião', dateKey: '2026-09-05', recurrence: 'none' },
      harness.runtime
    );

    const deleted = await executeAssistantTool(
      'delete_calendar_events',
      { dateKey: '2027-09-05', recurring: true },
      harness.runtime
    );

    expect(deleted.ok).toBe(true);
    expect(deleted.changed).toBe(true);
    expect(harness.getEvents().map((event) => event.title)).toEqual(['Dentista', 'Reunião']);
  });

  it('previews destructive calendar deletion without changing state', async () => {
    const harness = createRuntime();

    await executeAssistantTool(
      'add_calendar_event',
      { title: 'Meu aniversÃ¡rio', dateKey: '2026-09-05', recurrence: 'yearly' },
      harness.runtime
    );

    const preview = previewAssistantTool(
      'delete_calendar_events',
      { dateKey: '2027-09-05', recurring: true },
      harness.runtime
    );

    expect(preview?.ok).toBe(true);
    expect(preview?.changed).toBe(false);
    expect(preview?.matchedCount).toBe(1);
    expect(preview?.reason).toBe('needs_confirmation');
    expect(harness.getEvents()).toHaveLength(2);
  });

  it('rejects invalid calendar event recurrence and invalid list dates', async () => {
    const harness = createRuntime();

    const add = await executeAssistantTool(
      'add_calendar_event',
      { title: 'Backup', dateKey: '2026-07-03', recurrence: 'daily' },
      harness.runtime
    );
    const list = await executeAssistantTool('list_calendar_events', { dateKey: '2026-02-31' }, harness.runtime);

    expect(add.ok).toBe(false);
    expect(list.ok).toBe(false);
    expect(harness.getEvents()).toHaveLength(1);
  });

  it('rejects calendar events with invalid time ranges', async () => {
    const harness = createRuntime();

    const event = await executeAssistantTool(
      'add_calendar_event',
      { title: 'Reunião', dateKey: '2026-07-03', startTime: '18:00', endTime: '09:00' },
      harness.runtime
    );

    expect(event.ok).toBe(false);
    expect(harness.getEvents()).toHaveLength(1);
  });

  it('rejects empty calendar event updates', async () => {
    const harness = createRuntime();

    const update = await executeAssistantTool('update_calendar_event', { id: 'event-1' }, harness.runtime);

    expect(update.ok).toBe(false);
    expect(update.reason).toBe('empty_patch');
    expect(harness.getEvents()[0]?.title).toBe('Dentista');
  });


  it('does not duplicate equivalent tasks', async () => {
    const harness = createRuntime();
    const first = await executeAssistantTool('add_task', { text: 'Comprar leite', priority: 'medium' }, harness.runtime);
    const duplicate = await executeAssistantTool('add_task', { text: 'comprar leite', priority: 'medium' }, harness.runtime);

    expect(first.changed).toBe(true);
    expect(duplicate.ok).toBe(true);
    expect(duplicate.changed).toBe(false);
    expect(duplicate.reason).toBe('duplicate');
    expect(harness.getTasks()).toHaveLength(2);
  });

  it('does not claim success when a task mutation fails', async () => {
    const harness = createRuntime();
    harness.runtime.toggleTask = async () => false;

    const result = await executeAssistantTool('complete_task', { id: 'task-1', completed: true }, harness.runtime);

    expect(result.ok).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('store_error');
    expect(harness.getTasks()[0]?.completed).toBe(false);
  });

  it('rejects malformed JSON tool arguments', async () => {
    const harness = createRuntime();
    const result = await executeAssistantTool('complete_task', '{bad-json', harness.runtime);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_arguments');
  });
});

describe('assistant tool result contract', () => {
  it('reports affectedItems and counts when adding a task', async () => {
    const harness = createRuntime();

    const add = await executeAssistantTool('add_task', { text: 'Comprar leite' }, harness.runtime);

    expect(add.ok).toBe(true);
    expect(add.changed).toBe(true);
    expect(add.matchedCount).toBe(1);
    expect(add.changedCount).toBe(1);
    expect(add.reason).toBe('');
    expect(add.affectedItems).toEqual([{ type: 'task', id: 'task-2', label: 'Comprar leite' }]);
  });

  it('reports the duplicate reason without changing state', async () => {
    const harness = createRuntime();

    await executeAssistantTool(
      'add_calendar_event',
      { title: 'Meu aniversário', dateKey: '2026-09-05', recurrence: 'yearly' },
      harness.runtime
    );
    const duplicate = await executeAssistantTool(
      'add_calendar_event',
      { title: 'meu aniversario', dateKey: '2026-09-05', recurrence: 'yearly' },
      harness.runtime
    );

    expect(duplicate.ok).toBe(true);
    expect(duplicate.changed).toBe(false);
    expect(duplicate.changedCount).toBe(0);
    expect(duplicate.reason).toBe('duplicate');
    expect(duplicate.affectedItems).toHaveLength(1);
    expect(duplicate.affectedItems[0]?.type).toBe('event');
  });

  it('reports matched and changed counts for bulk deletions', async () => {
    const harness = createRuntime();

    await executeAssistantTool(
      'add_calendar_event',
      { title: 'Meu aniversário', dateKey: '2026-09-05', recurrence: 'yearly' },
      harness.runtime
    );

    const deleted = await executeAssistantTool(
      'delete_calendar_events',
      { dateKey: '2027-09-05', recurring: true },
      harness.runtime
    );

    expect(deleted.ok).toBe(true);
    expect(deleted.changed).toBe(true);
    expect(deleted.matchedCount).toBe(1);
    expect(deleted.changedCount).toBe(1);
    expect(deleted.affectedItems).toEqual([{ type: 'event', id: 'event-2', label: 'Meu aniversário' }]);
  });

  it('previews destructive task deletion with affectedItems and no state change', async () => {
    const harness = createRuntime();

    const preview = previewAssistantTool('delete_task', { id: 'task-1' }, harness.runtime);

    expect(preview?.ok).toBe(true);
    expect(preview?.changed).toBe(false);
    expect(preview?.reason).toBe('needs_confirmation');
    expect(preview?.affectedItems).toEqual([{ type: 'task', id: 'task-1', label: 'Revisar PR' }]);
    expect(harness.getTasks()).toHaveLength(1);
  });

  it('reports not_found reasons for missing items', async () => {
    const harness = createRuntime();

    const complete = await executeAssistantTool('complete_task', { id: 'missing' }, harness.runtime);
    const preview = previewAssistantTool('delete_calendar_event', { id: 'missing' }, harness.runtime);

    expect(complete.reason).toBe('not_found');
    expect(preview?.ok).toBe(false);
    expect(preview?.reason).toBe('not_found');
  });

  it('reports no_change_needed when the state is already the desired one', async () => {
    const harness = createRuntime();

    const complete = await executeAssistantTool('complete_task', { id: 'task-1', completed: false }, harness.runtime);

    expect(complete.ok).toBe(true);
    expect(complete.changed).toBe(false);
    expect(complete.reason).toBe('no_change_needed');
    expect(complete.affectedItems).toHaveLength(1);
  });
});

describe('list_calendar_events cross-date title search', () => {
  it('finds an event on another date by title when dateKey is omitted', async () => {
    const harness = createRuntime();
    await executeAssistantTool('add_calendar_event', { title: 'Reunião com Ana', dateKey: '2026-09-12' }, harness.runtime);

    const found = await executeAssistantTool('list_calendar_events', { title: 'reunião com ana' }, harness.runtime);

    expect(found.matchedCount).toBe(1);
    expect(found.affectedItems[0]?.label).toBe('Reunião com Ana');
  });

  it('still scopes to the visible date when dateKey is given, even with a duplicate title elsewhere', async () => {
    const harness = createRuntime();
    await executeAssistantTool('add_calendar_event', { title: 'Reunião com Ana', dateKey: '2026-09-12' }, harness.runtime);
    await executeAssistantTool('add_calendar_event', { title: 'Reunião com Ana', dateKey: '2026-07-01' }, harness.runtime);

    const found = await executeAssistantTool('list_calendar_events', { dateKey: '2026-07-01', title: 'Ana' }, harness.runtime);

    expect(found.matchedCount).toBe(1);
    expect(found.data).toMatchObject({ dateKey: '2026-07-01' });
  });

  it('returns nothing for a title that does not exist anywhere, instead of falling back to the visible date', async () => {
    const harness = createRuntime();
    await executeAssistantTool('add_calendar_event', { title: 'Reunião com Ana', dateKey: '2026-09-12' }, harness.runtime);

    const found = await executeAssistantTool('list_calendar_events', { title: 'Consulta inexistente' }, harness.runtime);

    expect(found.matchedCount).toBe(0);
  });

  it('keeps listing the visible date when neither dateKey nor title is given', async () => {
    const harness = createRuntime();
    const found = await executeAssistantTool('list_calendar_events', {}, harness.runtime);
    expect(found.data).toMatchObject({ dateKey: '2026-07-01' });
  });
});

describe('update_calendar_event persistence check', () => {
  it('accepts an update the store normalized instead of reporting a mismatch', async () => {
    const harness = createRuntime();
    const normalizing: AssistantToolRuntime = {
      ...harness.runtime,
      updateCalendarEvent: async (id, patch) =>
        // The real store trims and sentence-cases what it saves.
        harness.runtime.updateCalendarEvent(id, {
          ...patch,
          ...(patch.title ? { title: `  ${patch.title}  `.trim() } : {})
        })
    };

    const updated = await executeAssistantTool(
      'update_calendar_event',
      { id: 'event-1', title: 'Dentista da manhã' },
      normalizing
    );

    expect(updated.ok).toBe(true);
    expect(updated.reason).not.toBe('state_mismatch');
    expect(updated.changed).toBe(true);
  });

  it('still reports a mismatch when the store kept the old value', async () => {
    const harness = createRuntime();
    const ignoring: AssistantToolRuntime = {
      ...harness.runtime,
      updateCalendarEvent: async () => true
    };

    const updated = await executeAssistantTool(
      'update_calendar_event',
      { id: 'event-1', title: 'Outro titulo completamente diferente' },
      ignoring
    );

    expect(updated.ok).toBe(false);
    expect(updated.reason).toBe('state_mismatch');
  });
});

describe('tasks on an explicit date', () => {
  it('creates a task on another date without moving the visible one', async () => {
    const harness = createRuntime();

    const created = await executeAssistantTool(
      'add_task',
      { text: 'Revisar contrato', priority: 'high', dateKey: '2026-08-20' },
      harness.runtime
    );

    expect(created.ok).toBe(true);
    expect(created.changed).toBe(true);
    expect(created.message).toContain('2026-08-20');
    // The visible date must be untouched: no navigation, no extra task there.
    expect(harness.getTasks()).toHaveLength(1);
    expect(harness.getNavigatedDate()).toBe('');
    expect(harness.runtime.getTasks('2026-08-20')).toHaveLength(1);
  });

  it('lists tasks of another date', async () => {
    const harness = createRuntime();
    await executeAssistantTool('add_task', { text: 'Revisar contrato', dateKey: '2026-08-20' }, harness.runtime);

    const listed = await executeAssistantTool('list_tasks', { dateKey: '2026-08-20' }, harness.runtime);
    const visible = await executeAssistantTool('list_tasks', {}, harness.runtime);

    expect(listed.matchedCount).toBe(1);
    expect(listed.message).toContain('2026-08-20');
    expect(visible.matchedCount).toBe(1);
    expect(visible.affectedItems[0]?.label).toBe('Revisar PR');
  });

  it('rejects an invalid task date instead of silently using the visible one', async () => {
    const harness = createRuntime();

    const created = await executeAssistantTool('add_task', { text: 'Revisar contrato', dateKey: '20/08' }, harness.runtime);

    expect(created.ok).toBe(false);
    expect(created.reason).toBe('invalid_date');
    expect(harness.getTasks()).toHaveLength(1);
  });

  it('allows the same task text on a different date', async () => {
    const harness = createRuntime();

    const duplicateSameDay = await executeAssistantTool('add_task', { text: 'Revisar PR' }, harness.runtime);
    const otherDay = await executeAssistantTool('add_task', { text: 'Revisar PR', dateKey: '2026-08-20' }, harness.runtime);

    expect(duplicateSameDay.reason).toBe('duplicate');
    expect(otherDay.changed).toBe(true);
  });
});
