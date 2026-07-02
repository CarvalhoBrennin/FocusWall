import { describe, expect, it } from 'vitest';
import {
  formatMediaTime,
  interpolateMediaPosition,
  mediaCoverSrc,
  mediaProgressPercent,
  normalizeMediaSnapshot,
  positionFromAnchor,
  POSITION_RESYNC_THRESHOLD_MS,
  reconcilePositionAnchor
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

describe('position anchor', () => {
  const playing = { positionMs: 30_000, isPlaying: true, durationMs: 120_000 };

  it('anchors fresh when there is no previous anchor', () => {
    const anchor = reconcilePositionAnchor(null, playing, {
      trackChanged: false,
      playStateChanged: false,
      nowMs: 5_000
    });
    expect(anchor).toEqual({ baseMs: 30_000, atMs: 5_000 });
  });

  it('keeps the existing anchor on small backward drift (no jump)', () => {
    const prev = { baseMs: 30_000, atMs: 1_000 };
    // 1s later the bar is at ~31_000, but SMTC still reports 30_300 (drift).
    const anchor = reconcilePositionAnchor(
      { ...prev },
      { ...playing, positionMs: 30_300 },
      { trackChanged: false, playStateChanged: false, nowMs: 2_000 }
    );
    expect(anchor).toBe(prev as unknown as typeof anchor); // identity preserved
  });

  it('re-anchors on a real seek beyond the threshold', () => {
    const prev = { baseMs: 30_000, atMs: 1_000 };
    const seeked = prev.baseMs + (2_000 - 1_000) + POSITION_RESYNC_THRESHOLD_MS + 500;
    const anchor = reconcilePositionAnchor(prev, { ...playing, positionMs: seeked }, {
      trackChanged: false,
      playStateChanged: false,
      nowMs: 2_000
    });
    expect(anchor).toEqual({ baseMs: seeked, atMs: 2_000 });
  });

  it('re-anchors on track change and on play-state change', () => {
    const prev = { baseMs: 30_000, atMs: 1_000 };
    expect(
      reconcilePositionAnchor(prev, playing, {
        trackChanged: true,
        playStateChanged: false,
        nowMs: 2_000
      })
    ).toEqual({ baseMs: 30_000, atMs: 2_000 });
    expect(
      reconcilePositionAnchor(prev, playing, {
        trackChanged: false,
        playStateChanged: true,
        nowMs: 9_000
      })
    ).toEqual({ baseMs: 30_000, atMs: 9_000 });
  });

  it('projects position while playing and clamps to duration', () => {
    const anchor = { baseMs: 30_000, atMs: 1_000 };
    expect(positionFromAnchor(anchor, 120_000, true, 4_000)).toBe(33_000);
    expect(positionFromAnchor(anchor, 120_000, true, 500_000)).toBe(120_000);
  });

  it('holds position when paused', () => {
    const anchor = { baseMs: 42_000, atMs: 1_000 };
    expect(positionFromAnchor(anchor, 120_000, false, 999_000)).toBe(42_000);
  });
});
