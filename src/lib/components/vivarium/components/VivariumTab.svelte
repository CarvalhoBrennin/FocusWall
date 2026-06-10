<script lang="ts">
  import VivariumScene from './VivariumScene.svelte';
  import '../vivarium.css';

  type Props = {
    active?: boolean;
    completedTasksToday?: number;
    totalTasksToday?: number;
    focusLevel?: number;
  };

  let { active = true, completedTasksToday = 0, totalTasksToday = 0, focusLevel }: Props = $props();
</script>

<div class="vivarium-panel" id="vivarium-panel-root">
  <header class="vivarium-tab-header" aria-label="Vivário">
    <p class="vivarium-tab-title">Vivário</p>
    <p class="vivarium-tab-sub">ecossistema silencioso</p>
  </header>
  <VivariumScene {active} {completedTasksToday} {totalTasksToday} {focusLevel} />
</div>
