import { render, screen } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/stores/app-store.js', () => ({
  bootstrapApp: vi.fn().mockResolvedValue(undefined),
  startAllTimers: vi.fn(),
  stopAllAppTimers: vi.fn(),
  setClockTime: vi.fn(),
  onDayChange: vi.fn(),
  onFullscreenPause: vi.fn(),
  updateExchangeRates: vi.fn(),
  setViewOffset: vi.fn(),
  viewOffsetDays: writable(0),
  paused: writable(false)
}));

vi.mock('../../src/lib/stores/ui-store.js', async () => {
  const actual = await vi.importActual('../../src/lib/stores/ui-store.js');
  return { ...actual, settingsModal: writable(false) };
});

import App from '../../src/App.svelte';

describe('app smoke', () => {
  it('renders main shell without crashing', () => {
    render(App);

    expect(screen.getByLabelText('Painel pessoal de produtividade')).toBeInTheDocument();
  });
});
