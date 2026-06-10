import type { VivariumConfig } from './types.js';

export const defaultVivariumConfig: VivariumConfig = {
  worldWidth: 192,
  worldHeight: 108,
  updateHz: 18,
  renderFps: 60,
  dayLengthSeconds: 360,
  clockMode: 'simulated',
  screensaverSeconds: 120,
  numberOfFlies: 3,
  numberOfAnts: 2,
  numberOfParticles: 12,
  plantCount: 6,
  surfaceLifeCount: 18,
  fungusCount: 5,
  sporeDensity: 0.7,
  enableFauna: false,
  faunaDensity: 'none',
  visualNoise: 'low',
  eventFrequency: 'normal',
  debugOverlay: 'minimal',
  enableGecko: false,
  enableSpider: false,
  enableLarva: false,
  showDebug: false,
  reducedMotionScale: 0.34,
  parallaxDriftAmp: 2.5,
  lSystemDepth: 3
};

export function mergeVivariumConfig(config?: Partial<VivariumConfig>): VivariumConfig {
  return { ...defaultVivariumConfig, ...config };
}
