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

function requireDesktop(): void {
  if (!isTauri()) throw new Error(DESKTOP_ONLY);
}

export async function getMusicAuthStatus(): Promise<MusicAuthStatus> {
  requireDesktop();
  return tauriInvoke<MusicAuthStatus>('youtube_music_get_auth_status');
}

export async function saveMusicClientId(clientId: string, clientSecret: string): Promise<MusicAuthStatus> {
  requireDesktop();
  return tauriInvoke<MusicAuthStatus>('youtube_music_save_client_id', { clientId, clientSecret });
}

export async function connectYouTubeMusic(): Promise<MusicAuthStatus> {
  requireDesktop();
  return tauriInvoke<MusicAuthStatus>('youtube_music_connect');
}

export async function disconnectYouTubeMusic(): Promise<MusicAuthStatus> {
  requireDesktop();
  return tauriInvoke<MusicAuthStatus>('youtube_music_disconnect');
}

export async function listYouTubePlaylists(): Promise<YouTubePlaylist[]> {
  requireDesktop();
  return tauriInvoke<YouTubePlaylist[]>('youtube_music_list_playlists');
}

export async function listYouTubePlaylistItems(playlistId: string): Promise<YouTubeTrack[]> {
  requireDesktop();
  return tauriInvoke<YouTubeTrack[]>('youtube_music_list_playlist_items', { playlistId });
}

export async function openGoogleOAuthConsole(): Promise<void> {
  requireDesktop();
  await tauriInvoke('youtube_music_open_google_console');
}

export async function openYouTubeApiLibrary(): Promise<void> {
  requireDesktop();
  await tauriInvoke('youtube_music_open_api_library');
}
