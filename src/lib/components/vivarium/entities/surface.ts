import type { SeededRandom } from '../core/rng.js';
import { emitSporeAt } from '../systems/particles.js';
import type { SurfaceLife, SurfaceLifeKind, VivariumConfig, WorldState } from '../core/types.js';

type SurfaceFactoryOptions = Pick<VivariumConfig, 'surfaceLifeCount' | 'fungusCount'>;

export function createSurfaceLife(
  worldWidth: number,
  floorY: number,
  options: SurfaceFactoryOptions,
  random: SeededRandom
): SurfaceLife[] {
  const items: SurfaceLife[] = [];
  const baseKinds: SurfaceLifeKind[] = ['moss', 'mycelium', 'sprout'];
  const clusters = [
    { x: worldWidth * 0.18, width: 22 },
    { x: worldWidth * 0.48, width: 30 },
    { x: worldWidth * 0.78, width: 24 }
  ];

  for (let i = 0; i < options.surfaceLifeCount; i += 1) {
    const kind = baseKinds[i % baseKinds.length];
    const cluster = clusters[i % clusters.length];
    items.push(createSurfaceLifeItem(`surface-${i}`, kind, worldWidth, floorY, random, cluster));
  }

  for (let i = 0; i < options.fungusCount; i += 1) {
    const cluster = clusters[(i + 1) % clusters.length];
    items.push(createSurfaceLifeItem(`fungus-${i}`, 'fungus', worldWidth, floorY, random, cluster));
  }

  return items;
}

export function updateSurfaceLife(
  world: WorldState,
  dt: number,
  random: SeededRandom,
  sporeDensity: number
): void {
  const sporeScale = world.reducedMotion ? 0.3 : world.cycle === 'dawn' ? 1.45 : world.cycle === 'night' ? 0.82 : 1;

  for (const item of world.surfaceLife) {
    item.growth = Math.min(1, item.growth + dt * (item.kind === 'sprout' ? 0.012 : 0.003));
    item.moisture = Math.max(0.2, Math.min(1.2, item.moisture + (world.humidity - item.moisture) * dt * 0.1));
    item.alpha = surfaceAlpha(item, world);
    item.nextSpore -= dt * sporeDensity * sporeScale * (item.kind === 'fungus' ? 0.55 : 0.16);

    if (item.nextSpore <= 0) {
      item.nextSpore = random.range(item.kind === 'fungus' ? 8 : 16, item.kind === 'fungus' ? 18 : 32);
      if (item.kind === 'fungus' || item.kind === 'mycelium') {
        emitSporeAt(world, item.x, item.y - 4, random, item.kind === 'mycelium' ? 'moss' : 'fungus');
      }
    }
  }
}

function createSurfaceLifeItem(
  id: string,
  kind: SurfaceLifeKind,
  worldWidth: number,
  floorY: number,
  random: SeededRandom,
  cluster: { x: number; width: number }
): SurfaceLife {
  return {
    id,
    kind,
    x: Math.max(8, Math.min(worldWidth - 8, cluster.x + random.range(-cluster.width * 0.5, cluster.width * 0.5))),
    y: floorY + random.range(kind === 'sprout' ? -1 : 1, kind === 'mycelium' ? 14 : 8),
    width: random.range(kind === 'moss' ? 5 : 3, kind === 'mycelium' ? 14 : 9),
    phase: random.range(0, Math.PI * 2),
    moisture: random.range(0.45, 1),
    growth: random.range(0.55, 1),
    alpha: random.range(0.08, 0.18),
    nextSpore: random.range(9, 30)
  };
}

function surfaceAlpha(item: SurfaceLife, world: WorldState): number {
  const humidityBoost = world.humidity * (item.kind === 'moss' ? 0.13 : 0.08);
  const nightBoost =
    world.cycle === 'night' && (item.kind === 'fungus' || item.kind === 'mycelium') ? 0.05 : 0;
  const pulse = item.kind === 'fungus' ? Math.abs(Math.sin(world.elapsed * 0.5 + item.phase)) * 0.035 : 0;
  return Math.min(0.34, 0.055 + item.growth * 0.09 + humidityBoost + nightBoost + pulse);
}

export const surfaceSystem = {
  id: 'surface',
  update(world: WorldState, dt: number, rng: SeededRandom, config: VivariumConfig): void {
    updateSurfaceLife(world, dt, rng, config.sporeDensity);
  }
};
