<script lang="ts">
  import type { RadarArticleSummary } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { formatMessage, t } from '../../i18n/index.js';
  import { describeRadarRelativeTime } from '../../utils/radar.js';
  import { openRadarArticlePreview } from '../../stores/radar-store.js';

  let { article, index = 1 } = $props<{ article: RadarArticleSummary; index?: number }>();

  let publishedLabel = $derived.by(() => {
    const relative = describeRadarRelativeTime(article.publishedAt);
    if (!relative) return $t('radar.noPublishedDate');
    return formatMessage($t(`radar.relative.${relative.unit}` as MessageKey), { count: relative.count });
  });
</script>

<li class={`radar-news-item category-${article.category}`}>
  <button
    type="button"
    aria-label={`${$t('radar.openArticle')}: ${article.title}`}
    onclick={() => openRadarArticlePreview(article.id)}
  >
    <span class="radar-news-index radar-num" aria-hidden="true">{String(index).padStart(2, '0')}</span>
    <span class="radar-news-item-copy">
      <span class="radar-kicker">{$t(`radar.category.${article.category}` as MessageKey)}</span>
      <span class="radar-news-title">{article.title}</span>
    </span>
    <span class="radar-news-meta"><span>{article.sourceName}</span><span>{publishedLabel}</span></span>
    <span class="radar-news-arrow" aria-hidden="true">↗</span>
  </button>
</li>
