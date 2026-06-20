import type { MediaSnapshot } from '../services/media-session.js';
import { mediaTrackKey } from './album-palette.js';

const MIN_HD_EFFECTIVE_SIDE = 600;
const UPSCALE_SOFT_CAP = 1.5;

export type CoverClassification = {
  hd: boolean;
  maxForegroundSide: number;
};

export type ResolvedCover = {
  src: string | null;
  width: number;
  height: number;
  lowRes: boolean;
  source: string;
};

const MAX_RESOLVED_COVER_CACHE = 32;
const resolvedCoverCache = new Map<string, ResolvedCover>();

export function classifyCover(
  width: number,
  height: number,
  containerSidePx: number,
  devicePixelRatio = typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio ?? 1 : 1
): CoverClassification {
  const nativeSide = Math.min(width, height);
  const effectiveSide = nativeSide > 0 ? nativeSide / devicePixelRatio : 0;
  const hd = effectiveSide >= MIN_HD_EFFECTIVE_SIDE;
  const maxForegroundSide = hd
    ? containerSidePx
    : Math.min(
        containerSidePx * 0.7,
        nativeSide > 0 ? (nativeSide * UPSCALE_SOFT_CAP) / devicePixelRatio : containerSidePx * 0.7
      );

  return { hd, maxForegroundSide: Math.max(0, maxForegroundSide) };
}

export function isEffectivelyHd(
  width: number,
  height: number,
  devicePixelRatio = typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio ?? 1 : 1
): boolean {
  if (width <= 0 || height <= 0) return false;
  if (isVideoCover(width, height)) return false;
  return classifyCover(width, height, 480, devicePixelRatio).hd;
}

export function isVideoCover(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return width / height >= 1.15;
}

export function snapshotCoverClassification(
  snapshot: MediaSnapshot | null | undefined,
  containerSidePx: number
): CoverClassification {
  const width = snapshot?.coverArtWidth ?? 0;
  const height = snapshot?.coverArtHeight ?? 0;
  if (width <= 0 || height <= 0) {
    return { hd: false, maxForegroundSide: containerSidePx * 0.7 };
  }
  return classifyCover(width, height, containerSidePx);
}

export function artworkToResolvedCover(artwork: {
  src: string | null;
  width: number;
  height: number;
  lowRes: boolean;
  source: string;
}): ResolvedCover {
  return {
    src: artwork.src,
    width: artwork.width,
    height: artwork.height,
    lowRes: artwork.lowRes,
    source: artwork.source
  };
}

export function rememberResolvedCover(snapshot: MediaSnapshot, cover: ResolvedCover): void {
  const key = mediaTrackKey(snapshot);
  if (resolvedCoverCache.has(key)) {
    resolvedCoverCache.delete(key);
  }
  resolvedCoverCache.set(key, cover);
  if (resolvedCoverCache.size > MAX_RESOLVED_COVER_CACHE) {
    const oldest = resolvedCoverCache.keys().next().value;
    if (oldest !== undefined) {
      resolvedCoverCache.delete(oldest);
    }
  }
}

export function getCachedResolvedCover(snapshot: MediaSnapshot | null | undefined): ResolvedCover | null {
  if (!snapshot) return null;
  return resolvedCoverCache.get(mediaTrackKey(snapshot)) ?? null;
}

export function clearCoverArtCache(): void {
  resolvedCoverCache.clear();
}
