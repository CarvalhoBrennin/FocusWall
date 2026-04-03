import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/lib/config.js';
import { storage } from '../../src/lib/services/storage.js';

describe('browser storage adapter', () => {
  it('persists and restores normalized local state', async () => {
    expect(storage.mode).toBe('browser');

    await storage.saveState({
      tasksByDate: {
        '2026-04-02': [{ id: 'x', text: '  task   one ', priority: 'invalid' }]
      }
    });

    const restored = await storage.loadState();
    const [task] = restored.tasksByDate['2026-04-02'];

    expect(task.text).toBe('task one');
    expect(task.priority).toBe('medium');

    const raw = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY));
    expect(raw.version).toBeTypeOf('number');
  });
});
