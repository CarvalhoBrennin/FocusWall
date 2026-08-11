<script lang="ts">
  import type { RadarWeatherHour } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { formatMessage, t } from '../../i18n/index.js';
  import { weatherCodeToMessageKey } from '../../utils/radar.js';
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
  <!-- Faixa horizontal: rola dentro de si mesma, nunca empurra a largura do painel. -->
  <ul class="radar-hourly" aria-label={$t('radar.nextHours')}>
    {#each hours.slice(0, 6) as hour, index (`${hour.localTime}-${index}`)}
      <li class="radar-hour" class:is-now={hour.isCurrentHour} aria-label={hourAriaLabel(hour)}>
        <strong class="radar-num">{hourLabel(hour.localTime)}</strong>
        <span class="radar-num">{Math.round(hour.temperatureCelsius)}°</span>
        <span class="radar-hour-condition">{$t(weatherCodeToMessageKey(hour.weatherCode) as MessageKey)}</span>
        <small class="radar-num">
          {hour.precipitationProbabilityPercent == null ? '—' : `${Math.round(hour.precipitationProbabilityPercent)}%`}
        </small>
      </li>
    {/each}
  </ul>
{/if}
