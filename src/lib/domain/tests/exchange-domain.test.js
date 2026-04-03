import test from 'node:test';
import assert from 'node:assert/strict';
import { hasDisplayableRates, mergeFreshRatesIntoState } from '../exchange/exchange-domain.js';

test('hasDisplayableRates valida valores numéricos', () => {
  assert.equal(hasDisplayableRates({ usd: 5.2, eur: 6.1 }), true);
  assert.equal(hasDisplayableRates({ usd: null, eur: 6.1 }), false);
});

test('mergeFreshRatesIntoState recria baseline quando muda o dia', () => {
  const state = { ratesBaseline: { dayKey: '2026-03-01', usd: 4, eur: 5 } };
  const fresh = { usd: 6, eur: 7 };
  const next = mergeFreshRatesIntoState(state, fresh, new Date('2026-03-02T12:00:00-03:00'));
  assert.equal(next.ratesBaseline.usd, 6);
  assert.equal(next.ratesCache, fresh);
});
