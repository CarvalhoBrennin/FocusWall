import { describe, expect, it } from 'vitest';
import {
  isYouTubeAuthReconnectRequired,
  normalizeYouTubeMusicError,
  YouTubeMusicError
} from './youtube-music.js';

describe('youtube music service errors', () => {
  it('maps the backend reconnect signal to a stable typed error', () => {
    const error = normalizeYouTubeMusicError(
      'FOCUSWALL_YOUTUBE_AUTH_RECONNECT_REQUIRED'
    );

    expect(error).toBeInstanceOf(YouTubeMusicError);
    expect(isYouTubeAuthReconnectRequired(error)).toBe(true);
    expect(error.message).toBe('A autorização do YouTube precisa ser renovada.');
  });

  it('does not expose the raw invalid_grant payload when the stable signal is present', () => {
    const error = normalizeYouTubeMusicError(
      'command failed: FOCUSWALL_YOUTUBE_AUTH_RECONNECT_REQUIRED {"error":"invalid_grant","error_description":"Token has been expired or revoked."}'
    );

    expect(isYouTubeAuthReconnectRequired(error)).toBe(true);
    expect(error.message).not.toContain('invalid_grant');
    expect(error.message).not.toContain('revoked');
  });

  it('preserves ordinary Error instances for existing callers', () => {
    const source = new Error('Falha de transporte');
    const normalized = normalizeYouTubeMusicError(source);

    expect(normalized).toBe(source);
    expect(isYouTubeAuthReconnectRequired(normalized)).toBe(false);
  });

  it('maps object-shaped Tauri rejections when the stable signal is in message', () => {
    const normalized = normalizeYouTubeMusicError({
      code: 'TAURI_ERROR',
      message: 'FOCUSWALL_YOUTUBE_AUTH_RECONNECT_REQUIRED'
    });

    expect(isYouTubeAuthReconnectRequired(normalized)).toBe(true);
  });

  it('does not infer reconnect state from provider text without the backend signal', () => {
    const normalized = normalizeYouTubeMusicError('invalid_grant: token expired');

    expect(isYouTubeAuthReconnectRequired(normalized)).toBe(false);
  });

  it('normalizes non-Error rejections into Error instances', () => {
    const normalized = normalizeYouTubeMusicError({ code: 'OTHER', message: 'falha' });

    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.message).toBe('falha');
    expect(isYouTubeAuthReconnectRequired(normalized)).toBe(false);
  });
});

