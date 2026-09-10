<script lang="ts">
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
  import RadarArticleCover from './RadarArticleCover.svelte';
  import RadarIcon from './RadarIcon.svelte';

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
  <div class="radar-overlay-layer is-drawer">
    <button class="radar-overlay-backdrop" type="button" tabindex="-1" aria-label={$t('radar.closePreview')} onclick={close}></button>
    <aside
      class="radar-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={$radarArticlePreview ? 'radar-drawer-title' : undefined}
      aria-label={!$radarArticlePreview ? $t($radarArticlePreviewPhase === 'error' ? 'radar.previewError' : 'radar.previewLoading') : undefined}
      bind:this={dialog}
      tabindex="-1"
    >
      <div class="radar-drawer-topbar">
        <span class="radar-drawer-context">
          {#if $radarArticlePreview}
            <span class="radar-kicker">{$t(`radar.category.${$radarArticlePreview.category}` as MessageKey)}</span>
            <span>{$radarArticlePreview.sourceName}</span>
          {:else}
            <span>{$t($radarArticlePreviewPhase === 'error' ? 'radar.previewError' : 'radar.previewLoading')}</span>
          {/if}
        </span>
        <button type="button" class="radar-icon-button radar-drawer-close" aria-label={$t('radar.closePreview')} onclick={close}>
          <RadarIcon name="close" size={18} />
        </button>
      </div>

      {#if $radarArticlePreviewPhase === 'loading'}
        <div class="radar-drawer-loading" role="status">
          <span class="radar-drawer-loading-block"></span>
          <span class="radar-drawer-loading-line"></span>
          <span class="radar-drawer-loading-line is-short"></span>
          <p>{$t('radar.previewLoading')}</p>
        </div>
      {:else if $radarArticlePreviewPhase === 'error' || !$radarArticlePreview}
        <div class="radar-drawer-empty" role="alert">
          <p>{$t('radar.previewError')}</p>
          <button type="button" class="radar-button" onclick={close}>{$t('radar.closePreview')}</button>
        </div>
      {:else}
        <RadarArticleCover
          image={$radarArticlePreview.image}
          category={$radarArticlePreview.category}
          variant="lead"
        />

        <div class="radar-drawer-body">
          <div class="radar-drawer-meta">
            <span>{publishedLabel}</span>
            {#if $radarArticlePreview.author}<span aria-hidden="true">•</span><span>{$radarArticlePreview.author}</span>{/if}
            {#if $radarArticlePreview.cacheState === 'stale'}<span class="radar-badge">{$t('radar.stale')}</span>{/if}
          </div>

          <h2 id="radar-drawer-title">{$radarArticlePreview.title}</h2>

          {#if $radarArticlePreview.summary}
            <p class="radar-drawer-summary">{$radarArticlePreview.summary}</p>
          {/if}

          {#if $radarArticlePreview.tags.length}
            <ul class="radar-drawer-tags">
              {#each $radarArticlePreview.tags as tag}<li>{tag}</li>{/each}
            </ul>
          {/if}

          {#if $radarArticlePreview.related.length}
            <div class="radar-subsection radar-drawer-related-section">
              <div class="radar-subsection-heading">
                <span>{$t('radar.relatedArticles')}</span>
                <span class="radar-subsection-line" aria-hidden="true"></span>
              </div>
              <ul class="radar-drawer-related">
                {#each $radarArticlePreview.related as related (related.id)}
                  <li>
                    <button type="button" onclick={() => openRadarArticlePreview(related.id)}>
                      <span>{related.title}</span>
                      <small>{related.sourceName}</small>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>

        <div class="radar-drawer-footer">
          <p class="radar-drawer-attribution">{$radarArticlePreview.sourceAttribution}</p>
          {#if $radarArticlePreview.canOpenExternally}
            <button type="button" class="radar-button radar-drawer-open" onclick={openExternally} disabled={opening}>
              <span>{$t('radar.openInBrowser')}</span>
              <RadarIcon name="external" size={15} />
            </button>
          {:else}
            <p class="radar-drawer-status">{$t('radar.openUnavailable')}</p>
          {/if}
          {#if openFailed}<span class="radar-inline-error" role="alert">{$t('radar.openArticleError')}</span>{/if}
        </div>
      {/if}
    </aside>
  </div>
{/if}
