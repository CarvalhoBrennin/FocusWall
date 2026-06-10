import { getSwayOffset } from '../../entities/plants.js';
import type { Layer, RenderContext, WorldState } from '../../core/types.js';

export const plantsLayer: Layer = {
  id: 'plants',
  z: 4,
  draw(rc, world) {
    const plants = [...world.plants].sort((a, b) => a.layer - b.layer);
    for (const plant of plants) {
      const segments = plant.branches.slice(0, plant.visibleSegments);
      for (const branch of segments) {
        const { dx } = getSwayOffset(branch, plant.sway, branch.depth);
        const alpha = branch.alpha * (0.48 + plant.life * 0.16) * (plant.moisture * 0.3 + 0.7);
        rc.line(branch.x1 + dx, branch.y1, branch.x2 + dx, branch.y2, alpha);
      }
    }
  }
};
