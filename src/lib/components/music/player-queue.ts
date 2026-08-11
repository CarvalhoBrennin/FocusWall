export function clampTrackIndex(index: unknown, length: number): number {
  if (length <= 0) return -1;
  const parsed = Number(index);
  const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  return Math.max(0, Math.min(length - 1, safe));
}

export function musicQueueKey(
  playlistId: string | null | undefined,
  tracks: { videoId: string }[]
): string {
  return `${playlistId || 'queue'}::${tracks.map((track) => track.videoId).join('|')}`;
}

export function resolveTrackAtPlayerIndex<T extends { videoId: string }>(
  tracks: T[],
  playerPlaylist: string[],
  playerIndex: number
): T | null {
  if (!tracks.length || playerIndex < 0 || playerIndex >= playerPlaylist.length) return null;

  const videoId = playerPlaylist[playerIndex];
  if (!videoId) return null;

  let occurrence = 0;
  for (let index = 0; index <= playerIndex; index += 1) {
    if (playerPlaylist[index] === videoId) occurrence += 1;
  }

  let seen = 0;
  for (const track of tracks) {
    if (track.videoId !== videoId) continue;
    seen += 1;
    if (seen === occurrence) return track;
  }

  return tracks.find((track) => track.videoId === videoId) || null;
}
