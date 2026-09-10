<script lang="ts">
  import { weatherCodeToMessageKey } from '../../utils/radar.js';

  let { code, size = 64 } = $props<{ code: number; size?: number }>();

  type WeatherGlyph = 'clear' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';
  let glyph: WeatherGlyph = $derived.by(() => {
    const condition = weatherCodeToMessageKey(code);
    if (condition === 'radar.condition.clear') return 'clear';
    if (condition === 'radar.condition.fog') return 'fog';
    if (condition === 'radar.condition.snow') return 'snow';
    if (condition === 'radar.condition.thunderstorm') return 'storm';
    if (
      condition === 'radar.condition.drizzle' ||
      condition === 'radar.condition.rain' ||
      condition === 'radar.condition.showers'
    ) return 'rain';
    return 'cloud';
  });
</script>

<svg
  class={`radar-weather-glyph is-${glyph}`}
  width={size}
  height={size}
  viewBox="0 0 72 72"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  {#if glyph === 'clear'}
    <circle cx="36" cy="36" r="12" class="radar-weather-glyph-primary" />
    <g class="radar-weather-glyph-stroke">
      <path d="M36 8v9M36 55v9M8 36h9M55 36h9M16.2 16.2l6.4 6.4M49.4 49.4l6.4 6.4M16.2 55.8l6.4-6.4M49.4 22.6l6.4-6.4" />
    </g>
  {:else}
    {#if glyph !== 'fog'}
      <circle cx="48" cy="24" r="8" class="radar-weather-glyph-sun" />
    {/if}
    <path class="radar-weather-glyph-cloud" d="M18 47h34a10 10 0 0 0 .8-20 16 16 0 0 0-30.6 4.3A8 8 0 0 0 18 47Z" />
    {#if glyph === 'fog'}
      <g class="radar-weather-glyph-stroke radar-weather-glyph-muted"><path d="M16 54h40M21 61h30" /></g>
    {:else if glyph === 'rain'}
      <g class="radar-weather-glyph-stroke radar-weather-glyph-rain"><path d="m24 54-3 7M37 54l-3 7M50 54l-3 7" /></g>
    {:else if glyph === 'snow'}
      <g class="radar-weather-glyph-stroke radar-weather-glyph-rain"><path d="M24 54v8M20.5 56l7 4M27.5 56l-7 4M47 54v8M43.5 56l7 4M50.5 56l-7 4" /></g>
    {:else if glyph === 'storm'}
      <path d="m39 48-8 12h7l-3 8 11-14h-7l4-6Z" class="radar-weather-glyph-bolt" />
    {/if}
  {/if}
</svg>

