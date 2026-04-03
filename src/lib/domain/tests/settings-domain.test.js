import test from 'node:test';
import assert from 'node:assert/strict';
import { clampViewOffset, buildPersistedUiSnapshot } from '../settings/settings-domain.js';

test('clampViewOffset respeita limites', () => {
  assert.equal(clampViewOffset(999), 0);
  assert.ok(clampViewOffset(-999) < 0);
});

test('buildPersistedUiSnapshot escreve último contexto de visualização', () => {
  const state = { ui: { lastViewedBaseDate: '', viewOffsetDays: 0 }, tasksByDate: {} };
  const next = buildPersistedUiSnapshot(state, '2026-04-03', -2);
  assert.equal(next.ui.lastViewedBaseDate, '2026-04-03');
  assert.equal(next.ui.viewOffsetDays, -2);
});
