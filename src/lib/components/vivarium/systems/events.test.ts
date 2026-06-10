import { describe, expect, it } from 'vitest';
import { createRandom } from '../core/rng.js';
import { mergeVivariumConfig } from '../core/config.js';
import { createWorldState } from '../core/world.js';
import { normalizeProductivity } from './environment.js';
import { eventsSystem, pickWeightedEvent } from './events.js';

describe('vivarium events', () => {
  const config = mergeVivariumConfig({ eventFrequency: 'normal' });

  it('pickWeightedEvent returns a valid kind', () => {
    const { world, rng } = createWorldState(123, config, normalizeProductivity());
    const kind = pickWeightedEvent(world, rng);
    expect([
      'sporeBurst',
      'condensationRun',
      'rootPulse',
      'mossBloom',
      'soilShift',
      'faunaPass',
      'rain'
    ]).toContain(kind);
  });

  it('respects cooldown before spawning', () => {
    const { world, rng } = createWorldState(456, config, normalizeProductivity());
    world.eventCooldown = 5;
    const before = world.events.length;
    eventsSystem.update(world, 0.5, rng, config);
    expect(world.events.length).toBe(before);
    expect(world.eventCooldown).toBeLessThan(5);
  });
});
