export function noise1D(t: number, seed = 0): number {
  const x = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function smoothNoise1D(t: number, seed = 0): number {
  const i0 = Math.floor(t);
  const i1 = i0 + 1;
  const f = t - i0;
  const a = noise1D(i0, seed);
  const b = noise1D(i1, seed);
  const smooth = f * f * (3 - 2 * f);
  return a + (b - a) * smooth;
}

export function windAt(elapsed: number, seed: number): number {
  return (smoothNoise1D(elapsed * 0.08, seed) - 0.5) * 2;
}
