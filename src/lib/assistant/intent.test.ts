import { describe, expect, it } from 'vitest';
import { parseDeterministicAssistantTextResponse, parseDeterministicAssistantToolCall } from './intent.js';

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

  it('answers simple greetings in pt-BR without the model', () => {
    expect(parseDeterministicAssistantTextResponse('hi')).toContain('Olá');
  });
});
