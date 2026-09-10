<script lang="ts">
  let { variant = 'generic' } = $props<{ variant?: 'weather' | 'news' | 'generic' }>();
</script>

<div class={`radar-skeleton is-${variant}`} aria-hidden="true">
  {#if variant === 'weather'}
    <span class="radar-skeleton-block is-weather-main"></span>
    <span class="radar-skeleton-block is-weather-metrics"></span>
    <span class="radar-skeleton-block is-weather-hours"></span>
  {:else if variant === 'news'}
    <span class="radar-skeleton-block is-news-lead"></span>
    <span class="radar-skeleton-block is-news-side"></span>
    <span class="radar-skeleton-line"></span>
    <span class="radar-skeleton-line is-short"></span>
  {:else}
    <span class="radar-skeleton-line"></span>
    <span class="radar-skeleton-line"></span>
    <span class="radar-skeleton-line is-short"></span>
  {/if}
</div>
