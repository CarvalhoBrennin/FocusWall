<script>
  import { startupEnabled, toggleStartup } from '../stores/app-store.js';
  import { storage } from '../services/storage.js';
  import { t } from '../i18n/index.js';

  let loading = $state(storage.mode !== 'tauri');
  let errorMsg = $state(storage.mode !== 'tauri' ? null : null);

  $effect(() => {
    if (storage.mode !== 'tauri') {
      errorMsg = 'API de autostart indisponível no modo navegador.';
      return;
    }
    loading = false;
    errorMsg = null;
  });

  async function handleToggle() {
    try {
      await toggleStartup();
    } catch (err) {
      errorMsg = String(err?.message || err);
    }
  }
</script>

<div class="startup-toggle">
  <p class="eyebrow startup-toggle-title">{$t('startup.title')}</p>

  {#if loading}
    <p class="startup-status">Carregando...</p>
  {:else if errorMsg}
    <p class="startup-error">{errorMsg}</p>
  {:else}
    <label class="startup-option" class:is-active={$startupEnabled}>
      <input
        type="checkbox"
        checked={$startupEnabled}
        onchange={handleToggle}
      />
      <span class="startup-label">{$t('startup.label')}</span>
      <span class="startup-state">{$startupEnabled ? $t('startup.active') : $t('startup.inactive')}</span>
    </label>
  {/if}
</div>

<style>
  .startup-toggle {
    padding: var(--space-3) 0;
  }

  .startup-toggle-title {
    color: var(--light-soft);
    margin-bottom: var(--space-3);
  }

  .startup-status {
    padding: var(--space-3);
    text-align: center;
    color: var(--light-muted);
    font-size: 0.88rem;
  }

  .startup-error {
    padding: var(--space-3);
    text-align: center;
    color: var(--danger);
    font-size: 0.88rem;
  }

  .startup-option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.95rem 1rem 0.95rem 1.35rem;
    border: 1px solid rgba(241, 236, 236, 0.08);
    border-radius: 0;
    cursor: pointer;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-fast);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.022));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      var(--shadow-xs);
    isolation: isolate;
  }

  .startup-option::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.8rem;
    bottom: 0.8rem;
    width: 3px;
    border-radius: 0;
    background: rgba(241, 236, 236, 0.18);
  }

  .startup-option::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), transparent 52%);
    opacity: 0.85;
    z-index: 0;
  }

  .startup-option:hover {
    transform: translateY(-1px);
    border-color: rgba(207, 206, 205, 0.22);
    box-shadow: 0 18px 26px rgba(0, 0, 0, 0.14);
  }

  .startup-option.is-active {
    border-color: rgba(207, 206, 205, 0.28);
    background:
      linear-gradient(135deg, rgba(207, 206, 205, 0.12), rgba(10, 10, 10, 0.9));
  }

  .startup-option.is-active::before {
    background: var(--accent);
  }

  .startup-option input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .startup-label {
    position: relative;
    z-index: 1;
    flex: 1;
    color: var(--light-main);
    font-size: 0.92rem;
    font-weight: 800;
  }

  .startup-state {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 1.75rem;
    padding: 0.2rem 0.62rem;
    border-radius: 0;
    border: 1px solid rgba(207, 206, 205, 0.16);
    background: rgba(207, 206, 205, 0.08);
    color: var(--light-muted);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .is-active .startup-state {
    border-color: rgba(91, 140, 91, 0.2);
    background: rgba(91, 140, 91, 0.12);
    color: var(--success);
  }
</style>
