import type { Layer, WorldState } from '../../core/types.js';

export const skyLayer: Layer = {
  id: 'sky',
  z: 0,
  cache: true,
  parallaxFactor: 0.2,
  invalidate: (world) => world.cacheInvalid,
  draw(rc, world) {
    rc.ctx.fillStyle = '#000';
    rc.ctx.fillRect(0, 0, rc.w, world.height);
  }
};
