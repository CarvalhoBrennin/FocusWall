<script lang="ts">
  /**
   * Preview interno da matéria.
   *
   * O clique num card abre este drawer — nunca o navegador. A abertura externa
   * exige o botão explícito, e acontece por ID opaco: o componente jamais vê a
   * URL da matéria.
   */
  import type { MessageKey } from '../../i18n/messages.js';
  import { formatMessage, t } from '../../i18n/index.js';
  import { describeRadarRelativeTime } from '../../utils/radar.js';
  import { openRadarArticle } from '../../services/radar.js';
  import {
    closeRadarArticlePreview,
    openRadarArticlePreview,
    radarArticlePreview,
    radarArticlePreviewPhase,
    radarSelectedArticleId
  } from '../../stores/radar-store.js';
  import { trapFocus } from '../../utils/focus-trap.js';

  let dialog = $state<HTMLElement | null>(null);
  let opening = $state(false);
  let openFailed = $state(false);

  let open = $derived($radarSelectedArticleId !== null);

  let publishedLabel = $derived.by(() => {
    const relative = describeRadarRelativeTime($radarArticlePreview?.publishedAt ?? null);
    if (!relative) return $t('radar.noPublishedDate');
    return formatMessage($t(`radar.relative.${relative.unit}` as MessageKey), { count: relative.count });
  });

  function close() {
    openFailed = false;
    closeRadarArticlePreview();
  }

  // `trapFocus` prende o Tab, trata Escape e devolve o foco ao item da lista.
  $effect(() => {
    if (!open || !dialog) return;
    return trapFocus(dialog, { onEscape: close });
  });

  async function openExternally() {
    const id = $radarSelectedArticleId;
    if (!id || opening) return;
    opening = true;
    openFailed = false;
    try {
      await openRadarArticle(id);
    } catch {
      openFailed = true;
    } finally {
      opening = false;
    }
  }
</script>

{#if open}
  <div
    class="radar-drawer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="radar-drawer-title"
    bind:this={dialog}
    tabindex="-1"
  >
    <div class="radar-drawer-header">
      <h2 id="radar-drawer-title">
        {$radarArticlePreview?.title ?? $t('radar.previewLoading')}
      </h2>
      <button type="button" class="radar-drawer-close" onclick={close}>
        {$t('radar.closePreview')}
      </button>
    </div>

    {#if $radarArticlePreviewPhase === 'loading'}
      <p class="radar-drawer-status" role="status">{$t('radar.previewLoading')}</p>
    {:else if $radarArticlePreviewPhase === 'error' || !$radarArticlePreview}
      <p class="radar-drawer-status" role="alert">{$t('radar.previewError')}</p>
    {:else}
      <p class="radar-drawer-meta">
        {$radarArticlePreview.sourceName}
        {#if $radarArticlePreview.author} · {$radarArticlePreview.author}{/if}
        · {publishedLabel}
        · {$t(`radar.category.${$radarArticlePreview.category}` as MessageKey)}
      </p>

      {#if $radarArticlePreview.cacheState === 'stale'}
        <span class="radar-badge">{$t('radar.stale')}</span>
      {/if}

      {#if $radarArticlePreview.summary}
        <p class="radar-drawer-summary">{$radarArticlePreview.summary}</p>
      {/if}

      {#if $radarArticlePreview.tags.length}
        <ul class="radar-drawer-tags">
          {#each $radarArticlePreview.tags as tag}<li>{tag}</li>{/each}
        </ul>
      {/if}

      {#if $radarArticlePreview.related.length}
        <div class="radar-subsection">
          <h3>{$t('radar.relatedArticles')}</h3>
          <ul class="radar-drawer-related">
            {#each $radarArticlePreview.related as related (related.id)}
              <li>
                <button type="button" onclick={() => openRadarArticlePreview(related.id)}>
                  {related.title}
                </button>
                <span>{related.sourceName}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <p class="radar-drawer-attribution">{$radarArticlePreview.sourceAttribution}</p>

      {#if $radarArticlePreview.canOpenExternally}
        <button
          type="button"
          class="radar-drawer-open"
          onclick={openExternally}
          disabled={opening}
        >
          {$t('radar.openInBrowser')}
        </button>
      {:else}
        <p class="radar-drawer-status">{$t('radar.openUnavailable')}</p>
      {/if}
      {#if openFailed}
        <span class="radar-inline-error" role="alert">{$t('radar.openArticleError')}</span>
      {/if}
    {/if}
  </div>
{/if}
