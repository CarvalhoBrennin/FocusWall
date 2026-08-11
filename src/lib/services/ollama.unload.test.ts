import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config.js';

const tauriInvoke = vi.fn();

/**
 * Este arquivo é separado do `ollama.test.ts` porque precisa do runtime Tauri
 * mockado desde a importação do módulo, enquanto os outros testes exercitam o
 * caminho de `fetch` do modo browser.
 */
vi.mock('../utils/tauri.js', () => ({
  isTauri: () => true,
  refreshTauriDetection: () => true,
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args)
}));

const { unloadOllamaModel } = await import('./ollama.js');

describe('unloadOllamaModel no app desktop', () => {
  beforeEach(() => {
    tauriInvoke.mockReset();
    tauriInvoke.mockResolvedValue(true);
  });

  /**
   * A CSP do index.html não inclui a porta 11434 em `connect-src`, então um
   * `fetch` direto do webview é bloqueado e o descarregamento falharia calado —
   * o modelo continuaria ocupando VRAM sem nenhum sinal de erro.
   */
  it('routes through the Tauri command instead of fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await unloadOllamaModel('qwen3:8b');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(tauriInvoke).toHaveBeenCalledWith('unload_ollama_model', {
      model: 'qwen3:8b',
      baseUrl: CONFIG.ASSISTANT.ollamaBaseUrl
    });
  });

  it('stays silent when the command rejects', async () => {
    tauriInvoke.mockRejectedValue(new Error('Ollama indisponível'));

    await expect(unloadOllamaModel('qwen3:8b')).resolves.toBeUndefined();
  });

  it('does not invoke without a model to unload', async () => {
    await unloadOllamaModel('');

    expect(tauriInvoke).not.toHaveBeenCalled();
  });
});
