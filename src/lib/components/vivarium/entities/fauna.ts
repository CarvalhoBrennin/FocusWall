import type { SeededRandom } from '../core/rng.js';
import type { Creature, VivariumConfig, WorldState } from '../core/types.js';
import { createAnt, createFly, createGecko, createLarva, createSpider, updateCreature } from './fauna-behaviors.js';

export function createFauna(world: WorldState, random: SeededRandom, config: VivariumConfig): Creature[] {
  if (!config.enableFauna || config.faunaDensity === 'none') return [];

  const counts =
    config.faunaDensity === 'medium'
      ? { flies: Math.max(4, config.numberOfFlies), ants: Math.max(3, config.numberOfAnts) }
      : { flies: config.numberOfFlies, ants: config.numberOfAnts };

  const creatures: Creature[] = [];
  for (let i = 0; i < counts.flies; i += 1) creatures.push(createFly(i, world, random));
  for (let i = 0; i < counts.ants; i += 1) creatures.push(createAnt(i, world, random));

  if (config.enableSpider) creatures.push(createSpider(world, random));
  if (config.enableGecko && config.faunaDensity === 'medium') creatures.push(createGecko(world, random));
  if (config.enableLarva && config.faunaDensity === 'medium') creatures.push(createLarva(0, world, random));

  return creatures;
}

export const faunaSystem = {
  id: 'fauna',
  update(world: WorldState, dt: number, rng: SeededRandom, _config: VivariumConfig): void {
    for (const creature of world.creatures) updateCreature(creature, world, rng, dt);
  }
};
