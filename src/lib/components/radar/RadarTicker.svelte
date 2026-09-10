<script lang="ts">
  import type { RadarSection, RadarTickerItem } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { locale, t } from '../../i18n/index.js';

  let { section } = $props<{ section: RadarSection<RadarTickerItem[]> | null }>();
  let items = $derived(section?.data ?? []);

  function variationLabel(value: number): string {
    return `${new Intl.NumberFormat($locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'always'
    }).format(value)}%`;
  }

  function observedLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat($locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  }
</script>

{#if items.length}
  <div class="radar-ticker" role="region" aria-label={$t('radar.ticker')}>
    <div class="radar-ticker-heading" aria-hidden="true">
      <span class="radar-ticker-pulse"></span>
      <span>{$t('radar.ticker')}</span>
    </div>
    <ul>
      {#each items as item (item.id)}
        <li class:is-stale={item.cacheState === 'stale'}>
          <span class="radar-ticker-tag">{$t(`radar.quote.${item.quoteKind}` as MessageKey)}</span>
          <span class="radar-ticker-label">{item.label}</span>
          <b class="radar-num">{item.value}</b>
          {#if item.variation != null}
            <span class={`radar-ticker-variation ${item.variation >= 0 ? 'radar-up' : 'radar-down'}`}>
              <span aria-hidden="true">{item.variation >= 0 ? '▲' : '▼'}</span>
              <span class="radar-num">{variationLabel(item.variation)}</span>
            </span>
          {/if}
          <span class="radar-ticker-detail" title={item.providerName}>{item.detail ?? observedLabel(item.observedAt)}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}
