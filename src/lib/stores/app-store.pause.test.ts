import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const fetchExchangeRates = vi.fn();

vi.mock('../services/exchange.js', () => ({
  fetchExchangeRates: (...args: unknown[]) => fetchExchangeRates(...args)
}));

const { onFullscreenPause, paused } = await import('./app-store.js');
const { storage } = await import('../services/storage.js');

function rateSnapshot() {
  return {
    usd: 5.42,
    eur: 6.11,
    usdPctChange: 0.3,
    eurPctChange: -0.1,
    updatedAt: '2026-08-11T12:00:00.000Z',
    fetchedAt: '2026-08-11T12:00:00.000Z'
  };
}

describe('onFullscreenPause', () => {
  let saveState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchExchangeRates.mockReset();
    fetchExchangeRates.mockResolvedValue(rateSnapshot());
    saveState = vi.spyOn(storage, 'saveState').mockResolvedValue(undefined);
    // Estado conhecido: a primeira transição do teste sempre é uma mudança real.
    onFullscreenPause(true);
  });

  /**
   * `updateExchangeRates` ignora chamadas enquanto há uma em voo. Esperar apenas
   * pelo fetch não basta: a gravação do estado vem depois e é ela que libera o
   * guard, então um refresh subsequente seria descartado silenciosamente.
   */
  async function settleRatesCycle(expectedFetches: number) {
    await vi.waitFor(() => expect(fetchExchangeRates).toHaveBeenCalledTimes(expectedFetches));
    await vi.waitFor(() => expect(saveState).toHaveBeenCalledTimes(expectedFetches));
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pausa e retoma conforme a visibilidade muda', async () => {
    expect(get(paused)).toBe(true);

    onFullscreenPause(false);
    expect(get(paused)).toBe(false);

    onFullscreenPause(true);
    expect(get(paused)).toBe(true);
  });

  /**
   * O verificador de visibilidade roda a cada 3s e informa o mesmo valor a cada
   * chamada. Antes isso disparava um refresh de cotações por chamada — uma
   * requisição HTTP e uma regravação do estado a cada 3 segundos.
   */
  it('não refaz fetch de cotações quando o estado não muda', async () => {
    onFullscreenPause(false);
    await settleRatesCycle(1);

    onFullscreenPause(false);
    onFullscreenPause(false);
    onFullscreenPause(false);

    await Promise.resolve();
    expect(fetchExchangeRates).toHaveBeenCalledTimes(1);
  });

  it('refaz fetch quando volta de uma pausa real', async () => {
    onFullscreenPause(false);
    await settleRatesCycle(1);

    onFullscreenPause(true);
    onFullscreenPause(false);
    await settleRatesCycle(2);
  });
});
