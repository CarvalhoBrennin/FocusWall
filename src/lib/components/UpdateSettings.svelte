<script lang="ts">
  import { checkForUpdates, installUpdate } from '../services/updater.js';
  import { t } from '../i18n/index.js';

  let status = $state('');
  let checking = $state(false);
  let updateAvailable = $state(false);

  async function handleCheck() {
    checking = true;
    status = $t('updates.checking');
    updateAvailable = false;

    const result = await checkForUpdates();
    checking = false;

    if (result.available) {
      updateAvailable = true;
      status = `${$t('updates.available')} ${result.version ?? ''}`.trim();
      return;
    }

    status = result.error === 'disabled' ? $t('updates.disabled') : result.error ? $t('updates.error') : $t('updates.none');
  }

  async function handleInstall() {
    checking = true;
    await installUpdate();
    checking = false;
  }
</script>

<section class="settings-section settings-section--updates">
  <p class="eyebrow">{$t('settings.updates')}</p>
  <button type="button" class="ghost-button" disabled={checking} onclick={handleCheck}>
    {$t('settings.checkUpdates')}
  </button>
  {#if status}
    <p class="settings-status">{status}</p>
  {/if}
  {#if updateAvailable}
    <button type="button" class="primary-button" disabled={checking} onclick={handleInstall}>
      {$t('updates.install')}
    </button>
  {/if}
</section>

<style>
  .settings-section--updates {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3) 0;
  }

  .settings-status {
    margin: 0;
    color: var(--light-muted);
    font-size: 0.88rem;
  }
</style>
