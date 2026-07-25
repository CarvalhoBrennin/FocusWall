/**
 * End-to-end validation against the REAL local Ollama model.
 *
 * Everything else in this suite mocks `streamOllamaChat`; this file deliberately
 * does not, so it exercises the exact pipeline a real user hits: the model picks
 * a tool, `validators.ts` repairs/rejects the arguments, `tools.ts` mutates the
 * real svelte stores, and the confirmation gate runs for anything destructive.
 * Only `storage.saveState` is mocked, to avoid touching disk.
 *
 * Off by default (real network calls, 10-20 minutes). Run explicitly:
 *   ASSISTANT_LIVE=1 npx vitest run src/lib/services/assistant.live.test.ts
 *
 * Requires Ollama running locally with CONFIG.ASSISTANT.model installed.
 */
import { get } from 'svelte/store';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantMessage, AssistantToolResult } from '../types/assistant.js';
import { currentDateKey, data, viewOffsetDays, visibleDateKey } from '../stores/app-store.js';
import { createDefaultState, getLocalDateKey } from '../utils/state.js';
import { extractDateKeyFromText } from '../assistant/intent.js';
import { executeAssistantTool, getAssistantToolCallArguments } from '../assistant/tools.js';
import { runAssistantTurn } from './assistant.js';

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

// Avoids depending on @types/node, which this project does not install.
const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
const LIVE = nodeProcess?.env?.ASSISTANT_LIVE === '1';

function todayKey(): string {
  return getLocalDateKey(new Date());
}

/** A future month-day in the current year, so scenarios never land on a past date. */
function futureDateKey(monthDay: string): string {
  return `${new Date().getFullYear()}-${monthDay}`;
}

function seededId(result: AssistantToolResult): string {
  const id = result.affectedItems[0]?.id;
  if (!id) throw new Error(`seed failed: ${result.message}`);
  return id;
}

function makeConversation() {
  const messages: AssistantMessage[] = [];
  let turn = 0;
  return {
    messages,
    async send(text: string) {
      turn += 1;
      messages.push({ id: `live-u${turn}`, role: 'user', content: text, createdAt: new Date().toISOString() });
      const result = await runAssistantTurn(messages);
      messages.push({
        id: `live-a${turn}`,
        role: 'assistant',
        content: result.content,
        createdAt: new Date().toISOString(),
        actions: result.actions,
        pendingToolCall: result.pendingToolCall,
        pendingPlan: result.pendingPlan,
        pendingChoices: result.pendingChoices
      });
      return result;
    }
  };
}

const transcript: Array<{ name: string; ok: boolean; detail: string }> = [];

function scenario(name: string, fn: () => Promise<string>, timeout = 90000) {
  it(name, async () => {
    let detail = '(sem detalhe)';
    try {
      detail = await fn();
      transcript.push({ name, ok: true, detail });
    } catch (error) {
      transcript.push({ name, ok: false, detail: `${detail} :: ${String((error as Error)?.message || error)}` });
      throw error;
    }
  }, timeout);
}

describe.skipIf(!LIVE)('assistant live model validation', () => {
  beforeEach(() => {
    data.set(createDefaultState());
    currentDateKey.set(todayKey());
    viewOffsetDays.set(0);
  });

  afterAll(() => {
    if (!transcript.length) return;
    const passed = transcript.filter((entry) => entry.ok).length;
    const lines = transcript.map((entry) => `${entry.ok ? 'OK ' : 'XX '} ${entry.name} :: ${entry.detail}`);
    console.log(`\n=== ASSISTANT LIVE MODEL TRANSCRIPT (${passed}/${transcript.length}) ===\n${lines.join('\n')}\n`);
  });

  // ---------------------------------------------------------------- tasks --

  scenario('cria uma tarefa simples', async () => {
    const convo = makeConversation();
    const result = await convo.send('cria uma tarefa: revisar o relatório do cliente');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.tool).toBe('add_task');
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text.toLowerCase()).toContain('relatório');
    return `tarefa="${tasks[0].text}" priority=${tasks[0].priority}`;
  });

  scenario('cria tarefa urgente com prioridade alta', async () => {
    const convo = makeConversation();
    await convo.send('tenho que ligar pro banco urgente');
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe('high');
    return `tarefa="${tasks[0].text}" priority=${tasks[0].priority}`;
  });

  scenario('cria tarefa de baixa prioridade quando não há pressa', async () => {
    const convo = makeConversation();
    await convo.send('adiciona uma tarefa sem pressa: organizar as fotos antigas');
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe('low');
    return `tarefa="${tasks[0].text}" priority=${tasks[0].priority}`;
  });

  scenario('preserva o pedido completo em tarefas longas', async () => {
    const convo = makeConversation();
    await convo.send('tenho que remover o botão de download de PDF no portal do dentista');
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks).toHaveLength(1);
    const text = tasks[0].text.toLowerCase();
    expect(text).toContain('pdf');
    expect(text).toContain('dentista');
    return `tarefa="${tasks[0].text}"`;
  });

  scenario('cria tarefa para amanhã sem mudar a data visível', async () => {
    const convo = makeConversation();
    const tomorrow = extractDateKeyFromText('amanhã')!;
    await convo.send('cria uma tarefa pra amanhã: revisar o contrato');
    const tomorrowTasks = get(data).tasksByDate[tomorrow] || [];
    const todayTasks = get(data).tasksByDate[todayKey()] || [];
    expect(tomorrowTasks).toHaveLength(1);
    expect(todayTasks).toHaveLength(0);
    expect(get(visibleDateKey)).toBe(todayKey());
    return `tarefa criada em ${tomorrow}, dia visível continua ${get(visibleDateKey)}`;
  });

  scenario('cria tarefa para um dia da semana futuro', async () => {
    const convo = makeConversation();
    const friday = extractDateKeyFromText('sexta que vem')!;
    await convo.send('preciso ligar pro contador na sexta que vem');
    const tasks = get(data).tasksByDate[friday] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text.toLowerCase()).toContain('contador');
    return `tarefa em ${friday}: "${tasks[0].text}"`;
  });

  scenario('lista tarefas sem alterar nada', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Comprar leite', priority: 'medium' }));
    seededId(await executeAssistantTool('add_task', { text: 'Pagar boleto', priority: 'medium' }));
    const before = JSON.stringify(get(data).tasksByDate[todayKey()]);
    const convo = makeConversation();
    const result = await convo.send('liste minhas tarefas');
    // The tasks are already in context, so the model may answer directly
    // instead of calling list_tasks — that is correct per the system prompt
    // ("perguntas sobre o dia podem ser respondidas direto do contexto"). The
    // real invariant is that nothing gets mutated and both tasks are named.
    expect(result.actions.every((action) => !action.changed)).toBe(true);
    expect(JSON.stringify(get(data).tasksByDate[todayKey()])).toBe(before);
    expect(result.content.toLowerCase()).toContain('leite');
    expect(result.content.toLowerCase()).toContain('boleto');
    return `resposta="${result.content.slice(0, 80)}"`;
  });

  scenario('conclui uma tarefa pelo título', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Comprar leite', priority: 'medium' }));
    const convo = makeConversation();
    await convo.send('marca a tarefa comprar leite como concluída');
    const task = (get(data).tasksByDate[todayKey()] || [])[0];
    expect(task?.completed).toBe(true);
    return `completed=${task?.completed}`;
  });

  scenario('reabre uma tarefa concluída', async () => {
    const id = seededId(await executeAssistantTool('add_task', { text: 'Comprar leite', priority: 'medium' }));
    await executeAssistantTool('complete_task', { id, completed: true });
    const convo = makeConversation();
    await convo.send('reabre a tarefa comprar leite');
    const task = (get(data).tasksByDate[todayKey()] || [])[0];
    expect(task?.completed).toBe(false);
    return `completed=${task?.completed}`;
  });

  scenario('apaga uma tarefa após confirmação', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Pagar boleto', priority: 'medium' }));
    const convo = makeConversation();
    const preview = await convo.send('apaga a tarefa pagar boleto');
    expect(preview.actions).toEqual([]);
    expect(get(data).tasksByDate[todayKey()]).toHaveLength(1);
    const confirmed = await convo.send('sim');
    expect(confirmed.actions.some((action) => action.tool === 'delete_task' && action.ok)).toBe(true);
    expect(get(data).tasksByDate[todayKey()] || []).toHaveLength(0);
    return 'preview então "sim" -> excluída';
  }, 120000);

  scenario('cancela a exclusão de uma tarefa', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Pagar boleto', priority: 'medium' }));
    const convo = makeConversation();
    await convo.send('apaga a tarefa pagar boleto');
    const canceled = await convo.send('não, deixa');
    expect(canceled.actions).toEqual([]);
    expect(get(data).tasksByDate[todayKey()]).toHaveLength(1);
    return 'preview então "não" -> mantida';
  }, 120000);

  scenario('altera a prioridade de uma tarefa pelo título', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Enviar relatório', priority: 'medium' }));
    const convo = makeConversation();
    await convo.send('muda a prioridade de enviar relatório para alta');
    const task = (get(data).tasksByDate[todayKey()] || [])[0];
    expect(task?.priority).toBe('high');
    return `priority=${task?.priority}`;
  });

  scenario('fixa e desfixa uma tarefa', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Revisar PR', priority: 'medium' }));
    const convo = makeConversation();
    await convo.send('fixa a tarefa revisar pr');
    let task = (get(data).tasksByDate[todayKey()] || []).find((entry) => entry.text.includes('Revisar'));
    expect(task?.pinned).toBe(true);
    await convo.send('desafixa a tarefa revisar pr');
    task = (get(data).tasksByDate[todayKey()] || []).find((entry) => entry.text.includes('Revisar'));
    expect(task?.pinned).toBe(false);
    return 'fixada -> desfixada';
  }, 120000);

  scenario('pede para escolher quando duas tarefas têm título parecido', async () => {
    // addTask prepends (splices at the pinned count), so the store lists the
    // newest task first: after A then B, the array is [B, A] — matching what
    // the UI shows — and the choice list follows that same order.
    const idA = seededId(await executeAssistantTool('add_task', { text: 'Revisar contrato do cliente A', priority: 'medium' }));
    await executeAssistantTool('add_task', { text: 'Revisar contrato do cliente B', priority: 'medium' });
    const convo = makeConversation();
    const asked = await convo.send('conclui a tarefa revisar contrato');
    expect(asked.pendingChoices?.length).toBe(2);
    const resolved = await convo.send('2');
    expect(resolved.actions.some((action) => action.tool === 'complete_task' && action.itemId === idA)).toBe(true);
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks.find((entry) => entry.text.includes('cliente A'))?.completed).toBe(true);
    expect(tasks.find((entry) => entry.text.includes('cliente B'))?.completed).toBe(false);
    return 'escolha "2" -> cliente A concluído (2º na lista, B é o mais novo), B intacto';
  });

  scenario('tolera erro de digitação ao localizar uma tarefa', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Comprar leite', priority: 'medium' }));
    const convo = makeConversation();
    await convo.send('conclui a tarefa comprar liete');
    const task = (get(data).tasksByDate[todayKey()] || [])[0];
    expect(task?.completed).toBe(true);
    return `completed=${task?.completed}`;
  });

  scenario('refere-se à última tarefa da lista visível', async () => {
    // New tasks are prepended, so the visible list is newest-first: [Segunda,
    // Primeira]. "a última tarefa" resolves to the last position in that list
    // (tasks[length-1]), which is the OLDEST task, not the one just created.
    // Worth knowing: if users mean "the task I just added" by "a última", this
    // reads as the wrong one — flagged in the review, not changed here since
    // it is pre-existing behavior and the correct semantics are a product call.
    seededId(await executeAssistantTool('add_task', { text: 'Primeira tarefa', priority: 'medium' }));
    seededId(await executeAssistantTool('add_task', { text: 'Segunda tarefa', priority: 'medium' }));
    const convo = makeConversation();
    await convo.send('marca a última tarefa como concluída');
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks.find((entry) => entry.text === 'Primeira tarefa')?.completed).toBe(true);
    expect(tasks.find((entry) => entry.text === 'Segunda tarefa')?.completed).toBe(false);
    return 'concluiu a última da lista (a mais antiga, "Primeira tarefa") — ver nota sobre semântica de "última"';
  });

  scenario('responde uma pergunta de leitura sem executar nenhuma ação', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Tarefa pendente', priority: 'medium' }));
    const pendingId = seededId(await executeAssistantTool('add_task', { text: 'Tarefa concluída', priority: 'medium' }));
    await executeAssistantTool('complete_task', { id: pendingId, completed: true });
    const before = JSON.stringify(get(data).tasksByDate[todayKey()]);
    const convo = makeConversation();
    const result = await convo.send('quantas tarefas ainda faltam hoje?');
    expect(result.actions).toEqual([]);
    expect(JSON.stringify(get(data).tasksByDate[todayKey()])).toBe(before);
    return `resposta="${result.content.slice(0, 80)}"`;
  });

  // -------------------------------------------------------------- calendar --

  scenario('cria aniversário anual com cor de destaque', async () => {
    const convo = makeConversation();
    await convo.send('aniversário da minha mãe é dia 20 de agosto');
    const events = get(data).calendarEvents;
    expect(events).toHaveLength(1);
    expect(events[0].recurrence).toBe('yearly');
    expect(events[0].color).toBe('accent');
    expect(events[0].dateKey).toBe(futureDateKey('08-20'));
    return `evento="${events[0].title}" ${events[0].dateKey} ${events[0].recurrence}/${events[0].color}`;
  });

  scenario('reconhece "niver" como aniversário', async () => {
    const convo = makeConversation();
    await convo.send('niver do joão é dia 3 de setembro');
    const events = get(data).calendarEvents;
    expect(events).toHaveLength(1);
    expect(events[0].recurrence).toBe('yearly');
    expect(/jo[aã]o/i.test(events[0].title)).toBe(true);
    return `evento="${events[0].title}" ${events[0].dateKey}`;
  });

  scenario('cria evento com data e horário explícitos', async () => {
    const convo = makeConversation();
    await convo.send('agenda uma reunião com o cliente dia 25/08 às 15h');
    const events = get(data).calendarEvents;
    expect(events).toHaveLength(1);
    expect(events[0].dateKey).toBe(futureDateKey('08-25'));
    expect(events[0].startTime).toBe('15:00');
    expect(events[0].recurrence).toBe('none');
    return `evento="${events[0].title}" ${events[0].dateKey} ${events[0].startTime}`;
  });

  scenario('cria evento semanal recorrente', async () => {
    const convo = makeConversation();
    const expected = extractDateKeyFromText('toda segunda')!;
    await convo.send('cria um treino de corrida toda segunda às 7h');
    const events = get(data).calendarEvents;
    expect(events).toHaveLength(1);
    expect(events[0].recurrence).toBe('weekly');
    expect(events[0].dateKey).toBe(expected);
    return `evento="${events[0].title}" ${events[0].dateKey} weekly`;
  });

  scenario('cria evento em data relativa (amanhã)', async () => {
    const convo = makeConversation();
    const tomorrow = extractDateKeyFromText('amanhã')!;
    await convo.send('marca uma consulta médica amanhã às 9h');
    const events = get(data).calendarEvents;
    expect(events).toHaveLength(1);
    expect(events[0].dateKey).toBe(tomorrow);
    expect(events[0].startTime).toBe('09:00');
    return `evento="${events[0].title}" ${events[0].dateKey} ${events[0].startTime}`;
  });

  scenario('lista eventos de uma data sem alterar nada', async () => {
    const dateKey = futureDateKey('08-25');
    seededId(await executeAssistantTool('add_calendar_event', { title: 'Consulta no dentista', dateKey, startTime: '09:00' }));
    const before = JSON.stringify(get(data).calendarEvents);
    const convo = makeConversation();
    const result = await convo.send('quais eventos eu tenho no dia 25/08?');
    expect(result.actions.some((action) => action.tool === 'list_calendar_events')).toBe(true);
    expect(JSON.stringify(get(data).calendarEvents)).toBe(before);
    return `resposta="${result.content.slice(0, 80)}"`;
  });

  scenario('remarca um evento existente pelo título mesmo fora da data visível', async () => {
    // The event lives on a date the model was never told and that is not the
    // visible date, so this only works if it searches list_calendar_events by
    // title (no dateKey) to find the ID first.
    const dateKey = futureDateKey('09-12');
    const id = seededId(await executeAssistantTool('add_calendar_event', { title: 'Reunião com Ana', dateKey, startTime: '10:00' }));
    const convo = makeConversation();
    await convo.send('muda a reunião com ana pra dia 13/09 às 11h');
    const event = get(data).calendarEvents.find((entry) => entry.id === id);
    expect(event?.dateKey).toBe(futureDateKey('09-13'));
    expect(event?.startTime).toBe('11:00');
    return `evento remarcado para ${event?.dateKey} ${event?.startTime}`;
  }, 150000);

  scenario('apaga um evento único após confirmação, mesmo fora da data visível', async () => {
    const dateKey = futureDateKey('10-05');
    const id = seededId(await executeAssistantTool('add_calendar_event', { title: 'Consulta no dentista', dateKey, startTime: '09:00' }));
    const convo = makeConversation();
    const preview = await convo.send('apaga o evento consulta no dentista');
    // A search step (list_calendar_events by title) may run first — that is a
    // non-mutating lookup, not a failure. The real invariant is that nothing
    // was deleted yet, and the preview targets the actual seeded event.
    expect(preview.actions.every((action) => !action.changed)).toBe(true);
    expect(get(data).calendarEvents).toHaveLength(1);
    const previewedId = (preview.pendingToolCall ? getAssistantToolCallArguments(preview.pendingToolCall).id : undefined)
      ?? preview.pendingPlan?.steps[0]?.args.id;
    expect(previewedId).toBe(id);
    const confirmed = await convo.send('sim');
    expect(confirmed.actions.some((action) => action.tool === 'delete_calendar_event' && action.ok)).toBe(true);
    expect(get(data).calendarEvents).toHaveLength(0);
    return 'preview então "sim" -> evento excluído';
  }, 150000);

  scenario('cancela a exclusão de um evento fora da data visível', async () => {
    const dateKey = futureDateKey('10-05');
    const id = seededId(await executeAssistantTool('add_calendar_event', { title: 'Consulta no dentista', dateKey, startTime: '09:00' }));
    const convo = makeConversation();
    const preview = await convo.send('apaga o evento consulta no dentista');
    // Must genuinely find the event, not just happen to leave it untouched
    // because the deletion attempt itself already failed to locate anything.
    const previewedId = (preview.pendingToolCall ? getAssistantToolCallArguments(preview.pendingToolCall).id : undefined)
      ?? preview.pendingPlan?.steps[0]?.args.id;
    expect(previewedId).toBe(id);
    const canceled = await convo.send('não');
    expect(canceled.actions.every((action) => !action.changed)).toBe(true);
    expect(get(data).calendarEvents).toHaveLength(1);
    return 'preview então "não" -> mantido';
  }, 150000);

  scenario('remove eventos recorrentes de uma data após confirmação', async () => {
    const dateKey = futureDateKey('08-20');
    seededId(await executeAssistantTool('add_calendar_event', {
      title: 'Aniversário da minha mãe',
      dateKey,
      recurrence: 'yearly',
      color: 'accent'
    }));
    const convo = makeConversation();
    const preview = await convo.send('remove todos os eventos recorrentes do dia 20 de agosto');
    expect(preview.actions).toEqual([]);
    const previewedTool = preview.pendingToolCall?.function.name || preview.pendingPlan?.steps[0]?.tool;
    expect(previewedTool).toBe('delete_calendar_events');
    const confirmed = await convo.send('sim');
    expect(confirmed.actions.some((action) => action.tool === 'delete_calendar_events' && action.changed)).toBe(true);
    expect(get(data).calendarEvents).toHaveLength(0);
    return 'preview então "sim" -> removido em massa';
  }, 120000);

  scenario('rejeita horário final antes do início', async () => {
    const convo = makeConversation();
    await convo.send('agenda uma call dia 25/08 das 18h às 9h');
    expect(get(data).calendarEvents).toHaveLength(0);
    return 'nenhum evento criado com horário inválido';
  });

  scenario('reconhece criação duplicada de evento e não duplica', async () => {
    const convo = makeConversation();
    await convo.send('agenda uma reunião de equipe dia 25/08 às 15h');
    await convo.send('agenda uma reunião de equipe dia 25/08 às 15h');
    const events = get(data).calendarEvents.filter((entry) => entry.dateKey === futureDateKey('08-25'));
    expect(events).toHaveLength(1);
    return `eventos com esse título/data: ${events.length}`;
  }, 120000);

  // ------------------------------------------------------------ navigation --

  scenario('navega para uma data explícita', async () => {
    const convo = makeConversation();
    await convo.send('vai para o dia 20 de agosto');
    expect(get(visibleDateKey)).toBe(futureDateKey('08-20'));
    return `data visível=${get(visibleDateKey)}`;
  });

  scenario('volta para hoje', async () => {
    viewOffsetDays.set(15);
    const convo = makeConversation();
    await convo.send('volta pra hoje');
    expect(get(visibleDateKey)).toBe(todayKey());
    return `data visível=${get(visibleDateKey)}`;
  });

  scenario('navega para uma data relativa', async () => {
    const convo = makeConversation();
    const expected = extractDateKeyFromText('semana que vem')!;
    await convo.send('vai para semana que vem');
    expect(get(visibleDateKey)).toBe(expected);
    return `data visível=${get(visibleDateKey)}`;
  });

  // ------------------------------------------------------- safety/regression --

  scenario('não trava nem executa nada com um "sim" isolado', async () => {
    const convo = makeConversation();
    const result = await convo.send('sim');
    expect(result.actions.every((action) => !action.changed)).toBe(true);
    expect(get(data).tasksByDate[todayKey()] || []).toHaveLength(0);
    expect(get(data).calendarEvents).toHaveLength(0);
    return `resposta="${result.content.slice(0, 80)}"`;
  });

  scenario(
    'não apaga quando a resposta é uma pergunta nova que começa com uma palavra de confirmação',
    async () => {
      const id = seededId(await executeAssistantTool('add_calendar_event', {
        title: 'Reunião de equipe',
        dateKey: futureDateKey('10-20'),
        startTime: '10:00'
      }));
      const convo = makeConversation();
      await convo.send('apaga a reunião de equipe');
      const answered = await convo.send('vai ter reunião amanhã?');
      expect(answered.actions.some((action) => action.tool === 'delete_calendar_event' && action.changed)).toBe(false);
      expect(get(data).calendarEvents.find((entry) => entry.id === id)).toBeTruthy();
      return 'pergunta nova não confirmou a exclusão pendente';
    },
    120000
  );

  scenario('não apaga nada quando o alvo não existe', async () => {
    const convo = makeConversation();
    const result = await convo.send('apaga a reunião');
    expect(result.actions.every((action) => !action.changed)).toBe(true);
    expect(get(data).calendarEvents).toHaveLength(0);
    return `resposta="${result.content.slice(0, 80)}"`;
  });

  // ------------------------------------------- português informal e typos --

  scenario('cria tarefa com data relativa sem nenhum acento', async () => {
    const convo = makeConversation();
    const tomorrow = extractDateKeyFromText('amanhã')!;
    await convo.send('marca uma tarefa pra amanha: revisar o contrato');
    const tasks = get(data).tasksByDate[tomorrow] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text.toLowerCase()).toContain('contrato');
    return `tarefa em ${tomorrow}: "${tasks[0].text}"`;
  });

  scenario('reconhece aniversário escrito sem acento e com "eh" no lugar de "é"', async () => {
    const convo = makeConversation();
    await convo.send('aniversario da minha mae eh dia 20 de agosto');
    const events = get(data).calendarEvents;
    expect(events).toHaveLength(1);
    expect(events[0].recurrence).toBe('yearly');
    expect(/m[ãa]e/i.test(events[0].title)).toBe(true);
    return `evento="${events[0].title}" ${events[0].dateKey}`;
  });

  scenario('entende abreviações de internet (add, vc, pfv)', async () => {
    const convo = makeConversation();
    await convo.send('add uma tarefa: ligar pro banco, vc pode colocar como urgente pfv');
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe('high');
    expect(tasks[0].text.toLowerCase()).toContain('banco');
    return `tarefa="${tasks[0].text}" priority=${tasks[0].priority}`;
  });

  scenario('entende gíria coloquial ("dá um help aí")', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Comprar leite', priority: 'medium' }));
    const convo = makeConversation();
    await convo.send('dá um help aí e marca a tarefa comprar leite como feita');
    const task = (get(data).tasksByDate[todayKey()] || [])[0];
    expect(task?.completed).toBe(true);
    return `completed=${task?.completed}`;
  });

  scenario('funciona com o pedido inteiro em maiúsculas', async () => {
    const convo = makeConversation();
    await convo.send('CRIA UMA TAREFA PRA HOJE: PAGAR O BOLETO');
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text.toLowerCase()).toContain('boleto');
    return `tarefa="${tasks[0].text}"`;
  });

  scenario('extrai o pedido de uma frase corrida, cheia de enrolação e sem vírgulas', async () => {
    const convo = makeConversation();
    await convo.send(
      'olha so eu tava pensando aqui e acho que seria bom se voce pudesse criar uma tarefa pra mim tipo assim revisar o contrato do cliente novo'
    );
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text.toLowerCase()).toContain('contrato');
    return `tarefa="${tasks[0].text}"`;
  });

  scenario('tolera erro de concordância (plural/singular trocado)', async () => {
    const convo = makeConversation();
    await convo.send('cria umas tarefa: revisar os documento do cliente');
    const tasks = get(data).tasksByDate[todayKey()] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text.toLowerCase()).toContain('documento');
    return `tarefa="${tasks[0].text}"`;
  });

  scenario('tolera letra faltando, letra dobrada e falta de acento ao mesmo tempo', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Comprar leite', priority: 'medium' }));
    const convo = makeConversation();
    // "trefa" (falta a "a"), "leitee" (letra dobrada), "concluida" (sem acento).
    await convo.send('marca a trefa comprar leitee como concluida');
    const task = (get(data).tasksByDate[todayKey()] || [])[0];
    expect(task?.completed).toBe(true);
    return `completed=${task?.completed}`;
  });

  scenario('entende o anglicismo "task"', async () => {
    const convo = makeConversation();
    const tomorrow = extractDateKeyFromText('amanhã')!;
    await convo.send('cria uma task pra amanha: revisar contrato');
    const tasks = get(data).tasksByDate[tomorrow] || [];
    expect(tasks).toHaveLength(1);
    return `tarefa em ${tomorrow}: "${tasks[0].text}"`;
  });

  scenario('entende um pedido telegráfico, sem verbo', async () => {
    const convo = makeConversation();
    const tomorrow = extractDateKeyFromText('amanhã')!;
    await convo.send('task: comprar leite amanha');
    const tasks = get(data).tasksByDate[tomorrow] || [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text.toLowerCase()).toContain('leite');
    return `tarefa em ${tomorrow}: "${tasks[0].text}"`;
  });

  scenario('entende horário escrito por extenso', async () => {
    const convo = makeConversation();
    const tomorrow = extractDateKeyFromText('amanhã')!;
    await convo.send('marca uma consulta as 9 da manha amanha');
    const events = get(data).calendarEvents;
    expect(events).toHaveLength(1);
    expect(events[0].dateKey).toBe(tomorrow);
    expect(events[0].startTime).toBe('09:00');
    return `evento="${events[0].title}" ${events[0].dateKey} ${events[0].startTime}`;
  });

  scenario('reconhece data relativa mesmo sem acento no meio da frase', async () => {
    const convo = makeConversation();
    const dayAfterTomorrow = extractDateKeyFromText('depois de amanhã')!;
    await convo.send('cria evento reuniao dia depois de amanha as 10h');
    const events = get(data).calendarEvents;
    expect(events).toHaveLength(1);
    expect(events[0].dateKey).toBe(dayAfterTomorrow);
    expect(events[0].startTime).toBe('10:00');
    return `evento="${events[0].title}" ${events[0].dateKey} ${events[0].startTime}`;
  });

  scenario('extrai o pedido de uma frase excessivamente formal e prolixa', async () => {
    const id = seededId(await executeAssistantTool('add_task', { text: 'Pagar boleto', priority: 'medium' }));
    const convo = makeConversation();
    const preview = await convo.send(
      'Prezado assistente, gostaria imensamente que, se possível, o senhor pudesse gentilmente apagar a tarefa referente a pagar o boleto. Agradeço desde já.'
    );
    const previewedId = (preview.pendingToolCall ? getAssistantToolCallArguments(preview.pendingToolCall).id : undefined)
      ?? preview.pendingPlan?.steps[0]?.args.id;
    expect(previewedId).toBe(id);
    expect(get(data).tasksByDate[todayKey()]).toHaveLength(1);
    return 'identificou o alvo certo em meio à formalidade excessiva';
  });

  scenario('responde uma pergunta maldigitada sem executar nenhuma ação', async () => {
    seededId(await executeAssistantTool('add_task', { text: 'Tarefa pendente', priority: 'medium' }));
    const convo = makeConversation();
    const result = await convo.send('quantas tarefa ainda restam pra hj?');
    expect(result.actions.every((action) => !action.changed)).toBe(true);
    expect(get(data).tasksByDate[todayKey()]).toHaveLength(1);
    return `resposta="${result.content.slice(0, 80)}"`;
  });
});
