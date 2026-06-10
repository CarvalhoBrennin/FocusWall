import type { Layer, RenderContext, WorldState } from '../../core/types.js';

export const surfaceLifeLayer: Layer = {
  id: 'surface-life',
  z: 3,
  draw(rc, world) {
    for (const item of world.surfaceLife) {
      const x = Math.round(item.x);
      const y = Math.round(item.y);
      if (item.kind === 'moss') {
        for (let i = 0; i < Math.round(item.width); i += 2) {
          rc.px(x + i, y - (i % 3), 2, 1, item.alpha);
        }
      } else if (item.kind === 'mycelium') {
        const width = Math.round(item.width * item.growth);
        rc.line(x, y, x + width, y + 2, item.alpha);
      } else if (item.kind === 'fungus') {
        const h = Math.max(2, Math.round(4 * item.growth));
        rc.px(x, y - h, 1, h, item.alpha * 0.95);
        rc.px(x - 2, y - h - 1, 5, 1, item.alpha * 1.2);
      } else if (item.kind === 'sprout') {
        const h = Math.max(2, Math.round(5 * item.growth));
        rc.px(x, y - h, 1, h, item.alpha * 1.15);
        rc.px(x - 1, y - h, 1, 1, item.alpha * 0.85);
      }
    }
  }
};
