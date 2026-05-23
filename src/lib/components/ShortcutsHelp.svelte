<script lang="ts">
  import { t } from '../i18n/index.js';

  let { onClose = () => {} } = $props();
</script>

<div
  class="shortcuts-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="shortcuts-title"
  tabindex="-1"
  onclick={(e) => e.target === e.currentTarget && onClose()}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="shortcuts-modal">
    <div class="shortcuts-header">
      <h2 id="shortcuts-title">{$t('shortcuts.title')}</h2>
      <button
        type="button"
        class="shortcuts-close"
        aria-label={$t('settings.close')}
        onclick={onClose}
      >x</button>
    </div>
    <table class="shortcuts-table">
      <tbody>
        <tr><td><kbd>Enter</kbd></td><td>{$t('shortcuts.addTask')}</td></tr>
        <tr><td><kbd>Ctrl</kbd> + <kbd>Enter</kbd></td><td>{$t('shortcuts.focusComposer')}</td></tr>
        <tr><td><kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd></td><td>{$t('shortcuts.navigateDays')}</td></tr>
        <tr><td><kbd>←</kbd> / <kbd>→</kbd> (calendario)</td><td>{$t('shortcuts.navigateMonths')}</td></tr>
        <tr><td><kbd>Escape</kbd></td><td>Fechar modais</td></tr>
      </tbody>
    </table>
    <div class="shortcuts-footer">
      <button type="button" class="primary-button" onclick={onClose}>{$t('settings.close')}</button>
    </div>
  </div>
</div>

<style>
  .shortcuts-overlay {
    position: fixed; inset: 0; z-index: 1100;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: var(--space-4);
  }
  .shortcuts-modal {
    background: linear-gradient(180deg, rgba(10, 10, 10, 0.96), rgba(8, 8, 8, 0.94));
    border: 1px solid var(--surface-dark-border);
    box-shadow: var(--shadow-lg);
    max-width: 440px; width: 100%;
    display: flex; flex-direction: column;
  }
  .shortcuts-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--space-4) var(--space-4) var(--space-3);
    border-bottom: 1px solid rgba(241, 236, 236, 0.08);
  }
  .shortcuts-header h2 {
    margin: 0; font-size: 1.15rem; font-weight: 800; color: var(--light-strong);
  }
  .shortcuts-close {
    width: 2.5rem; height: 2.5rem;
    border: 1px solid rgba(241, 236, 236, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: var(--light-main); font-size: 1.25rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .shortcuts-close:hover { border-color: rgba(207, 206, 205, 0.28); background: rgba(255, 255, 255, 0.12); }
  .shortcuts-table { margin: var(--space-4); }
  .shortcuts-table td {
    padding: 0.65rem 0.5rem;
    border-bottom: 1px solid rgba(241, 236, 236, 0.06);
    color: var(--light-main); font-size: 0.92rem;
  }
  .shortcuts-table td:first-child {
    font-weight: 700; color: var(--light-strong); white-space: nowrap; padding-right: 1rem;
    font-family: var(--font-display); font-size: 0.82rem;
  }
  kbd {
    display: inline-block;
    padding: 0.15rem 0.45rem; border: 1px solid rgba(241, 236, 236, 0.2);
    background: rgba(255, 255, 255, 0.08); font-family: var(--font-display);
    font-size: 0.78rem; color: var(--light-strong);
  }
  .shortcuts-footer {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid rgba(241, 236, 236, 0.08);
    display: flex; justify-content: flex-end;
  }
</style>
