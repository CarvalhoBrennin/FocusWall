import { describe, expect, it } from 'vitest';
import {
  formatMediaTime,
  interpolateMediaPosition,
  mediaCoverSrc,
  mediaProgressPercent,
  normalizeMediaSnapshot
} from './media-session.js';

const sampleSnapshot = {
  available: true,
  source: 'smtc',
  title: 'Track',
  artist: 'Artist',
  album: 'Album',
  appName: 'Spotify',
  isPlaying: true,
  canPlay: true,
  canPause: true,
  canNext: true,
  canPrevious: false,
  positionMs: 30_000,
  durationMs: 120_000,
  coverArtBase64: 'abc',
  coverArtMime: 'image/jpeg'
};

describe('media-session', () => {
  it('normalizes snapshot payload', () => {
    const snapshot = normalizeMediaSnapshot(sampleSnapshot);
    expect(snapshot?.title).toBe('Track');
    expect(snapshot?.appName).toBe('Spotify');
    expect(mediaProgressPercent(snapshot!.positionMs, snapshot!.durationMs)).toBe(25);
    expect(mediaCoverSrc(snapshot)).toBe('data:image/jpeg;base64,abc');
  });

  it('formats elapsed time', () => {
    expect(formatMediaTime(65_000)).toBe('1:05');
    expect(formatMediaTime(0, true)).toBe('—');
  });

  it('interpolates position while playing', () => {
    const snapshot = normalizeMediaSnapshot(sampleSnapshot)!;
    const syncedAt = 1_000;
    expect(interpolateMediaPosition(snapshot, syncedAt, 4_000)).toBe(33_000);
    expect(interpolateMediaPosition(snapshot, syncedAt, 200_000)).toBe(120_000);
  });

  it('does not interpolate when paused', () => {
    const snapshot = normalizeMediaSnapshot({ ...sampleSnapshot, isPlaying: false })!;
    expect(interpolateMediaPosition(snapshot, 1_000, 10_000)).toBe(30_000);
  });
});
