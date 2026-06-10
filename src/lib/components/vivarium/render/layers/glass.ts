import { deterministicInt } from '../../core/rng.js';
import type { Layer, RenderContext, WorldState } from '../../core/types.js';

export const glassLayer: Layer = {
  id: 'glass',
  z: 9,
  draw(rc, world) {
    rc.px(2, 2, world.width - 4, 1, 0.22);
    rc.px(2, world.height - 3, world.width - 4, 1, 0.16);
    rc.px(2, 2, 1, world.height - 4, 0.18);
    rc.px(world.width - 3, 2, 1, world.height - 4, 0.18);

    if (!world.reducedMotion) {
      const scratchCount = world.clarityMode ? 1 : 2;
      for (let i = 0; i < scratchCount; i += 1) {
        const offset = i * 38 + Math.sin(world.elapsed * 0.1 + i) * 1.2;
        rc.line(offset, 3, offset - 24, 30, 0.018);
      }
    }

    for (let i = 0; i < 2; i += 1) {
      const x = 10 + deterministicInt(world.seed + 331, i, world.width - 20);
      const y = 10 + deterministicInt(world.seed + 337, i, 45);
      const h = 8 + deterministicInt(world.seed + 347, i, 24);
      rc.line(x, y, x - 8 - (i % 7), y + h, 0.009);
    }
  }
};
