<script lang="ts">
  import type { RadarSection, RadarWeather } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { t } from '../../i18n/index.js';
  import { formatRadarLocationLabel, weatherCodeToMessageKey } from '../../utils/radar.js';
  import { openRadarAttribution } from '../../services/radar.js';
  import RadarHourlyList from './RadarHourlyList.svelte';
  import RadarState from './RadarState.svelte';
  import RadarSkeleton from './RadarSkeleton.svelte';

  let { section, loading = false, hasLocation = false, onchoose = () => {} } = $props<{
    section: RadarSection<RadarWeather> | null;
    loading?: boolean;
    hasLocation?: boolean;
    onchoose?: () => void;
  }>();

  const metric = (value: number | null, suffix: string) => value == null ? '—' : `${Math.round(value)}${suffix}`;
  let attributionError = $state(false);

  async function openAttribution() {
    attributionError = false;
    try {
      // A URL de atribuição é resolvida no backend a partir do ID do provider.
      await openRadarAttribution(section?.data?.providerId ?? 'open-meteo');
    } catch {
      attributionError = true;
    }
  }
</script>

<section class="radar-card radar-weather-card" aria-labelledby="radar-weather-title">
  <div class="radar-card-heading">
    <div>
      <p class="radar-eyebrow">{$t('radar.weather')}</p>
      <h2 id="radar-weather-title">{section?.data ? formatRadarLocationLabel(section.data.location) : $t('radar.location')}</h2>
    </div>
    {#if section?.state === 'stale'}<span class="radar-badge">{$t('radar.stale')}</span>{/if}
  </div>

  {#if loading && !section?.data}
    <RadarSkeleton />
  {:else if !hasLocation}
    <RadarState title={$t('radar.locationRequiredTitle')} body={$t('radar.locationRequiredBody')} actionLabel={$t('radar.changeLocation')} onaction={onchoose} />
  {:else if !section?.data}
    <RadarState title={$t('radar.weatherUnavailable')} />
  {:else}
    <div class="radar-weather-current">
      <strong>{Math.round(section.data.current.temperatureCelsius)} °C</strong>
      <span>{$t(weatherCodeToMessageKey(section.data.current.weatherCode) as MessageKey)}</span>
    </div>
    <dl class="radar-metrics">
      <div><dt>{$t('radar.feelsLike')}</dt><dd>{metric(section.data.current.apparentTemperatureCelsius, ' °C')}</dd></div>
      <div><dt>{$t('radar.humidity')}</dt><dd>{metric(section.data.current.humidityPercent, '%')}</dd></div>
      <div><dt>{$t('radar.precipitation')}</dt><dd>{metric(section.data.current.precipitationProbabilityPercent, '%')}</dd></div>
      <div><dt>{$t('radar.wind')}</dt><dd>{metric(section.data.current.windSpeedKmh, ' km/h')}</dd></div>
      <div><dt>{$t('radar.minimum')}</dt><dd>{metric(section.data.today.minimumCelsius, ' °C')}</dd></div>
      <div><dt>{$t('radar.maximum')}</dt><dd>{metric(section.data.today.maximumCelsius, ' °C')}</dd></div>
    </dl>

    {#if section.data.alerts.length}
      <div class="radar-subsection">
        <h3>{$t('radar.alerts')}</h3>
        <ul class="radar-alert-list">
          {#each section.data.alerts as alert (alert.id)}
            <li class={`radar-alert is-${alert.severity}`}>
              <span>{$t(`radar.alert.${alert.kind}` as MessageKey)} · {alert.measuredValue}</span>
              <!-- Rótulo obrigatório: o Radar não emite alerta oficial. -->
              <span class="radar-alert-estimate">{$t('radar.estimateBadge')}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="radar-subsection">
      <h3>{$t('radar.nextHours')}</h3>
      <RadarHourlyList hours={section.data.hourly} />
    </div>

    {#if section.data.daily.length > 1}
      <div class="radar-subsection">
        <h3>{$t('radar.sevenDays')}</h3>
        <ul class="radar-daily-list">
          {#each section.data.daily as day (day.date)}
            <li>
              <span class="radar-daily-date">{day.date.slice(8, 10)}/{day.date.slice(5, 7)}</span>
              <span class="radar-daily-code">{$t(weatherCodeToMessageKey(day.weatherCode) as MessageKey)}</span>
              <span class="radar-daily-range">
                {Math.round(day.minimumCelsius)}° / {Math.round(day.maximumCelsius)}°
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}

  <button class="radar-attribution" type="button" onclick={openAttribution}>
    {$t('radar.attributionWeather')} ↗
  </button>
  {#if attributionError}<span class="radar-inline-error" role="status">{$t('radar.openArticleError')}</span>{/if}
</section>
