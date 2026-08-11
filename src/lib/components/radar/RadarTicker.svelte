<script lang="ts">
  import type { RadarSection, RadarTickerItem } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { locale, t } from '../../i18n/index.js';

  let { section } = $props<{ section: RadarSection<RadarTickerItem[]> | null }>();

  let items = $derived(section?.data ?? []);

  /**
   * A variação é opcional no contrato e hoje o backend não a calcula para PTAX
   * (a janela do Banco Central não permite comparação honesta). Quando vier,
   * o sinal fica no próprio número — a seta é só reforço visual.
   */
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
    <ul>
      {#each items as item (item.id)}
        <li class:is-stale={item.cacheState === 'stale'}>
          <span class="radar-ticker-tag">{$t(`radar.quote.${item.quoteKind}` as MessageKey)}</span>
          <span class="radar-ticker-label">{item.label}</span>
          <b class="radar-num">{item.value}</b>
          <span class="radar-ticker-detail" title={item.providerName}>
            {item.detail ?? observedLabel(item.observedAt)}
          </span>
          {#if item.variation != null}
            <span class={item.variation >= 0 ? 'radar-up' : 'radar-down'}>
              <span aria-hidden="true">{item.variation >= 0 ? '▲' : '▼'}</span>
              <span class="radar-num">{variationLabel(item.variation)}</span>
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}
