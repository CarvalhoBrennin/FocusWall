import { describe, expect, it } from 'vitest';
import { parseFallbackToolCalls } from './assistant.js';

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
});
