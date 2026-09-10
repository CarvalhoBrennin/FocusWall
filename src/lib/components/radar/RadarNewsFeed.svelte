<script lang="ts">
  import type {
    RadarNewsCategory,
    RadarNewsCollection,
    RadarSection,
    RadarWarningCode
  } from '../../types/radar.js';
  import { RADAR_CATEGORIES, collectionArticles } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { formatMessage, t } from '../../i18n/index.js';
  import { data, setRadarCategories, setRadarPreferences } from '../../stores/app-store.js';
  import {
    loadMoreRadarNews,
    radarSelectedCategory,
    resetRadarNewsPageSize
  } from '../../stores/radar-store.js';
  import RadarLeadArticle from './RadarLeadArticle.svelte';
  import RadarFeaturedArticle from './RadarFeaturedArticle.svelte';
  import RadarNewsItem from './RadarNewsItem.svelte';
  import RadarState from './RadarState.svelte';
  import RadarSkeleton from './RadarSkeleton.svelte';
  import RadarIcon from './RadarIcon.svelte';

  let { section, warnings = [], loading = false, refreshing = false, categories = [...RADAR_CATEGORIES] } = $props<{
    section: RadarSection<RadarNewsCollection> | null;
    warnings?: RadarWarningCode[];
    loading?: boolean;
    refreshing?: boolean;
    categories?: RadarNewsCategory[];
  }>();

  let partial = $derived(
    warnings.includes('newsSourceUnavailable') ||
    warnings.includes('newsRefreshFailed') ||
    warnings.includes('providerCooldown') ||
    warnings.includes('imagesUnavailable')
  );
  let savingCategories = $state(false);
  let categorySaveError = $state(false);

  let ordered = $derived(collectionArticles(section?.data ?? null));
  let lead = $derived(ordered[0] ?? null);
  let featured = $derived(ordered.slice(1, 3));
  let compact = $derived(ordered.slice(3));
  let totalCount = $derived(section?.data?.totalAvailable ?? ordered.length);
  let availableFilters = $derived(categories);

  let savingPreferences = $state(false);
  let preferenceSaveError = $state(false);
  let preferenceDirty = $state(false);
  let followedTopicsInput = $state('');
  let blockedTopicsInput = $state('');
  let preferredSourcesInput = $state('');
  let mutedSourcesInput = $state('');
  let tickerSymbolsInput = $state('');

  $effect(() => {
    const preferences = $data.radarPreferences;
    if (preferenceDirty || savingPreferences) return;
    followedTopicsInput = preferences.followedTopics.join(', ');
    blockedTopicsInput = preferences.blockedTopics.join(', ');
    preferredSourcesInput = preferences.preferredSources.join(', ');
    mutedSourcesInput = preferences.mutedSources.join(', ');
    tickerSymbolsInput = preferences.tickerSymbols.join(', ');
  });

  $effect(() => {
    const selected = $radarSelectedCategory;
    if (selected !== 'all' && !categories.includes(selected)) radarSelectedCategory.set('all');
  });

  function categoryLabel(category: RadarNewsCategory | 'all'): string {
    return $t(`radar.category.${category}` as MessageKey);
  }

  async function toggleCategory(category: RadarNewsCategory) {
    if (savingCategories) return;
    const enabled = categories.includes(category);
    if (enabled && categories.length === 1) return;
    const next = enabled
      ? categories.filter((value: RadarNewsCategory) => value !== category)
      : [...categories, category];
    savingCategories = true;
    categorySaveError = false;
    const saved = await setRadarCategories(next);
    categorySaveError = !saved;
    savingCategories = false;
    if (saved) resetRadarNewsPageSize();
  }

  function selectCategory(category: RadarNewsCategory | 'all') {
    resetRadarNewsPageSize();
    radarSelectedCategory.set(category);
  }

  function parseList(value: string, limit: number): string[] {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, limit);
  }

  function handleSettingsKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    const details = event.currentTarget as HTMLDetailsElement;
    if (!details.open) return;
    event.preventDefault();
    event.stopPropagation();
    details.open = false;
    details.querySelector('summary')?.focus();
  }

  async function savePersonalization() {
    if (savingPreferences) return;
    savingPreferences = true;
    preferenceSaveError = false;
    const saved = await setRadarPreferences({
      ...$data.radarPreferences,
      followedTopics: parseList(followedTopicsInput, 64),
      blockedTopics: parseList(blockedTopicsInput, 64),
      preferredSources: parseList(preferredSourcesInput, 32),
      mutedSources: parseList(mutedSourcesInput, 32),
      tickerSymbols: parseList(tickerSymbolsInput, 12)
    });
    savingPreferences = false;
    preferenceSaveError = !saved;
    if (saved) {
      preferenceDirty = false;
      resetRadarNewsPageSize();
    }
  }
</script>

<section class="radar-news" aria-labelledby="radar-news-title">
  <div class="radar-section-header">
    <div class="radar-section-heading">
      <span class="radar-section-index" aria-hidden="true">02</span>
      <div>
        <span class="radar-section-eyebrow">{$t('radar.newsEyebrow')}</span>
        <h2 id="radar-news-title">{$t('radar.news')}</h2>
      </div>
    </div>
    {#if section?.data}
      <span class="radar-news-count">{formatMessage($t('radar.newsCount'), { count: totalCount })}</span>
    {/if}
  </div>

  <div class="radar-news-toolbar">
    <div class="radar-filters" role="group" aria-label={$t('radar.news')}>
      <button
        type="button"
        class:is-active={$radarSelectedCategory === 'all'}
        aria-pressed={$radarSelectedCategory === 'all'}
        onclick={() => selectCategory('all')}
      >
        {categoryLabel('all')}
      </button>
      {#each availableFilters as category}
        <button
          type="button"
          class:is-active={$radarSelectedCategory === category}
          aria-pressed={$radarSelectedCategory === category}
          onclick={() => selectCategory(category)}
        >
          {categoryLabel(category)}
        </button>
      {/each}
    </div>

    <details class="radar-settings-menu" onkeydown={handleSettingsKeydown}>
      <summary>
        <RadarIcon name="settings" size={14} />
        <span>{$t('radar.personalization')}</span>
      </summary>
      <div class="radar-settings-popover">
        <div class="radar-settings-section">
          <div class="radar-settings-heading">
            <strong>{$t('radar.enabledCategories')}</strong>
            <span>{categories.length}/{RADAR_CATEGORIES.length}</span>
          </div>
          <fieldset class="radar-category-options" disabled={savingCategories}>
            <legend class="sr-only">{$t('radar.enabledCategories')}</legend>
            {#each RADAR_CATEGORIES as category}
              <label>
                <input
                  type="checkbox"
                  checked={categories.includes(category)}
                  disabled={savingCategories || (categories.includes(category) && categories.length === 1)}
                  onchange={() => toggleCategory(category)}
                />
                <span>{categoryLabel(category)}</span>
              </label>
            {/each}
          </fieldset>
          {#if categorySaveError}<span class="radar-inline-error" role="alert">{$t('radar.categorySaveError')}</span>{/if}
        </div>

        <div class="radar-settings-divider"></div>

        <div class="radar-settings-section">
          <div class="radar-settings-heading">
            <strong>{$t('radar.personalization')}</strong>
          </div>
          <p class="radar-settings-help">{$t('radar.personalizationHelp')}</p>
          <div class="radar-preference-grid">
            <label>
              <span>{$t('radar.followedTopics')}</span>
              <input type="text" bind:value={followedTopicsInput} placeholder={$t('radar.preferencePlaceholder')} oninput={() => preferenceDirty = true} disabled={savingPreferences} />
            </label>
            <label>
              <span>{$t('radar.blockedTopics')}</span>
              <input type="text" bind:value={blockedTopicsInput} placeholder={$t('radar.preferencePlaceholder')} oninput={() => preferenceDirty = true} disabled={savingPreferences} />
            </label>
            <label>
              <span>{$t('radar.preferredSources')}</span>
              <input type="text" bind:value={preferredSourcesInput} placeholder={$t('radar.preferencePlaceholder')} oninput={() => preferenceDirty = true} disabled={savingPreferences} />
            </label>
            <label>
              <span>{$t('radar.mutedSources')}</span>
              <input type="text" bind:value={mutedSourcesInput} placeholder={$t('radar.preferencePlaceholder')} oninput={() => preferenceDirty = true} disabled={savingPreferences} />
            </label>
            <label>
              <span>{$t('radar.tickerSymbols')}</span>
              <input type="text" bind:value={tickerSymbolsInput} placeholder="usd-brl, eur-brl" oninput={() => preferenceDirty = true} disabled={savingPreferences} />
            </label>
          </div>
          <button type="button" class="radar-button radar-save-preferences" onclick={savePersonalization} disabled={savingPreferences || !preferenceDirty}>
            {savingPreferences ? $t('radar.statusLoading') : $t('radar.savePreferences')}
          </button>
          {#if preferenceSaveError}<span class="radar-inline-error" role="alert">{$t('radar.preferencesSaveFailed')}</span>{/if}
        </div>
      </div>
    </details>
  </div>

  {#if section?.state === 'stale'}
    <p class="radar-section-warning" role="status">{$t('radar.usingCachedData')}</p>
  {:else if warnings.includes('imagesUnavailable')}
    <p class="radar-section-warning" role="status">{$t('radar.imagesUnavailable')}</p>
  {:else if partial}
    <p class="radar-section-warning" role="status">{$t('radar.partialSourceWarning')}</p>
  {/if}

  {#if loading && !section?.data}
    <RadarSkeleton variant="news" />
  {:else if !section?.data}
    <RadarState title={$t('radar.newsUnavailable')} />
  {:else if !lead}
    <RadarState title={$t('radar.newsEmpty')} />
  {:else}
    <div class="radar-editorial-grid" class:is-single={featured.length === 0}>
      <RadarLeadArticle article={lead} />
      {#if featured.length}
        <div class="radar-featured" class:is-single={featured.length === 1}>
          {#each featured as article (article.id)}
            <RadarFeaturedArticle {article} />
          {/each}
        </div>
      {/if}
    </div>

    {#if compact.length}
      <div class="radar-latest-heading">
        <span>{$t('radar.news')}</span>
        <span class="radar-subsection-line" aria-hidden="true"></span>
      </div>
      <ul class="radar-news-list">
        {#each compact as article, index (article.id)}<RadarNewsItem {article} index={index + 4} />{/each}
      </ul>
    {/if}

    {#if section.data.hasMore}
      <button type="button" class="radar-load-more" onclick={loadMoreRadarNews} disabled={refreshing}>
        {refreshing ? $t('radar.statusLoading') : $t('radar.loadMore')}
      </button>
    {/if}
  {/if}

  <p class="radar-news-attribution">{$t('radar.attributionNews')}</p>
</section>
