<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { RadarLocation } from '../../types/radar.js';
  import { data, paused, setRadarLocation } from '../../stores/app-store.js';
  import { t, formatMessage, locale } from '../../i18n/index.js';
  import { searchRadarLocations } from '../../services/radar.js';
  import { radarLocationPickerOpen } from '../../stores/radar-store.js';
  import { formatRadarLocationLabel } from '../../utils/radar.js';
  import { trapFocus } from '../../utils/focus-trap.js';

  let query = $state('');
  let results = $state<RadarLocation[]>([]);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state(false);
  let saveError = $state(false);
  let dialogElement = $state<HTMLElement | null>(null);
  let searchInput = $state<HTMLInputElement | null>(null);
  let generation = 0;

  let resultAnnouncement = $derived(
    query.trim().length >= 2 && !loading && !error
      ? formatMessage($t('radar.locationResultsCount'), { count: results.length })
      : ''
  );

  $effect(() => {
    if (!$radarLocationPickerOpen || !dialogElement) return;
    return trapFocus(dialogElement, { onEscape: closePicker, initialFocus: searchInput });
  });

  $effect(() => {
    const value = query.trim();
    const currentGeneration = ++generation;
    results = [];
    error = false;
    saveError = false;
    if (!$radarLocationPickerOpen || $paused || value.length < 2) {
      loading = false;
      return;
    }
    loading = true;
    const timer = setTimeout(async () => {
      try {
        const found = await searchRadarLocations(value, $locale);
        if (currentGeneration === generation) results = found;
      } catch {
        if (currentGeneration === generation) error = true;
      } finally {
        if (currentGeneration === generation) loading = false;
      }
    }, 350);
    return () => clearTimeout(timer);
  });

  async function selectLocation(location: RadarLocation | null) {
    if (saving) return;
    saving = true;
    saveError = false;
    const saved = await setRadarLocation(location);
    saving = false;
    if (saved) closePicker();
    else saveError = true;
  }

  function closePicker() {
    if (saving) return;
    generation += 1;
    query = '';
    results = [];
    loading = false;
    error = false;
    saveError = false;
    radarLocationPickerOpen.set(false);
  }

  onDestroy(() => { generation += 1; });
</script>

{#if $radarLocationPickerOpen}
  <div
    bind:this={dialogElement}
    class="radar-location-picker"
    role="dialog"
    aria-modal="true"
    aria-labelledby="radar-location-title"
    aria-describedby="radar-location-help"
    tabindex="-1"
  >
    <div class="radar-location-header">
      <h2 id="radar-location-title">{$t('radar.changeLocation')}</h2>
      <button type="button" class="radar-icon-button" aria-label={$t('radar.closeLocation')} onclick={closePicker} disabled={saving}>×</button>
    </div>
    <p id="radar-location-help" class="radar-location-help">{$t('radar.locationRequiredBody')}</p>
    <label for="radar-location-query">{$t('radar.locationSearchLabel')}</label>
    <input
      id="radar-location-query"
      bind:this={searchInput}
      type="search"
      bind:value={query}
      maxlength="80"
      autocomplete="off"
      placeholder={$t('radar.locationSearchPlaceholder')}
      aria-controls="radar-location-results"
      aria-describedby="radar-location-help"
      disabled={saving}
    />
    <span class="sr-only" aria-live="polite">{resultAnnouncement}</span>
    <div id="radar-location-results" class="radar-location-results" role="list" aria-label={$t('radar.locationResults')} aria-busy={loading}>
      {#if loading}<p>{$t('radar.statusLoading')}</p>
      {:else if error}<p class="radar-error">{$t('radar.locationSearchError')}</p>
      {:else if query.trim().length >= 2 && results.length === 0}<p>{$t('radar.locationSearchEmpty')}</p>
      {:else}
        {#each results as location (`${location.id}-${location.latitude.toFixed(4)}-${location.longitude.toFixed(4)}`)}
          <div role="listitem">
            <button type="button" onclick={() => selectLocation(location)} disabled={saving}>
              <strong>{location.name}</strong><span>{formatRadarLocationLabel(location)}</span>
            </button>
          </div>
        {/each}
      {/if}
    </div>
    {#if saveError}<span class="radar-inline-error" role="alert">{$t('radar.locationSaveError')}</span>{/if}
    <button
      type="button"
      class="radar-remove-location"
      onclick={() => selectLocation(null)}
      disabled={saving || !$data.radarPreferences.location}
    >
      {$t('radar.removeLocation')}
    </button>
  </div>
{/if}
