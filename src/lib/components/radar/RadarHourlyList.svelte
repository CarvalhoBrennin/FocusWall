<script lang="ts">
  import type { RadarWeatherHour } from '../../types/radar.js';
  import { t } from '../../i18n/index.js';
  let { hours = [] } = $props<{ hours: RadarWeatherHour[] }>();
  const hourLabel = (value: string) => /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(value)?.[1] ?? '—';
</script>

{#if hours.length}
  <div class="radar-hourly" aria-label={$t('radar.nextHours')}>
    {#each hours.slice(0, 6) as hour, index (`${hour.localTime}-${index}`)}
      <div class="radar-hour">
        <strong>{hourLabel(hour.localTime)}</strong>
        <span>{Math.round(hour.temperatureCelsius)} °C</span>
        <small>{hour.precipitationProbabilityPercent == null ? '—' : `${Math.round(hour.precipitationProbabilityPercent)}%`}</small>
      </div>
    {/each}
  </div>
{/if}
