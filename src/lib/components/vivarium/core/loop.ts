export type FixedStepAccumulator = {
  step: number;
  accumulator: number;
};

export function createFixedStepAccumulator(hz: number): FixedStepAccumulator {
  return { step: 1 / hz, accumulator: 0 };
}

export function consumeFixedSteps(
  acc: FixedStepAccumulator,
  deltaSeconds: number,
  maxDelta = 0.12
): number {
  const dt = Math.min(deltaSeconds, maxDelta);
  acc.accumulator += dt;
  let steps = 0;

  while (acc.accumulator >= acc.step) {
    acc.accumulator -= acc.step;
    steps += 1;
  }

  return steps;
}

export function fixedStepSize(acc: FixedStepAccumulator): number {
  return acc.step;
}
