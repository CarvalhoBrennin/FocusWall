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
  import RadarIcon from './RadarIcon.svelte';

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
  <div class="radar-mast-identity">
    <span class="radar-signal-mark" aria-hidden="true">
      <span></span><span></span><span></span>
    </span>
    <div class="radar-mast-title-group">
      <div class="radar-mast-title-line">
        <b class="radar-mast-brand">RADAR</b>
        <span class={`radar-status-pill is-${tone}`} role="status" aria-live="polite">
          <span class="radar-dot" aria-hidden="true"></span>
          {status}
        </span>
      </div>
      <span class="radar-mast-subtitle">{$t('radar.panelLabel')}</span>
    </div>
  </div>

  <div class="radar-mast-context">
    {#if request.location}
      <button
        type="button"
        class="radar-location-chip"
        onclick={() => radarLocationPickerOpen.set(true)}
        aria-label={`${$t('radar.changeLocation')}: ${locationLabel}`}
      >
        <RadarIcon name="location" size={14} />
        <span>{locationLabel}</span>
      </button>
    {:else}
      <button type="button" class="radar-location-chip is-empty" onclick={() => radarLocationPickerOpen.set(true)}>
        <RadarIcon name="location" size={14} />
        <span>{$t('radar.changeLocation')}</span>
      </button>
    {/if}

    <div class="radar-sync-copy">
      {#if referenceFetchedAt}
        <span>{formatMessage($t(cached ? 'radar.cachedAt' : 'radar.updatedAt'), { time: relativeLabel(referenceFetchedAt) })}</span>
      {:else}
        <span>{status}</span>
      {/if}
      {#if errorKey}
        <span class="radar-mast-error" role="alert">{$t(snapshot ? 'radar.refreshFailedUsingCache' : 'radar.refreshFailedNoData')}</span>
      {:else if cacheWriteFailed}
        <span class="radar-mast-error" role="alert">{$t('radar.cacheWriteFailed')}</span>
      {:else if cacheReadFailed}
        <span class="radar-mast-error" role="alert">{$t('radar.cacheReadFailed')}</span>
      {:else if cooldown}
        <span class="radar-mast-note">{cooldownTime ? formatMessage($t('radar.refreshCooldownUntil'), { time: cooldownTime }) : $t('radar.refreshCooldown')}</span>
      {/if}
    </div>
  </div>

  <div class="radar-mast-actions">
    <button
      type="button"
      class="radar-button radar-refresh-button"
      disabled={refreshing || cooldown}
      aria-describedby={errorKey ? 'radar-refresh-error' : undefined}
      onclick={() => manualRefreshRadar(request)}
    >
      <RadarIcon name="refresh" size={15} />
      <span>{refreshing ? $t('radar.refreshing') : $t('radar.refresh')}</span>
    </button>
  </div>
</header>
{#if errorKey}<span id="radar-refresh-error" class="sr-only">{$t(snapshot ? 'radar.refreshFailedUsingCache' : 'radar.refreshFailedNoData')}</span>{/if}
