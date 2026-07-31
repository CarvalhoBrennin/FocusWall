<script lang="ts">
  import { onDestroy } from 'svelte';
  import { data, paused } from '../../stores/app-store.js';
  import {
    activateRadar,
    deactivateRadar,
    radarErrorKey,
    radarLocationPickerOpen,
    radarPhase,
    radarRefreshAvailableAt,
    radarSelectedArticleId,
    radarSelectedCategory,
    radarSnapshot,
    closeRadarArticlePreview,
    setRadarPaused
  } from '../../stores/radar-store.js';
  import RadarToolbar from './RadarToolbar.svelte';
  import RadarWeatherCard from './RadarWeatherCard.svelte';
  import RadarNewsFeed from './RadarNewsFeed.svelte';
  import RadarLocationPicker from './RadarLocationPicker.svelte';
  import RadarArticleDrawer from './RadarArticleDrawer.svelte';
  import { t } from '../../i18n/index.js';
  import './radar.css';

  let { active = false } = $props<{ active?: boolean }>();

  // A categoria em foco entra no request: o backend pagina e ranqueia por ela.
  let request = $derived({
    location: $data.radarPreferences.location,
    categories: $data.radarPreferences.enabledCategories,
    selectedCategory: $radarSelectedCategory === 'all' ? null : $radarSelectedCategory,
    mutedSources: $data.radarPreferences.mutedSources,
    blockedTopics: $data.radarPreferences.blockedTopics,
    followedTopics: $data.radarPreferences.followedTopics,
    preferredSources: $data.radarPreferences.preferredSources
  });

  // O fundo fica inerte quando o seletor de cidade ou o drawer está aberto.
  let overlayOpen = $derived($radarLocationPickerOpen || $radarSelectedArticleId !== null);

  $effect(() => { setRadarPaused($paused); });
  $effect(() => {
    if (active) {
      activateRadar(request);
    } else {
      radarLocationPickerOpen.set(false);
      closeRadarArticlePreview();
      deactivateRadar();
    }
  });
  onDestroy(() => {
    radarLocationPickerOpen.set(false);
    closeRadarArticlePreview();
    deactivateRadar();
  });
</script>

<div class="radar-panel" aria-label={$t('radar.panelLabel')}>
  <div class="radar-content" inert={overlayOpen} aria-hidden={overlayOpen ? 'true' : undefined}>
    <RadarToolbar
      phase={$radarPhase}
      snapshot={$radarSnapshot}
      errorKey={$radarErrorKey}
      refreshAvailableAt={$radarRefreshAvailableAt}
      {request}
    />
    <div class="radar-grid">
      <RadarWeatherCard
        section={$radarSnapshot?.weather ?? null}
        loading={$radarPhase === 'loading'}
        hasLocation={Boolean(request.location)}
        onchoose={() => radarLocationPickerOpen.set(true)}
      />
      <RadarNewsFeed
        section={$radarSnapshot?.news ?? null}
        warnings={$radarSnapshot?.warnings ?? []}
        loading={$radarPhase === 'loading'}
        categories={request.categories}
      />
    </div>
  </div>
  <RadarLocationPicker />
  <RadarArticleDrawer />
</div>
