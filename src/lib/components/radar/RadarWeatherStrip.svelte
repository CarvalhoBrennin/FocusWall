<script lang="ts">
  import type { RadarSection, RadarWeather } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { t } from '../../i18n/index.js';
  import { formatRadarLocationLabel, weatherCodeToMessageKey } from '../../utils/radar.js';
  import { openRadarAttribution } from '../../services/radar.js';
  import RadarHourlyList from './RadarHourlyList.svelte';
  import RadarState from './RadarState.svelte';
  import RadarSkeleton from './RadarSkeleton.svelte';
  import RadarIcon from './RadarIcon.svelte';
  import RadarWeatherGlyph from './RadarWeatherGlyph.svelte';

  let { section, loading = false, hasLocation = false, onchoose = () => {} } = $props<{
    section: RadarSection<RadarWeather> | null;
    loading?: boolean;
    hasLocation?: boolean;
    onchoose?: () => void;
  }>();

  const metric = (value: number | null | undefined, suffix: string) =>
    value == null ? '—' : `${Math.round(value)}${suffix}`;
  const clock = (value: string | null | undefined) =>
    (value == null ? null : /T(\d{2}:\d{2})/.exec(value)?.[1]) ?? '—';

  let weather = $derived(section?.data ?? null);
  let attributionError = $state(false);

  async function openAttribution() {
    attributionError = false;
    try {
      await openRadarAttribution(weather?.providerId ?? 'open-meteo');
    } catch {
      attributionError = true;
    }
  }
</script>

<section class="radar-weather" aria-labelledby="radar-weather-title">
  <div class="radar-section-header radar-weather-header">
    <div class="radar-section-heading">
      <span class="radar-section-index" aria-hidden="true">01</span>
      <div>
        <span class="radar-section-eyebrow">{$t('radar.weather')}</span>
        <h2 id="radar-weather-title">
          {weather ? formatRadarLocationLabel(weather.location) : $t('radar.weather')}
        </h2>
      </div>
    </div>
    <button class="radar-attribution" type="button" onclick={openAttribution}>
      <span>{$t('radar.attributionWeather')}</span>
      <RadarIcon name="external" size={13} />
    </button>
  </div>

  {#if loading && !weather}
    <RadarSkeleton variant="weather" />
  {:else if !hasLocation}
    <RadarState
      title={$t('radar.locationRequiredTitle')}
      body={$t('radar.locationRequiredBody')}
      actionLabel={$t('radar.changeLocation')}
      onaction={onchoose}
      icon="location"
    />
  {:else if !weather}
    <RadarState title={$t('radar.weatherUnavailable')} />
  {:else}
    <div class="radar-weather-overview">
      <div class="radar-weather-hero">
        <div class="radar-weather-visual">
          <RadarWeatherGlyph code={weather.current.weatherCode} size={86} />
        </div>
        <div class="radar-weather-temperature">
          <strong class="radar-num">{Math.round(weather.current.temperatureCelsius)}<sup>°</sup></strong>
          <div class="radar-weather-condition">
            <span>{$t(weatherCodeToMessageKey(weather.current.weatherCode) as MessageKey)}</span>
            <small class="radar-num">
              {$t('radar.feelsLike')} {metric(weather.current.apparentTemperatureCelsius, '°')}
            </small>
          </div>
        </div>
        <div class="radar-weather-range">
          <span><small>{$t('radar.minimum')}</small><b class="radar-num">{metric(weather.today.minimumCelsius, '°')}</b></span>
          <span><small>{$t('radar.maximum')}</small><b class="radar-num">{metric(weather.today.maximumCelsius, '°')}</b></span>
        </div>
        {#if section?.state === 'stale'}<span class="radar-badge">{$t('radar.stale')}</span>{/if}
      </div>

      <dl class="radar-weather-metrics">
        <div class="radar-metric"><dt><RadarIcon name="humidity" size={17} /><span>{$t('radar.humidity')}</span></dt><dd class="radar-num">{metric(weather.current.humidityPercent, '%')}</dd></div>
        <div class="radar-metric"><dt><RadarIcon name="rain" size={17} /><span>{$t('radar.precipitation')}</span></dt><dd class="radar-num">{metric(weather.current.precipitationProbabilityPercent, '%')}</dd></div>
        <div class="radar-metric"><dt><RadarIcon name="wind" size={17} /><span>{$t('radar.wind')}</span></dt><dd class="radar-num">{metric(weather.current.windSpeedKmh, ' km/h')}</dd></div>
        <div class="radar-metric"><dt><RadarIcon name="gust" size={17} /><span>{$t('radar.gusts')}</span></dt><dd class="radar-num">{metric(weather.current.windGustsKmh, ' km/h')}</dd></div>
        <div class="radar-metric"><dt><RadarIcon name="uv" size={17} /><span>{$t('radar.uvIndex')}</span></dt><dd class="radar-num">{metric(weather.today.uvIndexMax, '')}</dd></div>
        <div class="radar-metric"><dt><RadarIcon name="pressure" size={17} /><span>{$t('radar.pressure')}</span></dt><dd class="radar-num">{metric(weather.current.surfacePressureHpa, ' hPa')}</dd></div>
        <div class="radar-metric"><dt><RadarIcon name="sunrise" size={17} /><span>{$t('radar.sunrise')}</span></dt><dd class="radar-num">{clock(weather.today.sunriseLocal)}</dd></div>
        <div class="radar-metric"><dt><RadarIcon name="sunset" size={17} /><span>{$t('radar.sunset')}</span></dt><dd class="radar-num">{clock(weather.today.sunsetLocal)}</dd></div>
      </dl>
    </div>

    {#if weather.alerts.length}
      <ul class="radar-alert-list" aria-label={$t('radar.alerts')}>
        {#each weather.alerts as alert (alert.id)}
          <li class={`radar-alert is-${alert.severity}`}>
            <span class="radar-alert-marker" aria-hidden="true"></span>
            <span class="radar-alert-copy">
              <strong>{$t(`radar.alert.${alert.kind}` as MessageKey)}</strong>
              <small>{alert.measuredValue}{#if alert.windowLocal} · {alert.windowLocal}{/if}</small>
            </span>
            <span class="radar-alert-estimate">{$t('radar.estimateBadge')}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="radar-hourly-section">
      <div class="radar-subsection-heading">
        <span>{$t('radar.nextHours')}</span>
        <span class="radar-subsection-line" aria-hidden="true"></span>
      </div>
      <RadarHourlyList hours={weather.hourly} />
    </div>

    {#if weather.daily.length > 1}
      <details class="radar-daily-forecast">
        <summary>
          <span>{$t('radar.sevenDays')}</span>
          <RadarIcon name="chevron" size={14} />
        </summary>
        <ul class="radar-daily-list">
          {#each weather.daily as day (day.date)}
            <li>
              <span class="radar-daily-date radar-num">{day.date.slice(8, 10)}/{day.date.slice(5, 7)}</span>
              <RadarWeatherGlyph code={day.weatherCode} size={30} />
              <span class="radar-daily-code">{$t(weatherCodeToMessageKey(day.weatherCode) as MessageKey)}</span>
              <span class="radar-daily-rain radar-num">{metric(day.precipitationProbabilityPercent, '%')}</span>
              <span class="radar-daily-range radar-num">{Math.round(day.minimumCelsius)}° <b>{Math.round(day.maximumCelsius)}°</b></span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}

  {#if attributionError}<span class="radar-inline-error" role="status">{$t('radar.openArticleError')}</span>{/if}
</section>
