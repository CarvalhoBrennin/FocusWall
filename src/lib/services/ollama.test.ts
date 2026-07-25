import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config.js';
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

  it('sends an explicit context window and leaves thinking untouched', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse(['{"message":{"content":"ok"},"done":true}\n']));
    vi.stubGlobal('fetch', fetchMock);

    await streamOllamaChat({ messages: [{ role: 'user', content: 'teste' }] });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Without num_ctx, Ollama falls back to 4096 and truncates the system prompt.
    expect(body.options.num_ctx).toBe(CONFIG.ASSISTANT.numCtx);
    expect(body.options.temperature).toBe(CONFIG.ASSISTANT.temperature);
    expect(body.stream).toBe(true);
    // Sending think:false makes qwen3 emit its reasoning inside content instead.
    expect('think' in body).toBe(false);
  });
});
