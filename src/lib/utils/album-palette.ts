export type AlbumPalette = {
  dominant: string;
  accent: string;
  accentSoft: string;
  shadow: string;
  glow: string;
  ink: 'light' | 'dark';
  ambientReady: boolean;
};

const DEFAULT_PALETTE: AlbumPalette = {
  dominant: '',
  accent: '',
  accentSoft: '',
  shadow: '',
  glow: '',
  ink: 'light',
  ambientReady: false
};

const MIN_SATURATION = 0.15;
const SAMPLE_SIZE = 64;
const SAMPLE_STEP = 4;
const BUCKET_SIZE = 24;
const INK_LUMINANCE_THRESHOLD = 150;

const MEDIA_CSS_VARS = [
  '--media-dominant',
  '--media-accent',
  '--media-accent-soft',
  '--media-shadow',
  '--media-glow',
  '--media-ink',
  '--media-ink-soft',
  '--media-ambient-image'
] as const;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        h = ((bn - rn) / d + 2) / 6;
        break;
      default:
        h = ((rn - gn) / d + 4) / 6;
    }
  }

  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function bucketKey(r: number, g: number, b: number): string {
  const br = Math.floor(r / BUCKET_SIZE) * BUCKET_SIZE;
  const bg = Math.floor(g / BUCKET_SIZE) * BUCKET_SIZE;
  const bb = Math.floor(b / BUCKET_SIZE) * BUCKET_SIZE;
  return `${br},${bg},${bb}`;
}

function parseBucket(key: string): [number, number, number] {
  const [r, g, b] = key.split(',').map(Number);
  return [r, g, b];
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function resolveInk(r: number, g: number, b: number): 'light' | 'dark' {
  return relativeLuminance(r, g, b) > INK_LUMINANCE_THRESHOLD ? 'dark' : 'light';
}

function inkColors(ink: 'light' | 'dark'): { ink: string; inkSoft: string } {
  if (ink === 'dark') {
    return {
      ink: '#1f1b18',
      inkSoft: 'rgba(31, 27, 24, 0.68)'
    };
  }
  return {
    ink: '#f1ecec',
    inkSoft: 'rgba(241, 236, 236, 0.72)'
  };
}

function buildPaletteFromPixels(data: Uint8ClampedArray): AlbumPalette {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < data.length; i += 4 * SAMPLE_STEP) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;

    const [, s, l] = rgbToHsl(r, g, b);
    if (s < MIN_SATURATION || l < 0.08 || l > 0.92) continue;

    const key = bucketKey(r, g, b);
    const entry = buckets.get(key);
    if (entry) {
      entry.count += 1;
      entry.r += r;
      entry.g += g;
      entry.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  if (buckets.size === 0) {
    return DEFAULT_PALETTE;
  }

  const ranked = [...buckets.entries()]
    .map(([key, value]) => {
      const avgR = value.r / value.count;
      const avgG = value.g / value.count;
      const avgB = value.b / value.count;
      const [h, s, l] = rgbToHsl(avgR, avgG, avgB);
      return { key, count: value.count, h, s, l, r: avgR, g: avgG, b: avgB };
    })
    .sort((a, b) => b.count - a.count);

  const dominantEntry = ranked[0];
  let accentEntry = dominantEntry;

  for (const candidate of ranked.slice(1, 8)) {
    if (hueDistance(candidate.h, dominantEntry.h) >= 30) {
      accentEntry = candidate;
      break;
    }
  }

  if (accentEntry === dominantEntry) {
    const [h, s, l] = rgbToHsl(dominantEntry.r, dominantEntry.g, dominantEntry.b);
    accentEntry = {
      ...dominantEntry,
      h,
      s: Math.min(1, s + 0.12),
      l: Math.min(0.72, l + 0.08)
    };
  }

  const dominantHex = hslToHex(dominantEntry.h, dominantEntry.s, dominantEntry.l);
  const accentHex = hslToHex(accentEntry.h, accentEntry.s, accentEntry.l);
  const shadowHex = hslToHex(dominantEntry.h, Math.min(1, dominantEntry.s * 0.85), 0.12);

  const accentRgb = hexToRgb(accentHex) ?? [accentEntry.r, accentEntry.g, accentEntry.b];
  const glowR = clampChannel(accentRgb[0] * 0.4 + 40);
  const glowG = clampChannel(accentRgb[1] * 0.4 + 40);
  const glowB = clampChannel(accentRgb[2] * 0.4 + 40);

  const ink = resolveInk(dominantEntry.r, dominantEntry.g, dominantEntry.b);

  return {
    dominant: dominantHex,
    accent: accentHex,
    accentSoft: `rgba(${clampChannel(accentRgb[0])}, ${clampChannel(accentRgb[1])}, ${clampChannel(accentRgb[2])}, 0.22)`,
    shadow: shadowHex,
    glow: `rgba(${glowR}, ${glowG}, ${glowB}, 0.45)`,
    ink,
    ambientReady: true
  };
}

export function extractAlbumPaletteFromImageData(data: Uint8ClampedArray): AlbumPalette {
  return buildPaletteFromPixels(data);
}

export function extractAlbumPalette(coverSrc: string | null | undefined): Promise<AlbumPalette> {
  if (!coverSrc) {
    return Promise.resolve(DEFAULT_PALETTE);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(DEFAULT_PALETTE);
          return;
        }
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        resolve(buildPaletteFromPixels(imageData.data));
      } catch {
        resolve(DEFAULT_PALETTE);
      }
    };

    img.onerror = () => resolve(DEFAULT_PALETTE);
    img.src = coverSrc;
  });
}

function clearMediaCssVars(element: HTMLElement): void {
  for (const name of MEDIA_CSS_VARS) {
    element.style.removeProperty(name);
  }
}

export function applyAlbumPalette(
  element: HTMLElement | null,
  palette: AlbumPalette,
  coverSrc: string | null
): void {
  if (!element) return;

  if (!palette.ambientReady || !coverSrc) {
    clearMediaCssVars(element);
    return;
  }

  const { ink, inkSoft } = inkColors(palette.ink);

  element.style.setProperty('--media-dominant', palette.dominant);
  element.style.setProperty('--media-accent', palette.accent);
  element.style.setProperty('--media-accent-soft', palette.accentSoft);
  element.style.setProperty('--media-shadow', palette.shadow);
  element.style.setProperty('--media-glow', palette.glow);
  element.style.setProperty('--media-ink', ink);
  element.style.setProperty('--media-ink-soft', inkSoft);
  element.style.setProperty('--media-ambient-image', `url("${coverSrc}")`);
  element.dataset.mediaInk = palette.ink;
}

export function resetAlbumPalette(element: HTMLElement | null): void {
  if (!element) return;
  clearMediaCssVars(element);
  delete element.dataset.mediaInk;
}

let paletteTimer: ReturnType<typeof setTimeout> | null = null;
let paletteRequestId = 0;

export function scheduleAlbumPalette(
  element: HTMLElement | null,
  coverSrc: string | null,
  onPalette?: (palette: AlbumPalette) => void
): void {
  if (paletteTimer) {
    clearTimeout(paletteTimer);
    paletteTimer = null;
  }

  if (!element || !coverSrc) {
    resetAlbumPalette(element);
    onPalette?.(DEFAULT_PALETTE);
    return;
  }

  const requestId = ++paletteRequestId;

  paletteTimer = setTimeout(() => {
    void extractAlbumPalette(coverSrc).then((palette) => {
      if (requestId !== paletteRequestId) return;
      applyAlbumPalette(element, palette, coverSrc);
      onPalette?.(palette);
    });
  }, 150);
}

export function mediaTrackKey(snapshot: {
  title?: string;
  artist?: string;
  album?: string;
  sourceAppId?: string;
  source?: string;
} | null | undefined): string {
  if (!snapshot) return 'empty';
  return [
    normalizeTrackKeyPart(snapshot.artist ?? ''),
    normalizeTrackKeyPart(snapshot.album ?? ''),
    normalizeTrackKeyPart(snapshot.title ?? ''),
    normalizeTrackKeyPart(snapshot.sourceAppId ?? snapshot.source ?? '')
  ].join('|');
}

function normalizeTrackKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split('')
    .filter((ch) => /[a-z0-9\s]/.test(ch))
    .join('')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}
