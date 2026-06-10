import type { SeededRandom } from '../core/rng.js';
import type { VivariumConfig, VivariumEvent, VivariumEventKind, WorldState } from '../core/types.js';

type EventDef = {
  kind: VivariumEventKind;
  duration: number;
  layer: number;
  weight: (world: WorldState) => number;
  affectsFauna: boolean;
  pickSource: (world: WorldState, rng: SeededRandom) => { x: number; y: number };
  radius: (world: WorldState) => number;
};

const EVENT_DEFS: EventDef[] = [
  {
    kind: 'rain',
    duration: 6.4,
    layer: 8,
    weight: (w) => (w.humidity > 0.66 && (w.cycle === 'night' || w.cycle === 'dawn') ? 0.28 : 0),
    affectsFauna: false,
    pickSource: (w) => ({ x: w.width * 0.5, y: 14 }),
    radius: () => 12
  },
  {
    kind: 'sporeBurst',
    duration: 3.2,
    layer: 7,
    weight: (w) => (w.cycle === 'dawn' ? 0.48 : 0.12),
    affectsFauna: false,
    pickSource: (w, rng) => {
      const plant = rng.pick(w.plants);
      return { x: plant.x, y: plant.rootY - plant.height * 0.55 };
    },
    radius: () => 18
  },
  {
    kind: 'mossBloom',
    duration: 4.2,
    layer: 5,
    weight: (w) => (w.humidity > 0.63 ? 0.35 : 0.08),
    affectsFauna: false,
    pickSource: (w, rng) => {
      const surface = rng.pick(w.surfaceLife);
      return { x: surface.x, y: surface.y };
    },
    radius: () => 12
  },
  {
    kind: 'condensationRun',
    duration: 3.8,
    layer: 9,
    weight: (w) => (w.cycle === 'night' ? 0.36 : 0.1),
    affectsFauna: false,
    pickSource: (w, rng) => ({ x: rng.range(18, w.width - 18), y: rng.range(8, 26) }),
    radius: () => 12
  },
  {
    kind: 'rootPulse',
    duration: 2.8,
    layer: 4,
    weight: () => 0.3,
    affectsFauna: false,
    pickSource: (w, rng) => ({
      x: rng.range(18, w.width - 18),
      y: rng.range(w.floorY + 3, w.height - 12)
    }),
    radius: () => 12
  },
  {
    kind: 'faunaPass',
    duration: 2.4,
    layer: 8,
    weight: (w) => (w.creatures.length > 0 ? 0.18 : 0),
    affectsFauna: true,
    pickSource: (w, rng) => {
      const creature = rng.pick(w.creatures);
      return { x: creature.x, y: creature.y };
    },
    radius: () => 12
  },
  {
    kind: 'soilShift',
    duration: 1.8,
    layer: 4,
    weight: () => 0.22,
    affectsFauna: false,
    pickSource: (w, rng) => ({
      x: rng.range(18, w.width - 18),
      y: rng.range(w.floorY + 3, w.height - 12)
    }),
    radius: () => 12
  }
];

export function pickWeightedEvent(world: WorldState, rng: SeededRandom): VivariumEventKind {
  const frequencyScale = world.reducedMotion ? 0 : 1;
  let total = 0;
  const weights: { kind: VivariumEventKind; w: number }[] = [];

  for (const def of EVENT_DEFS) {
    const w = def.weight(world) * frequencyScale;
    if (w > 0) {
      weights.push({ kind: def.kind, w });
      total += w;
    }
  }

  if (total <= 0) return 'soilShift';

  let roll = rng.next() * total;
  for (const entry of weights) {
    roll -= entry.w;
    if (roll <= 0) return entry.kind;
  }

  return weights[weights.length - 1].kind;
}

export function addVivariumEvent(
  world: WorldState,
  kind: VivariumEventKind,
  x: number,
  y: number,
  radius: number,
  intensity: number,
  affectsFauna: boolean
): VivariumEvent {
  const def = EVENT_DEFS.find((d) => d.kind === kind)!;
  const event: VivariumEvent = {
    id: `${kind}-${Math.round(world.elapsed * 1000)}-${world.events.length}`,
    kind,
    x,
    y,
    radius,
    age: 0,
    duration: def.duration,
    intensity,
    layer: def.layer,
    affectsFauna
  };
  world.events.push(event);
  return event;
}

export function spawnAmbientEvent(world: WorldState, rng: SeededRandom): VivariumEvent {
  const kind = pickWeightedEvent(world, rng);
  const def = EVENT_DEFS.find((d) => d.kind === kind)!;
  const source = def.pickSource(world, rng);
  return addVivariumEvent(world, kind, source.x, source.y, def.radius(world), rng.range(0.55, 1), def.affectsFauna);
}

export const eventsSystem = {
  id: 'events',
  update(world: WorldState, dt: number, rng: SeededRandom, config: VivariumConfig): void {
    for (const event of world.events) event.age += dt;
    world.events = world.events.filter((e) => e.age < e.duration).slice(-5);

    if (!world.active || world.hidden || world.reducedMotion) return;

    world.eventCooldown = Math.max(0, world.eventCooldown - dt);
    if (world.eventCooldown > 0) return;

    const frequencyScale = config.eventFrequency === 'rare' ? 1.85 : 1;
    const activityScale = Math.max(0.75, Math.min(1.25, world.botanicalActivity));
    world.eventCooldown = rng.range(4.4, 8.8) * frequencyScale / activityScale;

    const event = spawnAmbientEvent(world, rng);
    if (event.kind === 'rain') world.eventCooldown += rng.range(7, 12);
  }
};

export function eventProgress(event: VivariumEvent): number {
  return Math.max(0, Math.min(1, event.age / event.duration));
}
