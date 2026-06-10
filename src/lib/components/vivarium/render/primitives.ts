import type { RenderContext } from '../core/types.js';

export function createRenderContext(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  xPad = 0
): RenderContext {
  const setInk = (alpha = 1) => {
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  };

  return {
    ctx,
    w,
    h,
    px: (x, y, width = 1, height = 1, alpha = 1) => {
      setInk(alpha);
      ctx.fillRect(Math.round(x + xPad), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    },
    line: (x1, y1, x2, y2, alpha = 1) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        setInk(alpha);
        ctx.fillRect(Math.round(x1 + dx * t + xPad), Math.round(y1 + dy * t), 1, 1);
      }
    },
    text: (value, x, y, alpha = 0.45) => {
      setInk(alpha);
      ctx.font = '6px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(value, Math.round(x), Math.round(y));
    }
  };
}

export function parallaxOffset(world: import('../core/types.js').WorldState, factor: number): number {
  if (world.reducedMotion) return 0;
  return Math.round(world.camera.driftX * factor + world.camera.pointerX * factor * 0.15);
}
