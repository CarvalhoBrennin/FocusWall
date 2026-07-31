<script lang="ts">
  import type {
    RadarNewsCategory,
    RadarNewsCollection,
    RadarSection,
    RadarWarningCode
  } from '../../types/radar.js';
  import { RADAR_CATEGORIES, collectionArticles } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { t } from '../../i18n/index.js';
  import { setRadarCategories } from '../../stores/app-store.js';
  import { radarSelectedCategory } from '../../stores/radar-store.js';
  import RadarNewsItem from './RadarNewsItem.svelte';
  import RadarState from './RadarState.svelte';
  import RadarSkeleton from './RadarSkeleton.svelte';

  let { section, warnings = [], loading = false, categories = [...RADAR_CATEGORIES] } = $props<{
    section: RadarSection<RadarNewsCollection> | null;
    warnings?: RadarWarningCode[];
    loading?: boolean;
    categories?: RadarNewsCategory[];
  }>();

  let partial = $derived(
    warnings.includes('newsSourceUnavailable') ||
      warnings.includes('newsRefreshFailed') ||
      warnings.includes('providerCooldown')
  );
  let savingCategories = $state(false);
  let categorySaveError = $state(false);

  // O backend já entrega a coleção ordenada e paginada para a categoria em foco.
  let articles = $derived(collectionArticles(section?.data ?? null));

  /** Só oferecemos filtro para categorias habilitadas que têm conteúdo. */
  let availableFilters = $derived(
    categories.filter(
      (category: RadarNewsCategory) => section?.data?.categoriesAvailable.includes(category) ?? false
    )
  );

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
    // Desabilitar a última categoria deixaria o Radar sem nenhuma fonte.
    if (enabled && categories.length === 1) return;
    const next = enabled
      ? categories.filter((value: RadarNewsCategory) => value !== category)
      : [...categories, category];
    savingCategories = true;
    categorySaveError = false;
    const saved = await setRadarCategories(next);
    categorySaveError = !saved;
    savingCategories = false;
  }
</script>

<section class="radar-card radar-news-card" aria-labelledby="radar-news-title">
  <div class="radar-card-heading">
    <div>
      <p class="radar-eyebrow">{$t('radar.news')}</p>
      <h2 id="radar-news-title">{$t('radar.attributionNews')}</h2>
    </div>
    {#if section?.state === 'stale'}
      <span class="radar-badge">{$t('radar.stale')}</span>
    {:else if partial}
      <span class="radar-badge">{$t('radar.partial')}</span>
    {/if}
  </div>

  <fieldset class="radar-category-settings" disabled={savingCategories}>
    <legend>{$t('radar.enabledCategories')}</legend>
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

  <div class="radar-filters" role="group" aria-label={$t('radar.news')}>
    <button
      type="button"
      class:is-active={$radarSelectedCategory === 'all'}
      aria-pressed={$radarSelectedCategory === 'all'}
      onclick={() => radarSelectedCategory.set('all')}
    >
      {categoryLabel('all')}
    </button>
    {#each availableFilters as category}
      <button
        type="button"
        class:is-active={$radarSelectedCategory === category}
        aria-pressed={$radarSelectedCategory === category}
        onclick={() => radarSelectedCategory.set(category)}
      >
        {categoryLabel(category)}
      </button>
    {/each}
  </div>
  {#if partial}<p class="radar-section-warning" role="status">{$t('radar.partialSourceWarning')}</p>{/if}

  {#if loading && !section?.data}
    <RadarSkeleton />
  {:else if !section?.data}
    <RadarState title={$t('radar.newsUnavailable')} />
  {:else if articles.length === 0}
    <RadarState title={$t('radar.newsEmpty')} />
  {:else}
    <ul class="radar-news-list">
      {#each articles as article (article.id)}<RadarNewsItem {article} />{/each}
    </ul>
  {/if}
</section>
