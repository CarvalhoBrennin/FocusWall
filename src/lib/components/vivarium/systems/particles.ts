import type { SeededRandom } from '../core/rng.js';
import type { Particle, ParticleKind, PlantKind, VivariumConfig, WorldState } from '../core/types.js';

export function createParticlePool(count: number, world: WorldState, random: SeededRandom): Particle[] {
  const pool: Particle[] = Array.from({ length: count }, () => inactiveParticle());

  let active = 0;
  for (const p of pool) {
    if (active >= count) break;
    activateAmbientParticle(p, world, random);
    active += 1;
  }

  return pool;
}

export const particlesSystem = {
  id: 'particles',
  update(world: WorldState, dt: number, rng: SeededRandom, config: VivariumConfig): void {
    updateParticles(world, dt, rng, config);
  }
};

function inactiveParticle(): Particle {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    alpha: 0,
    size: 1,
    life: 0,
    maxLife: 1,
    seed: 0,
    kind: 'dust'
  };
}

function activateAmbientParticle(p: Particle, world: WorldState, random: SeededRandom): void {
  p.active = true;
  p.x = random.range(7, world.width - 7);
  p.y = random.range(8, world.floorY + 18);
  p.vx = random.range(-0.4, 0.4);
  p.vy = random.range(-1.2, -0.15);
  p.alpha = random.range(0.05, 0.18);
  p.size = random.chance(0.1) ? 2 : 1;
  p.life = random.range(2, 9);
  p.maxLife = 9;
  p.seed = random.next();
  p.kind = random.chance(0.16) ? 'spore' : random.chance(0.08) ? 'moisture' : 'dust';
}

export function emitSporeAt(
  world: WorldState,
  x: number,
  y: number,
  random: SeededRandom,
  plantKind: PlantKind | 'moss' | 'fungus' | 'mycelium'
): void {
  const kind: ParticleKind =
    plantKind === 'grass' || plantKind === 'fern' ? 'pollen' : plantKind === 'mycelium' ? 'moisture' : 'spore';
  const slot = findFreeSlot(world.particles);
  if (!slot) return;

  slot.active = true;
  slot.x = x + random.range(-5, 5);
  slot.y = y;
  slot.vx = random.range(-1.1, 1.1);
  slot.vy = random.range(-2.6, -0.7);
  slot.alpha = random.range(kind === 'pollen' ? 0.08 : 0.11, kind === 'pollen' ? 0.2 : 0.25);
  slot.size = random.chance(0.08) ? 2 : 1;
  slot.life = random.range(4, 8);
  slot.maxLife = 8;
  slot.seed = random.next();
  slot.kind = kind;
}

function findFreeSlot(pool: Particle[]): Particle | undefined {
  const inactive = pool.find((p) => !p.active);
  if (inactive) return inactive;
  return pool.reduce((oldest, p) => (!oldest || p.life < oldest.life ? p : oldest), undefined as Particle | undefined);
}

function updateParticles(world: WorldState, dt: number, random: SeededRandom, config: VivariumConfig): void {
  const targetActive = Math.round(
    config.numberOfParticles * (world.reducedMotion ? 0.52 : world.cycle === 'dawn' ? 1.18 : 1)
  );
  let activeCount = 0;

  for (const particle of world.particles) {
    if (!particle.active) continue;
    particle.life -= dt;
    particle.x += (particle.vx + Math.sin(world.elapsed * 0.9 + particle.seed) * 0.18) * dt * 8;
    particle.y += particle.vy * dt * 8;
    if (particle.y < 5 || particle.life <= 0) particle.active = false;
    if (particle.active) activeCount += 1;
  }

  while (activeCount < targetActive) {
    const slot = world.particles.find((p) => !p.active);
    if (!slot) break;
    slot.active = true;
    slot.x = random.range(7, world.width - 7);
    slot.y = random.range(world.floorY - 18, world.height - 8);
    slot.vx = random.range(-0.25, 0.25);
    slot.vy = random.range(-0.9, -0.2);
    slot.alpha = random.range(0.035, 0.15);
    slot.size = random.chance(0.08) ? 2 : 1;
    slot.life = random.range(4, 10);
    slot.maxLife = 10;
    slot.seed = random.next();
    slot.kind = random.chance(world.cycle === 'dawn' ? 0.18 : 0.08) ? 'pollen' : 'dust';
    activeCount += 1;
  }
}

export function getActiveParticles(world: WorldState): Particle[] {
  return world.particles.filter((p) => p.active);
}
