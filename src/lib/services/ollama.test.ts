import { describe, expect, it, vi } from 'vitest';
import { OllamaError, pickAssistantModel, streamOllamaChat } from './ollama.js';

const encoder = new TextEncoder();

function streamResponse(lines: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      }
    }),
    { status: 200, headers: { 'content-type': 'application/x-ndjson' } }
  );
}

describe('Ollama streaming transport', () => {
  it('collects content and requires the final done marker', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      '{"message":{"content":"Olá "},"done":false}\n',
      '{"message":{"content":"mundo"},"done":true,"done_reason":"stop"}\n'
    ])));

    const result = await streamOllamaChat({
      messages: [{ role: 'user', content: 'teste' }]
    });

    expect(result.content).toBe('Olá mundo');
    expect(result.doneReason).toBe('stop');
  });

  it('rejects a stream that ends before done=true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      '{"message":{"content":"parcial"},"done":false}\n'
    ])));

    await expect(streamOllamaChat({
      messages: [{ role: 'user', content: 'teste' }]
    })).rejects.toMatchObject({ code: 'incomplete_stream' });
  });

  it('rejects malformed NDJSON instead of silently accepting partial output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(['not-json\n'])));

    await expect(streamOllamaChat({
      messages: [{ role: 'user', content: 'teste' }]
    })).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('prefers the explicitly selected installed model', () => {
    expect(pickAssistantModel([{ name: 'other:1' }, { name: 'qwen3:4b' }], 'qwen3:4b')).toBe('qwen3:4b');
  });
});
