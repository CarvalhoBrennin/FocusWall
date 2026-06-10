import { describe, expect, it } from 'vitest';
import { mergeVivariumConfig } from '../core/config.js';
import { createRandom } from '../core/rng.js';
import { createWorldState } from '../core/world.js';
import { cycleFromPhase, environmentSystem, normalizeProductivity } from './environment.js';

describe('vivarium environment', () => {
  it('cycleFromPhase maps boundaries', () => {
    expect(cycleFromPhase(0.2)).toBe('late');
    expect(cycleFromPhase(0.25)).toBe('dawn');
    expect(cycleFromPhase(0.5)).toBe('day');
    expect(cycleFromPhase(0.75)).toBe('night');
  });

  it('dayPhase wraps in simulated mode', () => {
    const config = mergeVivariumConfig({ clockMode: 'simulated', dayLengthSeconds: 10 });
    const { world, rng } = createWorldState(88, config, normalizeProductivity());
    world.dayPhase = 0.95;
    environmentSystem.update(world, 2, rng, config);
    expect(world.dayPhase).toBeGreaterThanOrEqual(0);
    expect(world.dayPhase).toBeLessThan(1);
  });

  // Cloud layer disabled — restore when cloudsLayer is re-enabled.
  // it('advances cloudScroll when motion is enabled', () => {
  //   const config = mergeVivariumConfig();
  //   const { world, rng } = createWorldState(12, config, normalizeProductivity(), { reducedMotion: false });
  //   environmentSystem.update(world, 0.5, rng, config);
  //   expect(world.cloudScroll).toBeGreaterThan(0);
  // });
});
