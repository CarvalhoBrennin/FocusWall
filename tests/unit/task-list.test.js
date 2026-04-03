import { describe, expect, it } from 'vitest';
import { getTaskPageMeta } from '../../src/lib/utils/task-list.js';

describe('task list pagination behavior', () => {
  it('returns the expected task slice and page metadata', () => {
    const tasks = Array.from({ length: 9 }, (_, i) => ({ id: `${i + 1}` }));

    const first = getTaskPageMeta(tasks, 4, 0);
    const last = getTaskPageMeta(tasks, 4, 2);

    expect(first.totalPages).toBe(3);
    expect(first.start).toBe(1);
    expect(first.end).toBe(4);
    expect(first.paginatedTasks).toHaveLength(4);

    expect(last.page).toBe(2);
    expect(last.start).toBe(9);
    expect(last.end).toBe(9);
    expect(last.paginatedTasks).toHaveLength(1);
  });
});
