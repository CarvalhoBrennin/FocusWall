<script>
  import { onMount } from 'svelte';
  import { data, setAssistantModelPreference } from '../stores/app-store.js';
  import { checkOllamaHealth } from '../services/ollama.js';
  import { t } from '../i18n/index.js';

  let health = $state({ online: false, models: [], error: '' });
  let loading = $state(true);
  let saving = $state(false);

  const configuredModel = $derived($data.ui?.assistantModel || '');

  async function refreshModels() {
    loading = true;
    try {
      health = await checkOllamaHealth();
    } finally {
      loading = false;
    }
  }

  async function handleModelChange(event) {
    saving = true;
    try {
      await setAssistantModelPreference(event.currentTarget.value);
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    refreshModels();
  });
</script>

<section class="assistant-settings">
  <div class="assistant-settings-heading">
    <div>
      <p class="eyebrow">{$t('settings.wallbot')}</p>
      <p class="assistant-settings-help">{$t('settings.wallbotModelHelp')}</p>
    </div>
    <button
      class="ghost-button assistant-settings-refresh"
      type="button"
      aria-label={$t('settings.wallbotModelRefresh')}
      disabled={loading || saving}
      onclick={refreshModels}
    >
      {$t('settings.wallbotModelRefresh')}
    </button>
  </div>

  <label class="settings-field" for="settings-wallbot-model">
    <span>{$t('settings.wallbotModel')}</span>
    <select
      id="settings-wallbot-model"
      value={configuredModel}
      disabled={loading || saving || !health.online || health.models.length === 0}
      onchange={handleModelChange}
    >
      <option value="">{$t('settings.wallbotModelAuto')}</option>
      {#each health.models as model (model.name)}
        <option value={model.name}>{model.name}</option>
      {/each}
    </select>
  </label>

  {#if loading}
    <p class="assistant-settings-status" role="status">{$t('settings.wallbotModelLoading')}</p>
  {:else if !health.online}
    <p class="assistant-settings-status is-warning" role="status">{$t('settings.wallbotModelOffline')}</p>
  {:else if health.models.length === 0}
    <p class="assistant-settings-status is-warning" role="status">{$t('settings.wallbotModelNoModels')}</p>
  {/if}
</section>

<style>
  .assistant-settings {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3) 0;
  }

  .assistant-settings-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .assistant-settings-help,
  .assistant-settings-status {
    margin: 0.3rem 0 0;
    color: var(--light-muted);
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .assistant-settings-status.is-warning {
    color: var(--danger);
  }

  .assistant-settings-refresh {
    flex: 0 0 auto;
    min-height: 2.25rem;
    padding-inline: 0.7rem;
    font-size: 0.72rem;
    text-transform: none;
  }

  .settings-field {
    display: grid;
    gap: 0.38rem;
    color: var(--light-main);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .settings-field select {
    width: 100%;
    min-height: 2.7rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--control-border-strong);
    background: var(--field-bg);
    color: var(--light-main);
    font: inherit;
  }

  .settings-field select:focus-visible,
  .assistant-settings-refresh:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
  }

  .settings-field select:hover:not(:disabled) {
    background: var(--field-bg-hover);
  }

  @media (max-width: 480px) {
    .assistant-settings-heading {
      flex-direction: column;
    }

    .assistant-settings-refresh {
      width: 100%;
    }
  }
</style>
