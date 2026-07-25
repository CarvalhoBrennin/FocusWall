import { tauriInvoke } from '../utils/tauri.js';

export type AvailabilityInfo = {
  disks: boolean;
  network: boolean;
  gpu: boolean;
  temperatures: boolean;
};

export type CpuInfo = {
  usagePercent: number;
  name: string;
  frequencyMhz: number;
  physicalCores: number;
  logicalCores: number;
};

export type MemoryInfo = {
  usedBytes: number;
  availableBytes: number;
  totalBytes: number;
  usagePercent: number;
};

export type SystemInfo = {
  osName: string;
  uptimeSeconds: number;
};

export type TemperatureInfo = {
  cpuCelsius: number | null;
  gpuCelsius: number | null;
};

export type DiskInfo = {
  name: string;
  mountPoint: string;
  fileSystem: string;
  kind: string;
  totalBytes: number;
  usedBytes: number;
  usagePercent: number;
  readBytesPerSecond: number;
  writeBytesPerSecond: number;
};

export type NetworkInfo = {
  adapter: string;
  downloadBytesPerSecond: number;
  uploadBytesPerSecond: number;
};

export type GpuInfo = {
  name: string;
  usagePercent: number | null;
  memoryTotalBytes: number | null;
  temperatureCelsius: number | null;
};

export type ProcessRow = {
  name: string;
  exe: string;
  pid: number;
  cpuPercent: number;
  memoryBytes: number;
  readBytesPerSecond: number;
  writeBytesPerSecond: number;
  isSystem: boolean;
};

export type SnapshotWarning = 'disksUnavailable';

export type SystemSnapshot = {
  capturedAt: string;
  availability: AvailabilityInfo;
  warnings: SnapshotWarning[];
  cpu: CpuInfo;
  memory: MemoryInfo;
  system: SystemInfo;
  temperature: TemperatureInfo;
  disks: DiskInfo[];
  network: NetworkInfo[];
  gpus: GpuInfo[];
  processes: ProcessRow[];
  totalProcessCount: number;
  processesTruncated: boolean;
};

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' ? (value as RecordValue) : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value: unknown): number {
  return Math.max(0, finiteNumber(value));
}

function boundedPercent(value: unknown): number {
  return Math.max(0, Math.min(100, finiteNumber(value)));
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeDisk(value: unknown): DiskInfo | null {
  const disk = asRecord(value);
  if (!disk) return null;
  const mountPoint = text(disk.mountPoint);
  if (!mountPoint) return null;
  return {
    name: text(disk.name, mountPoint),
    mountPoint,
    fileSystem: text(disk.fileSystem),
    kind: text(disk.kind),
    totalBytes: nonNegative(disk.totalBytes),
    usedBytes: nonNegative(disk.usedBytes),
    usagePercent: boundedPercent(disk.usagePercent),
    readBytesPerSecond: nonNegative(disk.readBytesPerSecond),
    writeBytesPerSecond: nonNegative(disk.writeBytesPerSecond)
  };
}

function normalizeNetwork(value: unknown): NetworkInfo | null {
  const network = asRecord(value);
  if (!network) return null;
  const adapter = text(network.adapter);
  if (!adapter) return null;
  return {
    adapter,
    downloadBytesPerSecond: nonNegative(network.downloadBytesPerSecond),
    uploadBytesPerSecond: nonNegative(network.uploadBytesPerSecond)
  };
}

function normalizeGpu(value: unknown): GpuInfo | null {
  const gpu = asRecord(value);
  if (!gpu) return null;
  const name = text(gpu.name);
  if (!name) return null;
  return {
    name,
    usagePercent:
      gpu.usagePercent === null || gpu.usagePercent === undefined
        ? null
        : boundedPercent(gpu.usagePercent),
    memoryTotalBytes: optionalNumber(gpu.memoryTotalBytes),
    temperatureCelsius: optionalNumber(gpu.temperatureCelsius)
  };
}

function normalizeProcess(value: unknown): ProcessRow | null {
  const process = asRecord(value);
  if (!process) return null;
  const name = text(process.name);
  const pid = Math.trunc(nonNegative(process.pid));
  if (!name || pid <= 0) return null;
  return {
    name,
    exe: text(process.exe),
    pid,
    cpuPercent: boundedPercent(process.cpuPercent),
    memoryBytes: nonNegative(process.memoryBytes),
    readBytesPerSecond: nonNegative(process.readBytesPerSecond),
    writeBytesPerSecond: nonNegative(process.writeBytesPerSecond),
    isSystem: Boolean(process.isSystem)
  };
}

export function normalizeSystemSnapshot(raw: unknown): SystemSnapshot | null {
  const root = asRecord(raw);
  if (!root) return null;
  const availability = asRecord(root.availability);
  const cpu = asRecord(root.cpu);
  const memory = asRecord(root.memory);
  const system = asRecord(root.system);
  const temperature = asRecord(root.temperature);
  if (!availability || !cpu || !memory || !system || !temperature) return null;
  const processes = Array.isArray(root.processes)
    ? root.processes
        .map(normalizeProcess)
        .filter((process): process is ProcessRow => process !== null)
    : [];

  return {
    capturedAt: text(root.capturedAt),
    availability: {
      disks: Boolean(availability.disks),
      network: Boolean(availability.network),
      gpu: Boolean(availability.gpu),
      temperatures: Boolean(availability.temperatures)
    },
    warnings: Array.isArray(root.warnings)
      ? root.warnings.filter((warning): warning is SnapshotWarning => warning === 'disksUnavailable')
      : [],
    cpu: {
      usagePercent: boundedPercent(cpu.usagePercent),
      name: text(cpu.name, 'CPU'),
      frequencyMhz: nonNegative(cpu.frequencyMhz),
      physicalCores: Math.trunc(nonNegative(cpu.physicalCores)),
      logicalCores: Math.trunc(nonNegative(cpu.logicalCores))
    },
    memory: {
      usedBytes: nonNegative(memory.usedBytes),
      availableBytes: nonNegative(memory.availableBytes),
      totalBytes: nonNegative(memory.totalBytes),
      usagePercent: boundedPercent(memory.usagePercent)
    },
    system: {
      osName: text(system.osName),
      uptimeSeconds: nonNegative(system.uptimeSeconds)
    },
    temperature: {
      cpuCelsius: optionalNumber(temperature.cpuCelsius),
      gpuCelsius: optionalNumber(temperature.gpuCelsius)
    },
    disks: Array.isArray(root.disks)
      ? root.disks.map(normalizeDisk).filter((disk): disk is DiskInfo => disk !== null)
      : [],
    network: Array.isArray(root.network)
      ? root.network
          .map(normalizeNetwork)
          .filter((adapter): adapter is NetworkInfo => adapter !== null)
      : [],
    gpus: Array.isArray(root.gpus)
      ? root.gpus.map(normalizeGpu).filter((gpu): gpu is GpuInfo => gpu !== null)
      : [],
    processes,
    totalProcessCount: Math.max(
      processes.length,
      Math.trunc(nonNegative(root.totalProcessCount))
    ),
    processesTruncated: Boolean(root.processesTruncated)
  };
}

export function createSystemRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `system-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function fetchSystemSnapshot(requestId: string): Promise<SystemSnapshot> {
  const raw = await tauriInvoke<unknown>('get_system_snapshot', { requestId });
  const snapshot = normalizeSystemSnapshot(raw);
  if (!snapshot) {
    throw new Error('A leitura do sistema retornou dados inválidos.');
  }
  return snapshot;
}

export async function cancelSystemSnapshot(requestId: string): Promise<void> {
  await tauriInvoke('cancel_system_snapshot', { requestId });
}

export type SystemSnapshotLoadControllerOptions = {
  onLoading: () => void;
  onData: (snapshot: SystemSnapshot) => void;
  onError: (message: string) => void;
  fetcher?: (requestId: string) => Promise<SystemSnapshot>;
  canceller?: (requestId: string) => Promise<void>;
  createRequestId?: () => string;
};

export function createSystemSnapshotLoadController(options: SystemSnapshotLoadControllerOptions) {
  const fetcher = options.fetcher ?? fetchSystemSnapshot;
  const canceller = options.canceller ?? cancelSystemSnapshot;
  const requestIdFactory = options.createRequestId ?? createSystemRequestId;
  let requestId: string | null = null;
  let generation = 0;
  let disposed = false;

  async function load(): Promise<void> {
    cancel();
    if (disposed) return;
    const loadGeneration = generation;
    const nextRequestId = requestIdFactory();
    requestId = nextRequestId;
    options.onLoading();
    try {
      const snapshot = await fetcher(nextRequestId);
      if (disposed || generation !== loadGeneration || requestId !== nextRequestId) return;
      requestId = null;
      options.onData(snapshot);
    } catch (error) {
      if (disposed || generation !== loadGeneration || requestId !== nextRequestId) return;
      requestId = null;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLocaleLowerCase().includes('cancel')) {
        options.onError(message);
      }
    }
  }

  function cancel(): void {
    generation += 1;
    const activeRequestId = requestId;
    requestId = null;
    if (activeRequestId) {
      void canceller(activeRequestId).catch(() => undefined);
    }
  }

  function dispose(): void {
    disposed = true;
    cancel();
  }

  return { load, cancel, dispose };
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

export function formatTemperature(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} °C`;
}

export function formatBytes(value: number | null | undefined, precision = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const safeValue = Math.max(0, value);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let scaled = safeValue;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  const decimals = scaled >= 100 || unitIndex === 0 ? 0 : precision;
  return `${scaled.toFixed(decimals)} ${units[unitIndex]}`;
}

export function formatRate(value: number | null | undefined): string {
  const formatted = formatBytes(value);
  return formatted === '—' ? formatted : `${formatted}/s`;
}

export function formatFrequency(mhz: number): string {
  if (!Number.isFinite(mhz) || mhz <= 0) return '—';
  return mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz` : `${Math.round(mhz)} MHz`;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}
