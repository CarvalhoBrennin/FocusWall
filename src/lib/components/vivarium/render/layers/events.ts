import { deterministicInt } from '../../core/rng.js';
import { eventProgress } from '../../systems/events.js';
import type { Layer, RenderContext, VivariumEvent, WorldState } from '../../core/types.js';

function drawSporeBurst(rc: RenderContext, event: VivariumEvent, world: WorldState): void {
  const progress = eventProgress(event);
  const count = world.clarityMode ? 5 : 9;
  const alpha = (1 - progress) * 0.22 * event.intensity;
  for (let i = 0; i < count; i += 1) {
    rc.px(event.x + deterministicInt(world.seed + 601, i, 15) - 7, event.y - progress * (8 + i) - (i % 3), i % 7 === 0 ? 2 : 1, 1, alpha);
  }
}

function drawRain(rc: RenderContext, event: VivariumEvent, world: WorldState): void {
  const progress = eventProgress(event);
  const count = world.clarityMode ? 18 : 32;
  const alpha = Math.sin(progress * Math.PI) * 0.16 * event.intensity;
  const fall = world.reducedMotion ? 0 : event.age * 18;
  const height = Math.max(1, world.floorY - 8);
  for (let i = 0; i < count; i += 1) {
    const x = deterministicInt(world.seed + 811, i, world.width);
    const y = 5 + ((deterministicInt(world.seed + 823, i, height) + fall + i * 7) % height);
    rc.line(x, y, x - 2, y + 4, alpha * 0.7);
  }
}

export const eventsLayer: Layer = {
  id: 'events',
  z: 6,
  draw(rc, world) {
    const events = [...world.events].sort((a, b) => a.layer - b.layer);
    for (const event of events) {
      const progress = eventProgress(event);
      if (event.kind === 'sporeBurst') drawSporeBurst(rc, event, world);
      else if (event.kind === 'condensationRun') {
        const y = event.y + progress * 28;
        rc.px(event.x, y, 1, 6 + progress * 10, (1 - progress * 0.45) * 0.22 * event.intensity);
      } else if (event.kind === 'rootPulse') {
        const alpha = Math.sin(progress * Math.PI) * 0.18 * event.intensity;
        rc.line(event.x - 14, event.y + 1, event.x + 10, event.y + 5, alpha);
      } else if (event.kind === 'mossBloom') {
        const alpha = Math.sin(progress * Math.PI) * 0.2 * event.intensity;
        for (let i = 0; i < 10; i += 1) rc.px(event.x - 8 + i * 2, event.y - (i % 3), i % 4 === 0 ? 2 : 1, 1, alpha);
      } else if (event.kind === 'soilShift') {
        for (let i = 0; i < 5; i += 1) {
          rc.px(
            event.x + deterministicInt(world.seed + 641, i, 13) - 6,
            event.y + deterministicInt(world.seed + 653, i, 5) - 2,
            i % 2 === 0 ? 2 : 1,
            1,
            (1 - progress) * 0.18 * event.intensity
          );
        }
      } else if (event.kind === 'faunaPass') {
        rc.px(event.x - 3 + progress * 6, event.y, 2, 1, Math.sin(progress * Math.PI) * 0.18 * event.intensity);
      } else if (event.kind === 'rain') drawRain(rc, event, world);
    }
  }
};

// Fauna is intentionally disabled. Keep the drawing code commented for later redesign.
// function drawFly(rc: RenderContext, creature: Creature): void {
//   const x = Math.round(creature.x);
//   const y = Math.round(creature.y);
//   const wing = Math.floor(creature.animationTime / 0.1 + creature.variant) % 2 === 0;
//   const alpha = creature.state === 'flee' ? 0.64 : 0.46;
//   rc.px(x, y, 1, 1, alpha);
//   if (wing) {
//     rc.px(x - 1, y - 1, 1, 1, alpha * 0.28);
//     rc.px(x + 2, y - 1, 1, 1, alpha * 0.28);
//   }
// }
//
// function drawAnt(rc: RenderContext, creature: Creature): void {
//   const x = Math.round(creature.x);
//   const y = Math.round(creature.y);
//   const d = creature.dir;
//   const alpha = creature.state === 'flee' ? 0.58 : 0.42;
//   rc.px(x, y, 1, 1, alpha);
//   rc.px(x + d * 2, y, 1, 1, alpha);
//   rc.px(x + d * 4, y, 1, 1, alpha * 0.76);
// }
//
// function drawSpider(rc: RenderContext, creature: Creature): void {
//   const x = Math.round(creature.x);
//   const y = Math.round(creature.y);
//   const homeY = Math.round(creature.home?.y ?? 5);
//   rc.line(x, homeY, x, y, 0.12);
//   rc.px(x - 2, y - 1, 5, 3, 0.34);
// }
//
// function drawGecko(rc: RenderContext, creature: Creature): void {
//   const x = Math.round(creature.x);
//   const y = Math.round(creature.y);
//   const alpha = creature.state === 'rest' ? 0.18 : 0.28;
//   rc.px(x, y, 5, 2, alpha);
// }
//
// function drawLarva(rc: RenderContext, creature: Creature): void {
//   if (creature.hidden) return;
//   const x = Math.round(creature.x);
//   const y = Math.round(creature.y);
//   for (let i = 0; i < 5; i += 1) rc.px(x + creature.dir * i * 2, y + (i % 2), 2, 1, 0.18 + i * 0.018);
// }
//
// export const faunaLayer: Layer = {
//   id: 'fauna',
//   z: 7,
//   draw(rc, world) {
//     const creatures = [...world.creatures].sort((a, b) => a.layer - b.layer);
//     for (const creature of creatures) {
//       if (creature.kind === 'fly') drawFly(rc, creature);
//       else if (creature.kind === 'ant') drawAnt(rc, creature);
//       else if (creature.kind === 'spider') drawSpider(rc, creature);
//       else if (creature.kind === 'gecko') drawGecko(rc, creature);
//       else if (creature.kind === 'larva') drawLarva(rc, creature);
//     }
//   }
// };
