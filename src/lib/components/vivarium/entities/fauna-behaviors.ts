import type { SeededRandom } from '../core/rng.js';
import type { Creature, Perception, Plant, WorldState } from '../core/types.js';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export function perceive(creature: Creature, world: WorldState): Perception {
  const radius = creature.kind === 'fly' ? 28 : creature.kind === 'spider' ? 36 : 22;
  const neighbors = world.creatures.filter(
    (other) => other.id !== creature.id && distance(creature.x, creature.y, other.x, other.y) < radius
  );
  const predators = neighbors.filter(
    (other) => other.kind === 'spider' || other.kind === 'gecko' || other.kind === 'beetle'
  );
  const prey = neighbors.filter((other) => other.kind === 'fly' || other.kind === 'ant');
  const plants = world.plants.filter(
    (plant) => distance(creature.x, creature.y, plant.x, plant.rootY - plant.height * 0.45) < radius + 10
  );
  const event = world.events.find(
    (item) => item.affectsFauna && distance(creature.x, creature.y, item.x, item.y) < item.radius
  );

  return {
    predators,
    prey,
    neighbors,
    plants,
    event,
    nearLeft: creature.x < 12,
    nearRight: creature.x > world.width - 12,
    nearFloor: creature.y > world.floorY - 5
  };
}

export function decide(creature: Creature, world: WorldState, perception: Perception, random: SeededRandom): void {
  if (perception.event || (perception.predators.length > 0 && (creature.kind === 'fly' || creature.kind === 'ant')))
    return setState(creature, 'flee');
  if (creature.energy < 0.16 && creature.kind !== 'spider') return setState(creature, 'rest');

  if (creature.kind === 'fly') {
    if (creature.state === 'land' && creature.stateTime > random.range(0.7, 2.4)) return setState(creature, 'fly');
    if (random.chance(0.18)) return setState(creature, 'land');
    if (perception.plants.length && random.chance(0.32)) return setState(creature, 'seekFood');
    return setState(creature, 'fly');
  }

  if (creature.kind === 'ant') {
    if (random.chance(0.16)) creature.carryingFood = !creature.carryingFood;
    if (random.chance(0.2)) return setState(creature, 'inspect');
    return setState(creature, creature.carryingFood ? 'seekFood' : 'wander');
  }

  if (creature.kind === 'beetle') return setState(creature, random.chance(0.42) ? 'feed' : random.chance(0.45) ? 'idle' : 'wander');
  if (creature.kind === 'spider')
    return setState(creature, perception.prey.some((item) => item.kind === 'fly') ? 'inspect' : random.chance(0.22) ? 'climb' : 'hide');
  if (creature.kind === 'gecko')
    return setState(creature, world.cycle === 'night' && random.chance(0.35) ? 'inspect' : random.chance(0.72) ? 'rest' : 'wander');
  if (creature.kind === 'larva') return setState(creature, random.chance(0.55) ? 'hide' : 'wander');
}

function setState(creature: Creature, state: Creature['state']): void {
  if (creature.state === state) return;
  creature.state = state;
  creature.stateTime = 0;
}

export function updateCreature(creature: Creature, world: WorldState, random: SeededRandom, dt: number): void {
  const perception = perceive(creature, world);
  creature.stateTime += dt;
  creature.animationTime += dt;
  creature.decisionTime -= dt;
  creature.energy = clamp(creature.energy - dt * energyDrain(creature), 0, 1);

  if (creature.decisionTime <= 0) {
    decide(creature, world, perception, random);
    creature.decisionTime = random.range(0.35, 1.4);
  }

  if (creature.kind === 'fly') updateFly(creature, world, perception, random, dt);
  if (creature.kind === 'ant') updateAnt(creature, world, perception, random, dt);
  if (creature.kind === 'beetle') updateBeetle(creature, world, perception, random, dt);
  if (creature.kind === 'spider') updateSpider(creature, world, perception, random, dt);
  if (creature.kind === 'gecko') updateGecko(creature, world, perception, random, dt);
  if (creature.kind === 'larva') updateLarva(creature, world, random, dt);

  applyEventFlee(creature, perception, dt);
  creature.x = clamp(creature.x, 5, world.width - 6);
  creature.y = clamp(creature.y, creature.kind === 'fly' ? world.airTop : 5, world.height - 5);
  if (creature.vx > 0.01) creature.dir = 1;
  if (creature.vx < -0.01) creature.dir = -1;
}

function updateFly(creature: Creature, world: WorldState, perception: Perception, random: SeededRandom, dt: number): void {
  const speed = 12 * world.activityLevel;

  if (creature.state === 'land' || creature.state === 'rest') {
    creature.vx *= 0.7;
    creature.vy *= 0.7;
    if (perception.plants[0]) {
      const plant = perception.plants[0];
      creature.x += (plant.x + plant.sway - creature.x) * dt * 1.5;
      creature.y += (plant.rootY - plant.height * 0.52 - creature.y) * dt * 1.5;
    }
  } else if (creature.state === 'flee') {
    const threat = perception.predators[0];
    const awayX = threat ? creature.x - threat.x : random.range(-1, 1);
    const awayY = threat ? creature.y - threat.y : -1;
    creature.vx += Math.sign(awayX || random.range(-1, 1)) * speed * dt * 5;
    creature.vy += Math.sign(awayY || -1) * speed * dt * 3;
  } else {
    const plant = perception.plants[0] ?? nearestPlant(creature, world.plants);
    const orbit = plant ? Math.sin(world.elapsed * 2.3 + creature.seed) : 0;
    const targetX = plant ? plant.x + orbit * 18 : creature.x + creature.dir * 12;
    const targetY = plant ? plant.rootY - plant.height * 0.7 + Math.cos(world.elapsed + creature.seed) * 8 : creature.y;
    creature.vx += (targetX - creature.x) * dt * 0.8 + random.range(-1, 1) * dt * 18;
    creature.vy += (targetY - creature.y) * dt * 0.8 + random.range(-1, 1) * dt * 14;
  }

  if (perception.nearLeft) creature.vx += speed * dt * 4;
  if (perception.nearRight) creature.vx -= speed * dt * 4;
  if (creature.y < world.airTop + 5) creature.vy += speed * dt * 2;
  if (creature.y > world.floorY - 10) creature.vy -= speed * dt * 3;

  creature.vx = clamp(creature.vx, -16, 16);
  creature.vy = clamp(creature.vy, -10, 10);
  creature.x += creature.vx * dt;
  creature.y += creature.vy * dt;
}

function updateAnt(creature: Creature, world: WorldState, perception: Perception, random: SeededRandom, dt: number): void {
  const route = creature.route;
  if (route && (!creature.target || Math.abs(creature.x - creature.target.x) < 3)) {
    creature.target = creature.target === route[0] ? route[1] : route[0];
  }

  if (creature.state === 'inspect' || creature.state === 'rest') {
    creature.vx *= 0.62;
  } else if (creature.state === 'flee') {
    const threat = perception.predators[0];
    creature.vx += Math.sign(creature.x - (threat?.x ?? world.width / 2)) * dt * 26;
  } else if (creature.target) {
    creature.vx += Math.sign(creature.target.x - creature.x) * dt * 15;
  } else {
    creature.vx += creature.dir * dt * 7;
  }

  creature.vx = clamp(creature.vx, -7, 7);
  creature.x += creature.vx * dt * world.activityLevel;
  creature.y += ((creature.target?.y ?? world.floorY + 8) - creature.y) * dt * 2;
  creature.y = clamp(creature.y + random.range(-0.08, 0.08), world.floorY + 3, world.height - 12);
}

function updateBeetle(creature: Creature, world: WorldState, _perception: Perception, random: SeededRandom, dt: number): void {
  if (creature.state === 'idle' || creature.state === 'feed') {
    creature.vx *= 0.5;
    creature.energy = clamp(creature.energy + dt * 0.08, 0, 1);
  } else {
    creature.vx += creature.dir * dt * random.range(1.6, 3.4);
  }

  if (creature.x < 18) creature.dir = 1;
  if (creature.x > world.width - 22) creature.dir = -1;
  creature.vx = clamp(creature.vx, -3, 3);
  creature.x += creature.vx * dt * world.activityLevel;
  creature.y = clamp(creature.y, world.floorY + 4, world.height - 13);
}

function updateSpider(creature: Creature, world: WorldState, perception: Perception, random: SeededRandom, dt: number): void {
  const home = creature.home ?? { x: world.width * 0.62, y: 12 };
  const prey = perception.prey.find((item) => item.kind === 'fly');
  const targetY =
    creature.state === 'climb'
      ? home.y + random.range(3, 8)
      : creature.state === 'inspect' && prey
        ? Math.min(prey.y, 54)
        : home.y + 20;
  const targetX = creature.state === 'inspect' && prey ? home.x + Math.sign(prey.x - home.x) * 7 : home.x;
  creature.x += (targetX - creature.x) * dt * 1.8;
  creature.y += (targetY - creature.y) * dt * (creature.state === 'hide' ? 0.55 : 1.5);
}

function updateGecko(creature: Creature, world: WorldState, _perception: Perception, random: SeededRandom, dt: number): void {
  if (creature.state === 'rest') {
    creature.vx *= 0.5;
    creature.vy *= 0.5;
    return;
  }

  const impulse = Math.floor((world.elapsed + creature.seed) / 0.38) % 5 === 0;
  if (impulse) {
    creature.vx += creature.dir * random.range(0.8, 2.1);
    creature.vy += random.range(-0.5, 0.5);
  }

  if (creature.x < world.width - 56) creature.dir = 1;
  if (creature.x > world.width - 18) creature.dir = -1;
  creature.vx = clamp(creature.vx, -4, 4);
  creature.x += creature.vx * dt;
  creature.y = clamp(creature.y + creature.vy * dt, 28, world.floorY + 4);
}

function updateLarva(creature: Creature, world: WorldState, random: SeededRandom, dt: number): void {
  creature.hidden = creature.state === 'hide';
  if (creature.state === 'hide') {
    creature.vx *= 0.2;
    creature.y += (world.floorY + 22 - creature.y) * dt;
  } else {
    creature.vx += random.range(-0.4, 0.4) * dt;
    creature.x += clamp(creature.vx, -1, 1) * dt;
    creature.y += (world.floorY + 12 + Math.sin(world.elapsed * 2 + creature.seed) * 2 - creature.y) * dt * 2;
  }
}

function applyEventFlee(creature: Creature, perception: Perception, dt: number): void {
  if (!perception.event || creature.kind === 'spider') return;
  creature.state = 'flee';
  creature.vx += Math.sign(creature.x - perception.event.x) * perception.event.intensity * dt * 18;
  creature.vy += Math.sign(creature.y - perception.event.y) * perception.event.intensity * dt * 10;
}

function energyDrain(creature: Creature): number {
  if (creature.state === 'rest' || creature.state === 'hide') return -0.035;
  if (creature.state === 'flee') return 0.035;
  if (creature.kind === 'fly') return 0.012;
  return 0.006;
}

function nearestPlant(creature: Creature, plants: Plant[]): Plant | undefined {
  let best: Plant | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const plant of plants) {
    const value = distance(creature.x, creature.y, plant.x, plant.rootY - plant.height * 0.5);
    if (value < bestDistance) {
      best = plant;
      bestDistance = value;
    }
  }
  return best;
}

// --- factories ---

export function createFly(index: number, world: WorldState, random: SeededRandom): Creature {
  const plant = random.pick(world.plants);
  return {
    ...createBase(`fly-${index}`, 'fly', world, random),
    x: plant.x + random.range(-18, 18),
    y: random.range(12, world.floorY - 24),
    vx: random.range(-9, 9),
    vy: random.range(-5, 5),
    state: random.chance(0.18) ? 'land' : 'fly',
    size: 2,
    layer: 8,
    target: { x: plant.x, y: plant.rootY - plant.height * 0.7 }
  };
}

export function createAnt(index: number, world: WorldState, random: SeededRandom): Creature {
  const lane = index % 3;
  const y = world.floorY + 6 + lane * 4 + random.range(-1, 1);
  return {
    ...createBase(`ant-${index}`, 'ant', world, random),
    x: random.range(14, world.width - 14),
    y,
    vx: random.chance(0.5) ? 5 : -5,
    state: 'wander',
    size: 1,
    layer: 5,
    route: [
      { x: 14 + lane * 10, y },
      { x: world.width - 18 - lane * 14, y: y + random.range(-2, 2) }
    ],
    target: { x: world.width - 20, y }
  };
}

export function createSpider(world: WorldState, random: SeededRandom): Creature {
  const home = { x: random.range(world.width * 0.48, world.width * 0.76), y: random.range(8, 22) };
  return {
    ...createBase('spider-0', 'spider', world, random),
    x: home.x,
    y: home.y + 18,
    home,
    vx: 0,
    vy: 0,
    state: 'hide',
    size: 4,
    layer: 9
  };
}

export function createGecko(world: WorldState, random: SeededRandom): Creature {
  return {
    ...createBase('gecko-0', 'gecko', world, random),
    x: world.width - random.range(22, 36),
    y: random.chance(0.55) ? random.range(34, 72) : world.floorY + 2,
    vx: 0,
    state: 'rest',
    size: 7,
    layer: 7,
    home: { x: world.width - 24, y: 48 }
  };
}

export function createLarva(index: number, world: WorldState, random: SeededRandom): Creature {
  return {
    ...createBase(`larva-${index}`, 'larva', world, random),
    x: random.range(42, world.width - 42),
    y: world.floorY + random.range(14, 23),
    vx: random.range(-0.8, 0.8),
    state: 'hide',
    size: 3,
    layer: 3,
    hidden: random.chance(0.45)
  };
}

function createBase(id: string, kind: Creature['kind'], world: WorldState, random: SeededRandom): Creature {
  return {
    id,
    kind,
    x: random.range(10, world.width - 10),
    y: random.range(10, world.floorY - 10),
    vx: 0,
    vy: 0,
    dir: random.chance(0.5) ? 1 : -1,
    energy: random.range(0.45, 1),
    state: 'wander',
    stateTime: 0,
    size: 1,
    layer: 4,
    seed: random.next() * 1000,
    variant: random.int(0, 4),
    animationTime: random.range(0, 4),
    decisionTime: random.range(0.1, 1)
  };
}
