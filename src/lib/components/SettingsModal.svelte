<script>
  import { onMount } from 'svelte';
  import MonitorSelector from './MonitorSelector.svelte';
  import StartupToggle from './StartupToggle.svelte';
  import AppearanceSettings from './AppearanceSettings.svelte';
  import UpdateSettings from './UpdateSettings.svelte';
  import { settingsModal } from '../stores/ui-store.js';
  import { exportStateBackup } from '../stores/app-store.js';
  import { trapFocus } from '../utils/focus-trap.js';
  import { t } from '../i18n/index.js';

  let overlayEl = $state(null);
  let closeButtonEl = $state(null);

  function handleClose() {
    settingsModal.set(null);
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleOverlayKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClose();
    }
  }

  onMount(() => () => {});

  $effect(() => {
    if (!overlayEl) return;
    return trapFocus(overlayEl, {
      initialFocus: closeButtonEl,
      onEscape: handleClose
    });
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_click_events_have_key_events -->
<div
  bind:this={overlayEl}
  class="settings-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="settings-title"
  tabindex="-1"
  onclick={handleOverlayClick}
  onkeydown={handleOverlayKeydown}
>
  <div class="settings-modal">
    <div class="settings-header">
      <h2 id="settings-title" class="settings-title">{$t('settings.title')}</h2>
      <button
        bind:this={closeButtonEl}
        type="button"
        class="settings-close"
        aria-label={$t('settings.close')}
        onclick={handleClose}
      >
        ×
      </button>
    </div>

    <div class="settings-content">
      <section class="settings-section">
        <AppearanceSettings />
      </section>
      <section class="settings-section">
        <UpdateSettings />
      </section>
      <section class="settings-section">
        <MonitorSelector />
      </section>
      <section class="settings-section">
        <StartupToggle />
      </section>
      <section class="settings-section settings-section--backup">
        <p class="eyebrow">{$t('settings.data')}</p>
        <button type="button" class="ghost-button" onclick={exportStateBackup}>
          {$t('settings.exportBackup')}
        </button>
      </section>
    </div>

    <div class="settings-footer">
      <button type="button" class="primary-button" onclick={handleClose}>
        {$t('settings.close')}
      </button>
    </div>
  </div>
</div>

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay-bg);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-4);
  }

  .settings-modal {
    position: relative;
    background: var(--panel-bg);
    border: 1px solid var(--surface-dark-border);
    border-radius: 0;
    box-shadow: var(--shadow-lg);
    max-width: 500px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    isolation: isolate;
  }

  .settings-modal::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(140deg, var(--glare-strong), transparent 28%),
      linear-gradient(180deg, var(--glare-faint), transparent 40%);
  }

  .settings-modal::after {
    content: "";
    position: absolute;
    inset: 1px;
    pointer-events: none;
    border: 1px solid var(--control-border-soft);
  }

  .settings-header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-4) var(--space-3);
    border-bottom: 1px solid var(--divider);
  }

  .settings-title {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--light-strong);
    margin: 0;
    letter-spacing: 0.04em;
  }

  .settings-close {
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--control-border-strong);
    border-radius: 0;
    background: var(--control-bg);
    color: var(--light-main);
    font-size: 1.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast);
    box-shadow: var(--shadow-xs);
  }

  .settings-close:hover {
    transform: translateY(-1px);
    border-color: var(--accent-soft);
    background: var(--control-bg-hover);
    color: var(--light-strong);
  }

  .settings-content {
    position: relative;
    z-index: 1;
    flex: 1;
    padding: var(--space-4);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .settings-section {
    border-bottom: 1px solid var(--divider);
  }

  .settings-section:last-child {
    border-bottom: 0;
  }

  .settings-section--backup {
    padding: var(--space-3) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .settings-footer {
    position: relative;
    z-index: 1;
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--divider);
    display: flex;
    justify-content: flex-end;
  }

  .settings-content::-webkit-scrollbar {
    width: 8px;
  }

  .settings-content::-webkit-scrollbar-track {
    background: var(--surface-dark);
  }

  .settings-content::-webkit-scrollbar-thumb {
    background: var(--surface-dark-border);
  }

  .settings-content::-webkit-scrollbar-thumb:hover {
    background: var(--accent-soft);
  }
</style>
