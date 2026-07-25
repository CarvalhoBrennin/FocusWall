import { describe, expect, it, vi } from 'vitest';
import {
  createSystemSnapshotLoadController,
  formatBytes,
  formatFrequency,
  formatPercent,
  formatRate,
  formatTemperature,
  formatUptime,
  normalizeSystemSnapshot,
  type SystemSnapshot
} from './system-metrics.js';

const rawSnapshot = {
  capturedAt: '2026-07-25T04:00:00Z',
  availability: {
    disks: true,
    network: true,
    gpu: false,
    temperatures: true
  },
  warnings: ['disksUnavailable'],
  cpu: {
    usagePercent: 42.5,
    name: 'AMD Ryzen',
    frequencyMhz: 4200,
    physicalCores: 8,
    logicalCores: 16
  },
  memory: {
    usedBytes: 8_589_934_592,
    availableBytes: 8_589_934_592,
    totalBytes: 17_179_869_184,
    usagePercent: 50
  },
  system: {
    osName: 'Windows 11',
    uptimeSeconds: 90_000
  },
  temperature: {
    cpuCelsius: 55,
    gpuCelsius: null
  },
  disks: [
    {
      name: 'SSD',
      mountPoint: 'C:\\',
      fileSystem: 'NTFS',
      kind: 'SSD',
      totalBytes: 1_000,
      usedBytes: 500,
      usagePercent: 50,
      readBytesPerSecond: 100,
      writeBytesPerSecond: 50
    }
  ],
  network: [
    {
      adapter: 'Ethernet',
      downloadBytesPerSecond: 1_000,
      uploadBytesPerSecond: 500
    }
  ],
  gpus: [],
  processes: [
    {
      name: 'Chrome',
      exe: 'chrome.exe',
      pid: 100,
      cpuPercent: 5,
      memoryBytes: 512_000_000,
      readBytesPerSecond: 2_000,
      writeBytesPerSecond: 1_000,
      isSystem: false
    }
  ],
  totalProcessCount: 500,
  processesTruncated: true
};

function snapshot(): SystemSnapshot {
  const normalized = normalizeSystemSnapshot(rawSnapshot);
  if (!normalized) throw new Error('Fixture inválida');
  return normalized;
}

describe('normalizeSystemSnapshot', () => {
  it('normalizes the expanded snapshot', () => {
    const result = normalizeSystemSnapshot(rawSnapshot);
    expect(result?.cpu.usagePercent).toBe(42.5);
    expect(result?.memory.totalBytes).toBe(17_179_869_184);
    expect(result?.disks[0]?.mountPoint).toBe('C:\\');
    expect(result?.network[0]?.adapter).toBe('Ethernet');
    expect(result?.processes[0]?.pid).toBe(100);
    expect(result?.warnings).toEqual(['disksUnavailable']);
    expect(result?.totalProcessCount).toBe(500);
    expect(result?.processesTruncated).toBe(true);
  });

  it('clamps percentages and rejects malformed collection rows', () => {
    const result = normalizeSystemSnapshot({
      ...rawSnapshot,
      cpu: { ...rawSnapshot.cpu, usagePercent: 150 },
      disks: [{ name: 'Sem ponto de montagem' }],
      processes: [{ name: 'Sem PID' }]
    });
    expect(result?.cpu.usagePercent).toBe(100);
    expect(result?.disks).toEqual([]);
    expect(result?.processes).toEqual([]);
  });

  it('keeps only recognized availability warnings', () => {
    const result = normalizeSystemSnapshot({
      ...rawSnapshot,
      warnings: ['disksUnavailable', 'unknownWarning']
    });
    expect(result?.warnings).toEqual(['disksUnavailable']);
  });

  it('returns null when required sections are missing', () => {
    expect(normalizeSystemSnapshot(null)).toBeNull();
    expect(normalizeSystemSnapshot({})).toBeNull();
    expect(normalizeSystemSnapshot({ ...rawSnapshot, cpu: null })).toBeNull();
  });
});

describe('system formatters', () => {
  it('formats technical values for the UI', () => {
    expect(formatPercent(12.3)).toBe('12%');
    expect(formatPercent(null)).toBe('—');
    expect(formatTemperature(48.7)).toBe('49 °C');
    expect(formatBytes(1_073_741_824)).toBe('1.0 GB');
    expect(formatRate(1024)).toBe('1.0 KB/s');
    expect(formatFrequency(4200)).toBe('4.20 GHz');
    expect(formatUptime(90_000)).toBe('1d 1h 0min');
  });
});

describe('createSystemSnapshotLoadController', () => {
  it('loads exactly one snapshot for each explicit load', async () => {
    const onLoading = vi.fn();
    const onData = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(snapshot());
    const controller = createSystemSnapshotLoadController({
      onLoading,
      onData,
      onError: vi.fn(),
      fetcher,
      canceller: vi.fn().mockResolvedValue(undefined),
      createRequestId: () => 'request-1'
    });

    await controller.load();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onLoading).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight request and ignores its late result', async () => {
    let resolveRequest: ((value: SystemSnapshot) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<SystemSnapshot>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const canceller = vi.fn().mockResolvedValue(undefined);
    const onData = vi.fn();
    const controller = createSystemSnapshotLoadController({
      onLoading: vi.fn(),
      onData,
      onError: vi.fn(),
      fetcher,
      canceller,
      createRequestId: () => 'request-cancel'
    });

    const pending = controller.load();
    controller.cancel();
    resolveRequest?.(snapshot());
    await pending;

    expect(canceller).toHaveBeenCalledWith('request-cancel');
    expect(onData).not.toHaveBeenCalled();
  });

  it('does not publish failures after disposal', async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<SystemSnapshot>((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    const onError = vi.fn();
    const controller = createSystemSnapshotLoadController({
      onLoading: vi.fn(),
      onData: vi.fn(),
      onError,
      fetcher,
      canceller: vi.fn().mockResolvedValue(undefined),
      createRequestId: () => 'request-dispose'
    });

    const pending = controller.load();
    controller.dispose();
    rejectRequest?.(new Error('Falha tardia'));
    await pending;

    expect(onError).not.toHaveBeenCalled();
  });
});
