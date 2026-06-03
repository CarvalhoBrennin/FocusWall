<script lang="ts">
  import { data, setThemePreference, setLocalePreference } from '../stores/app-store.js';
  import { THEME_OPTIONS } from '../stores/theme-store.js';
  import { LOCALE_OPTIONS, t } from '../i18n/index.js';

  async function handleThemeChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'dark' || value === 'light' || value === 'olive') {
      await setThemePreference(value);
    }
  }

  async function handleLocaleChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'pt-BR' || value === 'en-US') {
      await setLocalePreference(value);
    }
  }
</script>

<section class="settings-section settings-section--appearance">
  <p class="eyebrow">{$t('settings.theme')}</p>
  <label class="settings-field">
    <span class="sr-only">{$t('settings.theme')}</span>
    <select value={$data.ui.theme} onchange={handleThemeChange}>
      {#each THEME_OPTIONS as option}
        <option value={option.id}>{$t(option.labelKey)}</option>
      {/each}
    </select>
  </label>

  <p class="eyebrow">{$t('settings.locale')}</p>
  <label class="settings-field">
    <span class="sr-only">{$t('settings.locale')}</span>
    <select value={$data.ui.locale} onchange={handleLocaleChange}>
      {#each LOCALE_OPTIONS as option}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
  </label>
</section>

<style>
  .settings-section--appearance {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3) 0;
  }

  .settings-field select {
    width: 100%;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--control-border-strong);
    background: var(--field-bg);
    color: var(--light-main);
    font: inherit;
  }

  .settings-field select:hover {
    background: var(--field-bg-hover);
  }
</style>
