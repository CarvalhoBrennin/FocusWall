import { getActiveParticles } from '../../systems/particles.js';
import type { Layer, RenderContext, WorldState } from '../../core/types.js';

export const particlesLayer: Layer = {
  id: 'particles',
  z: 5,
  draw(rc, world) {
    for (const particle of getActiveParticles(world)) {
      const fade = Math.max(0, Math.min(1, particle.life / particle.maxLife));
      const scale = particle.kind === 'pollen' ? 0.72 : particle.alpha < 0.12 ? 0.65 : 1;
      rc.px(particle.x, particle.y, particle.size, particle.size, particle.alpha * fade * scale);
    }

    if (world.reducedMotion || world.plants.length === 0) return;
    const count = world.cycle === 'dawn' ? 7 : 4;
    const step = Math.floor(world.elapsed / 0.5);
    for (let i = 0; i < count; i += 1) {
      const plant = world.plants[(i + step) % world.plants.length];
      if (!plant) continue;
      const x = plant.x + ((world.seed + 503 + i) % 10) - 5;
      const y = plant.rootY - plant.height * 0.65;
      rc.px(x, y - ((step + i) % 4), 1, 1, 0.035 + world.humidity * 0.035);
    }
  }
};
