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

function createAbortController(timeoutMs: number, outerSignal?: AbortSignal) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const abort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) {
      controller.abort();
    } else {
      outerSignal.addEventListener('abort', abort, { once: true });
    }
  }

  const resetTimer = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  };

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    outerSignal?.removeEventListener('abort', abort);
  };

  resetTimer();
  return { controller, resetTimer, cleanup };
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

function applyResolvedBaseUrl(health: OllamaHealth): OllamaHealth {
  if (health.baseUrl) {
    resolvedBaseUrl = health.baseUrl;
  }
  return health;
}

async function checkOllamaHealthViaFetch(signal?: AbortSignal): Promise<OllamaHealth> {
  const candidates = getBrowserBaseUrlCandidates();
  let lastError = 'Ollama indisponível.';

  for (const baseUrl of candidates) {
    const { controller, cleanup } = createAbortController(5000, signal);
    try {
      const response = await fetch(ollamaUrl('/api/tags', baseUrl), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const payload = await response.json();
      return applyResolvedBaseUrl({
        online: true,
        models: normalizeModels(payload),
        baseUrl
      });
    } catch (err) {
      lastError = String((err as Error)?.message || err);
      if (signal?.aborted) break;
    } finally {
      cleanup();
    }
  }

  return { online: false, models: [], error: lastError };
}

async function checkOllamaHealthViaTauri(): Promise<OllamaHealth> {
  const health = await tauriInvoke<OllamaHealth>('check_ollama_health', {
    baseUrl: CONFIG.ASSISTANT.ollamaBaseUrl
  });
  return applyResolvedBaseUrl(health);
}

export async function checkOllamaHealth(signal?: AbortSignal): Promise<OllamaHealth> {
  if (isTauri()) {
    try {
      return await checkOllamaHealthViaTauri();
    } catch (err) {
      return {
        online: false,
        models: [],
        error: String((err as Error)?.message || err)
      };
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
    const result = await tauriInvoke<OllamaStartResult>('start_ollama_service', {
      baseUrl: CONFIG.ASSISTANT.ollamaBaseUrl
    });
    if (result.baseUrl) resolvedBaseUrl = result.baseUrl;
    return result;
  } catch (err) {
    return {
      online: false,
      started: false,
      message: 'Não foi possível iniciar o assistente.',
      error: String((err as Error)?.message || err)
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
    const result = await tauriInvoke<OllamaModelInstallResult>('install_ollama_model', {
      model,
      baseUrl: CONFIG.ASSISTANT.ollamaBaseUrl
    });
    if (result.baseUrl) resolvedBaseUrl = result.baseUrl;
    return result;
  } catch (err) {
    return {
      installed: false,
      model,
      message: 'Não foi possível instalar o modelo do assistente.',
      error: String((err as Error)?.message || err)
    };
  }
}

function collectToolCalls(target: OllamaStreamResult, chunk: unknown) {
  const calls = (chunk as { message?: { tool_calls?: unknown[] } })?.message?.tool_calls;
  if (Array.isArray(calls)) {
    target.toolCalls.push(...(calls as OllamaStreamResult['toolCalls']));
  }
}

function collectContent(target: OllamaStreamResult, chunk: unknown, onContent?: (content: string) => void) {
  const message = (chunk as { message?: { content?: unknown; thinking?: unknown } })?.message;
  if (typeof message?.thinking === 'string') {
    target.thinking += message.thinking;
  }
  if (typeof message?.content === 'string' && message.content) {
    target.content += message.content;
    onContent?.(message.content);
  }
  const doneReason = (chunk as { done_reason?: unknown })?.done_reason;
  if (typeof doneReason === 'string') {
    target.doneReason = doneReason;
  }
}

function parseStreamLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function applyStreamChunk(
  target: OllamaStreamResult,
  line: string,
  onContent?: (content: string) => void
) {
  const parsed = parseStreamLine(line);
  if (!parsed) return false;
  collectContent(target, parsed, onContent);
  collectToolCalls(target, parsed);
  return Boolean((parsed as { done?: boolean }).done);
}

async function streamOllamaChatViaFetch(options: StreamChatOptions): Promise<OllamaStreamResult> {
  const { controller, resetTimer, cleanup } = createAbortController(
    CONFIG.ASSISTANT.streamIdleTimeoutMs,
    options.signal
  );
  const result: OllamaStreamResult = { content: '', thinking: '', toolCalls: [] };

  try {
    const response = await fetch(ollamaUrl('/api/chat', options.baseUrl), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model || CONFIG.ASSISTANT.model,
        messages: options.messages,
        tools: options.tools || [],
        stream: true,
        options: {
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama retornou HTTP ${response.status}.`);
    }

    if (!response.body) {
      const payload = await response.json();
      collectContent(result, payload, options.onContent);
      collectToolCalls(result, payload);
      return result;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      resetTimer();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        applyStreamChunk(result, line, options.onContent);
      }
    }

    buffer += decoder.decode();
    applyStreamChunk(result, buffer, options.onContent);
    return result;
  } finally {
    cleanup();
  }
}

async function streamOllamaChatViaTauri(options: StreamChatOptions): Promise<OllamaStreamResult> {
  const result: OllamaStreamResult = { content: '', thinking: '', toolCalls: [] };
  const { Channel } = await import('@tauri-apps/api/core');

  return new Promise((resolve, reject) => {
    const channel = new Channel<OllamaStreamChunk>();
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      options.signal?.removeEventListener('abort', abort);
    };

    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const settleResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        settleReject(new Error('Tempo esgotado aguardando resposta do Ollama.'));
      }, CONFIG.ASSISTANT.streamIdleTimeoutMs);
    };

    const abort = () => settleReject(new DOMException('Aborted', 'AbortError'));

    channel.onmessage = (chunk) => {
      if (options.signal?.aborted) {
        abort();
        return;
      }
      resetTimer();
      applyStreamChunk(result, chunk.line, options.onContent);
    };

    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener('abort', abort, { once: true });
    resetTimer();

    tauriInvoke('ollama_chat_stream', {
      body: JSON.stringify({
        model: options.model || CONFIG.ASSISTANT.model,
        messages: options.messages,
        tools: options.tools || [],
        stream: true,
        options: {
          temperature: 0.2
        }
      }),
      baseUrl: options.baseUrl || resolvedBaseUrl,
      onChunk: channel
    })
      .then(settleResolve)
      .catch(settleReject);
  });
}

export async function streamOllamaChat(options: StreamChatOptions): Promise<OllamaStreamResult> {
  if (isTauri()) {
    return streamOllamaChatViaTauri(options);
  }
  return streamOllamaChatViaFetch(options);
}

export function pickAssistantModel(models: OllamaModelInfo[], preferred = CONFIG.ASSISTANT.model): string {
  const names = models.map((entry) => entry.name);
  for (const candidate of CONFIG.ASSISTANT.modelPreferences) {
    if (names.includes(candidate)) return candidate;
  }
  if (names.includes(preferred)) return preferred;
  return names[0] || preferred;
}
