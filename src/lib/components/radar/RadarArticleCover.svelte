<script lang="ts">
  import type { RadarImageRef, RadarImageTone, RadarNewsCategory } from '../../types/radar.js';
  import type { MessageKey } from '../../i18n/messages.js';
  import { t } from '../../i18n/index.js';

  let { image = null, category, variant = 'featured' } = $props<{
    image?: RadarImageRef | null;
    category: RadarNewsCategory;
    variant?: 'lead' | 'featured';
  }>();

  /**
   * Capa editorial: o backend ainda entrega `image: null` (o pipeline de
   * download/reencode não foi habilitado), então a capa é um bloco tonal
   * derivado da categoria. Quando a imagem chegar, `dominantTone` já manda no
   * tom e este componente é o único lugar que precisa renderizar o `<img>`.
   */
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
</script>

<!-- `span`, não `div`: a capa vive dentro do botão da matéria, que só aceita conteúdo de frase. -->
<span class={`radar-cover is-${variant} tone-${tone}`} aria-hidden="true">
  <span class="radar-cover-label">{label}</span>
</span>
