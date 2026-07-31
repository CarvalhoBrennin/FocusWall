<script lang="ts">
  import type { RadarPhase } from '../../stores/radar-store.js';
  import type { RadarSnapshot, RadarSnapshotRequest } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { formatMessage, locale, t } from '../../i18n/index.js';
  import { describeRadarRelativeTime, getRadarReferenceFetchedAt } from '../../utils/radar.js';
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
  let referenceFetchedAt = $derived(getRadarReferenceFetchedAt(snapshot));
  let cacheWriteFailed = $derived(Boolean(snapshot?.warnings.includes('cacheWriteFailed')));
  let cacheReadFailed = $derived(Boolean(snapshot?.warnings.includes('cacheReadFailed')));
  let cached = $derived(
    snapshot?.weather.state === 'stale' || snapshot?.news.state === 'stale' ||
    snapshot?.warnings.includes('weatherUsingStaleCache') || snapshot?.warnings.includes('newsUsingStaleCache')
  );

  function relativeLabel(value: string | null): string {
    const relative = describeRadarRelativeTime(value);
    if (!relative) return '—';
    const key = `radar.relative.${relative.unit}` as MessageKey;
    return formatMessage($t(key), { count: relative.count });
  }
</script>

<div class="radar-toolbar" aria-busy={refreshing}>
  <div aria-live="polite" aria-atomic="true">
    <strong>{status}</strong>
    {#if referenceFetchedAt}
      <span>{formatMessage($t(cached ? 'radar.cachedAt' : 'radar.updatedAt'), { time: relativeLabel(referenceFetchedAt) })}</span>
    {/if}
    {#if errorKey}
      <span class="radar-toolbar-error" role="alert">{$t(snapshot ? 'radar.refreshFailedUsingCache' : 'radar.refreshFailedNoData')}</span>
    {:else if cacheWriteFailed}
      <span class="radar-toolbar-error" role="alert">{$t('radar.cacheWriteFailed')}</span>
    {:else if cacheReadFailed}
      <span class="radar-toolbar-error" role="alert">{$t('radar.cacheReadFailed')}</span>
    {:else if cooldown}
      <span>{cooldownTime ? formatMessage($t('radar.refreshCooldownUntil'), { time: cooldownTime }) : $t('radar.refreshCooldown')}</span>
    {/if}
  </div>
  <div class="radar-toolbar-actions">
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
</div>
{#if errorKey}<span id="radar-refresh-error" class="sr-only">{$t(snapshot ? 'radar.refreshFailedUsingCache' : 'radar.refreshFailedNoData')}</span>{/if}

