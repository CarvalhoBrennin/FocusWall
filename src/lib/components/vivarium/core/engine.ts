// Foreground plants are intentionally disabled; re-add plantsSystem when L-system flora is redesigned.
// import { plantsSystem } from '../entities/plants.js';
import { surfaceSystem } from '../entities/surface.js';
// Fauna is intentionally disabled. Keep the system import documented for later reactivation.
// import { faunaSystem } from '../entities/fauna.js';
import { buildLayers } from '../render/layers/index.js';
import { VivariumRenderer } from '../render/renderer.js';
import { environmentSystem, normalizeProductivity } from '../systems/environment.js';
import { eventsSystem } from '../systems/events.js';
import { particlesSystem } from '../systems/particles.js';
import { mergeVivariumConfig } from './config.js';
import { createRandom, loadVivariumSeed, saveVivariumSeed, type SeededRandom } from './rng.js';
import { createWorldState, rebuildWorld } from './world.js';
import type {
  HudSnapshot,
  System,
  VivariumConfig,
  VivariumProductivity,
  WorldState
} from './types.js';

export type VivariumEngine = {
  world: WorldState;
  config: VivariumConfig;
  update: (dt: number) => void;
  render: (ctx: CanvasRenderingContext2D) => void;
  setActive: (active: boolean) => void;
  setHidden: (hidden: boolean) => void;
  setReducedMotion: (reducedMotion: boolean) => void;
  setViewportSize: (width: number, height: number) => void;
  setProductivity: (productivity: VivariumProductivity) => void;
  setSeed: (seed: number) => void;
  snapshot: () => HudSnapshot;
};

const systems: System[] = [
  environmentSystem,
  // plantsSystem,
  surfaceSystem,
  eventsSystem,
  particlesSystem
  // Fauna is intentionally disabled; re-add faunaSystem here when the animals are redesigned.
  // faunaSystem
];

export function createVivariumEngine(options: {
  seed?: number;
  config?: Partial<VivariumConfig>;
  productivity?: Partial<VivariumProductivity>;
  reducedMotion?: boolean;
} = {}): VivariumEngine {
  const config = mergeVivariumConfig(options.config);
  const seed = loadVivariumSeed(options.seed);
  const productivity = normalizeProductivity(options.productivity);
  const rng = createRandom(seed);

  const { world } = createWorldState(seed, config, productivity, {
    reducedMotion: options.reducedMotion
  });

  const renderer = new VivariumRenderer(buildLayers());
  let random = rng;

  const scaleDt = (dt: number) => {
    if (world.hidden) return dt * 0.08;
    if (world.reducedMotion) return dt * config.reducedMotionScale;
    return dt;
  };

  return {
    world,
    config,
    update(dt) {
      if (!world.active) return;
      const adjusted = Math.min(scaleDt(dt), 0.08);
      world.elapsed += adjusted;
      for (const system of systems) system.update(world, adjusted, random, config);
    },
    render(ctx) {
      if (!world.reducedMotion) world.visualElapsed = performance.now() / 1000;
      renderer.render(ctx, world);
    },
    setActive(active) {
      world.active = active;
    },
    setHidden(hidden) {
      world.hidden = hidden;
    },
    setReducedMotion(reducedMotion) {
      world.reducedMotion = reducedMotion;
      world.clarityMode = reducedMotion || world.viewportWidth < 520 || world.viewportHeight < 260;
    },
    setViewportSize(width, height) {
      world.viewportWidth = width;
      world.viewportHeight = height;
      world.clarityMode = world.reducedMotion || width < 520 || height < 260;
    },
    setProductivity(next) {
      world.productivity = normalizeProductivity(next);
    },
    setSeed(nextSeed) {
      const s = nextSeed >>> 0;
      saveVivariumSeed(s);
      random = rebuildWorld(world, s, config, world.productivity);
      world.cacheInvalid = true;
      renderer.invalidateAll();
    },
    snapshot() {
      return {
        flora: world.plants.length + world.surfaceLife.length,
        fauna: world.creatures.length,
        cycle: world.cycle,
        humidity: Math.round(world.humidity * 100),
        event: world.events[0]?.kind ?? 'idle',
        seed: String(world.seed).slice(-4),
        dayPhase: world.dayPhase
      };
    }
  };
}
