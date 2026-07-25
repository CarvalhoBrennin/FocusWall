import { describe, expect, it } from 'vitest';
import type { AssistantContextSnapshot, AssistantContextTask, AssistantMessage } from '../types/assistant.js';
import {
  extractDateKeyFromText,
  parseDeterministicAssistantTextResponse,
  parseDeterministicAssistantToolCall,
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
    today: '2026-07-03',
    todayWeekday: 'sexta-feira',
    dateHints: {},
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

describe('date extraction', () => {
  it('parses relative date words', () => {
    const today = new Date();
    expect(extractDateKeyFromText('hoje')).toBe(toDateKey(today));
    expect(extractDateKeyFromText('amanhã')).toBe(toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)));
    expect(extractDateKeyFromText('depois de amanhã')).toBe(toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)));
    expect(extractDateKeyFromText('semana que vem')).toBe(toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)));
    expect(extractDateKeyFromText('mes que vem')).toBeTruthy();
  });

  it('parses day-before-month dates without the "dia" prefix', () => {
    const year = new Date().getFullYear();
    expect(extractDateKeyFromText('11 de julho')).toBe(`${year}-07-11`);
    expect(extractDateKeyFromText('11 de julho de 2027')).toBe('2027-07-11');
  });

  it('parses month-before-day and numeric dates', () => {
    const year = new Date().getFullYear();
    expect(extractDateKeyFromText('julho dia 11')).toBe(`${year}-07-11`);
    expect(extractDateKeyFromText('03/09')).toBe(`${year}-09-03`);
  });

  it('parses accented and unaccented variants alike', () => {
    expect(extractDateKeyFromText('amanha')).toBe(extractDateKeyFromText('amanhã'));
    expect(extractDateKeyFromText('5 de marco')).toBe(extractDateKeyFromText('5 de março'));
  });

  it('rejects impossible dates', () => {
    expect(extractDateKeyFromText('32/01')).toBeNull();
    expect(extractDateKeyFromText('30 de fevereiro')).toBeNull();
  });
});

describe('weekday dates', () => {
  function nextWeekday(target: number, strictlyFuture = false): string {
    const today = new Date();
    let delta = (target - today.getDay() + 7) % 7;
    if (delta === 0 && strictlyFuture) delta = 7;
    return toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta));
  }

  it('parses weekday names as dates', () => {
    expect(extractDateKeyFromText('próxima sexta')).toBe(nextWeekday(5, true));
    expect(extractDateKeyFromText('segunda que vem')).toBe(nextWeekday(1, true));
    expect(extractDateKeyFromText('toda segunda')).toBe(nextWeekday(1));
  });

  it('does not treat ordinal "segunda" as a weekday', () => {
    expect(extractDateKeyFromText('a segunda tarefa')).toBeNull();
  });
});

describe('deterministic navigation', () => {
  it('navigates to explicit dates', () => {
    const year = new Date().getFullYear();
    const call = parseDeterministicAssistantToolCall('vai para o dia 11 de julho');

    expect(call?.function.name).toBe('go_to_date');
    expect(call?.function.arguments).toEqual({ dateKey: `${year}-07-11` });
  });

  it('navigates back to today', () => {
    expect(parseDeterministicAssistantToolCall('volta pra hoje')?.function.name).toBe('go_to_today');
  });

  it('navigates to relative dates like next week', () => {
    expect(parseDeterministicAssistantToolCall('vai para semana que vem')?.function.name).toBe('go_to_date');
  });

  it('leaves task and calendar requests to the model', () => {
    // Navigation must never swallow a request that touches saved data.
    expect(parseDeterministicAssistantToolCall('mostra minhas tarefas de amanhã')).toBeNull();
    expect(parseDeterministicAssistantToolCall('mostra os eventos de amanhã')).toBeNull();
    expect(parseDeterministicAssistantToolCall('apaga o evento de amanhã')).toBeNull();
    expect(parseDeterministicAssistantToolCall('cria uma tarefa amanhã')).toBeNull();
  });

  it('does not hijack rescheduling that mentions a date', () => {
    // "muda ... para 13/07" is a reschedule, not a request to change the panel date.
    expect(parseDeterministicAssistantToolCall('muda a reunião com Ana para dia 13/07 às 11h')).toBeNull();
    expect(parseDeterministicAssistantToolCall('adia a consulta para sexta')).toBeNull();
    expect(parseDeterministicAssistantToolCall('vai ter treino amanhã?')).toBeNull();
  });

  it('ignores generic messages', () => {
    expect(parseDeterministicAssistantToolCall('me conta uma piada')).toBeNull();
    expect(parseDeterministicAssistantToolCall('')).toBeNull();
  });
});

describe('deterministic scope', () => {
  const tasks = [makeTask('t1', 'Comprar leite')];

  it('defers event creation to the model', () => {
    // Title extraction used to live here; the model plus validators.ts own it now.
    expect(resolveDeterministicAssistantIntent(
      [userMessage('aniversário da minha mãe é dia 11 de julho')],
      makeSnapshot(tasks)
    )).toBeNull();
    expect(resolveDeterministicAssistantIntent(
      [userMessage('cria evento treino de corrida toda segunda às 7h30')],
      makeSnapshot(tasks)
    )).toBeNull();
  });

  it('defers task creation to the model', () => {
    expect(resolveDeterministicAssistantIntent(
      [userMessage('cria tarefa urgente revisar contrato')],
      makeSnapshot(tasks)
    )).toBeNull();
    expect(resolveDeterministicAssistantIntent(
      [userMessage('tenho que remover o botão de download de PDF no portal do dentista')],
      makeSnapshot(tasks)
    )).toBeNull();
  });

  it('does not hijack a creation request that also sets a priority inline', () => {
    // Regression: "add" (common informal usage) plus an inline "como urgente"
    // used to make this misfire as a priority change on an EXISTING task —
    // with none on the visible date, it asked "quer que eu crie uma?" instead
    // of deferring to the model to create it.
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('add uma tarefa: ligar pro banco, vc pode colocar como urgente pfv')],
      makeSnapshot([])
    );
    expect(intent).toBeNull();
  });

  it('defers listing and deletion by title to the model', () => {
    expect(resolveDeterministicAssistantIntent(
      [userMessage('quais eventos tenho amanhã?')],
      makeSnapshot(tasks)
    )).toBeNull();
    expect(resolveDeterministicAssistantIntent(
      [userMessage('apaga a reunião')],
      makeSnapshot(tasks)
    )).toBeNull();
    expect(resolveDeterministicAssistantIntent(
      [userMessage('adia a consulta para sexta')],
      makeSnapshot(tasks)
    )).toBeNull();
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

  it('completes the first task by reference', () => {
    const intent = resolveDeterministicAssistantIntent(
      [userMessage('conclui a primeira tarefa')],
      makeSnapshot(tasks)
    );

    expect(intent?.kind === 'tool_call' && intent.call.function.arguments).toEqual({ id: 't1', completed: true });
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

describe('canned text responses', () => {
  it('answers simple greetings in pt-BR without the model', () => {
    expect(parseDeterministicAssistantTextResponse('oi')).toContain('Olá');
    expect(parseDeterministicAssistantTextResponse('bom dia!')).toContain('Olá');
    expect(parseDeterministicAssistantTextResponse('oi, cria uma tarefa')).toBeNull();
  });
});
