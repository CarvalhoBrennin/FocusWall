<script>
  import TaskIcons from './icons/TaskIcons.svelte';
  import { showSettingsModal } from '../stores/ui-store.js';

  function handleClick() {
    showSettingsModal();
  }
</script>

<button
  type="button"
  class="settings-button"
  aria-label="Configurações"
  onclick={handleClick}
>
  <TaskIcons name="settings" />
</button>

<style>
  .settings-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--control-border-strong);
    border-radius: 0;
    background: var(--control-bg);
    color: var(--light-soft);
    cursor: pointer;
    box-shadow: var(--shadow-xs);
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .settings-button:hover {
    transform: translateY(-1px);
    border-color: var(--accent-soft);
    background: var(--control-bg-hover);
    color: var(--light-strong);
  }

  .settings-button :global(svg) {
    width: 1.05rem;
    height: 1.05rem;
  }
</style>
