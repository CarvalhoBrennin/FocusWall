import { describe, expect, it } from 'vitest';
import type { AssistantContextSnapshot, AssistantContextTask, AssistantMessage } from '../types/assistant.js';
import {
  extractDateKeyFromText,
  extractTimeRange,
  parseDeterministicAssistantTextResponse,
  parseDeterministicAssistantToolCall,
  parseDeterministicAssistantToolCallFromConversation,
  resolveDeterministicAssistantIntent
} from './intent.js';

function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function makeTask(id: string, text: string, extra: Partial<AssistantContextTask> = {}): AssistantContextTask {
  return { id, text, completed: false, priority: 'medium', pinned: false, ...extra };
}

function makeSnapshot(tasks: AssistantContextTask[]): AssistantContextSnapshot {
  return {
    visibleDate: '2026-07-03',
    viewOffset: 0,
    taskCounts: {
      total: tasks.length,
      completed: tasks.filter((task) => task.completed).length,
      pending: tasks.filter((task) => !task.completed).length,
      pinned: tasks.filter((task) => task.pinned).length
    },
    tasks,
    eventsToday: []
  };
}

function userMessage(content: string, id = 'user-1'): AssistantMessage {
  return { id, role: 'user', content, createdAt: '2026-07-03T00:00:00.000Z' };
}

describe('parseDeterministicAssistantToolCall', () => {
  it('extracts the full actionable task from a long add-task request', () => {
    const call = parseDeterministicAssistantToolCall(
      'adicione uma nova tarefa que eu tenho que entregar hoje, é um ajuste no portal do dentista tenho que remover o botão de PDF download'
    );

    expect(call?.function.name).toBe('add_task');
    expect(call?.function.arguments).toEqual({
      text: 'Remover o botão de download de PDF no portal do dentista',
      priority: 'medium'
    });
  });

  it('handles short add-task commands', () => {
    const call = parseDeterministicAssistantToolCall('adicione tarefa comprar leite');

    expect(call?.function.arguments).toEqual({
      text: 'Comprar leite',
      priority: 'medium'
    });
  });

  it('creates yearly all-day birthday events without asking redundant questions', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('adicione um novo evento, meu aniversário é dia 5 de setembro');

    expect(call?.function.name).toBe('add_calendar_event');
    expect(call?.function.arguments).toEqual({
      title: 'Meu aniversário',
      dateKey: `${year}-09-05`,
      recurrence: 'yearly',
      color: 'accent'
    });
  });

  it('understands owned birthdays with month before day', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('o Aniversário da minha mãe acontece todo Julho dia 11');

    expect(call?.function.name).toBe('add_calendar_event');
    expect(call?.function.arguments).toEqual({
      title: 'Aniversário de minha mãe',
      dateKey: `${year}-07-11`,
      recurrence: 'yearly',
      color: 'accent'
    });
  });

  it('handles natural calendar phrasing variants without relying on the model', () => {
    const year = new Date().getFullYear();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0')
    ].join('-');

    const cases = [
      {
        input: 'meu niver é 05/09 todo ano',
        expected: {
          name: 'add_calendar_event',
          args: { title: 'Meu aniversário', dateKey: `${year}-09-05`, recurrence: 'yearly' }
        }
      },
      {
        input: 'cria evento consulta médica amanhã 09:30',
        expected: {
          name: 'add_calendar_event',
          args: { title: 'Consulta médica', dateKey: tomorrowKey, startTime: '09:30', recurrence: 'none' }
        }
      },
      {
        input: 'crie evento reunião com o contador 11/07 às 9h30',
        expected: {
          name: 'add_calendar_event',
          args: { title: 'Reunião com o contador', dateKey: `${year}-07-11`, startTime: '09:30', recurrence: 'none' }
        }
      },
      {
        input: 'remova niver da minha mãe julho 11 todo ano',
        expected: {
          name: 'delete_calendar_events',
          args: { title: 'aniversário', dateKey: `${year}-07-11`, recurring: true }
        }
      },
      {
        input: 'remove os eventos recorrentes de julho dia 11',
        expected: {
          name: 'delete_calendar_events',
          args: { dateKey: `${year}-07-11`, recurring: true }
        }
      }
    ];

    for (const testCase of cases) {
      const call = parseDeterministicAssistantToolCall(testCase.input);
      expect(call?.function.name, testCase.input).toBe(testCase.expected.name);
      expect(call?.function.arguments, testCase.input).toMatchObject(testCase.expected.args);
    }
  });

  it('resolves an affirmative follow-up using the recent birthday request', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCallFromConversation([
      {
        id: 'user-1',
        role: 'user',
        content: 'adicione um novo evento, meu aniversário é dia 5 de setembro',
        createdAt: '2026-07-03T00:00:00.000Z'
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Gostaria que fosse recorrente?',
        createdAt: '2026-07-03T00:00:01.000Z'
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'sim',
        createdAt: '2026-07-03T00:00:02.000Z'
      }
    ]);

    expect(call?.function.name).toBe('add_calendar_event');
    expect(call?.function.arguments).toMatchObject({
      title: 'Meu aniversário',
      dateKey: `${year}-09-05`,
      recurrence: 'yearly'
    });
  });

  it('does not treat every later affirmative answer as the birthday confirmation', () => {
    const call = parseDeterministicAssistantToolCallFromConversation([
      {
        id: 'user-1',
        role: 'user',
        content: 'adicione um novo evento, meu aniversário é dia 5 de setembro',
        createdAt: '2026-07-03T00:00:00.000Z'
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Pronto. Evento criado: Meu aniversário.',
        createdAt: '2026-07-03T00:00:01.000Z',
        actions: [
          {
            id: 'action-1',
            tool: 'add_calendar_event',
            label: 'Evento criado: Meu aniversário.',
            ok: true,
            changed: true
          }
        ]
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'sim',
        createdAt: '2026-07-03T00:00:02.000Z'
      }
    ]);

    expect(call).toBeNull();
  });

  it('creates simple non-birthday calendar events deterministically', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('adicione evento reunião com Ana dia 5 de setembro às 14:00');

    expect(call?.function.name).toBe('add_calendar_event');
    expect(call?.function.arguments).toMatchObject({
      title: 'Reunião com Ana',
      dateKey: `${year}-09-05`,
      startTime: '14:00',
      recurrence: 'none'
    });
  });

  it('deletes recurring events by date before trying birthday creation', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('remove todos os eventos do dia 5 de setembro recorrente');

    expect(call?.function.name).toBe('delete_calendar_events');
    expect(call?.function.arguments).toEqual({
      dateKey: `${year}-09-05`,
      recurring: true
    });
  });

  it('deletes birthday events by date with a title filter', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('remova meu aniversário do dia 5 de setembro recorrente');

    expect(call?.function.name).toBe('delete_calendar_events');
    expect(call?.function.arguments).toEqual({
      dateKey: `${year}-09-05`,
      recurring: true,
      title: 'aniversário'
    });
  });

  it('infers priority only from explicit urgency', () => {
    const call = parseDeterministicAssistantToolCall('crie uma tarefa urgente para revisar o contrato');

    expect(call?.function.arguments).toEqual({
      text: 'Revisar o contrato',
      priority: 'high'
    });
  });

  it('ignores generic messages', () => {
    expect(parseDeterministicAssistantToolCall('oi, tudo bem?')).toBeNull();
  });


  it('does not deterministically execute ambiguous references', () => {
    expect(parseDeterministicAssistantToolCall('tenho que resolver isso')).toBeNull();
    expect(parseDeterministicAssistantToolCall('adicione tarefa sobre aquele evento')).toBeNull();
  });

  it('answers simple greetings in pt-BR without the model', () => {
    expect(parseDeterministicAssistantTextResponse('hi')).toContain('Olá');
  });
});

describe('natural language variations without accents or perfect phrasing', () => {
  it('understands birthdays written without accents', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('meu aniversario e dia 5 de setembro');

    expect(call?.function.name).toBe('add_calendar_event');
    expect(call?.function.arguments).toMatchObject({
      title: 'Meu aniversário',
      dateKey: `${year}-09-05`,
      recurrence: 'yearly'
    });
  });

  it('understands third-party birthdays with "niver do" and month-first dates', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('niver do João julho 11');

    expect(call?.function.name).toBe('add_calendar_event');
    expect(call?.function.arguments).toMatchObject({
      title: 'Aniversário de João',
      dateKey: `${year}-07-11`,
      recurrence: 'yearly'
    });
  });

  it('creates events from bare appointment nouns with hour without minutes', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('reunião com Ana dia 5 de setembro às 14h');

    expect(call?.function.name).toBe('add_calendar_event');
    expect(call?.function.arguments).toMatchObject({
      title: 'Reunião com Ana',
      dateKey: `${year}-09-05`,
      startTime: '14:00',
      recurrence: 'none'
    });
  });

  it('creates appointments phrased without a verb', () => {
    const tomorrowKey = toDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const call = parseDeterministicAssistantToolCall('consulta médica amanhã 9h30');

    expect(call?.function.name).toBe('add_calendar_event');
    expect(call?.function.arguments).toMatchObject({
      title: 'Consulta médica',
      dateKey: tomorrowKey,
      startTime: '09:30'
    });
  });
});

describe('time and date extraction', () => {
  it('parses hour variants', () => {
    expect(extractTimeRange('às 9h30')).toMatchObject({ startTime: '09:30' });
    expect(extractTimeRange('9:30')).toMatchObject({ startTime: '09:30' });
    expect(extractTimeRange('às 14h')).toMatchObject({ startTime: '14:00' });
    expect(extractTimeRange('das 9 às 11')).toMatchObject({ startTime: '09:00', endTime: '11:00' });
  });

  it('does not confuse dates with times', () => {
    expect(extractTimeRange('11/07').startTime).toBeUndefined();
    expect(extractTimeRange('julho 11').startTime).toBeUndefined();
    expect(extractTimeRange('dia 11 de julho').startTime).toBeUndefined();
  });

  it('parses relative date words', () => {
    const today = new Date();
    expect(extractDateKeyFromText('hoje')).toBe(toDateKey(today));
    expect(extractDateKeyFromText('amanhã')).toBe(toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)));
    expect(extractDateKeyFromText('semana que vem')).toBe(toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)));
    expect(extractDateKeyFromText('mes que vem')).toBeTruthy();
  });

  it('parses day-before-month dates without the "dia" prefix', () => {
    const year = new Date().getFullYear();
    expect(extractDateKeyFromText('11 de julho')).toBe(`${year}-07-11`);
    expect(extractDateKeyFromText('11 de julho de 2027')).toBe('2027-07-11');
  });
});

describe('deterministic navigation and listing', () => {
  it('navigates to explicit dates', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('vai para o dia 11 de julho');

    expect(call?.function.name).toBe('go_to_date');
    expect(call?.function.arguments).toEqual({ dateKey: `${year}-07-11` });
  });

  it('navigates back to today', () => {
    const call = parseDeterministicAssistantToolCall('volta pra hoje');
    expect(call?.function.name).toBe('go_to_today');
  });

  it('navigates to relative dates like next week', () => {
    const call = parseDeterministicAssistantToolCall('vai para semana que vem');
    expect(call?.function.name).toBe('go_to_date');
  });

  it('lists events for a date', () => {
    const tomorrowKey = toDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const call = parseDeterministicAssistantToolCall('quais eventos tenho amanhã?');

    expect(call?.function.name).toBe('list_calendar_events');
    expect(call?.function.arguments).toEqual({ dateKey: tomorrowKey });
  });

  it('lists tasks', () => {
    const call = parseDeterministicAssistantToolCall('lista minhas tarefas');
    expect(call?.function.name).toBe('list_tasks');
  });

  it('does not treat "o que tenho que fazer" as an event listing', () => {
    const call = parseDeterministicAssistantToolCall('o que tenho que fazer amanhã?');
    expect(call?.function.name).not.toBe('list_calendar_events');
  });
});

describe('resolveDeterministicAssistantIntent task references', () => {
  const tasks = [makeTask('t1', 'Comprar leite'), makeTask('t2', 'Revisar contrato')];

  it('completes the last task by reference', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('marca a última tarefa como concluída')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind).toBe('tool_call');
    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('complete_task');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 't2', completed: true });
  });

  it('reopens a task matched by text', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('reabre a tarefa comprar leite')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('complete_task');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 't1', completed: false });
  });

  it('deletes the last task by reference', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('apaga a última tarefa')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('delete_task');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 't2' });
  });

  it('asks which task when a pronoun reference is ambiguous', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('fixa aquela tarefa')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind).toBe('question');
    expect(intent?.kind === 'question' && intent.content).toContain('Qual tarefa');
  });

  it('resolves pronoun references using the last acted task from the conversation', () => {
    const intent = resolveDeterministicAssistantIntent(
      [
        userMessage('cria tarefa comprar leite', 'user-1'),
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Pronto. Tarefa adicionada: Comprar leite.',
          createdAt: '2026-07-03T00:00:01.000Z',
          actions: [
            { id: 'action-1', tool: 'add_task', label: 'Tarefa adicionada: Comprar leite.', ok: true, changed: true, itemId: 't1' }
          ]
        },
        userMessage('marca isso como concluído', 'user-2')
      ],
      makeSnapshot(tasks)
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('complete_task');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 't1', completed: true });
  });

  it('offers structured choices when the text matches multiple candidates', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('conclui a tarefa revisar contrato')],
      makeSnapshot([makeTask('t1', 'Revisar contrato do cliente A'), makeTask('t2', 'Revisar contrato do cliente B')])
    );

    expect(intent?.kind).toBe('choice');
    if (intent?.kind !== 'choice') return;
    expect(intent.content).toContain('parecidas');
    expect(intent.choices).toHaveLength(2);
    expect(intent.choices[0]?.call.function.name).toBe('complete_task');
    expect(intent.choices[0]?.call.function.arguments).toEqual({ id: 't1', completed: true });
  });

  it('does not hijack task creation requests', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('cria tarefa urgente revisar contrato')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind).toBe('tool_call');
    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('add_task');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({
      text: 'Revisar contrato',
      priority: 'high'
    });
  });

  it('does not hijack obligation phrases that mention removal', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('tenho que remover o botão de download de PDF no portal do dentista')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind).toBe('tool_call');
    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('add_task');
  });

  it('explains when there is no task to act on', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('marca a última tarefa como concluída')],
      makeSnapshot([])
    );

    expect(intent?.kind).toBe('question');
    expect(intent?.kind === 'question' && intent.content).toContain('Não há tarefas');
  });

  it('changes task priority by reference', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('muda a prioridade da última tarefa para alta')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('set_task_priority');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 't2', priority: 'high' });
  });

  it('understands "como urgente" as a priority change, not task creation', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('deixa a tarefa comprar leite como urgente')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('set_task_priority');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 't1', priority: 'high' });
  });

  it('tolerates typos when matching task text', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('conclui a tarefa comprar liete')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('complete_task');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 't1', completed: true });
  });
});

describe('weekly recurrence and weekday dates', () => {
  function nextWeekday(target: number, strictlyFuture = false): string {
    const today = new Date();
    let delta = (target - today.getDay() + 7) % 7;
    if (delta === 0 && strictlyFuture) delta = 7;
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta);
    return toDateKey(date);
  }

  it('parses weekday names as dates', () => {
    expect(extractDateKeyFromText('próxima sexta')).toBe(nextWeekday(5, true));
    expect(extractDateKeyFromText('segunda que vem')).toBe(nextWeekday(1, true));
  });

  it('does not treat ordinal "segunda" as a weekday', () => {
    expect(extractDateKeyFromText('a segunda tarefa')).toBeNull();
  });

  it('creates weekly recurring events from "toda segunda"', () => {
    const call = parseDeterministicAssistantToolCall('cria evento treino de corrida toda segunda às 7h30');

    expect(call?.function.name).toBe('add_calendar_event');
    expect(call?.function.arguments).toMatchObject({
      title: 'Treino de corrida',
      dateKey: nextWeekday(1),
      startTime: '07:30',
      recurrence: 'weekly'
    });
  });
});

describe('event references without dates', () => {
  const events = [
    {
      id: 'e1',
      title: 'Consulta médica',
      dateKey: '2026-07-10',
      startTime: '09:30'
    },
    {
      id: 'e2',
      title: 'Reunião com Ana',
      dateKey: '2026-07-12'
    }
  ];

  it('deletes an event by title without a date', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('apaga a reunião com ana')],
      makeSnapshot([]),
      { events }
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('delete_calendar_event');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 'e2' });
  });

  it('reschedules an event time by title', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('muda a consulta para 15h')],
      makeSnapshot([]),
      { events }
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('update_calendar_event');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 'e1', startTime: '15:00' });
  });

  it('moves an event to another date by title', () => {
    const tomorrowKey = toDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('adia a reunião com ana para amanhã')],
      makeSnapshot([]),
      { events }
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('update_calendar_event');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 'e2', dateKey: tomorrowKey });
  });

  it('offers mixed choices when a title matches both a task and an event', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('apaga a reunião')],
      makeSnapshot([makeTask('t1', 'Preparar reunião de pauta')]),
      { events }
    );

    expect(intent?.kind).toBe('choice');
    if (intent?.kind !== 'choice') return;
    expect(intent.choices.some((choice) => choice.call.function.name === 'delete_task')).toBe(true);
    expect(intent.choices.some((choice) => choice.call.function.name === 'delete_calendar_event')).toBe(true);
  });

  it('deletes by title and date through the bulk tool when a date is present', () => {
    const tomorrowKey = toDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('apaga a reunião de amanhã')],
      makeSnapshot([]),
      { events }
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.name).toBe('delete_calendar_events');
    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({
      dateKey: tomorrowKey,
      title: 'reuniao'
    });
  });
});
