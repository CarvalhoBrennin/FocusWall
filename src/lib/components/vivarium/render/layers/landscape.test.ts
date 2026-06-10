import { describe, expect, it } from 'vitest';
import { soilLift } from './landscape.js';

describe('soilLift', () => {
  it('returns values within -2..2', () => {
    for (let x = 0; x < 40; x += 1) {
      const lift = soilLift(42, x);
      expect(lift).toBeGreaterThanOrEqual(-2);
      expect(lift).toBeLessThanOrEqual(2);
    }
  });

  it('is deterministic for the same seed and x', () => {
    expect(soilLift(7, 24)).toBe(soilLift(7, 24));
    expect(soilLift(7, 24)).not.toBe(soilLift(8, 24));
  });
});
