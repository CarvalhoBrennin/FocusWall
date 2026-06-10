import { smoothNoise1D } from '../../core/noise.js';
import { deterministicInt } from '../../core/rng.js';
import type { Layer, RenderContext, WorldState } from '../../core/types.js';
import { parallaxOffset } from '../primitives.js';

export function soilLift(seed: number, x: number): number {
  const coarse = deterministicInt(seed + 401, Math.floor(x / 9), 3) - 1;
  const fine = x % 12 === 0 ? deterministicInt(seed + 409, x, 2) : 0;
  return Math.max(-2, Math.min(2, coarse + fine));
}

type MountainProfile = 'jagged' | 'plateau' | 'rolling' | 'needle';

type MountainRangeOptions = {
  seedOffset: number;
  baseY: number;
  count: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  alpha: number;
  ridgeAlpha: number;
  step: number;
  parallax: number;
  useSmoothNoise?: boolean;
};

function profileHeight(profile: MountainProfile, t: number): number {
  const centerFalloff = 1 - Math.abs(t * 2 - 1);

  if (profile === 'jagged') return Math.pow(Math.max(0, centerFalloff), 0.72);
  if (profile === 'plateau') return Math.min(1, Math.pow(Math.max(0, centerFalloff) * 1.85, 0.38));
  if (profile === 'needle') return Math.pow(Math.max(0, centerFalloff), 1.55);
  return Math.sin(Math.PI * t) * 0.82 + Math.sin(Math.PI * t * 2) * 0.12;
}

function pickMountainProfile(seed: number, index: number): MountainProfile {
  const profiles: MountainProfile[] = ['jagged', 'plateau', 'rolling', 'needle'];
  return profiles[deterministicInt(seed + 911, index, profiles.length)];
}

function roughness(
  seed: number,
  index: number,
  x: number,
  profile: MountainProfile,
  useSmoothNoise: boolean
): number {
  const coarse = deterministicInt(seed + 929 + index * 17, Math.floor(x / 5), 5) - 2;
  const fine = deterministicInt(seed + 937 + index * 23, Math.floor(x / 2), 3) - 1;
  const smooth = useSmoothNoise
    ? Math.round((smoothNoise1D(x * 0.14 + index * 2.1, seed + 1000) - 0.5) * 4)
    : 0;
  const scale = profile === 'rolling' ? 0.45 : profile === 'plateau' ? 0.65 : 1;
  return (coarse + fine + smooth) * scale;
}

function drawMountainRange(rc: RenderContext, world: WorldState, options: MountainRangeOptions): void {
  const offset = parallaxOffset(world, options.parallax);
  const span = world.width + options.maxWidth * 2;
  let cursor = -options.maxWidth + deterministicInt(world.seed + options.seedOffset, 0, 18) - 9;

  for (let i = 0; i < options.count; i += 1) {
    const width =
      options.minWidth +
      deterministicInt(world.seed + options.seedOffset + 13, i, options.maxWidth - options.minWidth + 1);
    const height =
      options.minHeight +
      deterministicInt(world.seed + options.seedOffset + 29, i, options.maxHeight - options.minHeight + 1);
    const profile = pickMountainProfile(world.seed + options.seedOffset, i);
    const baseX = cursor + deterministicInt(world.seed + options.seedOffset + 43, i, 12) - 6;
    const ridgeShift = deterministicInt(world.seed + options.seedOffset + 59, i, 9) - 4;

    for (let x = 0; x <= width; x += options.step) {
      const t = x / width;
      const raw = profileHeight(profile, t);
      const noise = roughness(world.seed + options.seedOffset, i, x, profile, options.useSmoothNoise === true);
      const h = Math.max(0, Math.round(raw * height + noise));
      const sx = Math.round(baseX + x + offset);
      const topY = options.baseY - h;
      const colWidth = Math.max(1, options.step);

      rc.px(sx, topY, colWidth, h + 1, options.alpha);

      if (h > 4) {
        rc.px(sx, topY + 1, colWidth, Math.min(2, h), options.alpha * 0.42);
      }

      if (x % (options.step * 3) === 0 && h > 5) {
        const ridgeY = topY + deterministicInt(world.seed + options.seedOffset + 71, x + i * 31, 3);
        const ridgeX = sx + Math.sign(t - 0.5 || 1) * ridgeShift;
        rc.px(ridgeX, ridgeY, colWidth, 1, options.ridgeAlpha);
      }

      if (profile === 'plateau' && raw > 0.88 && x % (options.step * 3) === 0) {
        rc.px(sx, topY + 1, colWidth * 2, 1, options.ridgeAlpha * 0.65);
        rc.px(sx + 1, topY + 2, colWidth, 1, options.ridgeAlpha * 0.45);
      }

      if (profile === 'needle' && raw > 0.78 && Math.abs(t - 0.5) < 0.08) {
        rc.px(sx, topY - 1, colWidth, 2, options.ridgeAlpha * 1.1);
      }
    }

    cursor += Math.round(width * 0.48) + deterministicInt(world.seed + options.seedOffset + 83, i, 10) - 2;
    if (cursor > span) break;
  }

  rc.px(4 + offset, options.baseY + 1, world.width - 8, 1, options.alpha * 0.9);
}

function drawGround(rc: RenderContext, world: WorldState): void {
  const soilPx = parallaxOffset(world, 0.28);
  const top = world.floorY + 1;
  const height = world.height - top;

  rc.px(4 + soilPx, top, world.width - 8, height, 0.14);

  let previousY = world.floorY;
  for (let x = 3; x < world.width - 3; x += 3) {
    const lift = soilLift(world.seed, x);
    const y = world.floorY + lift;
    rc.px(x + soilPx, y, 3, 1, 0.22);
    if (Math.abs(y - previousY) > 1) {
      rc.px(x + soilPx, Math.min(y, previousY), 1, Math.abs(y - previousY), 0.12);
    }
    previousY = y;
  }
}

export const landscapeLayer: Layer = {
  id: 'landscape',
  z: 2,
  draw(rc, world) {
    drawMountainRange(rc, world, {
      seedOffset: 501,
      baseY: world.floorY - 46,
      count: 8,
      minWidth: 34,
      maxWidth: 74,
      minHeight: 12,
      maxHeight: 30,
      alpha: 0.015,
      ridgeAlpha: 0.028,
      step: 2,
      parallax: 0.12
    });

    drawMountainRange(rc, world, {
      seedOffset: 601,
      baseY: world.floorY - 36,
      count: 7,
      minWidth: 28,
      maxWidth: 62,
      minHeight: 15,
      maxHeight: 38,
      alpha: 0.026,
      ridgeAlpha: 0.04,
      step: 2,
      parallax: 0.22,
      useSmoothNoise: true
    });

    drawMountainRange(rc, world, {
      seedOffset: 681,
      baseY: world.floorY - 27,
      count: 6,
      minWidth: 24,
      maxWidth: 54,
      minHeight: 10,
      maxHeight: 24,
      alpha: 0.018,
      ridgeAlpha: 0.033,
      step: 3,
      parallax: 0.28,
      useSmoothNoise: true
    });

    drawGround(rc, world);
  }
};
