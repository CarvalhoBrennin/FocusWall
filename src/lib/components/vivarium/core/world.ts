// Foreground plants are intentionally disabled; re-add createPlants when L-system flora is redesigned.
// import { createPlants } from '../entities/plants.js';
import { createSurfaceLife } from '../entities/surface.js';
// Fauna is intentionally disabled. Keep this import path documented for later reactivation.
// import { createFauna } from '../entities/fauna.js';
import { createParticlePool } from '../systems/particles.js';
import { mergeVivariumConfig } from './config.js';
import { createRandom, type SeededRandom } from './rng.js';
import { normalizeProductivity } from '../systems/environment.js';
import type { VivariumConfig, VivariumProductivity, WorldState } from './types.js';

export function createWorldState(
  seed: number,
  config: VivariumConfig,
  productivity: VivariumProductivity,
  options: { reducedMotion?: boolean } = {}
): { world: WorldState; rng: SeededRandom } {
  const rng = createRandom(seed);
  const floorY = Math.round(config.worldHeight * 0.79);

  const world: WorldState = {
    width: config.worldWidth,
    height: config.worldHeight,
    floorY,
    airTop: 7,
    seed,
    creatures: [],
    // plants: createPlants(config.worldWidth, floorY, config, rng),
    plants: [],
    surfaceLife: createSurfaceLife(config.worldWidth, floorY, config, rng),
    particles: [],
    events: [],
    viewportWidth: config.worldWidth,
    viewportHeight: config.worldHeight,
    eventCooldown: rng.range(1.8, 3.8),
    lightLevel: 0.75,
    humidity: 0.62,
    activityLevel: 1,
    botanicalActivity: 0.7,
    warmth: 0.64,
    timeOfDay: 12,
    dayPhase: 0.5,
    wind: 0,
    cycle: 'day',
    ecosystemMood: 'med',
    visualFocus: 'plants',
    clarityMode: options.reducedMotion ?? false,
    productivity,
    reducedMotion: options.reducedMotion ?? false,
    active: true,
    hidden: false,
    elapsed: 0,
    visualElapsed: 0,
    cloudScroll: 0,
    camera: { driftX: 0, driftY: 0, pointerX: 0, pointerY: 0 },
    cacheInvalid: true,
    lastLightBand: 7
  };

  world.particles = createParticlePool(config.numberOfParticles, world, rng);
  // Fauna is intentionally disabled; keep the creation line commented for later reactivation.
  // world.creatures = createFauna(world, rng, config);
  world.creatures = [];

  return { world, rng };
}

export function rebuildWorld(
  world: WorldState,
  seed: number,
  config: VivariumConfig,
  productivity: VivariumProductivity
): SeededRandom {
  const { world: fresh, rng } = createWorldState(seed, config, productivity, {
    reducedMotion: world.reducedMotion
  });
  fresh.viewportWidth = world.viewportWidth;
  fresh.viewportHeight = world.viewportHeight;
  fresh.active = world.active;
  fresh.hidden = world.hidden;
  fresh.productivity = productivity;
  Object.assign(world, fresh);
  return rng;
}

export function initWorldFromOptions(options: {
  seed?: number;
  config?: Partial<VivariumConfig>;
  productivity?: Partial<VivariumProductivity>;
  reducedMotion?: boolean;
}): { world: WorldState; rng: SeededRandom; config: VivariumConfig } {
  const config = mergeVivariumConfig(options.config);
  const seed = options.seed ?? 1;
  const productivity = normalizeProductivity(options.productivity);
  const { world, rng } = createWorldState(seed, config, productivity, {
    reducedMotion: options.reducedMotion
  });
  return { world, rng, config };
}
