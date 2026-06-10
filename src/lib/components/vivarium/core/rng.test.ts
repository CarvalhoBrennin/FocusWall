import { describe, expect, it } from 'vitest';
import { createRandom, deterministicInt } from './rng.js';

describe('vivarium rng', () => {
  it('same seed yields same sequence', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqB).toEqual(seqA);
  });

  it('range and int stay within bounds', () => {
    const rng = createRandom(99);
    for (let i = 0; i < 20; i += 1) {
      expect(rng.range(2, 5)).toBeGreaterThanOrEqual(2);
      expect(rng.range(2, 5)).toBeLessThan(5);
      expect(rng.int(1, 4)).toBeGreaterThanOrEqual(1);
      expect(rng.int(1, 4)).toBeLessThanOrEqual(4);
    }
  });

  it('deterministicInt is stable', () => {
    expect(deterministicInt(7, 3, 50)).toBe(deterministicInt(7, 3, 50));
  });
});
