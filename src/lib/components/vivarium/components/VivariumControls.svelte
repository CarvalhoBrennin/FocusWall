<script lang="ts">
  import { createSeedFromTime, saveVivariumSeed } from '../core/rng.js';
  import { setVivariumHudVisible, vivariumHudVisible, vivariumSeed } from '../store.js';

  let { onRegenerate = () => {} } = $props<{ onRegenerate?: (seed: number) => void }>();

  function regenerateSeed(): void {
    const seed = createSeedFromTime();
    saveVivariumSeed(seed);
    vivariumSeed.set(seed);
    onRegenerate(seed);
  }

  async function copySeed(): Promise<void> {
    try {
      await navigator.clipboard.writeText(String($vivariumSeed));
    } catch {
      /* ignore */
    }
  }

  function toggleHud(): void {
    setVivariumHudVisible(!$vivariumHudVisible);
  }
</script>

<div class="vivarium-controls" aria-label="Controles do vivário">
  <button type="button" class="vivarium-ctrl" onclick={regenerateSeed}>novo seed</button>
  <button type="button" class="vivarium-ctrl" onclick={copySeed}>copiar seed</button>
  <button type="button" class="vivarium-ctrl" onclick={toggleHud}>
    {$vivariumHudVisible ? 'ocultar hud' : 'mostrar hud'}
  </button>
</div>
