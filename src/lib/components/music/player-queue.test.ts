import { describe, expect, it } from 'vitest';
import {
  clampTrackIndex,
  musicQueueKey,
  resolveTrackAtPlayerIndex
} from './player-queue.js';

const tracks = [
  { playlistItemId: 'a', videoId: 'video-a', title: 'A', artist: 'Artist', thumbnailUrl: null, position: 0 },
  { playlistItemId: 'b', videoId: 'video-b', title: 'B', artist: 'Artist', thumbnailUrl: null, position: 1 },
  { playlistItemId: 'c', videoId: 'video-a', title: 'A reprise', artist: 'Artist', thumbnailUrl: null, position: 2 }
];

describe('music player queue helpers', () => {
  it('clamps requested indexes to the available queue', () => {
    expect(clampTrackIndex(-4, 3)).toBe(0);
    expect(clampTrackIndex(1.8, 3)).toBe(1);
    expect(clampTrackIndex(99, 3)).toBe(2);
    expect(clampTrackIndex('invalid', 3)).toBe(0);
    expect(clampTrackIndex(0, 0)).toBe(-1);
  });

  it('builds a stable queue identity from playlist and video order', () => {
    expect(musicQueueKey('playlist-1', tracks)).toBe(
      'playlist-1::video-a|video-b|video-a'
    );
  });

  it('resolves duplicate video ids by occurrence instead of the first match', () => {
    expect(resolveTrackAtPlayerIndex(tracks, ['video-a', 'video-b', 'video-a'], 2)?.playlistItemId).toBe('c');
  });

  it('resolves the current track when the player shuffled the queue', () => {
    expect(resolveTrackAtPlayerIndex(tracks, ['video-b', 'video-a', 'video-a'], 0)?.playlistItemId).toBe('b');
    expect(resolveTrackAtPlayerIndex(tracks, ['video-b', 'video-a', 'video-a'], 2)?.playlistItemId).toBe('c');
  });

  it('returns null while the iframe has no stable playlist index', () => {
    expect(resolveTrackAtPlayerIndex(tracks, [], -1)).toBeNull();
  });
});
