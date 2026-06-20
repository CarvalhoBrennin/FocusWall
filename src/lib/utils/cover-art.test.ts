import { describe, expect, it } from 'vitest';
import { classifyCover, isEffectivelyHd, isVideoCover } from './cover-art.js';

describe('cover-art', () => {
  it('classifies large covers as HD at 1x DPR', () => {
    const result = classifyCover(1200, 1200, 640, 1);
    expect(result.hd).toBe(true);
    expect(result.maxForegroundSide).toBe(640);
  });

  it('treats borderline covers as low-res at higher DPR', () => {
    const result = classifyCover(640, 640, 640, 1.5);
    expect(result.hd).toBe(false);
    expect(result.maxForegroundSide).toBeLessThan(640);
  });

  it('caps low-res foreground size using native dimensions', () => {
    const result = classifyCover(200, 200, 500, 1);
    expect(result.hd).toBe(false);
    expect(result.maxForegroundSide).toBe(300);
  });

  it('limits low-res foreground to 70% of container', () => {
    const result = classifyCover(120, 120, 400, 1);
    expect(result.hd).toBe(false);
    expect(result.maxForegroundSide).toBe(180);
  });

  it('reports effective HD using device pixel ratio', () => {
    expect(isEffectivelyHd(1200, 1200, 1)).toBe(true);
    expect(isEffectivelyHd(640, 640, 1.5)).toBe(false);
    expect(isEffectivelyHd(0, 0, 1)).toBe(false);
  });

  it('detects wide video thumbnails', () => {
    expect(isVideoCover(1280, 720)).toBe(true);
    expect(isVideoCover(600, 600)).toBe(false);
  });
});
