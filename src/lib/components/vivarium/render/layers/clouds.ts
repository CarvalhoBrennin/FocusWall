import { deterministicInt, wrap } from '../../core/rng.js';
import type { Layer, RenderContext, WorldState } from '../../core/types.js';
import { parallaxOffset } from '../primitives.js';

type CloudBlock = readonly [x: number, y: number, width: number, height: number, tone?: number];
type CloudShape = {
  width: number;
  blocks: readonly CloudBlock[];
};

const cloudShapes: readonly CloudShape[] = [
  {
    width: 38,
    blocks: [
      [0, 4, 7, 1, 0.45],
      [5, 2, 12, 3, 0.92],
      [16, 0, 9, 4, 1],
      [24, 2, 10, 3, 0.78],
      [33, 4, 5, 1, 0.42]
    ]
  },
  {
    width: 52,
    blocks: [
      [0, 5, 8, 1, 0.36],
      [7, 3, 11, 2, 0.62],
      [17, 1, 16, 4, 0.9],
      [31, 0, 8, 3, 1],
      [38, 2, 11, 2, 0.58],
      [47, 4, 5, 1, 0.32]
    ]
  },
  {
    width: 30,
    blocks: [
      [0, 2, 5, 1, 0.38],
      [4, 1, 9, 2, 0.8],
      [12, 0, 7, 3, 1],
      [18, 2, 9, 2, 0.68],
      [25, 3, 5, 1, 0.35]
    ]
  },
  {
    width: 64,
    blocks: [
      [0, 5, 10, 1, 0.28],
      [9, 4, 14, 2, 0.48],
      [22, 2, 13, 3, 0.72],
      [34, 1, 12, 4, 0.88],
      [45, 3, 13, 2, 0.52],
      [57, 5, 7, 1, 0.26]
    ]
  },
  {
    width: 24,
    blocks: [
      [0, 2, 6, 1, 0.5],
      [5, 0, 8, 3, 0.95],
      [12, 1, 8, 2, 0.78],
      [19, 3, 5, 1, 0.35]
    ]
  },
  {
    width: 44,
    blocks: [
      [0, 3, 44, 1, 0.32],
      [6, 2, 18, 2, 0.55],
      [24, 1, 14, 2, 0.72],
      [36, 2, 8, 1, 0.4]
    ]
  },
  {
    width: 18,
    blocks: [
      [0, 1, 6, 1, 0.42],
      [5, 0, 7, 2, 0.88],
      [11, 1, 7, 1, 0.55]
    ]
  },
  {
    width: 56,
    blocks: [
      [0, 4, 9, 1, 0.3],
      [8, 2, 10, 2, 0.5],
      [17, 1, 14, 3, 0.82],
      [30, 0, 11, 4, 0.95],
      [40, 2, 12, 2, 0.6],
      [50, 4, 6, 1, 0.28]
    ]
  },
  {
    width: 72,
    blocks: [
      [0, 6, 12, 1, 0.22],
      [11, 4, 16, 2, 0.4],
      [26, 2, 20, 4, 0.75],
      [45, 3, 18, 3, 0.65],
      [60, 5, 12, 1, 0.25]
    ]
  },
  {
    width: 20,
    blocks: [
      [0, 0, 4, 1, 0.35],
      [3, 1, 5, 1, 0.6],
      [7, 0, 6, 2, 0.9],
      [12, 1, 8, 1, 0.5]
    ]
  }
];

function cloudMotion(world: WorldState): number {
  return world.reducedMotion ? 0 : world.cloudScroll;
}

function drawPixelCloud(
  rc: RenderContext,
  x: number,
  y: number,
  variant: number,
  alpha: number,
  scale = 1
): void {
  const shape = cloudShapes[variant % cloudShapes.length];
  const sx = Math.round(x);
  const sy = Math.round(y);
  for (const [bx, by, bw, bh, tone = 1] of shape.blocks) {
    const px = sx + Math.round(bx * scale);
    const py = sy + Math.round(by * scale);
    const pw = Math.max(1, Math.round(bw * scale));
    const ph = Math.max(1, Math.round(bh * scale));
    rc.px(px, py, pw, ph, alpha * tone);
  }
}

function drawCloudAt(
  rc: RenderContext,
  world: WorldState,
  xFloat: number,
  y: number,
  variant: number,
  alpha: number,
  scale: number,
  width: number
): void {
  const min = -width - 12;
  const max = world.width + width + 12;
  const period = max - min;
  const x0 = wrap(xFloat, min, max);

  drawPixelCloud(rc, x0, y, variant, alpha, scale);
  drawPixelCloud(rc, x0 - period, y, variant, alpha, scale);
  drawPixelCloud(rc, x0 + period, y, variant, alpha, scale);
}

function drawCloudField(
  rc: RenderContext,
  world: WorldState,
  options: {
    count: number;
    seedOffset: number;
    yMin: number;
    yMax: number;
    speed: number;
    alpha: number;
    parallax: number;
    scaleMin: number;
    scaleMax: number;
  }
): void {
  const offset = parallaxOffset(world, options.parallax);
  const motion = cloudMotion(world);
  const skyTop = world.airTop;
  const skyBottom = world.floorY - 34;

  for (let i = 0; i < options.count; i += 1) {
    const variant = deterministicInt(world.seed + options.seedOffset + 3, i, cloudShapes.length);
    const shape = cloudShapes[variant];
    const scaleJitter =
      options.scaleMin +
      deterministicInt(world.seed + options.seedOffset + 37, i, Math.round((options.scaleMax - options.scaleMin) * 100)) /
        100;
    const width = Math.round(shape.width * scaleJitter);
    const laneOffset = (i / Math.max(1, options.count - 1)) * (options.yMax - options.yMin);
    const baseX = deterministicInt(world.seed + options.seedOffset + 11, i, world.width + width);
    const speedJitter = 0.82 + deterministicInt(world.seed + options.seedOffset + 19, i, 45) / 100;
    const xFloat = baseX + motion * options.speed * speedJitter + offset;
    const ySpread = deterministicInt(world.seed + options.seedOffset + 29, i, Math.max(1, options.yMax - options.yMin));
    const yBase = Math.min(skyBottom - 4, options.yMin + laneOffset + ySpread * 0.35);
    const yFinal = Math.max(skyTop, yBase);
    const bob = world.reducedMotion ? 0 : Math.sin(world.elapsed * 0.18 + i * 1.4 + world.seed * 0.01) * 0.6;
    const alpha = options.alpha + world.lightLevel * 0.028 + (i % 3) * 0.01;

    drawCloudAt(rc, world, xFloat, yFinal + bob, variant, alpha, scaleJitter, width);
  }
}

export const cloudsLayer: Layer = {
  id: 'clouds',
  z: 1,
  draw(rc, world) {
    drawCloudField(rc, world, {
      count: world.clarityMode ? 3 : 6,
      seedOffset: 17,
      yMin: world.airTop + 2,
      yMax: world.floorY - 52,
      speed: 7,
      alpha: 0.07,
      parallax: 0.28,
      scaleMin: 0.7,
      scaleMax: 1
    });

    drawCloudField(rc, world, {
      count: world.clarityMode ? 3 : 7,
      seedOffset: 117,
      yMin: world.airTop + 8,
      yMax: world.floorY - 44,
      speed: 12,
      alpha: 0.11,
      parallax: 0.55,
      scaleMin: 0.85,
      scaleMax: 1.2
    });

    drawCloudField(rc, world, {
      count: world.clarityMode ? 2 : 4,
      seedOffset: 217,
      yMin: world.airTop + 14,
      yMax: world.floorY - 38,
      speed: 18,
      alpha: 0.14,
      parallax: 0.82,
      scaleMin: 1,
      scaleMax: 1.35
    });
  }
};
