<script lang="ts">
  import type { RadarPhase } from '../../stores/radar-store.js';
  import type { RadarSnapshot, RadarSnapshotRequest } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { formatMessage, locale, t } from '../../i18n/index.js';
  import {
    describeRadarRelativeTime,
    formatRadarLocationLabel,
    getRadarReferenceFetchedAt
  } from '../../utils/radar.js';
  import { manualRefreshRadar, radarLocationPickerOpen } from '../../stores/radar-store.js';

  let {
    phase,
    snapshot,
    request,
    errorKey = '',
    refreshAvailableAt = null
  } = $props<{
    phase: RadarPhase;
    snapshot: RadarSnapshot | null;
    request: RadarSnapshotRequest;
    errorKey?: MessageKey | '';
    refreshAvailableAt?: string | null;
  }>();

  let refreshing = $derived(phase === 'refreshing' || phase === 'loading');
  let cooldown = $derived(Boolean(refreshAvailableAt));
  let cooldownTime = $derived.by(() => {
    if (!refreshAvailableAt) return null;
    const date = new Date(refreshAvailableAt);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat($locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  });
  let status = $derived(
    phase === 'loading' ? $t('radar.statusLoading') :
    phase === 'refreshing' ? $t('radar.refreshing') :
    phase === 'error' ? $t('radar.statusError') :
    phase === 'stale' ? $t('radar.stale') :
    phase === 'partial' ? $t('radar.partial') : $t('radar.statusReady')
  );
  /** A cor do sinalizador é redundante com o texto: nunca é o único indicador. */
  let tone = $derived(
    phase === 'error' ? 'off' :
    phase === 'stale' || phase === 'partial' ? 'warn' :
    refreshing ? 'busy' : 'ok'
  );
  let referenceFetchedAt = $derived(getRadarReferenceFetchedAt(snapshot));
  let cacheWriteFailed = $derived(Boolean(snapshot?.warnings.includes('cacheWriteFailed')));
  let cacheReadFailed = $derived(Boolean(snapshot?.warnings.includes('cacheReadFailed')));
  let cached = $derived(
    snapshot?.weather.state === 'stale' || snapshot?.news.state === 'stale' ||
    snapshot?.warnings.includes('weatherUsingStaleCache') || snapshot?.warnings.includes('newsUsingStaleCache')
  );
  let locationLabel = $derived(formatRadarLocationLabel(request.location));

  function relativeLabel(value: string | null): string {
    const relative = describeRadarRelativeTime(value);
    if (!relative) return '—';
    const key = `radar.relative.${relative.unit}` as MessageKey;
    return formatMessage($t(key), { count: relative.count });
  }
</script>

<header class="radar-mast" aria-busy={refreshing}>
  <div class="radar-mast-id">
    <b class="radar-mast-brand">RADAR</b>
    <div class="radar-mast-state" aria-live="polite" aria-atomic="true">
      <p class="radar-mast-line">
        <span class={`radar-dot is-${tone}`} aria-hidden="true"></span>
        {#if request.location}<span class="radar-mast-place">{locationLabel}</span>{/if}
        {#if referenceFetchedAt}
          <!-- Com a hora à mostra, o estado só existe na cor do ponto: o leitor de tela precisa dele por extenso. -->
          <span class="sr-only">{status}</span>
          <span class="radar-mast-sep" aria-hidden="true">·</span>
          <span>{formatMessage($t(cached ? 'radar.cachedAt' : 'radar.updatedAt'), { time: relativeLabel(referenceFetchedAt) })}</span>
        {:else}
          <span>{status}</span>
        {/if}
      </p>
      {#if errorKey}
        <p class="radar-mast-error" role="alert">{$t(snapshot ? 'radar.refreshFailedUsingCache' : 'radar.refreshFailedNoData')}</p>
      {:else if cacheWriteFailed}
        <p class="radar-mast-error" role="alert">{$t('radar.cacheWriteFailed')}</p>
      {:else if cacheReadFailed}
        <p class="radar-mast-error" role="alert">{$t('radar.cacheReadFailed')}</p>
      {:else if cooldown}
        <p class="radar-mast-note">{cooldownTime ? formatMessage($t('radar.refreshCooldownUntil'), { time: cooldownTime }) : $t('radar.refreshCooldown')}</p>
      {/if}
    </div>
  </div>

  <div class="radar-mast-actions">
    <button type="button" class="radar-button radar-button--secondary" onclick={() => radarLocationPickerOpen.set(true)}>
      {$t('radar.changeLocation')}
    </button>
    <button
      type="button"
      class="radar-button"
      disabled={refreshing || cooldown}
      aria-describedby={errorKey ? 'radar-refresh-error' : undefined}
      onclick={() => manualRefreshRadar(request)}
    >
      {refreshing ? $t('radar.refreshing') : $t('radar.refresh')}
    </button>
  </div>
</header>
{#if errorKey}<span id="radar-refresh-error" class="sr-only">{$t(snapshot ? 'radar.refreshFailedUsingCache' : 'radar.refreshFailedNoData')}</span>{/if}
