import { describe, expect, it } from 'vitest';
import {
  formatPercent,
  formatTemp,
  normalizeSystemSnapshot
} from './system-metrics.js';

describe('normalizeSystemSnapshot', () => {
  it('parses camelCase snapshot', () => {
    const snap = normalizeSystemSnapshot({
      metrics: {
        cpuPercent: 42.5,
        memoryUsedMb: 8192,
        memoryTotalMb: 16384,
        memoryPercent: 50
      },
      hardware: {
        cpuName: 'AMD Ryzen',
        totalMemoryMb: 16384,
        osName: 'Windows'
      },
      temperature: { cpuCelsius: 55, gpuCelsius: null },
      apps: [
        {
          name: 'Chrome',
          exe: 'chrome.exe',
          pid: 100,
          instanceCount: 3,
          cpuPercent: 5,
          memoryMb: 512.4
        }
      ]
    });
    expect(snap?.metrics.cpuPercent).toBe(42.5);
    expect(snap?.apps[0]?.name).toBe('Chrome');
    expect(snap?.apps[0]?.instanceCount).toBe(3);
    expect(snap?.apps[0]?.memoryMb).toBe(512.4);
    expect(snap?.temperature.gpuCelsius).toBeNull();
  });

  it('returns null for invalid payload', () => {
    expect(normalizeSystemSnapshot(null)).toBeNull();
    expect(normalizeSystemSnapshot({})).toBeNull();
  });

  it('rejects non-finite temperature values', () => {
    const snap = normalizeSystemSnapshot({
      metrics: { cpuPercent: 0, memoryUsedMb: 0, memoryTotalMb: 0, memoryPercent: 0 },
      hardware: { cpuName: 'CPU', totalMemoryMb: 0, osName: 'Windows' },
      temperature: { cpuCelsius: Number.NaN, gpuCelsius: 'hot' },
      apps: []
    });
    expect(snap?.temperature.cpuCelsius).toBeNull();
    expect(snap?.temperature.gpuCelsius).toBeNull();
  });
});

describe('formatters', () => {
  it('formats temperature and percent', () => {
    expect(formatTemp(null)).toBe('—');
    expect(formatTemp(48.7)).toBe('49°C');
    expect(formatPercent(101)).toBe('100%');
    expect(formatPercent(12.3)).toBe('12%');
  });
});
