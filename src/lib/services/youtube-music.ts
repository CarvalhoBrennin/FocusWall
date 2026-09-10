import { isTauri, tauriInvoke } from '../utils/tauri.js';

export interface MusicAuthStatus {
  configured: boolean;
  clientSecretConfigured: boolean;
  authenticated: boolean;
  clientId: string;
  authInProgress: boolean;
}

export interface YouTubePlaylist {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  itemCount: number;
}

export interface YouTubeTrack {
  playlistItemId: string;
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  position: number;
}

const DESKTOP_ONLY = 'YouTube Music está disponível apenas no aplicativo desktop FocusWall.';
const AUTH_RECONNECT_REQUIRED_SIGNAL = 'FOCUSWALL_YOUTUBE_AUTH_RECONNECT_REQUIRED';

export type YouTubeMusicErrorCode = 'AUTH_RECONNECT_REQUIRED';

export class YouTubeMusicError extends Error {
  readonly code: YouTubeMusicErrorCode;

  constructor(code: YouTubeMusicErrorCode, message: string) {
    super(message);
    this.name = 'YouTubeMusicError';
    this.code = code;
  }
}

function requireDesktop(): void {
  if (!isTauri()) throw new Error(DESKTOP_ONLY);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }

  return String(error);
}

export function normalizeYouTubeMusicError(error: unknown): Error {
  const message = errorText(error);
  if (message.includes(AUTH_RECONNECT_REQUIRED_SIGNAL)) {
    return new YouTubeMusicError(
      'AUTH_RECONNECT_REQUIRED',
      'A autorização do YouTube precisa ser renovada.'
    );
  }

  return error instanceof Error ? error : new Error(message);
}

export function isYouTubeAuthReconnectRequired(error: unknown): boolean {
  return error instanceof YouTubeMusicError && error.code === 'AUTH_RECONNECT_REQUIRED';
}

async function musicInvoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    throw normalizeYouTubeMusicError(error);
  }
}

export async function getMusicAuthStatus(): Promise<MusicAuthStatus> {
  requireDesktop();
  return musicInvoke<MusicAuthStatus>('youtube_music_get_auth_status');
}

export async function saveMusicClientId(clientId: string, clientSecret: string): Promise<MusicAuthStatus> {
  requireDesktop();
  return musicInvoke<MusicAuthStatus>('youtube_music_save_client_id', { clientId, clientSecret });
}

export async function connectYouTubeMusic(): Promise<MusicAuthStatus> {
  requireDesktop();
  return musicInvoke<MusicAuthStatus>('youtube_music_connect');
}

export async function disconnectYouTubeMusic(): Promise<MusicAuthStatus> {
  requireDesktop();
  return musicInvoke<MusicAuthStatus>('youtube_music_disconnect');
}

export async function listYouTubePlaylists(): Promise<YouTubePlaylist[]> {
  requireDesktop();
  return musicInvoke<YouTubePlaylist[]>('youtube_music_list_playlists');
}

export async function listYouTubePlaylistItems(playlistId: string): Promise<YouTubeTrack[]> {
  requireDesktop();
  return musicInvoke<YouTubeTrack[]>('youtube_music_list_playlist_items', { playlistId });
}

export async function openGoogleOAuthConsole(): Promise<void> {
  requireDesktop();
  await musicInvoke('youtube_music_open_google_console');
}

export async function openYouTubeApiLibrary(): Promise<void> {
  requireDesktop();
  await musicInvoke('youtube_music_open_api_library');
}
