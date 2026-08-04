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
  import RadarLeadArticle from './RadarLeadArticle.svelte';
  import RadarFeaturedArticle from './RadarFeaturedArticle.svelte';
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

  /**
   * O backend entrega a coleção já ranqueada: manchete primeiro, destaques
   * depois, resto na sequência. A hierarquia visual reusa essa ordem em vez de
   * reordenar por conta própria — 1 manchete, 2 destaques, o resto compacto.
   */
  let ordered = $derived(collectionArticles(section?.data ?? null));
  let lead = $derived(ordered[0] ?? null);
  let featured = $derived(ordered.slice(1, 3));
  let compact = $derived(ordered.slice(3));

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

<section class="radar-news" aria-labelledby="radar-news-title">
  <h2 id="radar-news-title" class="sr-only">{$t('radar.news')}</h2>

  <div class="radar-news-bar">
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

    <!-- Configuração sai do fluxo de leitura: fica recolhida atrás do disclosure. -->
    <details class="radar-news-settings">
      <summary>{$t('radar.enabledCategories')}</summary>
      <fieldset disabled={savingCategories}>
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
    </details>
  </div>

  {#if section?.state === 'stale'}
    <p class="radar-section-warning" role="status">{$t('radar.usingCachedData')}</p>
  {:else if partial}
    <p class="radar-section-warning" role="status">{$t('radar.partialSourceWarning')}</p>
  {/if}

  {#if loading && !section?.data}
    <RadarSkeleton />
  {:else if !section?.data}
    <RadarState title={$t('radar.newsUnavailable')} />
  {:else if !lead}
    <RadarState title={$t('radar.newsEmpty')} />
  {:else}
    <RadarLeadArticle article={lead} />

    {#if featured.length}
      <div class="radar-featured">
        {#each featured as article (article.id)}
          <RadarFeaturedArticle {article} />
        {/each}
      </div>
    {/if}

    {#if compact.length}
      <ul class="radar-news-list">
        {#each compact as article (article.id)}<RadarNewsItem {article} />{/each}
      </ul>
    {/if}
  {/if}

  <p class="radar-news-attribution">{$t('radar.attributionNews')}</p>
</section>
