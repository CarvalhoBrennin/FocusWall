import type { Layer, WorldState } from '../core/types.js';
import { createRenderContext, parallaxOffset } from './primitives.js';

const CACHE_PARALLAX_PAD = 12;

type CacheEntry = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  valid: boolean;
  pad: number;
};

export class VivariumRenderer {
  private caches = new Map<string, CacheEntry>();

  constructor(private layers: Layer[]) {}

  render(target: CanvasRenderingContext2D, world: WorldState): void {
    target.imageSmoothingEnabled = false;
    const rc = createRenderContext(target, world.width, world.height);

    for (const layer of this.layers) {
      if (layer.cache) {
        this.renderCached(layer, rc, world);
      } else {
        layer.draw(rc, world);
      }
    }

    if (world.cacheInvalid) world.cacheInvalid = false;
  }

  private renderCached(layer: Layer, rc: import('../core/types.js').RenderContext, world: WorldState): void {
    const pad = layer.parallaxFactor != null ? CACHE_PARALLAX_PAD : 0;
    let entry = this.caches.get(layer.id);
    if (!entry || entry.pad !== pad || entry.canvas.width !== world.width + pad * 2) {
      const canvas = document.createElement('canvas');
      canvas.width = world.width + pad * 2;
      canvas.height = world.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      entry = { canvas, ctx, valid: false, pad };
      this.caches.set(layer.id, entry);
    }

    const needsInvalidate = !entry.valid || layer.invalidate?.(world) === true;
    if (needsInvalidate) {
      entry.ctx.imageSmoothingEnabled = false;
      entry.ctx.fillStyle = '#000';
      entry.ctx.fillRect(0, 0, entry.canvas.width, world.height);
      const cacheRc = createRenderContext(entry.ctx, entry.canvas.width, world.height, pad);
      layer.draw(cacheRc, world);
      entry.valid = true;
    }

    if (layer.parallaxFactor != null) {
      const dx = parallaxOffset(world, layer.parallaxFactor);
      const sourceX = Math.max(0, Math.min(entry.pad - dx, entry.canvas.width - world.width));
      rc.ctx.drawImage(entry.canvas, sourceX, 0, world.width, world.height, 0, 0, world.width, world.height);
    } else {
      rc.ctx.drawImage(entry.canvas, entry.pad, 0, world.width, world.height, 0, 0, world.width, world.height);
    }
  }

  invalidateAll(): void {
    for (const entry of this.caches.values()) entry.valid = false;
  }
}
