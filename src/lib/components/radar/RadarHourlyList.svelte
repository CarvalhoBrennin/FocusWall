<script lang="ts">
  import type { RadarWeatherHour } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { formatMessage, t } from '../../i18n/index.js';
  import { weatherCodeToMessageKey } from '../../utils/radar.js';
  import RadarWeatherGlyph from './RadarWeatherGlyph.svelte';

  let { hours = [] } = $props<{ hours: RadarWeatherHour[] }>();
  const hourLabel = (value: string) => /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(value)?.[1] ?? '—';

  const hourAriaLabel = (hour: RadarWeatherHour) => formatMessage($t('radar.hourlyA11y'), {
    time: hourLabel(hour.localTime),
    temperature: `${Math.round(hour.temperatureCelsius)}°C`,
    condition: $t(weatherCodeToMessageKey(hour.weatherCode) as MessageKey),
    precipitation: hour.precipitationProbabilityPercent == null
      ? '—'
      : `${Math.round(hour.precipitationProbabilityPercent)}%`
  });
</script>

{#if hours.length}
  <ul class="radar-hourly" aria-label={$t('radar.nextHours')}>
    {#each hours.slice(0, 12) as hour, index (`${hour.localTime}-${index}`)}
      <li class="radar-hour" class:is-now={hour.isCurrentHour} aria-label={hourAriaLabel(hour)}>
        <span class="radar-hour-time radar-num">{hour.isCurrentHour ? $t('radar.relative.now') : hourLabel(hour.localTime)}</span>
        <RadarWeatherGlyph code={hour.weatherCode} size={28} />
        <strong class="radar-hour-temp radar-num">{Math.round(hour.temperatureCelsius)}°</strong>
        <span class="radar-hour-condition">{$t(weatherCodeToMessageKey(hour.weatherCode) as MessageKey)}</span>
        <small class="radar-hour-rain radar-num">{hour.precipitationProbabilityPercent == null ? '—' : `${Math.round(hour.precipitationProbabilityPercent)}%`}</small>
      </li>
    {/each}
  </ul>
{/if}
