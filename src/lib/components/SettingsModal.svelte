<script>
  import { tick, onMount } from 'svelte';
  import MonitorSelector from './MonitorSelector.svelte';
  import { settingsModal } from '../stores/ui-store.js';
  import { openOnboarding } from '../stores/app-store.js';

  const sections = [
    { id: 'display', label: 'Display & monitor' },
    { id: 'startup', label: 'Inicialização' },
    { id: 'window', label: 'Janela' },
    { id: 'appearance', label: 'Aparência' },
    { id: 'locale', label: 'Idioma e locale' },
    { id: 'panel', label: 'Painel' }
  ];

  let activeSection = sections[0].id;
  let rootEl;
  let loadingAction = '';
  let status = null;

  let draft = structuredClone($preferences);
  $: draft = structuredClone($preferences);

  function close() {
    hideSettingsModal();
  }

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) close();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = rootEl?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function handleReopenOnboarding() {
    openOnboarding();
    handleClose();
  }
</script>

<div class="settings-overlay" role="presentation" on:click={onOverlayClick} on:keydown={onKeydown}>
  <div
    class="settings-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    bind:this={rootEl}
  >
    <header class="settings-header">
      <div>
        <h2 id="settings-title" class="settings-title">Central de configurações</h2>
        <p class="settings-subtitle">Ajustes persistentes para operação always-on do FocusWall.</p>
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
        class="settings-close"
        aria-label="Fechar configurações"
        on:click={close}
        data-initial-focus="true"
      >×</button>
    </header>

    <div class="settings-body">
      <nav class="settings-nav" aria-label="Seções de configuração">
        {#each sections as section}
          <button
            type="button"
            class="section-link"
            class:is-active={activeSection === section.id}
            on:click={() => (activeSection = section.id)}
          >
            {section.label}
          </button>
        {/each}
      </nav>

      <div class="settings-content">
        <article class="settings-section" id="display" hidden={activeSection !== 'display'}>
          <h3>Display / monitor</h3>
          <p>Define em qual monitor o painel é exibido quando aberto pela bandeja.</p>
          <MonitorSelector onStatus={(next) => (status = next)} />
        </article>

        <article class="settings-section" id="startup" hidden={activeSection !== 'startup'}>
          <h3>Inicialização com Windows</h3>
          <p>Controle se o FocusWall deve iniciar com a sessão do sistema.</p>
          <label class="switch-row">
            <span>Iniciar automaticamente</span>
            <input
              type="checkbox"
              checked={$startupEnabled}
              disabled={loadingAction !== ''}
              on:change={handleStartupToggle}
            />
          </label>
        </article>

        <article class="settings-section" id="window" hidden={activeSection !== 'window'}>
          <h3>Comportamento da janela</h3>
          <p>Ajustes da camada da janela e ação ao fechar.</p>
          <label class="field">
            <span>Camada da janela</span>
            <select
              value={draft.window.layer}
              on:change={(e) => applyChange((next) => (next.window.layer = e.target.value), 'Aplicando camada...')}
            >
              <option value="bottom">Sempre em segundo plano</option>
              <option value="normal">Camada normal</option>
              <option value="top">Sempre no topo</option>
            </select>
          </label>
          <label class="switch-row">
            <span>Fechar para bandeja (não encerrar app)</span>
            <input
              type="checkbox"
              checked={draft.window.closeToTray}
              on:change={(e) => applyChange((next) => (next.window.closeToTray = e.target.checked), 'Aplicando fechamento...')}
            />
          </label>
        </article>

        <article class="settings-section" id="appearance" hidden={activeSection !== 'appearance'}>
          <h3>Aparência e tema</h3>
          <p>Manter padrão visual com opção de ajuste rápido.</p>
          <label class="field">
            <span>Tema</span>
            <select value={draft.appearance.theme} on:change={(e) => applyChange((next) => (next.appearance.theme = e.target.value))}>
              <option value="system">Seguir sistema</option>
              <option value="dark">Escuro</option>
              <option value="light">Claro</option>
            </select>
          </label>
          <label class="field">
            <span>Densidade visual</span>
            <select value={draft.appearance.density} on:change={(e) => applyChange((next) => (next.appearance.density = e.target.value))}>
              <option value="comfortable">Confortável</option>
              <option value="compact">Compacta</option>
            </select>
          </label>
        </article>

        <article class="settings-section" id="locale" hidden={activeSection !== 'locale'}>
          <h3>Idioma / locale</h3>
          <p>Define formatação de datas, percentuais e números.</p>
          <label class="field">
            <span>Locale</span>
            <select value={draft.locale.code} on:change={(e) => applyChange((next) => (next.locale.code = e.target.value))}>
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en-US">English (US)</option>
            </select>
          </label>
        </article>

        <article class="settings-section" id="panel" hidden={activeSection !== 'panel'}>
          <h3>Comportamento do painel</h3>
          <p>Controle de foco e leitura contínua em tela.</p>
          <label class="switch-row">
            <span>Ocultar painel ao perder foco</span>
            <input
              type="checkbox"
              checked={draft.panel.autoHideOnBlur}
              on:change={(e) => applyChange((next) => (next.panel.autoHideOnBlur = e.target.checked))}
            />
          </label>
          <label class="switch-row">
            <span>Mostrar segundos no relógio</span>
            <input
              type="checkbox"
              checked={draft.panel.showSeconds}
              on:change={(e) => applyChange((next) => (next.panel.showSeconds = e.target.checked))}
            />
          </label>
        </article>
      </div>
    </div>

    <footer class="settings-footer">
      {#if loadingAction}
        <p class="status status--loading" role="status">{loadingAction}</p>
      {:else if status}
        <p class={`status status--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.message}</p>
      {/if}
      <button type="button" class="primary-button" on:click={close}>Concluir</button>
    </footer>
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
