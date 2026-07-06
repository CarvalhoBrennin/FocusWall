import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantMessage, AssistantPendingChoice } from '../types/assistant.js';
import { currentDateKey, data, viewOffsetDays } from '../stores/app-store.js';
import { executeAssistantTool } from '../assistant/tools.js';
import { createDefaultState } from '../utils/state.js';
import {
  buildAssistantChatMessages,
  buildAssistantConversationContextMessage,
  parseFallbackToolCalls,
  resolveChoiceSelection,
  runAssistantTurn
} from './assistant.js';

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

beforeEach(() => {
  streamOllamaChatMock.mockReset();
  currentDateKey.set('2026-07-05');
  viewOffsetDays.set(0);
  data.set(createDefaultState());
});

describe('assistant planning flow', () => {
  it('creates a yearly birthday event directly from a natural request', async () => {
    const result = await runAssistantTurn([
      {
        id: 'user-birthday-mom',
        role: 'user',
        content: 'Aniversário da minha mãe é dia 11 de julho adicione um evento recorrente pra isso',
        createdAt: '2026-07-03T00:00:00.000Z'
      }
    ]);

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.tool).toBe('add_calendar_event');
    expect(result.content).toContain('Aniversário da minha mãe');
    expect(result.content).toContain('Evento criado');
  });

  it('creates a yearly birthday event from short birthday wording', async () => {
    const result = await runAssistantTurn([
      {
        id: 'user-birthday-joao',
        role: 'user',
        content: 'Niver do João dia 03/09 todo ano',
        createdAt: '2026-07-03T00:00:00.000Z'
      }
    ]);

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.tool).toBe('add_calendar_event');
    expect(result.content).toContain('Aniversário do João');
  });

  it('sanitizes suspicious model calendar titles before saving', async () => {
    streamOllamaChatMock
      .mockResolvedValueOnce({
        content: '',
        thinking: '',
        toolCalls: [
          {
            function: {
              name: 'add_calendar_event',
              arguments: {
                title: 'Aniversário de minha mãe é',
                dateKey: '2026-07-11',
                recurrence: 'yearly'
              }
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        content: 'Pronto.',
        thinking: '',
        toolCalls: []
      });

    const result = await runAssistantTurn([
      {
        id: 'user-model-title',
        role: 'user',
        content: 'cria esse evento no calendário',
        createdAt: '2026-07-03T00:00:00.000Z'
      }
    ]);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.label).toContain('Aniversário da minha mãe');
    expect(result.actions[0]?.label).not.toContain('Aniversário da minha mãe é');
  });

  it('asks for confirmation before executing low-confidence fallback JSON creations', async () => {
    streamOllamaChatMock.mockResolvedValueOnce({
      content: '{"action":"add_calendar_event","args":{"title":"Reunião","dateKey":"2026-07-12"}}',
      thinking: '',
      toolCalls: []
    });

    const result = await runAssistantTurn([
      {
        id: 'user-fallback-create',
        role: 'user',
        content: 'coloca isso na agenda',
        createdAt: '2026-07-03T00:00:00.000Z'
      }
    ]);

    expect(result.actions).toEqual([]);
    expect(result.pendingToolCall?.function.name).toBe('add_calendar_event');
    expect(result.content).toContain('Responda "sim"');
  });
});

describe('parseFallbackToolCalls', () => {
  it('parses a single fallback action', () => {
    const calls = parseFallbackToolCalls('{"action":"add_task","args":{"text":"Comprar leite","priority":"medium"}}');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.function.name).toBe('add_task');
    expect(calls[0]?.function.arguments).toEqual({ text: 'Comprar leite', priority: 'medium' });
  });

  it('parses fenced action lists', () => {
    const calls = parseFallbackToolCalls(`\`\`\`json
{"actions":[{"action":"list_tasks","args":{}},{"action":"go_to_today","args":{}}]}
\`\`\``);

    expect(calls.map((call) => call.function.name)).toEqual(['list_tasks', 'go_to_today']);
  });

  it('ignores unknown tools and prose', () => {
    expect(parseFallbackToolCalls('Sem ação.')).toEqual([]);
    expect(parseFallbackToolCalls('{"action":"shell","args":{}}')).toEqual([]);
  });
  it('adds compact context for older conversation turns', () => {
    const messages: AssistantMessage[] = Array.from({ length: 22 }, (_, index) => ({
      id: `user-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant' as 'user' | 'assistant',
      content: index === 0 ? 'Lembre que o aniversário da Ana é importante' : `mensagem ${index}`,
      createdAt: '2026-07-03T00:00:00.000Z'
    }));

    const chatMessages = buildAssistantChatMessages(messages);
    const compactContext = chatMessages.find((message) =>
      message.role === 'system' && message.content.includes('Contexto compacto da conversa anterior')
    );

    expect(compactContext?.content).toContain('aniversário da Ana');
    expect(chatMessages.at(-1)?.content).toBe('mensagem 21');
  });

  it('keeps action logs in compact conversation context', () => {
    const messages: AssistantMessage[] = [
      {
        id: 'user-old',
        role: 'user' as const,
        content: 'crie um evento para o aniversário da Ana',
        createdAt: '2026-07-03T00:00:00.000Z'
      },
      {
        id: 'assistant-old',
        role: 'assistant' as const,
        content: 'Pronto.',
        createdAt: '2026-07-03T00:00:01.000Z',
        actions: [
          {
            id: 'action-1',
            tool: 'add_calendar_event',
            label: 'Evento criado: Aniversário da Ana.',
            ok: true,
            changed: true
          }
        ]
      },
      ...Array.from({ length: 18 }, (_, index) => ({
        id: `recent-${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant' as 'user' | 'assistant',
        content: `recente ${index}`,
        createdAt: '2026-07-03T00:01:00.000Z'
      }))
    ];

    const compactContext = buildAssistantConversationContextMessage(messages);

    expect(compactContext).toContain('add_calendar_event');
    expect(compactContext).toContain('Evento criado: Aniversário da Ana');
  });

  it('keeps recent assistant action logs in the model history', () => {
    const messages: AssistantMessage[] = [
      {
        id: 'user-1',
        role: 'user' as const,
        content: 'crie o aniversário da Ana',
        createdAt: '2026-07-03T00:00:00.000Z'
      },
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: 'Pronto.',
        createdAt: '2026-07-03T00:00:01.000Z',
        actions: [
          {
            id: 'action-1',
            tool: 'add_calendar_event',
            label: 'Evento criado: Aniversário da Ana.',
            ok: true,
            changed: true
          }
        ]
      },
      {
        id: 'user-2',
        role: 'user' as const,
        content: 'adicione observação nele',
        createdAt: '2026-07-03T00:00:02.000Z'
      }
    ];

    const chatMessages = buildAssistantChatMessages(messages);
    const assistantHistory = chatMessages.find(
      (message) => message.role === 'assistant' && message.content.includes('Ações executadas')
    );

    expect(assistantHistory?.content).toContain('add_calendar_event');
    expect(assistantHistory?.content).toContain('Evento criado: Aniversário da Ana');
  });

  it('blocks model claims that say an action ran without a tool call', async () => {
    streamOllamaChatMock.mockResolvedValueOnce({
      content: 'Entendi. Ações executadas: ok:add_calendar_event Evento criado: Aniversário da minha mãe.',
      thinking: '',
      toolCalls: []
    });

    const result = await runAssistantTurn([
      {
        id: 'user-1',
        role: 'user',
        content: 'organiza isso no calendário pra mim',
        createdAt: '2026-07-03T00:00:00.000Z'
      }
    ]);

    expect(result.actions).toEqual([]);
    expect(result.content).toContain('Não executei nenhuma ação');
  });

  it('blocks first-person completion claims without any tool call', async () => {
    streamOllamaChatMock.mockResolvedValueOnce({
      content: 'Criei o evento Aniversário da Ana para você.',
      thinking: '',
      toolCalls: []
    });

    const result = await runAssistantTurn([
      {
        id: 'user-1',
        role: 'user',
        content: 'cuida disso pra mim',
        createdAt: '2026-07-03T00:00:00.000Z'
      }
    ]);

    expect(result.actions).toEqual([]);
    expect(result.content).toContain('Não executei nenhuma ação');
  });

  it('does not block completion claims when real tool calls ran in the same turn', async () => {
    streamOllamaChatMock
      .mockResolvedValueOnce({
        content: '',
        thinking: '',
        toolCalls: [{ function: { name: 'go_to_today', arguments: {} } }]
      })
      .mockResolvedValueOnce({
        content: 'Pronto: data visível atualizada.',
        thinking: '',
        toolCalls: []
      });

    const result = await runAssistantTurn([
      {
        id: 'user-1',
        role: 'user',
        content: 'me leve de volta e resuma o que fez',
        createdAt: '2026-07-03T00:00:00.000Z'
      }
    ]);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.tool).toBe('go_to_today');
    expect(result.content).toBe('Pronto: data visível atualizada.');
  });
});

describe('resolveChoiceSelection', () => {
  const choices: AssistantPendingChoice[] = [
    { label: 'Comprar leite', call: { function: { name: 'complete_task', arguments: { id: 't1' } } } },
    { label: 'Revisar contrato', call: { function: { name: 'complete_task', arguments: { id: 't2' } } } },
    { label: 'Enviar relatório', call: { function: { name: 'complete_task', arguments: { id: 't3' } } } }
  ];

  it('resolves numbers and ordinals', () => {
    expect(resolveChoiceSelection(choices, '1')?.function.arguments).toEqual({ id: 't1' });
    expect(resolveChoiceSelection(choices, 'a segunda')?.function.arguments).toEqual({ id: 't2' });
    expect(resolveChoiceSelection(choices, 'a última')?.function.arguments).toEqual({ id: 't3' });
  });

  it('resolves by label text with typo tolerance', () => {
    expect(resolveChoiceSelection(choices, 'revisar contarto')?.function.arguments).toEqual({ id: 't2' });
  });

  it('returns null for ambiguous or unknown replies', () => {
    expect(resolveChoiceSelection(choices, 'talvez amanhã')).toBeNull();
    expect(resolveChoiceSelection(choices, '9')).toBeNull();
  });
});

describe('pending confirmation flow', () => {
  const pendingDeleteMessage: AssistantMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Encontrei 1 evento(s) para remover em 2026-07-04. Confirmar remoção?',
    createdAt: '2026-07-03T00:00:01.000Z',
    pendingToolCall: {
      function: { name: 'delete_calendar_events', arguments: { dateKey: '2026-07-04' } }
    }
  };

  function conversationWithReply(reply: string): AssistantMessage[] {
    return [
      {
        id: 'user-1',
        role: 'user',
        content: 'remove os eventos de amanhã',
        createdAt: '2026-07-03T00:00:00.000Z'
      },
      pendingDeleteMessage,
      {
        id: 'user-2',
        role: 'user',
        content: reply,
        createdAt: '2026-07-03T00:00:02.000Z'
      }
    ];
  }

  it('executes exactly the pending tool on confirmation without calling the model', async () => {
    const result = await runAssistantTurn(conversationWithReply('sim'));

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.tool).toBe('delete_calendar_events');
    expect(result.content).toContain('Confirmado.');
  });

  it('cancels without changing state and without calling the model', async () => {
    const result = await runAssistantTurn(conversationWithReply('não, deixa'));

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(result.actions).toEqual([]);
    expect(result.content).toContain('Cancelado');
  });

  it('previews bulk deletions and only deletes after explicit confirmation', async () => {
    const year = new Date().getFullYear();
    const seeded = await executeAssistantTool('add_calendar_event', {
      title: 'Aniversário da minha mãe',
      dateKey: `${year}-07-11`,
      recurrence: 'yearly'
    });
    expect(seeded.ok).toBe(true);

    const request: AssistantMessage = {
      id: 'user-1',
      role: 'user',
      content: 'remove todos os eventos recorrentes de julho dia 11',
      createdAt: '2026-07-03T00:00:00.000Z'
    };

    const previewTurn = await runAssistantTurn([request]);

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(previewTurn.actions).toEqual([]);
    expect(previewTurn.pendingToolCall?.function.name).toBe('delete_calendar_events');
    expect(previewTurn.content).toContain('Confirmar');
    expect(previewTurn.content).toContain('Aniversário da minha mãe');

    const confirmTurn = await runAssistantTurn([
      request,
      {
        id: 'assistant-1',
        role: 'assistant',
        content: previewTurn.content,
        createdAt: '2026-07-03T00:00:01.000Z',
        pendingToolCall: previewTurn.pendingToolCall
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'sim',
        createdAt: '2026-07-03T00:00:02.000Z'
      }
    ]);

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(confirmTurn.actions).toHaveLength(1);
    expect(confirmTurn.actions[0]?.changed).toBe(true);
    expect(confirmTurn.content).toContain('Confirmado.');
    expect(confirmTurn.content).toContain('Aniversário da minha mãe');
  });

  it('executes the selected pending choice by number without calling the model', async () => {
    const choices: AssistantPendingChoice[] = [
      { label: '11 de julho', call: { function: { name: 'go_to_date', arguments: { dateKey: '2026-07-11' } } } },
      { label: 'hoje', call: { function: { name: 'go_to_today', arguments: {} } } }
    ];

    const result = await runAssistantTurn([
      {
        id: 'user-1',
        role: 'user',
        content: 'vai para a data',
        createdAt: '2026-07-03T00:00:00.000Z'
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Qual data?\n1. 11 de julho\n2. hoje',
        createdAt: '2026-07-03T00:00:01.000Z',
        pendingChoices: choices
      },
      {
        id: 'user-2',
        role: 'user',
        content: '2',
        createdAt: '2026-07-03T00:00:02.000Z'
      }
    ]);

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.tool).toBe('go_to_today');
  });

  it('cancels pending choices without executing anything', async () => {
    const result = await runAssistantTurn([
      {
        id: 'user-1',
        role: 'user',
        content: 'apaga a reunião',
        createdAt: '2026-07-03T00:00:00.000Z'
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Qual devo apagar?',
        createdAt: '2026-07-03T00:00:01.000Z',
        pendingChoices: [
          { label: 'Reunião A', call: { function: { name: 'delete_calendar_event', arguments: { id: 'e1' } } } },
          { label: 'Reunião B', call: { function: { name: 'delete_calendar_event', arguments: { id: 'e2' } } } }
        ]
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'deixa, esquece',
        createdAt: '2026-07-03T00:00:02.000Z'
      }
    ]);

    expect(streamOllamaChatMock).not.toHaveBeenCalled();
    expect(result.actions).toEqual([]);
    expect(result.content).toContain('como está');
  });

  it('does not re-execute an already resolved confirmation on a later "sim"', async () => {
    streamOllamaChatMock.mockResolvedValueOnce({
      content: 'Certo!',
      thinking: '',
      toolCalls: []
    });

    const result = await runAssistantTurn([
      {
        id: 'user-1',
        role: 'user',
        content: 'remove os eventos de amanhã',
        createdAt: '2026-07-03T00:00:00.000Z'
      },
      pendingDeleteMessage,
      {
        id: 'user-2',
        role: 'user',
        content: 'sim',
        createdAt: '2026-07-03T00:00:02.000Z'
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'Confirmado. Eventos removidos.',
        createdAt: '2026-07-03T00:00:03.000Z',
        actions: [
          {
            id: 'action-1',
            tool: 'delete_calendar_events',
            label: 'Eventos removidos.',
            ok: true,
            changed: true
          }
        ]
      },
      {
        id: 'user-3',
        role: 'user',
        content: 'sim',
        createdAt: '2026-07-03T00:00:04.000Z'
      }
    ]);

    expect(result.actions).toEqual([]);
    expect(streamOllamaChatMock).toHaveBeenCalledTimes(1);
  });
});
