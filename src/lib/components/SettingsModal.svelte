<script>
  import MonitorSelector from './MonitorSelector.svelte';
  import { settingsModal } from '../stores/ui-store.js';
  import { openOnboarding } from '../stores/app-store.js';

  function handleClose() {
    settingsModal.set(null);
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      handleClose();
    }
  }

  function handleReopenOnboarding() {
    openOnboarding();
    handleClose();
  }
</script>

<div 
  class="settings-overlay" 
  role="dialog" 
  aria-modal="true"
  aria-labelledby="settings-title"
  tabindex="-1"
  on:click={handleOverlayClick}
  on:keydown={handleKeydown}
>
  <div class="settings-modal">
      <div class="settings-header">
        <h2 id="settings-title" class="settings-title">Configurações</h2>
        <button
          type="button"
          class="settings-close"
          aria-label="Fechar"
          on:click={handleClose}
        >
          ×
        </button>
      </div>
    
    <div class="settings-content">
      <MonitorSelector />

      <section class="settings-section" aria-labelledby="settings-onboarding-title">
        <h3 id="settings-onboarding-title">Onboarding</h3>
        <p>Reveja o setup inicial para ajustar preferências e contexto do painel.</p>
        <button
          type="button"
          class="ghost-button"
          on:click={handleReopenOnboarding}
        >
          Reabrir onboarding
        </button>
      </section>
    </div>
    
    <div class="settings-footer">
      <button
        type="button"
        class="primary-button"
        on:click={handleClose}
      >
        Fechar
      </button>
    </div>
  </div>
</div>

<style>
  .settings-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .settings-modal {
    background: var(--surface-dark-strong);
    border: 1px solid var(--surface-dark-border);
    border-radius: 16px;
    box-shadow: var(--shadow-lg);
    max-width: 500px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--surface-dark-border);
  }

  .settings-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--light-main);
    margin: 0;
  }

  .settings-close {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--light-muted);
    font-size: 24px;
    cursor: pointer;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .settings-close:hover {
    background: var(--surface-dark);
    color: var(--light-main);
  }

  .settings-content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .settings-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--surface-dark-border);
    display: flex;
    justify-content: flex-end;
  }

  .settings-section {
    margin-top: 18px;
    padding: 14px;
    border-radius: 12px;
    border: 1px solid var(--surface-dark-border);
    background: var(--surface-dark);
    display: grid;
    gap: 10px;
  }

  .settings-section h3 {
    margin: 0;
    font-size: 15px;
    color: var(--light-main);
  }

  .settings-section p {
    margin: 0;
    color: var(--light-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  /* Scrollbar styling */
  .settings-content::-webkit-scrollbar {
    width: 8px;
  }

  .settings-content::-webkit-scrollbar-track {
    background: var(--surface-dark);
  }

  .settings-content::-webkit-scrollbar-thumb {
    background: var(--surface-dark-border);
    border-radius: 4px;
  }

  .settings-content::-webkit-scrollbar-thumb:hover {
    background: var(--accent-soft);
  }
</style>
