import { CONFIG } from '../config.js';
import type {
  OllamaChatMessage,
  OllamaHealth,
  OllamaModelInfo,
  OllamaModelInstallResult,
  OllamaStartResult,
  OllamaStreamResult,
  OllamaToolDefinition
} from '../types/assistant.js';
import { isTauri, tauriInvoke } from '../utils/tauri.js';

type StreamChatOptions = {
  model?: string;
  messages: OllamaChatMessage[];
  tools?: OllamaToolDefinition[];
  signal?: AbortSignal;
  onContent?: (chunk: string) => void;
  baseUrl?: string;
};

type OllamaStreamChunk = {
  line: string;
  done: boolean;
};

type AbortState = {
  controller: AbortController;
  resetIdle: () => void;
  cleanup: () => void;
  getReason: () => 'outer' | 'idle' | 'overall' | null;
};

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'offline'
      | 'http_error'
      | 'invalid_response'
      | 'incomplete_stream'
      | 'idle_timeout'
      | 'request_timeout'
      | 'response_too_large'
      | 'aborted'
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

let resolvedBaseUrl = CONFIG.ASSISTANT.ollamaBaseUrl;

function ollamaUrl(path: string, baseUrl = resolvedBaseUrl): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function getBrowserBaseUrlCandidates(): string[] {
  const candidates = [
    import.meta.env.DEV ? '/ollama' : '',
    CONFIG.ASSISTANT.ollamaBaseUrl,
    'http://localhost:11434'
  ].filter(Boolean);
  return candidates.filter((value, index, list) => list.indexOf(value) === index);
}

function createAbortState(
  idleTimeoutMs: number,
  overallTimeoutMs: number,
  outerSignal?: AbortSignal
): AbortState {
  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let overallTimer: ReturnType<typeof setTimeout> | null = null;
  let reason: 'outer' | 'idle' | 'overall' | null = null;

  const abort = (nextReason: 'outer' | 'idle' | 'overall') => {
    if (controller.signal.aborted) return;
    reason = nextReason;
    controller.abort();
  };
  const outerAbort = () => abort('outer');
  if (outerSignal?.aborted) outerAbort();
  else outerSignal?.addEventListener('abort', outerAbort, { once: true });

  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abort('idle'), idleTimeoutMs);
  };
  resetIdle();
  overallTimer = setTimeout(() => abort('overall'), overallTimeoutMs);

  return {
    controller,
    resetIdle,
    cleanup: () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (overallTimer) clearTimeout(overallTimer);
      outerSignal?.removeEventListener('abort', outerAbort);
    },
    getReason: () => reason
  };
}

function abortError(reason: ReturnType<AbortState['getReason']>): Error {
  if (reason === 'idle') return new OllamaError('Tempo esgotado aguardando dados do Ollama.', 'idle_timeout');
  if (reason === 'overall') return new OllamaError('A resposta do Ollama excedeu o tempo máximo.', 'request_timeout');
  return new OllamaError('Solicitação ao Ollama cancelada.', 'aborted');
}

function normalizeModels(payload: unknown): OllamaModelInfo[] {
  const models = (payload as { models?: unknown[] })?.models;
  if (!Array.isArray(models)) return [];
  return models
    .map((model) => {
      const entry = model as OllamaModelInfo;
      return typeof entry?.name === 'string' && entry.name.trim() ? entry : null;
    })
    .filter(Boolean) as OllamaModelInfo[];
}

function applyResolvedBaseUrl<T extends { baseUrl?: string }>(result: T): T {
  if (result.baseUrl) resolvedBaseUrl = result.baseUrl;
  return result;
}

async function checkOllamaHealthViaFetch(signal?: AbortSignal): Promise<OllamaHealth> {
  const candidates = getBrowserBaseUrlCandidates();
  let lastError = 'Ollama indisponível.';

  for (const baseUrl of candidates) {
    const abortState = createAbortState(
      CONFIG.ASSISTANT.healthTimeoutMs,
      CONFIG.ASSISTANT.healthTimeoutMs,
      signal
    );
    try {
      const response = await fetch(ollamaUrl('/api/tags', baseUrl), {
        method: 'GET',
        cache: 'no-store',
        signal: abortState.controller.signal
      });
      if (!response.ok) {
        lastError = `Ollama retornou HTTP ${response.status}.`;
        continue;
      }
      const payload = await response.json();
      return applyResolvedBaseUrl({ online: true, models: normalizeModels(payload), baseUrl });
    } catch (error) {
      if (abortState.controller.signal.aborted) {
        const reason = abortState.getReason();
        if (reason === 'outer') break;
        lastError = abortError(reason).message;
      } else {
        lastError = String((error as Error)?.message || error);
      }
    } finally {
      abortState.cleanup();
    }
  }

  return { online: false, models: [], error: lastError };
}

async function checkOllamaHealthViaTauri(signal?: AbortSignal): Promise<OllamaHealth> {
  if (signal?.aborted) throw abortError('outer');
  const health = await tauriInvoke<OllamaHealth>('check_ollama_health', {
    baseUrl: CONFIG.ASSISTANT.ollamaBaseUrl
  });
  if (signal?.aborted) throw abortError('outer');
  return applyResolvedBaseUrl(health);
}

export async function checkOllamaHealth(signal?: AbortSignal): Promise<OllamaHealth> {
  if (isTauri()) {
    try {
      return await checkOllamaHealthViaTauri(signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      return { online: false, models: [], error: String((error as Error)?.message || error) };
    }
  }
  return checkOllamaHealthViaFetch(signal);
}

export async function startOllamaService(): Promise<OllamaStartResult> {
  if (!isTauri()) {
    return {
      online: false,
      started: false,
      message: 'Inicialização automática disponível somente no app desktop.',
      error: 'desktop-only'
    };
  }
  try {
    return applyResolvedBaseUrl(await tauriInvoke<OllamaStartResult>('start_ollama_service', {
      baseUrl: CONFIG.ASSISTANT.ollamaBaseUrl
    }));
  } catch (error) {
    return {
      online: false,
      started: false,
      message: 'Não foi possível iniciar o assistente.',
      error: String((error as Error)?.message || error)
    };
  }
}

export async function installOllamaModel(model = CONFIG.ASSISTANT.model): Promise<OllamaModelInstallResult> {
  if (!isTauri()) {
    return {
      installed: false,
      model,
      message: 'Instalação de modelo disponível somente no app desktop.',
      error: 'desktop-only'
    };
  }
  try {
    return applyResolvedBaseUrl(await tauriInvoke<OllamaModelInstallResult>('install_ollama_model', {
      model,
      baseUrl: CONFIG.ASSISTANT.ollamaBaseUrl
    }));
  } catch (error) {
    return {
      installed: false,
      model,
      message: 'Não foi possível instalar o modelo do assistente.',
      error: String((error as Error)?.message || error)
    };
  }
}

function collectToolCalls(target: OllamaStreamResult, chunk: unknown): void {
  const calls = (chunk as { message?: { tool_calls?: unknown[] } })?.message?.tool_calls;
  if (Array.isArray(calls)) target.toolCalls.push(...(calls as OllamaStreamResult['toolCalls']));
}

function collectContent(target: OllamaStreamResult, chunk: unknown, onContent?: (content: string) => void): void {
  const message = (chunk as { message?: { content?: unknown; thinking?: unknown } })?.message;
  if (typeof message?.thinking === 'string') target.thinking += message.thinking;
  if (typeof message?.content === 'string' && message.content) {
    target.content += message.content;
    onContent?.(message.content);
  }
  const doneReason = (chunk as { done_reason?: unknown })?.done_reason;
  if (typeof doneReason === 'string') target.doneReason = doneReason;
}

function parseStreamLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.length > CONFIG.ASSISTANT.maxStreamLineBytes) {
    throw new OllamaError('Ollama enviou uma linha maior que o limite permitido.', 'response_too_large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new OllamaError('Ollama enviou uma resposta JSON inválida.', 'invalid_response');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OllamaError('Ollama enviou um chunk inválido.', 'invalid_response');
  }
  return parsed as Record<string, unknown>;
}

function applyStreamChunk(
  target: OllamaStreamResult,
  line: string,
  onContent?: (content: string) => void
): boolean {
  const parsed = parseStreamLine(line);
  if (!parsed) return false;
  collectContent(target, parsed, onContent);
  collectToolCalls(target, parsed);
  return parsed.done === true;
}

function assertCompleted(doneSeen: boolean): void {
  if (!doneSeen) {
    throw new OllamaError('A conexão com o Ollama terminou antes do marcador final.', 'incomplete_stream');
  }
}

async function streamOllamaChatViaFetch(options: StreamChatOptions): Promise<OllamaStreamResult> {
  const abortState = createAbortState(
    CONFIG.ASSISTANT.streamIdleTimeoutMs,
    CONFIG.ASSISTANT.requestTimeoutMs,
    options.signal
  );
  const result: OllamaStreamResult = { content: '', thinking: '', toolCalls: [] };
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    const response = await fetch(ollamaUrl('/api/chat', options.baseUrl), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      signal: abortState.controller.signal,
      body: JSON.stringify(buildChatRequestBody(options))
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim().slice(0, 300);
      throw new OllamaError(
        `Ollama retornou HTTP ${response.status}${detail ? `: ${detail}` : '.'}`,
        'http_error'
      );
    }

    if (!response.body) {
      const payload = await response.json();
      if (!(payload as { done?: unknown })?.done) {
        throw new OllamaError('Ollama retornou uma resposta incompleta.', 'incomplete_stream');
      }
      collectContent(result, payload, options.onContent);
      collectToolCalls(result, payload);
      return result;
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let totalBytes = 0;
    let doneSeen = false;

    while (!doneSeen) {
      abortState.resetIdle();
      const next = await reader.read();
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > CONFIG.ASSISTANT.maxStreamBytes) {
        throw new OllamaError('A resposta do Ollama excedeu o limite permitido.', 'response_too_large');
      }
      buffer += decoder.decode(next.value, { stream: true });
      if (buffer.length > CONFIG.ASSISTANT.maxStreamLineBytes && !buffer.includes('\n')) {
        throw new OllamaError('Ollama enviou uma linha maior que o limite permitido.', 'response_too_large');
      }
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (applyStreamChunk(result, line, options.onContent)) {
          doneSeen = true;
          break;
        }
      }
    }

    if (!doneSeen) {
      buffer += decoder.decode();
      if (buffer.trim()) doneSeen = applyStreamChunk(result, buffer, options.onContent);
    }
    assertCompleted(doneSeen);
    return result;
  } catch (error) {
    if (abortState.controller.signal.aborted) throw abortError(abortState.getReason());
    throw error;
  } finally {
    if (reader) await reader.cancel().catch(() => undefined);
    abortState.cleanup();
  }
}

/**
 * Single source of truth for the chat payload shared by both transports.
 *
 * Deliberately does not send `think`. Measured against the local qwen3:4b,
 * `think: false` does not stop the model from reasoning — it moves the reasoning
 * out of the separate `thinking` field and into `content`, so every read answer
 * started with English chain-of-thought ("Okay, the user is asking..."). Leaving
 * the field unset keeps Ollama isolating it into `thinking`, which collectContent
 * routes away from the UI.
 */
function buildChatRequestBody(options: StreamChatOptions): Record<string, unknown> {
  return {
    model: options.model || CONFIG.ASSISTANT.model,
    messages: options.messages,
    tools: options.tools || [],
    stream: true,
    options: {
      temperature: CONFIG.ASSISTANT.temperature,
      num_ctx: CONFIG.ASSISTANT.numCtx
    }
  };
}

function createRequestId(): string {
  return `ollama-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function streamOllamaChatViaTauri(options: StreamChatOptions): Promise<OllamaStreamResult> {
  const result: OllamaStreamResult = { content: '', thinking: '', toolCalls: [] };
  const { Channel } = await import('@tauri-apps/api/core');
  const requestId = createRequestId();

  return new Promise((resolve, reject) => {
    const channel = new Channel<OllamaStreamChunk>();
    let settled = false;
    let doneSeen = false;
    let totalBytes = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let overallTimer: ReturnType<typeof setTimeout> | null = null;

    const cancelBackend = () => {
      void tauriInvoke('cancel_ollama_chat', { requestId }).catch(() => undefined);
    };
    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (overallTimer) clearTimeout(overallTimer);
      options.signal?.removeEventListener('abort', onAbort);
    };
    const settleReject = (error: unknown, cancel = true) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (cancel) cancelBackend();
      reject(error);
    };
    const settleResolve = () => {
      if (settled) return;
      try {
        assertCompleted(doneSeen);
      } catch (error) {
        settleReject(error, false);
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => settleReject(new OllamaError('Tempo esgotado aguardando dados do Ollama.', 'idle_timeout')),
        CONFIG.ASSISTANT.streamIdleTimeoutMs
      );
    };
    const onAbort = () => settleReject(new OllamaError('Solicitação ao Ollama cancelada.', 'aborted'));

    channel.onmessage = (chunk) => {
      if (settled) return;
      try {
        if (options.signal?.aborted) return onAbort();
        resetIdle();
        totalBytes += new TextEncoder().encode(chunk.line).byteLength;
        if (totalBytes > CONFIG.ASSISTANT.maxStreamBytes) {
          throw new OllamaError('A resposta do Ollama excedeu o limite permitido.', 'response_too_large');
        }
        const parsedDone = applyStreamChunk(result, chunk.line, options.onContent);
        doneSeen = doneSeen || parsedDone || chunk.done === true;
      } catch (error) {
        settleReject(error);
      }
    };

    if (options.signal?.aborted) return onAbort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    resetIdle();
    overallTimer = setTimeout(
      () => settleReject(new OllamaError('A resposta do Ollama excedeu o tempo máximo.', 'request_timeout')),
      CONFIG.ASSISTANT.requestTimeoutMs
    );

    tauriInvoke('ollama_chat_stream', {
      requestId,
      body: JSON.stringify(buildChatRequestBody(options)),
      baseUrl: options.baseUrl || resolvedBaseUrl,
      idleTimeoutMs: CONFIG.ASSISTANT.streamIdleTimeoutMs,
      requestTimeoutMs: CONFIG.ASSISTANT.requestTimeoutMs,
      onChunk: channel
    })
      .then(settleResolve)
      .catch((error) => settleReject(error, false));
  });
}

export async function streamOllamaChat(options: StreamChatOptions): Promise<OllamaStreamResult> {
  return isTauri() ? streamOllamaChatViaTauri(options) : streamOllamaChatViaFetch(options);
}

export function pickAssistantModel(models: OllamaModelInfo[], preferred = CONFIG.ASSISTANT.model): string {
  const names = models.map((entry) => entry.name);
  if (names.includes(preferred)) return preferred;
  for (const candidate of CONFIG.ASSISTANT.modelPreferences) {
    if (names.includes(candidate)) return candidate;
  }
  return names[0] || preferred;
}
