import { windAt } from '../core/noise.js';
import type { SeededRandom } from '../core/rng.js';
import type { EcosystemCycle, VivariumConfig, VivariumProductivity, WorldState } from '../core/types.js';

export function normalizeProductivity(
  productivity: Partial<VivariumProductivity> = {}
): VivariumProductivity {
  return {
    completedTasksToday: Math.max(0, productivity.completedTasksToday ?? 0),
    totalTasksToday: Math.max(0, productivity.totalTasksToday ?? 0),
    focusLevel: productivity.focusLevel
  };
}

export function cycleFromPhase(phase: number): EcosystemCycle {
  const hour = phase * 24;
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 18) return 'day';
  if (hour >= 18 && hour < 24) return 'night';
  return 'late';
}

export function lightFromCycle(cycle: EcosystemCycle): number {
  if (cycle === 'day') return 0.78;
  if (cycle === 'dawn') return 0.62;
  if (cycle === 'night') return 0.38;
  return 0.22;
}

export const environmentSystem = {
  id: 'environment',
  update(world: WorldState, dt: number, _rng: SeededRandom, config: VivariumConfig): void {
    updateEnvironment(world, dt, config);
  }
};

function updateEnvironment(world: WorldState, dt: number, config: VivariumConfig): void {
  if (config.clockMode === 'real') {
    const now = new Date();
    world.timeOfDay = now.getHours() + now.getMinutes() / 60;
    world.dayPhase = world.timeOfDay / 24;
  } else {
    world.dayPhase = (world.dayPhase + dt / config.dayLengthSeconds) % 1;
    world.timeOfDay = world.dayPhase * 24;
  }

  world.cycle = cycleFromPhase(world.dayPhase);
  world.lightLevel = lightFromCycle(world.cycle);

  const lightBand = Math.floor(world.lightLevel * 10);
  if (lightBand !== world.lastLightBand) {
    world.lastLightBand = lightBand;
    world.cacheInvalid = true;
  }

  world.wind = world.reducedMotion ? 0 : windAt(world.elapsed, world.seed);
  world.humidity =
    0.5 + Math.sin(world.elapsed * 0.03 + world.seed) * 0.08 + (world.cycle === 'dawn' ? 0.16 : 0.04);
  world.warmth = world.cycle === 'day' ? 0.72 : world.cycle === 'night' ? 0.48 : 0.4;

  const completion =
    world.productivity.totalTasksToday > 0
      ? world.productivity.completedTasksToday / world.productivity.totalTasksToday
      : 0.42;
  const focus = world.productivity.focusLevel ?? completion;
  const cycleActivity =
    world.cycle === 'late' ? 0.42 : world.cycle === 'night' ? 0.64 : world.cycle === 'dawn' ? 0.82 : 1;

  world.activityLevel = Math.max(0.25, Math.min(1.35, cycleActivity + completion * 0.2 + focus * 0.15));
  world.botanicalActivity = Math.max(
    0.2,
    Math.min(1.2, world.humidity * 0.58 + world.activityLevel * 0.32 + completion * 0.12)
  );

  const activeEvent = world.events[0];
  world.visualFocus = activeEvent?.kind === 'condensationRun'
    ? 'air'
    : activeEvent?.kind === 'soilShift' || activeEvent?.kind === 'rootPulse'
      ? 'soil'
      : world.creatures.length > 0 && activeEvent?.kind === 'faunaPass'
        ? 'fauna'
        : 'plants';

  world.clarityMode =
    world.reducedMotion || world.viewportWidth < 520 || world.viewportHeight < 260;
  world.ecosystemMood =
    world.activityLevel > 1.05 ? 'high' : world.activityLevel > 0.72 ? 'med' : world.activityLevel > 0.46 ? 'low' : 'quiet';

  if (!world.reducedMotion) {
    const amp = config.parallaxDriftAmp * 0.35;
    world.camera.driftX = Math.sin(world.elapsed * 0.12) * amp;
    world.camera.driftY = Math.cos(world.elapsed * 0.09) * amp * 0.4;
    // Cloud layer disabled — re-enable when cloudsLayer is restored.
    // world.cloudScroll += dt * (1.05 + Math.abs(world.wind) * 0.4);
  } else {
    world.camera.driftX = 0;
    world.camera.driftY = 0;
  }
}
