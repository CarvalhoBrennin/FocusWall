<script lang="ts">
  import { onMount } from 'svelte';
  import { defaultVivariumConfig } from '../core/config.js';
  import { createVivariumEngine, type VivariumEngine } from '../core/engine.js';
  import { createFixedStepAccumulator, consumeFixedSteps, fixedStepSize } from '../core/loop.js';
  import { vivariumScreensaver, vivariumSnapshot } from '../store.js';
  import VivariumControls from './VivariumControls.svelte';
  import VivariumHud from './VivariumHud.svelte';

  type Props = {
    active?: boolean;
    completedTasksToday?: number;
    totalTasksToday?: number;
    focusLevel?: number;
    seed?: number;
  };

  let {
    active = true,
    completedTasksToday = 0,
    totalTasksToday = 0,
    focusLevel,
    seed
  }: Props = $props();

  let canvas: HTMLCanvasElement;
  let tank: HTMLDivElement;
  let engine: VivariumEngine | undefined;
  let animationFrame = 0;
  let mediaQuery: MediaQueryList | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let lastHudUpdate = 0;
  let lastRenderAt = 0;
  let idleSeconds = 0;
  let stepAcc = createFixedStepAccumulator(defaultVivariumConfig.updateHz);

  const width = defaultVivariumConfig.worldWidth;
  const height = defaultVivariumConfig.worldHeight;
  const renderInterval = 1000 / defaultVivariumConfig.renderFps;
  const screensaverAfter = defaultVivariumConfig.screensaverSeconds;

  function handlePointerMove(event: PointerEvent): void {
    if (!engine || engine.world.reducedMotion) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    engine.world.camera.pointerX = nx * 4;
  }

  function syncViewportSize(): void {
    engine?.setViewportSize(tank?.getBoundingClientRect().width ?? width, tank?.getBoundingClientRect().height ?? height);
  }

  function handleRegenerate(nextSeed: number): void {
    engine?.setSeed(nextSeed);
    if (engine) vivariumSnapshot.set(engine.snapshot());
  }

  $effect(() => {
    engine?.setActive(active);
    engine?.setProductivity({ completedTasksToday, totalTasksToday, focusLevel });
  });

  onMount(() => {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    engine = createVivariumEngine({
      seed,
      productivity: { completedTasksToday, totalTasksToday, focusLevel },
      reducedMotion: mediaQuery.matches
    });
    engine.setActive(active);
    syncViewportSize();
    vivariumSnapshot.set(engine.snapshot());
    stepAcc = createFixedStepAccumulator(engine.config.updateHz);

    const handleMotionChange = () => engine?.setReducedMotion(mediaQuery?.matches ?? false);
    const handleVisibilityChange = () => engine?.setHidden(document.hidden);

    mediaQuery.addEventListener('change', handleMotionChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    resizeObserver = new ResizeObserver(syncViewportSize);
    resizeObserver.observe(tank);

    let last = performance.now();

    const loop = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.12);
      last = now;

      const running = active && !document.hidden && engine;
      if (running) {
        idleSeconds += delta;
        vivariumScreensaver.set(idleSeconds >= screensaverAfter);

        const steps = consumeFixedSteps(stepAcc, delta);
        for (let i = 0; i < steps; i += 1) engine.update(fixedStepSize(stepAcc));

        if (now - lastRenderAt >= renderInterval) {
          lastRenderAt = now;
          engine.render(ctx);
        }

        if (now - lastHudUpdate > 500) {
          lastHudUpdate = now;
          vivariumSnapshot.set(engine.snapshot());
        }
      }

      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrame);
      mediaQuery?.removeEventListener('change', handleMotionChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver?.disconnect();
    };
  });
</script>

<div class="vivarium-shell" class:is-screensaver={$vivariumScreensaver}>
  <div
    bind:this={tank}
    class="vivarium-tank"
    role="img"
    aria-label="Vivário pixelizado em preto e branco com ecossistema silencioso"
  >
    <canvas bind:this={canvas} class="vivarium-canvas"></canvas>
    <div
      class="vivarium-interaction"
      onpointermove={handlePointerMove}
      aria-hidden="true"
    ></div>
    <VivariumHud />
    <div class="vivarium-vignette" aria-hidden="true"></div>
  </div>
  <VivariumControls onRegenerate={handleRegenerate} />
</div>

<style>
  .vivarium-shell {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.45rem;
    background:
      linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px),
      #000;
    background-size: 24px 24px;
  }

  .vivarium-shell.is-screensaver :global(.vivarium-controls) {
    opacity: 0;
    pointer-events: none;
  }

  .vivarium-tank {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border: 2px solid rgba(255, 255, 255, 0.28);
    background: #000;
    box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.92), inset 0 0 0 4px rgba(255, 255, 255, 0.03);
    touch-action: none;
  }

  .vivarium-canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: #000;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }

  .vivarium-interaction {
    position: absolute;
    inset: 0;
    z-index: 2;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .vivarium-vignette {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 7px),
      radial-gradient(circle at 50% 52%, transparent 58%, rgba(0, 0, 0, 0.62) 100%);
    opacity: 0.42;
  }

  .vivarium-tank::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
    background: linear-gradient(
      120deg,
      rgba(255, 255, 255, 0.045) 0%,
      rgba(255, 255, 255, 0.014) 14%,
      transparent 36%,
      transparent 72%,
      rgba(255, 255, 255, 0.012) 100%
    );
    opacity: 0.2;
  }

  @media (prefers-reduced-motion: reduce) {
    .vivarium-vignette {
      opacity: 0.3;
    }
  }
</style>
