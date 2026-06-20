<script>
  import ClockBlock from './ClockBlock.svelte';
  import RatesCard from './RatesCard.svelte';
  import SettingsButton from './SettingsButton.svelte';
  import { t } from '../i18n/index.js';
</script>

<aside class="info-rail panel" aria-label={$t('infoRail.label')}>
  <ClockBlock />

  <RatesCard />

  <div class="info-rail-bottom">
    <SettingsButton />
  </div>
</aside>

<style>
  .info-rail-bottom {
    margin-top: auto;
    display: flex;
    justify-content: flex-start;
    padding-top: var(--space-2);
  }
</style>
