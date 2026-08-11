<script lang="ts">
  import type { RadarImageRef, RadarImageTone, RadarNewsCategory } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { t } from '../../i18n/index.js';

  let { image = null, category, variant = 'featured' } = $props<{
    image?: RadarImageRef | null;
    category: RadarNewsCategory;
    variant?: 'lead' | 'featured';
  }>();

  /** The tonal cover remains the fallback for feeds without a valid image. */
  const CATEGORY_TONE: Record<RadarNewsCategory, RadarImageTone> = {
    brasil: 'olive',
    technology: 'cool',
    development: 'neutral',
    security: 'warm',
    business: 'olive',
    science: 'cool',
    world: 'warm'
  };

  let tone = $derived(image?.dominantTone ?? CATEGORY_TONE[category as RadarNewsCategory] ?? 'neutral');
  let label = $derived($t(`radar.category.${category}` as MessageKey));
  let imageFailed = $state(false);
  let imageSource = $derived(image?.dataUrl ?? null);

  $effect(() => {
    imageSource;
    imageFailed = false;
  });
</script>

<!-- `span`, not `div`: the cover lives inside the article button. -->
<span class={`radar-cover is-${variant} tone-${tone}`} aria-hidden="true">
  {#if imageSource && !imageFailed}
    <img src={imageSource} alt="" loading="lazy" decoding="async" onerror={() => imageFailed = true} />
  {:else}
    <span class="radar-cover-fallback" aria-hidden="true">
      <span class="radar-cover-fallback-mark">{label.slice(0, 1)}</span>
      <span class="radar-cover-label">{label}</span>
    </span>
  {/if}
</span>
