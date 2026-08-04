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

  const metric = (value: number | null | undefined, suffix: string) =>
    value == null ? '—' : `${Math.round(value)}${suffix}`;
  /** `sunriseLocal`/`sunsetLocal` chegam como hora local ISO; só a hora importa. */
  const clock = (value: string | null | undefined) =>
    (value == null ? null : /T(\d{2}:\d{2})/.exec(value)?.[1]) ?? '—';

  let weather = $derived(section?.data ?? null);
  let attributionError = $state(false);

  async function openAttribution() {
    attributionError = false;
    try {
      // A URL de atribuição é resolvida no backend a partir do ID do provider.
      await openRadarAttribution(weather?.providerId ?? 'open-meteo');
    } catch {
      attributionError = true;
    }
  }
</script>

<section class="radar-wx" aria-labelledby="radar-weather-title">
  <h2 id="radar-weather-title" class="sr-only">
    {weather ? formatRadarLocationLabel(weather.location) : $t('radar.weather')}
  </h2>

  {#if loading && !weather}
    <RadarSkeleton />
  {:else if !hasLocation}
    <RadarState
      title={$t('radar.locationRequiredTitle')}
      body={$t('radar.locationRequiredBody')}
      actionLabel={$t('radar.changeLocation')}
      onaction={onchoose}
    />
  {:else if !weather}
    <RadarState title={$t('radar.weatherUnavailable')} />
  {:else}
    <div class="radar-wx-main">
      <div class="radar-wx-now">
        <strong class="radar-num">{Math.round(weather.current.temperatureCelsius)}°</strong>
        <div>
          <em>{$t(weatherCodeToMessageKey(weather.current.weatherCode) as MessageKey)}</em>
          <span class="radar-num">
            {$t('radar.feelsLike')} {metric(weather.current.apparentTemperatureCelsius, '°')}
            <span aria-hidden="true">·</span>
            {metric(weather.today.minimumCelsius, '°')} / {metric(weather.today.maximumCelsius, '°')}
          </span>
          {#if section?.state === 'stale'}<span class="radar-badge">{$t('radar.stale')}</span>{/if}
        </div>
      </div>

      <dl class="radar-wx-metrics">
        <div><dt>{$t('radar.humidity')}</dt><dd class="radar-num">{metric(weather.current.humidityPercent, '%')}</dd></div>
        <div><dt>{$t('radar.precipitation')}</dt><dd class="radar-num">{metric(weather.current.precipitationProbabilityPercent, '%')}</dd></div>
        <div><dt>{$t('radar.wind')}</dt><dd class="radar-num">{metric(weather.current.windSpeedKmh, ' km/h')}</dd></div>
        <div><dt>{$t('radar.gusts')}</dt><dd class="radar-num">{metric(weather.current.windGustsKmh, ' km/h')}</dd></div>
        <div><dt>{$t('radar.uvIndex')}</dt><dd class="radar-num">{metric(weather.today.uvIndexMax, '')}</dd></div>
        <div><dt>{$t('radar.pressure')}</dt><dd class="radar-num">{metric(weather.current.surfacePressureHpa, ' hPa')}</dd></div>
        <div><dt>{$t('radar.sunrise')}</dt><dd class="radar-num">{clock(weather.today.sunriseLocal)}</dd></div>
        <div><dt>{$t('radar.sunset')}</dt><dd class="radar-num">{clock(weather.today.sunsetLocal)}</dd></div>
      </dl>

      <RadarHourlyList hours={weather.hourly} />
    </div>

    {#if weather.alerts.length}
      <ul class="radar-alert-list">
        {#each weather.alerts as alert (alert.id)}
          <li class={`radar-alert is-${alert.severity}`}>
            <span>{$t(`radar.alert.${alert.kind}` as MessageKey)} · {alert.measuredValue}</span>
            <!-- Rótulo obrigatório: o Radar não emite alerta oficial. -->
            <span class="radar-alert-estimate">{$t('radar.estimateBadge')}</span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if weather.daily.length > 1}
      <details class="radar-wx-days">
        <summary>{$t('radar.sevenDays')}</summary>
        <ul class="radar-daily-list">
          {#each weather.daily as day (day.date)}
            <li>
              <span class="radar-daily-date radar-num">{day.date.slice(8, 10)}/{day.date.slice(5, 7)}</span>
              <span class="radar-daily-code">{$t(weatherCodeToMessageKey(day.weatherCode) as MessageKey)}</span>
              <span class="radar-daily-range radar-num">
                {Math.round(day.minimumCelsius)}° / {Math.round(day.maximumCelsius)}°
              </span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}

  <button class="radar-attribution" type="button" onclick={openAttribution}>
    {$t('radar.attributionWeather')} ↗
  </button>
  {#if attributionError}<span class="radar-inline-error" role="status">{$t('radar.openArticleError')}</span>{/if}
</section>
