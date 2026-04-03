import { describe, expect, it } from 'vitest';
import { PRIORITY } from '../../src/lib/config.js';
import {
  normalizeTask,
  normalizePriority,
  normalizeTaskText,
  pruneTasksByRetention
} from '../../src/lib/utils/state.js';

describe('state normalization', () => {
  it('normalizes task text and fallback priority', () => {
    const task = normalizeTask({
      text: '   revisar   pipeline   ',
      priority: 'unexpected',
      completed: 1,
      pinned: 0
    });

    expect(task).toBeTruthy();
    expect(task.text).toBe('revisar pipeline');
    expect(task.priority).toBe(PRIORITY.MEDIUM);
    expect(task.completed).toBe(true);
    expect(task.pinned).toBe(false);
  });

  it('applies valid priority enum only', () => {
    expect(normalizePriority(PRIORITY.HIGH)).toBe(PRIORITY.HIGH);
    expect(normalizePriority(PRIORITY.LOW)).toBe(PRIORITY.LOW);
    expect(normalizePriority('whatever')).toBe(PRIORITY.MEDIUM);
  });

  it('trims and caps task text', () => {
    const input = `  ${'x'.repeat(300)}   `;
    const normalized = normalizeTaskText(input);

    expect(normalized.length).toBeLessThanOrEqual(180);
    expect(normalized).toBe(normalized.trim());
  });
});

describe('history retention', () => {
  it('prunes dates older than configured retention window', () => {
    const tasksByDate = {
      '2026-01-10': [{ id: 'old' }],
      '2026-02-15': [{ id: 'kept-start' }],
      '2026-03-25': [{ id: 'new' }]
    };

    const pruned = pruneTasksByRetention(tasksByDate, '2026-04-01', 45);

    expect(pruned['2026-01-10']).toBeUndefined();
    expect(pruned['2026-02-15']).toEqual([{ id: 'kept-start' }]);
    expect(pruned['2026-03-25']).toEqual([{ id: 'new' }]);
  });
});
