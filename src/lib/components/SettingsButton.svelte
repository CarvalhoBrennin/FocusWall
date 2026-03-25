<script>
  import { ICONS } from '../config.js';
  import { showSettingsModal } from '../stores/ui-store.js';

  function handleClick() {
    showSettingsModal();
  }
</script>

<button
  type="button"
  class="settings-button"
  aria-label="Configurações"
  on:click={handleClick}
>
  {@html ICONS.settings}
</button>

<style>
  .settings-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 50%;
    background: var(--surface-dark-soft);
    color: var(--light-soft);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .settings-button:hover {
    background: var(--surface-dark-strong);
    color: var(--light-main);
    transform: scale(1.05);
  }

  .settings-button:active {
    transform: scale(0.95);
  }

  .settings-button :global(svg) {
    width: 18px;
    height: 18px;
  }
</style>
