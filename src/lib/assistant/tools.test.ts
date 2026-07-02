import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Task } from '../types/app.js';
import type { AssistantToolRuntime } from './tools.js';
import { executeAssistantTool, getAssistantToolDefinitions, normalizeToolArguments } from './tools.js';

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

  const runtime: AssistantToolRuntime = {
    getContext: () => ({
      visibleDate: '2026-07-01',
      viewOffset: 0,
      taskCounts: { total: tasks.length, completed: tasks.filter((task) => task.completed).length, pending: 0, pinned: 0 },
      tasks,
      eventsToday: events
    }),
    getTasks: () => tasks,
    getCalendarEvents: () => events,
    getEventsForDate: (dateKey) => events.filter((event) => event.dateKey === dateKey),
    addTask: async (text, priority) => {
      const id = `task-${tasks.length + 1}`;
      tasks = [
        ...tasks,
        {
          id,
          text,
          completed: false,
          pinned: false,
          priority,
          createdAt: '',
          updatedAt: ''
        }
      ];
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
    goToDate: (dateKey) => {
      navigatedDate = dateKey;
    },
    goToToday: () => {
      wentToday = true;
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
    expect(names).toContain('go_to_today');
  });
});

describe('normalizeToolArguments', () => {
  it('accepts JSON strings and objects', () => {
    expect(normalizeToolArguments('{"id":"task-1"}')).toEqual({ id: 'task-1' });
    expect(normalizeToolArguments({ id: 'task-1' })).toEqual({ id: 'task-1' });
    expect(normalizeToolArguments('bad')).toEqual({});
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
    await executeAssistantTool('go_to_date', { dateKey: '2026-07-02' }, harness.runtime);
    await executeAssistantTool('go_to_today', {}, harness.runtime);

    expect(event.ok).toBe(true);
    expect(harness.getEvents()[1]?.title).toBe('Reunião');
    expect(harness.getNavigatedDate()).toBe('2026-07-02');
    expect(harness.wentToday()).toBe(true);
  });
});
