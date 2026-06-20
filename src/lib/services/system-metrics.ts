import { tauriInvoke } from '../utils/tauri.js';

export type SystemMetrics = {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPercent: number;
};

export type HardwareInfo = {
  cpuName: string;
  totalMemoryMb: number;
  osName: string;
};

export type TemperatureInfo = {
  cpuCelsius: number | null;
  gpuCelsius: number | null;
};

export type AppProcessRow = {
  name: string;
  exe: string;
  pid: number;
  instanceCount: number;
  cpuPercent: number;
  memoryMb: number;
};

export type SystemSnapshot = {
  metrics: SystemMetrics;
  hardware: HardwareInfo;
  temperature: TemperatureInfo;
  apps: AppProcessRow[];
};

const POLL_MS = 4000;
const DEFAULT_TOP_APPS = 15;

/** @param {unknown} raw */
export function normalizeSystemSnapshot(raw: unknown): SystemSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const metrics = o.metrics as Record<string, unknown> | undefined;
  const hardware = o.hardware as Record<string, unknown> | undefined;
  const temperature = o.temperature as Record<string, unknown> | undefined;
  const appsRaw = o.apps;

  if (!metrics || !hardware || !temperature) return null;

  const apps = Array.isArray(appsRaw)
    ? appsRaw
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const a = row as Record<string, unknown>;
          const name = typeof a.name === 'string' ? a.name : '';
          const exe = typeof a.exe === 'string' ? a.exe : '';
          if (!name) return null;
          return {
            name,
            exe,
            pid: Number(a.pid) || 0,
            instanceCount: Number(a.instanceCount) || 1,
            cpuPercent: Number(a.cpuPercent) || 0,
            memoryMb: Number(a.memoryMb) || 0
          };
        })
        .filter((x): x is AppProcessRow => x !== null)
    : [];

  return {
    metrics: {
      cpuPercent: Number(metrics.cpuPercent) || 0,
      memoryUsedMb: Number(metrics.memoryUsedMb) || 0,
      memoryTotalMb: Number(metrics.memoryTotalMb) || 0,
      memoryPercent: Number(metrics.memoryPercent) || 0
    },
    hardware: {
      cpuName: String(hardware.cpuName ?? 'CPU'),
      totalMemoryMb: Number(hardware.totalMemoryMb) || 0,
      osName: String(hardware.osName ?? '')
    },
    temperature: {
      cpuCelsius: parseOptionalCelsius(temperature.cpuCelsius),
      gpuCelsius: parseOptionalCelsius(temperature.gpuCelsius)
    },
    apps
  };
}

function parseOptionalCelsius(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatTemp(celsius: number | null | undefined): string {
  if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) {
    return '—';
  }
  return `${celsius.toFixed(0)}°C`;
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

export async function fetchSystemSnapshot(topApps = DEFAULT_TOP_APPS): Promise<SystemSnapshot> {
  const raw = await tauriInvoke<unknown>('get_system_snapshot', { topApps });
  const snapshot = normalizeSystemSnapshot(raw);
  if (!snapshot) {
    throw new Error('Resposta de métricas inválida.');
  }
  return snapshot;
}

export type SystemMetricsPollingOptions = {
  onData: (snapshot: SystemSnapshot) => void;
  onError?: (message: string) => void;
  getActive: () => boolean;
  getPaused: () => boolean;
  topApps?: number;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;

async function pollOnce(options: SystemMetricsPollingOptions) {
  if (!options.getActive() || options.getPaused() || pollInFlight) return;
  pollInFlight = true;
  try {
    const snapshot = await fetchSystemSnapshot(options.topApps ?? DEFAULT_TOP_APPS);
    options.onData(snapshot);
  } catch (err) {
    options.onError?.(err instanceof Error ? err.message : String(err));
  } finally {
    pollInFlight = false;
  }
}

export function startSystemMetricsPolling(options: SystemMetricsPollingOptions) {
  stopSystemMetricsPolling();
  void pollOnce(options);
  pollTimer = setInterval(() => {
    void pollOnce(options);
  }, POLL_MS);
}

export function stopSystemMetricsPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollInFlight = false;
}
