<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { RadarLocation } from '../../types/radar.js';
  import { data, paused, setRadarLocation } from '../../stores/app-store.js';
  import { t, formatMessage, locale } from '../../i18n/index.js';
  import { searchRadarLocations } from '../../services/radar.js';
  import { radarLocationPickerOpen } from '../../stores/radar-store.js';
  import { formatRadarLocationLabel } from '../../utils/radar.js';
  import { trapFocus } from '../../utils/focus-trap.js';
  import RadarIcon from './RadarIcon.svelte';

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
  <div class="radar-overlay-layer is-modal">
    <button class="radar-overlay-backdrop" type="button" tabindex="-1" aria-label={$t('radar.closeLocation')} onclick={closePicker}></button>
    <section
      bind:this={dialogElement}
      class="radar-location-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby="radar-location-title"
      aria-describedby="radar-location-help"
      tabindex="-1"
    >
      <div class="radar-location-header">
        <div class="radar-location-heading">
          <span class="radar-location-heading-icon"><RadarIcon name="location" size={20} /></span>
          <div>
            <span class="radar-section-eyebrow">{$t('radar.location')}</span>
            <h2 id="radar-location-title">{$t('radar.changeLocation')}</h2>
          </div>
        </div>
        <button type="button" class="radar-icon-button" aria-label={$t('radar.closeLocation')} onclick={closePicker} disabled={saving}>
          <RadarIcon name="close" size={18} />
        </button>
      </div>

      <p id="radar-location-help" class="radar-location-help">{$t('radar.locationRequiredBody')}</p>

      <label class="radar-location-search" for="radar-location-query">
        <span class="sr-only">{$t('radar.locationSearchLabel')}</span>
        <RadarIcon name="search" size={17} />
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
      </label>

      <span class="sr-only" aria-live="polite">{resultAnnouncement}</span>
      <div id="radar-location-results" class="radar-location-results" aria-busy={loading}>
        {#if loading}
          <div class="radar-location-loading" role="status">
            <span class="sr-only">{$t('radar.statusLoading')}</span>
            <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
          </div>
        {:else if error}
          <p class="radar-error" role="alert">{$t('radar.locationSearchError')}</p>
        {:else if query.trim().length >= 2 && results.length === 0}
          <p>{$t('radar.locationSearchEmpty')}</p>
        {:else if query.trim().length < 2}
          <p class="radar-location-prompt">{$t('radar.locationSearchPlaceholder')}</p>
        {:else}
          <div class="radar-location-result-list" role="list" aria-label={$t('radar.locationResults')}>
            {#each results as location (`${location.id}-${location.latitude.toFixed(4)}-${location.longitude.toFixed(4)}`)}
              <div role="listitem" class="radar-location-result">
                <button type="button" onclick={() => selectLocation(location)} disabled={saving}>
                  <span class="radar-location-result-mark"><RadarIcon name="location" size={15} /></span>
                  <span class="radar-location-result-copy">
                    <strong>{location.name}</strong>
                    <small>{formatRadarLocationLabel(location)}</small>
                  </span>
                  <span class="radar-location-result-arrow" aria-hidden="true">→</span>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="radar-location-footer">
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
    </section>
  </div>
{/if}
