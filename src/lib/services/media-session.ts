import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauri, tauriInvoke } from '../utils/tauri.js';

const MEDIA_CHANGED_EVENT = 'media://changed';

export type MediaSnapshot = {
  available: boolean;
  source: 'smtc' | 'none' | 'unsupported' | string;
  title: string;
  artist: string;
  album: string;
  appName: string;
  sourceAppId: string;
  isPlaying: boolean;
  canPlay: boolean;
  canPause: boolean;
  canNext: boolean;
  canPrevious: boolean;
  positionMs: number;
  durationMs: number;
  coverArtBase64?: string | null;
  coverArtMime?: string | null;
  coverArtWidth?: number | null;
  coverArtHeight?: number | null;
};

export type MediaArtworkResult = {
  src: string | null;
  width: number;
  height: number;
  lowRes: boolean;
  source: string;
};

const POLL_MS_PLAYING = 1000;
// Maior intervalo de fallback: a ponte de eventos (media://changed) acorda o
// poll imediatamente quando a sessão/faixa muda.
const POLL_MS_IDLE = 5000;

/** @param {unknown} raw */
export function normalizeMediaSnapshot(raw: unknown): MediaSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  return {
    available: Boolean(o.available),
    source: typeof o.source === 'string' ? o.source : 'none',
    title: typeof o.title === 'string' ? o.title : '',
    artist: typeof o.artist === 'string' ? o.artist : '',
    album: typeof o.album === 'string' ? o.album : '',
    appName: typeof o.appName === 'string' ? o.appName : '',
    sourceAppId: typeof o.sourceAppId === 'string' ? o.sourceAppId : '',
    isPlaying: Boolean(o.isPlaying),
    canPlay: Boolean(o.canPlay),
    canPause: Boolean(o.canPause),
    canNext: Boolean(o.canNext),
    canPrevious: Boolean(o.canPrevious),
    positionMs: Number(o.positionMs) || 0,
    durationMs: Number(o.durationMs) || 0,
    coverArtBase64:
      typeof o.coverArtBase64 === 'string' && o.coverArtBase64.length > 0
        ? o.coverArtBase64
        : null,
    coverArtMime:
      typeof o.coverArtMime === 'string' && o.coverArtMime.length > 0 ? o.coverArtMime : null,
    coverArtWidth: typeof o.coverArtWidth === 'number' && o.coverArtWidth > 0 ? o.coverArtWidth : null,
    coverArtHeight:
      typeof o.coverArtHeight === 'number' && o.coverArtHeight > 0 ? o.coverArtHeight : null
  };
}

export function formatMediaTime(ms: number, unknown = false): string {
  if (unknown || !Number.isFinite(ms) || ms <= 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function mediaProgressPercent(positionMs: number, durationMs: number): number {
  if (!durationMs) return 0;
  return Math.max(0, Math.min(100, (positionMs / durationMs) * 100));
}

export function interpolateMediaPosition(
  snapshot: MediaSnapshot,
  syncedAtMs: number,
  nowMs = performance.now()
): number {
  if (!snapshot.isPlaying || !snapshot.durationMs) return snapshot.positionMs;
  const elapsed = Math.max(0, nowMs - syncedAtMs);
  return Math.min(snapshot.durationMs, snapshot.positionMs + elapsed);
}

export function mediaCoverSrc(snapshot: MediaSnapshot | null | undefined): string | null {
  if (!snapshot?.coverArtBase64) return null;
  const mime = snapshot.coverArtMime || 'image/jpeg';
  return `data:${mime};base64,${snapshot.coverArtBase64}`;
}

export async function fetchMediaSnapshot(): Promise<MediaSnapshot> {
  const raw = await tauriInvoke<unknown>('get_media_snapshot');
  const snapshot = normalizeMediaSnapshot(raw);
  if (!snapshot) {
    throw new Error('Resposta de mídia inválida.');
  }
  return snapshot;
}

export async function toggleMediaPlayback(): Promise<boolean> {
  return tauriInvoke<boolean>('media_toggle_playback');
}

export async function skipMediaNext(): Promise<void> {
  await tauriInvoke('media_skip_next');
}

export async function fetchMediaArtwork(snapshot: MediaSnapshot): Promise<MediaArtworkResult> {
  const raw = await tauriInvoke<{
    base64?: string | null;
    mime?: string | null;
    width?: number;
    height?: number;
    source?: string;
    lowRes?: boolean;
  }>('get_media_artwork', {
    artist: snapshot.artist,
    album: snapshot.album,
    title: snapshot.title,
    sourceAppId: snapshot.sourceAppId,
    smtcBase64: snapshot.coverArtBase64 ?? null,
    smtcMime: snapshot.coverArtMime ?? null,
    smtcWidth: snapshot.coverArtWidth ?? null,
    smtcHeight: snapshot.coverArtHeight ?? null
  });

  const mime = raw.mime || 'image/jpeg';
  const src =
    typeof raw.base64 === 'string' && raw.base64.length > 0
      ? `data:${mime};base64,${raw.base64}`
      : null;

  return {
    src,
    width: Number(raw.width) || 0,
    height: Number(raw.height) || 0,
    lowRes: Boolean(raw.lowRes),
    source: typeof raw.source === 'string' ? raw.source : 'none'
  };
}

export async function skipMediaPrevious(): Promise<void> {
  await tauriInvoke('media_skip_previous');
}

export type MediaSessionPollingOptions = {
  onData: (snapshot: MediaSnapshot) => void;
  onError?: (message: string) => void;
  getActive: () => boolean;
  getPaused: () => boolean;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
let lastSnapshot: MediaSnapshot | null = null;
let pollingActive = false;
let unlistenChanged: UnlistenFn | null = null;
let changeListenerPending = false;

function pollIntervalMs(snapshot: MediaSnapshot | null): number {
  if (snapshot?.available && snapshot.isPlaying) return POLL_MS_PLAYING;
  return POLL_MS_IDLE;
}

function scheduleNextPoll(options: MediaSessionPollingOptions) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!options.getActive() || options.getPaused()) return;

  pollTimer = setInterval(() => {
    void pollOnce(options);
  }, pollIntervalMs(lastSnapshot));
}

async function pollOnce(options: MediaSessionPollingOptions) {
  if (!options.getActive() || options.getPaused() || pollInFlight) return;
  pollInFlight = true;
  try {
    const snapshot = await fetchMediaSnapshot();
    lastSnapshot = snapshot;
    options.onData(snapshot);
  } catch (err) {
    options.onError?.(err instanceof Error ? err.message : String(err));
  } finally {
    pollInFlight = false;
    if (options.getActive() && !options.getPaused()) {
      scheduleNextPoll(options);
    }
  }
}

function attachChangeListener(options: MediaSessionPollingOptions) {
  if (unlistenChanged || changeListenerPending || !isTauri()) return;
  changeListenerPending = true;
  void listen(MEDIA_CHANGED_EVENT, () => {
    if (!pollingActive || !options.getActive() || options.getPaused()) return;
    void pollOnce(options);
  })
    .then((fn) => {
      changeListenerPending = false;
      if (!pollingActive) {
        fn();
        return;
      }
      unlistenChanged = fn;
    })
    .catch(() => {
      changeListenerPending = false;
    });
}

export function startMediaSessionPolling(options: MediaSessionPollingOptions) {
  stopMediaSessionPolling();
  pollingActive = true;
  lastSnapshot = null;
  void pollOnce(options);
  attachChangeListener(options);
}

export function stopMediaSessionPolling() {
  pollingActive = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollInFlight = false;
  lastSnapshot = null;
  if (unlistenChanged) {
    unlistenChanged();
    unlistenChanged = null;
  }
}
