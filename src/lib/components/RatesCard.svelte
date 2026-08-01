<script>
  import { get } from 'svelte/store';
  import {
    ratesCache,
    ratesStatus,
    ratesMeta,
    prevRates,
    ratesBaseline
  } from '../stores/app-store.js';
  import { formatters, RATE_STATUS, CONFIG } from '../config.js';
  import { getBrazilDateKey } from '../utils/state.js';
  import { t, formatMessage } from '../i18n/index.js';

  let pctFmt;
  try {
    pctFmt = new Intl.NumberFormat(CONFIG.LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'exceptZero'
    });
  } catch {
    pctFmt = {
      format: (n) => {
        if (n == null || !Number.isFinite(n)) return '';
        const s = n >= 0 ? '+' : '';
        return s + n.toFixed(2).replace('.', ',');
      }
    };
  }

  $: statusText =
    $ratesStatus === RATE_STATUS.LIVE
      ? $t('rates.status.live')
      : $ratesStatus === RATE_STATUS.CACHED
        ? $t('rates.status.cached')
        : $ratesStatus === RATE_STATUS.UNAVAILABLE
          ? $t('rates.status.unavailable')
          : $t('rates.status.updating');

  $: statusClass =
    $ratesStatus === RATE_STATUS.LIVE
      ? 'status-live'
      : $ratesStatus === RATE_STATUS.CACHED
        ? 'status-cached'
        : $ratesStatus === RATE_STATUS.UNAVAILABLE
          ? 'status-unavailable'
          : 'status-updating';

  $: todayBR = getBrazilDateKey(new Date());

  $: usdRefreshDelta =
    $ratesCache && $prevRates.usd != null ? $ratesCache.usd - $prevRates.usd : null;
  $: eurRefreshDelta =
    $ratesCache && $prevRates.eur != null ? $ratesCache.eur - $prevRates.eur : null;

  $: bl = $ratesBaseline;
  $: rc = $ratesCache;

  $: usdPrimary = (() => {
    if (!rc || rc.usd == null || !Number.isFinite(rc.usd)) return null;
    if (rc.usdPctChange != null && Number.isFinite(rc.usdPctChange)) {
      return {
        delta: rc.usdVarBid,
        pct: rc.usdPctChange,
        suffix: 'rates.inDay',
        source: 'api'
      };
    }
    if (bl?.dayKey === todayBR && Number.isFinite(bl.usd) && Number.isFinite(rc.usd)) {
      const d = rc.usd - bl.usd;
      const p = Math.abs(bl.usd) > 1e-9 ? (d / bl.usd) * 100 : null;
      return {
        delta: d,
        pct: p,
        suffix: 'rates.sinceOpen',
        source: 'baseline',
        beforeVal: bl.usd
      };
    }
    if (usdRefreshDelta != null) {
      const p =
        $prevRates.usd != null && Math.abs($prevRates.usd) > 1e-9
          ? (usdRefreshDelta / $prevRates.usd) * 100
          : null;
      return {
        delta: usdRefreshDelta,
        pct: p,
        suffix: 'rates.sinceRefresh',
        source: 'refresh',
        beforeVal: $prevRates.usd
      };
    }
    return null;
  })();

  $: eurPrimary = (() => {
    if (!rc || rc.eur == null || !Number.isFinite(rc.eur)) return null;
    if (rc.eurPctChange != null && Number.isFinite(rc.eurPctChange)) {
      return {
        delta: rc.eurVarBid,
        pct: rc.eurPctChange,
        suffix: 'rates.inDay',
        source: 'api'
      };
    }
    if (bl?.dayKey === todayBR && Number.isFinite(bl.eur) && Number.isFinite(rc.eur)) {
      const d = rc.eur - bl.eur;
      const p = Math.abs(bl.eur) > 1e-9 ? (d / bl.eur) * 100 : null;
      return {
        delta: d,
        pct: p,
        suffix: 'rates.sinceOpen',
        source: 'baseline',
        beforeVal: bl.eur
      };
    }
    if (eurRefreshDelta != null) {
      const p =
        $prevRates.eur != null && Math.abs($prevRates.eur) > 1e-9
          ? (eurRefreshDelta / $prevRates.eur) * 100
          : null;
      return {
        delta: eurRefreshDelta,
        pct: p,
        suffix: 'rates.sinceRefresh',
        source: 'refresh',
        beforeVal: $prevRates.eur
      };
    }
    return null;
  })();

  $: usdGold =
    rc?.usd != null && rc.usd <= CONFIG.RATE_GOLD_USD_AT_OR_BELOW;
  $: eurGold =
    rc?.eur != null && rc.eur < CONFIG.RATE_GOLD_EUR_BELOW;

  function primaryLabel(p, translate = get(t)) {
    if (!p) return '--';
    const eps = 0.0001;
    if (Math.abs(p.delta ?? 0) < eps && (p.pct == null || Math.abs(p.pct) < 0.001)) {
      return translate('rates.stable') + ' · ' + translate(p.suffix);
    }
    const money =
      p.delta != null && Number.isFinite(p.delta)
        ? (p.delta > 0 ? '+' : '-') + 'R$ ' + formatters.rateNumber.format(Math.abs(p.delta))
        : '';
    const pctStr =
      p.pct != null && Number.isFinite(p.pct) ? pctFmt.format(p.pct) + '%' : '';
    const parts = [money, pctStr].filter(Boolean);
    return (parts.length ? parts.join(' · ') : '--') + ' · ' + translate(p.suffix);
  }

  function isUp(p) {
    if (!p) return false;
    if (p.pct != null && Number.isFinite(p.pct)) return p.pct > 0.001;
    return p.delta != null && p.delta > 0.0001;
  }
  function isDown(p) {
    if (!p) return false;
    if (p.pct != null && Number.isFinite(p.pct)) return p.pct < -0.001;
    return p.delta != null && p.delta < -0.0001;
  }
  function isFlat(p) {
    if (!p) return true;
    return !isUp(p) && !isDown(p);
  }

  function movementLabel(p, translate = get(t)) {
    if (isUp(p)) return translate('rates.movement.up');
    if (isDown(p)) return translate('rates.movement.down');
    return translate('rates.movement.flat');
  }

  $: usdDeltaText = primaryLabel(usdPrimary, $t);
  $: eurDeltaText = primaryLabel(eurPrimary, $t);
  $: usdMovementText = movementLabel(usdPrimary, $t);
  $: eurMovementText = movementLabel(eurPrimary, $t);

  function movementClass(p) {
    return isUp(p) ? 'is-up' : isDown(p) ? 'is-down' : 'is-flat';
  }

  function sparklinePoints(current, primary) {
    const fallback = '0,32 50,32 100,32 150,32 200,32';
    if (current == null || !Number.isFinite(current)) return fallback;

    const before =
      primary?.beforeVal != null && Number.isFinite(primary.beforeVal)
        ? primary.beforeVal
        : primary?.delta != null && Number.isFinite(primary.delta)
          ? current - primary.delta
          : current;

    const delta = current - before;
    const wave = Math.max(Math.abs(delta) * 0.22, current * 0.0014);
    const values = [
      before,
      before + delta * 0.22 + wave * 0.2,
      before + delta * 0.48 - wave * 0.12,
      before + delta * 0.76 + wave * 0.1,
      current
    ];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, current * 0.0022, 0.001);

    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * 200;
        const normalized = (value - min) / range;
        const y = 44 - normalized * 28;
        return `${x},${y.toFixed(2)}`;
      })
      .join(' ');
  }
</script>

<section class="rates-card" aria-labelledby="rates-title">
  <div class="section-heading section-heading--rates">
    <h3 id="rates-title" class="section-title section-title--rates">{$t('rates.title')}</h3>
    <span class={`status-pill ${statusClass}`} aria-live="polite">{statusText}</span>
  </div>

  <div class="rate-list" role="list" aria-label={$t('rates.listLabel')}>
    <div
      class="rate-row"
      class:rate-row--gold={usdGold}
      class:rate-row--up={isUp(usdPrimary)}
      class:rate-row--down={isDown(usdPrimary)}
      class:rate-row--flat={isFlat(usdPrimary)}
      role="listitem"
      aria-label={`USD-BRL, ${usdMovementText}`}
    >
      <div class="rate-row-top">
        <span class="rate-market">USD-BRL</span>
        <strong class="rate-value" class:rate-value--gold={usdGold}>
          <span class="rate-symbol">R$</span>
          <span class="rate-number">
            {rc?.usd != null ? formatters.rateNumber.format(rc.usd) : '--'}
          </span>
        </strong>
        <span
          class="rate-delta"
          class:rate-up={isUp(usdPrimary)}
          class:rate-down={isDown(usdPrimary)}
          class:rate-flat={isFlat(usdPrimary)}
        >
          {usdDeltaText}
        </span>
        {#if usdPrimary?.beforeVal != null && usdPrimary?.delta != null && Math.abs(usdPrimary.delta) > 0.0001}
          <span class="rate-before" aria-label={$t('rates.previousQuote')}>
            {formatMessage($t('rates.before'), { value: formatters.rateNumber.format(usdPrimary.beforeVal) })}
          </span>
        {/if}
      </div>
      <div class="rate-sparkline" aria-hidden="true">
        <svg viewBox="0 0 200 48" preserveAspectRatio="none">
          <polyline
            class={`sparkline-trace ${movementClass(usdPrimary)}`}
            points={sparklinePoints(rc?.usd, usdPrimary)}
          />
        </svg>
      </div>
    </div>

    <div
      class="rate-row"
      class:rate-row--gold={eurGold}
      class:rate-row--up={isUp(eurPrimary)}
      class:rate-row--down={isDown(eurPrimary)}
      class:rate-row--flat={isFlat(eurPrimary)}
      role="listitem"
      aria-label={`EUR-BRL, ${eurMovementText}`}
    >
      <div class="rate-row-top">
        <span class="rate-market">EUR-BRL</span>
        <strong class="rate-value" class:rate-value--gold={eurGold}>
          <span class="rate-symbol">R$</span>
          <span class="rate-number">
            {rc?.eur != null ? formatters.rateNumber.format(rc.eur) : '--'}
          </span>
        </strong>
        <span
          class="rate-delta"
          class:rate-up={isUp(eurPrimary)}
          class:rate-down={isDown(eurPrimary)}
          class:rate-flat={isFlat(eurPrimary)}
        >
          {eurDeltaText}
        </span>
        {#if eurPrimary?.beforeVal != null && eurPrimary?.delta != null && Math.abs(eurPrimary.delta) > 0.0001}
          <span class="rate-before" aria-label={$t('rates.previousQuote')}>
            {formatMessage($t('rates.before'), { value: formatters.rateNumber.format(eurPrimary.beforeVal) })}
          </span>
        {/if}
      </div>
      <div class="rate-sparkline" aria-hidden="true">
        <svg viewBox="0 0 200 48" preserveAspectRatio="none">
          <polyline
            class={`sparkline-trace ${movementClass(eurPrimary)}`}
            points={sparklinePoints(rc?.eur, eurPrimary)}
          />
        </svg>
      </div>
    </div>
  </div>

  <p class="meta-text meta-text--rates">{$ratesMeta}</p>
</section>
