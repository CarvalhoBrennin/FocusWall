import { describe, expect, it } from 'vitest';
import { enqueueStatePersistence } from './state-persistence.js';

describe('state persistence queue', () => {
  it('runs mutations sequentially in submission order', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = enqueueStatePersistence(async () => {
      order.push('first:start');
      await gate;
      order.push('first:end');
      return 1;
    });
    const second = enqueueStatePersistence(async () => {
      order.push('second');
      return 2;
    });
    await Promise.resolve();
    expect(order).toEqual(['first:start']);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues after a failed mutation', async () => {
    await expect(enqueueStatePersistence(async () => { throw new Error('disk'); })).rejects.toThrow('disk');
    await expect(enqueueStatePersistence(async () => 'next')).resolves.toBe('next');
  });
});
