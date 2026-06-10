import type { SeededRandom } from '../core/rng.js';
import { emitSporeAt } from '../systems/particles.js';
import type { Branch, Plant, PlantKind, VivariumConfig, WorldState } from '../core/types.js';

type PlantFactoryOptions = Pick<
  VivariumConfig,
  'plantCount' | 'surfaceLifeCount' | 'fungusCount' | 'lSystemDepth'
>;

type LParams = {
  depth: number;
  angle: number;
  lengthDecay: number;
  branchProb: number;
};

const KIND_PARAMS: Record<PlantKind, LParams> = {
  stem: { depth: 3, angle: 22, lengthDecay: 0.72, branchProb: 0.55 },
  fern: { depth: 3, angle: 28, lengthDecay: 0.68, branchProb: 0.7 },
  grass: { depth: 2, angle: 18, lengthDecay: 0.8, branchProb: 0.85 },
  vine: { depth: 3, angle: 16, lengthDecay: 0.75, branchProb: 0.45 },
  moss: { depth: 2, angle: 12, lengthDecay: 0.85, branchProb: 0.4 },
  fungus: { depth: 2, angle: 10, lengthDecay: 0.7, branchProb: 0.3 },
  sprout: { depth: 2, angle: 20, lengthDecay: 0.78, branchProb: 0.5 }
};

export function createPlants(
  worldWidth: number,
  floorY: number,
  options: PlantFactoryOptions,
  random: SeededRandom
): Plant[] {
  const kinds: PlantKind[] = ['stem', 'fern', 'grass', 'vine', 'stem', 'fern'];
  const count = Math.max(1, options.plantCount);

  return Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length];
    const t = count === 1 ? 0.5 : index / (count - 1);
    const baseX =
      kind === 'vine'
        ? random.chance(0.5)
          ? 12
          : worldWidth - 12
        : 14 + t * (worldWidth - 28);

    return createPlant(
      `plant-${index}`,
      kind,
      baseX + random.range(-5, 5),
      worldWidth,
      floorY,
      random,
      options.lSystemDepth
    );
  });
}

export function updatePlants(
  world: WorldState,
  dt: number,
  random: SeededRandom,
  sporeDensity: number
): void {
  const stepTime = Math.floor(world.elapsed / 0.22) * 0.22;
  const motionScale = world.reducedMotion ? 0.18 : world.cycle === 'night' ? 0.55 : 1;
  const sporeScale = world.reducedMotion ? 0.3 : world.cycle === 'dawn' ? 1.45 : world.cycle === 'night' ? 0.82 : 1;

  for (const plant of world.plants) {
    plant.age += dt;
    plant.growth = Math.min(1, plant.growth + dt * 0.004 * plant.health);
    plant.moisture = Math.max(0.2, Math.min(1.1, plant.moisture + (world.humidity - plant.moisture) * dt * 0.08));
    plant.sway = calculatePlantSway(plant, stepTime, motionScale, world.wind);
    plant.visibleSegments = Math.max(1, Math.floor(plant.branches.length * plant.growth));
    plant.nextSpore -= dt * plant.sporeRate * sporeDensity * sporeScale * (0.65 + world.humidity * 0.5);

    if (plant.nextSpore <= 0) {
      plant.nextSpore = random.range(plant.kind === 'fungus' ? 7 : 9, plant.kind === 'grass' ? 18 : 24);
      emitSporeAt(
        world,
        plant.x + plant.lean + plant.sway,
        plant.rootY - plant.height * random.range(0.38, 0.9),
        random,
        plant.kind
      );
    }
  }
}

export function generateBranches(
  kind: PlantKind,
  rootX: number,
  rootY: number,
  height: number,
  lean: number,
  random: SeededRandom,
  maxDepth: number
): Branch[] {
  const params = KIND_PARAMS[kind];
  const depth = Math.min(maxDepth, params.depth);
  const branches: Branch[] = [];
  const angleUp = kind === 'vine' ? 88 : -90;

  function grow(
    x: number,
    y: number,
    length: number,
    angleDeg: number,
    currentDepth: number,
    alpha: number
  ): void {
    if (currentDepth > depth || length < 2) return;

    const rad = (angleDeg * Math.PI) / 180;
    const x2 = x + Math.cos(rad) * length + lean * (currentDepth / depth);
    const y2 = y + Math.sin(rad) * length;
    branches.push({ x1: x, y1: y, x2, y2, depth: currentDepth, alpha });

    if (currentDepth >= depth) return;

    const nextLen = length * params.lengthDecay;
    const spread = params.angle * (kind === 'grass' ? 0.7 : 1);

    if (random.chance(params.branchProb)) {
      grow(x2, y2, nextLen, angleDeg - spread, currentDepth + 1, alpha * 0.85);
    }
    if (random.chance(params.branchProb * 0.85)) {
      grow(x2, y2, nextLen, angleDeg + spread, currentDepth + 1, alpha * 0.8);
    }
    grow(x2, y2, nextLen * 0.92, angleDeg + random.range(-4, 4), currentDepth + 1, alpha * 0.9);
  }

  const startLen = height / Math.max(1, depth);
  grow(rootX, rootY, startLen, angleUp + lean * 0.5, 1, 0.5);
  return branches;
}

function createPlant(
  id: string,
  kind: PlantKind,
  x: number,
  worldWidth: number,
  floorY: number,
  random: SeededRandom,
  lSystemDepth: number
): Plant {
  const profile = plantProfile(kind, random);
  const rootY = floorY + random.range(kind === 'vine' ? -48 : 1, kind === 'vine' ? -34 : 5);
  const rootX = Math.max(8, Math.min(worldWidth - 8, x));
  const branches = generateBranches(kind, rootX, rootY, profile.height, profile.lean, random, lSystemDepth);

  return {
    id,
    kind,
    x: rootX,
    rootY,
    height: profile.height,
    lean: profile.lean,
    phase: random.range(0, Math.PI * 2),
    sway: 0,
    moisture: random.range(0.5, 1),
    life: random.range(0.68, 1),
    age: random.range(0, 40),
    growth: random.range(0.72, 1),
    health: random.range(0.72, 1),
    sporeRate: profile.sporeRate,
    layer: profile.layer,
    leaves: profile.leaves,
    nextSpore: random.range(6, 18),
    branches,
    visibleSegments: branches.length
  };
}

function plantProfile(
  kind: PlantKind,
  random: SeededRandom
): { height: number; lean: number; leaves: number; sporeRate: number; layer: number } {
  if (kind === 'stem') return { height: random.range(24, 44), lean: random.range(-4, 4), leaves: random.int(3, 5), sporeRate: 0.06, layer: 5 };
  if (kind === 'fern') return { height: random.range(20, 34), lean: random.range(-5, 5), leaves: random.int(5, 8), sporeRate: 0.08, layer: 5 };
  if (kind === 'grass') return { height: random.range(7, 16), lean: random.range(-2, 2), leaves: random.int(4, 7), sporeRate: 0.04, layer: 4 };
  if (kind === 'vine') return { height: random.range(30, 48), lean: random.range(-3, 3), leaves: random.int(4, 7), sporeRate: 0.035, layer: 3 };
  if (kind === 'fungus') return { height: random.range(7, 13), lean: random.range(-1, 1), leaves: random.int(1, 2), sporeRate: 0.14, layer: 4 };
  if (kind === 'sprout') return { height: random.range(5, 9), lean: random.range(-1, 1), leaves: 2, sporeRate: 0.02, layer: 4 };
  return { height: random.range(3, 6), lean: 0, leaves: random.int(2, 4), sporeRate: 0.02, layer: 3 };
}

function calculatePlantSway(plant: Plant, stepTime: number, motionScale: number, wind: number): number {
  if (plant.kind === 'moss' || plant.kind === 'fungus' || plant.kind === 'sprout') return 0;
  const base = plant.kind === 'grass' ? 1 : plant.kind === 'vine' ? 2 : 3;
  const speed = plant.kind === 'fern' ? 0.52 : plant.kind === 'vine' ? 0.38 : 0.62;
  return Math.round(Math.sin(stepTime * speed + plant.phase) * base * motionScale + wind * 0.4);
}

export function getSwayOffset(branch: Branch, sway: number, depth: number): { dx: number; dy: number } {
  const factor = depth * 0.15;
  return { dx: sway * factor, dy: 0 };
}

export const plantsSystem = {
  id: 'plants',
  update(world: WorldState, dt: number, rng: SeededRandom, config: VivariumConfig): void {
    updatePlants(world, dt, rng, config.sporeDensity);
  }
};
