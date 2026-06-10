import { describe, expect, it } from 'vitest';
import { createRandom } from '../core/rng.js';
import { mergeVivariumConfig } from '../core/config.js';
import { createPlants, generateBranches } from './plants.js';

describe('vivarium plants', () => {
  it('same seed produces identical branch geometry', () => {
    const a = generateBranches('fern', 40, 80, 28, 2, createRandom(1001), 3);
    const b = generateBranches('fern', 40, 80, 28, 2, createRandom(1001), 3);
    expect(b.length).toBe(a.length);
    expect(b[0]?.x2).toBe(a[0]?.x2);
    expect(b[0]?.y2).toBe(a[0]?.y2);
  });

  it('createPlants count matches config', () => {
    const config = mergeVivariumConfig({ plantCount: 5 });
    const plants = createPlants(config.worldWidth, 85, config, createRandom(77));
    expect(plants).toHaveLength(5);
    expect(plants[0]?.branches.length).toBeGreaterThan(0);
  });
});
