<script lang="ts">
  import { vivariumHudVisible, vivariumSnapshot } from '../store.js';
</script>

{#if $vivariumHudVisible}
  <div class="vivarium-hud" aria-hidden="true">
    <span class="vivarium-hud-tag">opencode://vivarium</span>
    <span>flora:{$vivariumSnapshot.flora}</span>
    <span>fauna:{$vivariumSnapshot.fauna}</span>
    <span>ciclo:{$vivariumSnapshot.cycle}</span>
    <span>umidade:{$vivariumSnapshot.humidity}</span>
    <span>evento:{$vivariumSnapshot.event}</span>
    <span>seed:{$vivariumSnapshot.seed}</span>
  </div>
{/if}
