import { describe, expect, it } from 'vitest';
import {
  extractAlbumPaletteFromImageData,
  mediaTrackKey
} from './album-palette.js';

function fillPixels(
  data: Uint8ClampedArray,
  r: number,
  g: number,
  b: number,
  a = 255
): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
}

describe('album-palette', () => {
  it('builds rich palette from saturated pixels', () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    fillPixels(data, 200, 40, 40);

    const palette = extractAlbumPaletteFromImageData(data);
    expect(palette.ambientReady).toBe(true);
    expect(palette.dominant).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.shadow).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.accentSoft).toContain('rgba');
    expect(palette.glow).toContain('rgba');
    expect(palette.ink).toBe('light');
  });

  it('uses dark ink for bright dominant colors', () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    fillPixels(data, 245, 210, 45);

    const palette = extractAlbumPaletteFromImageData(data);
    expect(palette.ambientReady).toBe(true);
    expect(palette.ink).toBe('dark');
  });

  it('returns empty palette for transparent image data', () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    const palette = extractAlbumPaletteFromImageData(data);
    expect(palette.ambientReady).toBe(false);
    expect(palette.dominant).toBe('');
    expect(palette.accent).toBe('');
    expect(palette.shadow).toBe('');
  });

  it('builds stable track keys aligned with backend cache', () => {
    expect(
      mediaTrackKey({
        title: 'Song A',
        artist: 'Artist B',
        album: 'Album C',
        sourceAppId: 'BraveSoftware.BraveBrowser'
      })
    ).toBe('artist b|album c|song a|bravesoftwarebravebrowser');
    expect(mediaTrackKey(null)).toBe('empty');
  });
});
