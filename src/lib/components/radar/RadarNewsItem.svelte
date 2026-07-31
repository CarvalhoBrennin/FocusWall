<script lang="ts">
  import type { RadarArticleSummary } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { formatMessage, t } from '../../i18n/index.js';
  import { describeRadarRelativeTime } from '../../utils/radar.js';
  import { openRadarArticlePreview } from '../../stores/radar-store.js';

  let { article } = $props<{ article: RadarArticleSummary }>();

  let publishedLabel = $derived.by(() => {
    const relative = describeRadarRelativeTime(article.publishedAt);
    if (!relative) return $t('radar.noPublishedDate');
    return formatMessage($t(`radar.relative.${relative.unit}` as MessageKey), { count: relative.count });
  });
</script>

<li class="radar-news-item">
  <!--
    O clique abre o preview interno. O navegador só é acionado a partir do
    drawer, por ação explícita — e este componente nunca vê a URL da matéria.
  -->
  <button
    type="button"
    aria-label={`${$t('radar.openArticle')}: ${article.title}`}
    onclick={() => openRadarArticlePreview(article.id)}
  >
    <span class="radar-news-title">{article.title}</span>
    {#if article.summary}<span class="radar-news-summary">{article.summary}</span>{/if}
    <span class="radar-news-meta">{article.sourceName} · {publishedLabel}</span>
  </button>
</li>
