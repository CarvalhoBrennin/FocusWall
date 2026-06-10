const SEED_STORAGE_KEY = 'focuswall.vivarium.seed';

export type SeededRandom = {
  seed: number;
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  chance: (probability: number) => boolean;
  pick: <T>(items: T[]) => T;
};

export function createSeedFromTime(): number {
  return Math.floor(Date.now() % 2147483647);
}

export function createRandom(seed: number): SeededRandom {
  let state = seed >>> 0;

  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    seed,
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)]
  };
}

export function loadVivariumSeed(explicitSeed?: number): number {
  if (typeof explicitSeed === 'number' && Number.isFinite(explicitSeed)) return explicitSeed >>> 0;
  if (typeof localStorage === 'undefined') return createSeedFromTime();

  const saved = Number(localStorage.getItem(SEED_STORAGE_KEY));
  if (Number.isFinite(saved) && saved > 0) return saved >>> 0;

  const seed = createSeedFromTime();
  localStorage.setItem(SEED_STORAGE_KEY, String(seed));
  return seed;
}

export function saveVivariumSeed(seed: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SEED_STORAGE_KEY, String(seed >>> 0));
}

export function deterministicInt(seed: number, index: number, max: number): number {
  const value = Math.sin(seed * 0.013 + index * 12.9898) * 43758.5453;
  return Math.floor((value - Math.floor(value)) * Math.max(1, max));
}

export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}
