import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantMessage } from '../types/assistant.js';
import { currentDateKey, data, viewOffsetDays } from '../stores/app-store.js';
import { createDefaultState } from '../utils/state.js';
import { runAssistantTurn } from './assistant.js';

const streamOllamaChatMock = vi.hoisted(() => vi.fn());

vi.mock('./ollama.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ollama.js')>();
  return {
    ...actual,
    streamOllamaChat: streamOllamaChatMock
  };
});

vi.mock('./storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./storage.js')>();
  return {
    ...actual,
    storage: {
      ...actual.storage,
      saveState: vi.fn().mockResolvedValue(undefined)
    }
  };
});

function userMessage(content: string, index: number): AssistantMessage {
  return {
    id: `user-${index}`,
    role: 'user',
    content,
    createdAt: `2026-07-05T12:00:0${index}.000Z`
  };
}

function assistantMessage(content: string, index: number, extra: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id: `assistant-${index}`,
    role: 'assistant',
    content,
    createdAt: `2026-07-05T12:00:0${index}.500Z`,
    ...extra
  };
}

beforeEach(() => {
  streamOllamaChatMock.mockReset();
  currentDateKey.set('2026-07-05');
  viewOffsetDays.set(0);
  data.set(createDefaultState());
});

describe('direct assistant agent flows', () => {
  it('adds, lists, previews deletion, confirms deletion, and leaves no birthday event behind', async () => {
    const createRequest = userMessage('Aniversário da minha mãe é dia 11 de julho adicione um evento recorrente pra isso', 1);
    const created = await runAssistantTurn([createRequest]);

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(created.actions[0]?.tool).toBe('add_calendar_event');
    expect(created.content).toContain('Aniversário da minha mãe');

    let events = get(data).calendarEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Aniversário da minha mãe',
      dateKey: '2026-07-11',
      recurrence: 'yearly'
    });

    const listRequest = userMessage('liste os eventos do dia 11 de julho', 2);
    const listed = await runAssistantTurn([
      createRequest,
      assistantMessage(created.content, 1, { actions: created.actions }),
      listRequest
    ]);

    expect(listed.actions[0]?.tool).toBe('list_calendar_events');
    expect(listed.content).toContain('1 evento');

    const deleteRequest = userMessage('remove todos os eventos recorrentes de julho dia 11', 3);
    const preview = await runAssistantTurn([
      createRequest,
      assistantMessage(created.content, 1, { actions: created.actions }),
      listRequest,
      assistantMessage(listed.content, 2, { actions: listed.actions }),
      deleteRequest
    ]);

    expect(preview.actions).toEqual([]);
    expect(preview.pendingToolCall?.function.name).toBe('delete_calendar_events');
    expect(preview.content).toContain('Confirmar');
    expect(get(data).calendarEvents).toHaveLength(1);

    const confirmRequest = userMessage('sim', 4);
    const confirmed = await runAssistantTurn([
      deleteRequest,
      assistantMessage(preview.content, 3, { pendingToolCall: preview.pendingToolCall }),
      confirmRequest
    ]);

    expect(confirmed.actions[0]?.tool).toBe('delete_calendar_events');
    expect(confirmed.actions[0]?.changed).toBe(true);
    events = get(data).calendarEvents;
    expect(events).toHaveLength(0);
  });

  it('adds a generic event, moves it to another date and time, then refuses an invalid move', async () => {
    const addRequest = userMessage('agende um evento Reunião com Ana dia 12/07 às 10h', 1);
    const added = await runAssistantTurn([addRequest]);

    expect(added.actions[0]?.tool).toBe('add_calendar_event');
    expect(get(data).calendarEvents[0]).toMatchObject({
      title: 'Reunião com Ana',
      dateKey: '2026-07-12',
      startTime: '10:00'
    });

    const moveRequest = userMessage('muda a reunião com Ana para dia 13/07 às 11h', 2);
    const moved = await runAssistantTurn([
      addRequest,
      assistantMessage(added.content, 1, { actions: added.actions }),
      moveRequest
    ]);

    expect(moved.actions[0]?.tool).toBe('update_calendar_event');
    expect(get(data).calendarEvents[0]).toMatchObject({
      title: 'Reunião com Ana',
      dateKey: '2026-07-13',
      startTime: '11:00'
    });

    streamOllamaChatMock.mockResolvedValueOnce({
      content: '',
      thinking: '',
      toolCalls: [
        {
          function: {
            name: 'update_calendar_event',
            arguments: {
              id: get(data).calendarEvents[0].id,
              startTime: '18:00',
              endTime: '09:00'
            }
          }
        }
      ]
    });

    const invalidMove = await runAssistantTurn([
      addRequest,
      assistantMessage(added.content, 1, { actions: added.actions }),
      moveRequest,
      assistantMessage(moved.content, 2, { actions: moved.actions }),
      userMessage('altere esse evento com horário inválido', 3)
    ]);

    expect(invalidMove.actions).toEqual([]);
    expect(invalidMove.content).toContain('horário final');
    expect(get(data).calendarEvents[0]).toMatchObject({
      startTime: '11:00',
      endTime: undefined
    });
  });

  it('adds a task, completes it, pins it, asks before deleting it, then deletes it after confirmation', async () => {
    const addTaskRequest = userMessage('adiciona uma tarefa Comprar leite', 1);
    const added = await runAssistantTurn([addTaskRequest]);

    expect(added.actions[0]?.tool).toBe('add_task');
    let tasks = get(data).tasksByDate['2026-07-05'] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ text: 'Comprar leite', completed: false, pinned: false });

    const completeRequest = userMessage('marca a tarefa comprar leite como concluída', 2);
    const completed = await runAssistantTurn([
      addTaskRequest,
      assistantMessage(added.content, 1, { actions: added.actions }),
      completeRequest
    ]);

    expect(completed.actions[0]?.tool).toBe('complete_task');
    tasks = get(data).tasksByDate['2026-07-05'] || [];
    expect(tasks[0]).toMatchObject({ text: 'Comprar leite', completed: true });

    const pinRequest = userMessage('fixa a tarefa comprar leite', 3);
    const pinned = await runAssistantTurn([
      addTaskRequest,
      assistantMessage(added.content, 1, { actions: added.actions }),
      completeRequest,
      assistantMessage(completed.content, 2, { actions: completed.actions }),
      pinRequest
    ]);

    expect(pinned.actions[0]?.tool).toBe('pin_task');
    tasks = get(data).tasksByDate['2026-07-05'] || [];
    expect(tasks[0]).toMatchObject({ text: 'Comprar leite', pinned: true });

    const deleteRequest = userMessage('apaga a tarefa comprar leite', 4);
    const preview = await runAssistantTurn([
      addTaskRequest,
      assistantMessage(added.content, 1, { actions: added.actions }),
      completeRequest,
      assistantMessage(completed.content, 2, { actions: completed.actions }),
      pinRequest,
      assistantMessage(pinned.content, 3, { actions: pinned.actions }),
      deleteRequest
    ]);

    expect(preview.actions).toEqual([]);
    expect(preview.pendingToolCall?.function.name).toBe('delete_task');
    expect(preview.content).toContain('Confirmar');
    expect(get(data).tasksByDate['2026-07-05']).toHaveLength(1);

    const confirmed = await runAssistantTurn([
      deleteRequest,
      assistantMessage(preview.content, 4, { pendingToolCall: preview.pendingToolCall }),
      userMessage('sim', 5)
    ]);

    expect(confirmed.actions[0]?.tool).toBe('delete_task');
    expect(get(data).tasksByDate['2026-07-05'] || []).toHaveLength(0);
  });

  it('asks the user to choose when a task reference is ambiguous, then executes the selected option', async () => {
    await runAssistantTurn([userMessage('adiciona uma tarefa Revisar contrato do cliente A', 1)]);
    await runAssistantTurn([userMessage('adiciona uma tarefa Revisar contrato do cliente B', 2)]);

    const ambiguousRequest = userMessage('marca revisar contrato como concluída', 3);
    const choice = await runAssistantTurn([ambiguousRequest]);

    expect(choice.actions).toEqual([]);
    expect(choice.pendingChoices).toHaveLength(2);
    expect(choice.content).toContain('Qual delas');

    const selected = await runAssistantTurn([
      ambiguousRequest,
      assistantMessage(choice.content, 3, { pendingChoices: choice.pendingChoices }),
      userMessage('Revisar contrato do cliente B', 4)
    ]);

    expect(selected.actions[0]?.tool).toBe('complete_task');
    const tasks = get(data).tasksByDate['2026-07-05'] || [];
    expect(tasks.find((task) => task.text.includes('cliente A'))?.completed).toBe(false);
    expect(tasks.find((task) => task.text.includes('cliente B'))?.completed).toBe(true);
  });

  it('changes task priority, reopens it, unpins it, and lists tasks through direct commands', async () => {
    const addTaskRequest = userMessage('adiciona uma tarefa Enviar relatorio', 1);
    const added = await runAssistantTurn([addTaskRequest]);

    expect(added.actions[0]?.tool).toBe('add_task');
    let task = (get(data).tasksByDate['2026-07-05'] || [])[0];
    expect(task).toMatchObject({ text: 'Enviar relatorio', priority: 'medium' });

    const priorityRequest = userMessage('define enviar relatorio como urgente', 2);
    const prioritized = await runAssistantTurn([
      addTaskRequest,
      assistantMessage(added.content, 1, { actions: added.actions }),
      priorityRequest
    ]);

    expect(prioritized.actions[0]?.tool).toBe('set_task_priority');
    task = (get(data).tasksByDate['2026-07-05'] || [])[0];
    expect(task.priority).toBe('high');

    const completeRequest = userMessage('conclui enviar relatorio', 3);
    const completed = await runAssistantTurn([
      priorityRequest,
      assistantMessage(prioritized.content, 2, { actions: prioritized.actions }),
      completeRequest
    ]);

    expect(completed.actions[0]?.tool).toBe('complete_task');
    task = (get(data).tasksByDate['2026-07-05'] || [])[0];
    expect(task.completed).toBe(true);

    const reopenRequest = userMessage('reabre enviar relatorio', 4);
    const reopened = await runAssistantTurn([
      completeRequest,
      assistantMessage(completed.content, 3, { actions: completed.actions }),
      reopenRequest
    ]);

    expect(reopened.actions[0]?.tool).toBe('complete_task');
    task = (get(data).tasksByDate['2026-07-05'] || [])[0];
    expect(task.completed).toBe(false);

    const pinRequest = userMessage('fixa enviar relatorio', 5);
    const pinned = await runAssistantTurn([
      reopenRequest,
      assistantMessage(reopened.content, 4, { actions: reopened.actions }),
      pinRequest
    ]);

    expect(pinned.actions[0]?.tool).toBe('pin_task');
    task = (get(data).tasksByDate['2026-07-05'] || [])[0];
    expect(task.pinned).toBe(true);

    const unpinRequest = userMessage('desafixa enviar relatorio', 6);
    const unpinned = await runAssistantTurn([
      pinRequest,
      assistantMessage(pinned.content, 5, { actions: pinned.actions }),
      unpinRequest
    ]);

    expect(unpinned.actions[0]?.tool).toBe('pin_task');
    task = (get(data).tasksByDate['2026-07-05'] || [])[0];
    expect(task.pinned).toBe(false);

    const listed = await runAssistantTurn([userMessage('liste minhas tarefas', 7)]);

    expect(listed.actions[0]?.tool).toBe('list_tasks');
    expect(listed.content).toContain('1 tarefa');
  });

  it('cancels a single event deletion, then confirms it on a second request', async () => {
    const addRequest = userMessage('agende um evento Consulta medica dia 14/07 as 09h', 1);
    const added = await runAssistantTurn([addRequest]);

    expect(added.actions[0]?.tool).toBe('add_calendar_event');
    expect(get(data).calendarEvents).toHaveLength(1);

    const deleteRequest = userMessage('apaga o evento consulta medica', 2);
    const preview = await runAssistantTurn([
      addRequest,
      assistantMessage(added.content, 1, { actions: added.actions }),
      deleteRequest
    ]);

    expect(preview.actions).toEqual([]);
    expect(preview.pendingToolCall?.function.name).toBe('delete_calendar_event');
    expect(preview.content).toContain('Confirmar');

    const canceled = await runAssistantTurn([
      deleteRequest,
      assistantMessage(preview.content, 2, { pendingToolCall: preview.pendingToolCall }),
      userMessage('não', 3)
    ]);

    expect(canceled.actions).toEqual([]);
    expect(canceled.content).toContain('Cancelado');
    expect(get(data).calendarEvents).toHaveLength(1);

    const secondPreview = await runAssistantTurn([
      addRequest,
      assistantMessage(added.content, 1, { actions: added.actions }),
      deleteRequest
    ]);
    const confirmed = await runAssistantTurn([
      deleteRequest,
      assistantMessage(secondPreview.content, 4, { pendingToolCall: secondPreview.pendingToolCall }),
      userMessage('sim', 5)
    ]);

    expect(confirmed.actions[0]?.tool).toBe('delete_calendar_event');
    expect(get(data).calendarEvents).toHaveLength(0);
  });

  it('navigates to a requested date and returns to today without using the model', async () => {
    const goToDate = await runAssistantTurn([userMessage('vai para dia 20/07', 1)]);

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(goToDate.actions[0]?.tool).toBe('go_to_date');
    expect(get(viewOffsetDays)).toBe(15);

    const goToday = await runAssistantTurn([
      userMessage('vai para dia 20/07', 1),
      assistantMessage(goToDate.content, 1, { actions: goToDate.actions }),
      userMessage('volta para hoje', 2)
    ]);

    expect(goToday.actions[0]?.tool).toBe('go_to_today');
    expect(get(viewOffsetDays)).toBe(0);
  });
});
