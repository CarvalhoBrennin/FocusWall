<script lang="ts">
  import type { RadarWeatherHour } from '../../types/radar.js';
  import { t } from '../../i18n/index.js';
  let { hours = [] } = $props<{ hours: RadarWeatherHour[] }>();
  const hourLabel = (value: string) => /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(value)?.[1] ?? '—';
</script>

{#if hours.length}
  <!-- Faixa horizontal: rola dentro de si mesma, nunca empurra a largura do painel. -->
  <div class="radar-hourly" aria-label={$t('radar.nextHours')}>
    {#each hours.slice(0, 6) as hour, index (`${hour.localTime}-${index}`)}
      <div class="radar-hour" class:is-now={hour.isCurrentHour}>
        <strong class="radar-num">{hourLabel(hour.localTime)}</strong>
        <span class="radar-num">{Math.round(hour.temperatureCelsius)}°</span>
        <small class="radar-num">
          {hour.precipitationProbabilityPercent == null ? '—' : `${Math.round(hour.precipitationProbabilityPercent)}%`}
        </small>
      </div>
    {/each}
  </div>
{/if}
