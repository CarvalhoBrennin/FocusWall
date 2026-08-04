<script lang="ts">
  import type { RadarArticleSummary } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { formatMessage, t } from '../../i18n/index.js';
  import { describeRadarRelativeTime } from '../../utils/radar.js';
  import { openRadarArticlePreview } from '../../stores/radar-store.js';
  import RadarArticleCover from './RadarArticleCover.svelte';

  let { article } = $props<{ article: RadarArticleSummary }>();

  let publishedLabel = $derived.by(() => {
    const relative = describeRadarRelativeTime(article.publishedAt);
    if (!relative) return $t('radar.noPublishedDate');
    return formatMessage($t(`radar.relative.${relative.unit}` as MessageKey), { count: relative.count });
  });
</script>

<article class="radar-lead">
  <!-- O clique abre o preview interno; o navegador só é acionado pelo drawer. -->
  <button
    type="button"
    aria-label={`${$t('radar.openArticle')}: ${article.title}`}
    onclick={() => openRadarArticlePreview(article.id)}
  >
    <RadarArticleCover image={article.image} category={article.category} variant="lead" />
    <span class="radar-lead-copy">
      <span class="radar-kicker">{$t(`radar.category.${article.category}` as MessageKey)}</span>
      <span class="radar-lead-title">{article.title}</span>
      {#if article.summary}<span class="radar-lead-summary">{article.summary}</span>{/if}
      <span class="radar-news-meta">
        {article.sourceName}
        <span aria-hidden="true">·</span>
        {publishedLabel}
        {#if article.relatedCount > 0}
          <span aria-hidden="true">·</span>
          {formatMessage($t('radar.relatedCount'), { count: article.relatedCount })}
        {/if}
      </span>
    </span>
  </button>
</article>
