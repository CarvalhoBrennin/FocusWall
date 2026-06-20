<script>
  import { clockTime, clockNow } from '../stores/app-store.js';
  import { formatters } from '../config.js';
  import { t } from '../i18n/index.js';

  $: timeParts = String($clockTime || '00:00:00').split(':');
  $: mainTime = timeParts.length >= 2 ? `${timeParts[0]}:${timeParts[1]}` : $clockTime;
  $: seconds = timeParts[2] ?? '00';
  $: dateLine = formatters.longDate.format($clockNow);
  $: dateIso = $clockNow.toISOString();
</script>

<section class="clock-block" aria-labelledby="clock-title">
  <div class="clock-header">
    <p id="clock-title" class="eyebrow">{$t('clock.localTime')}</p>
  </div>

  <div class="clock-face">
    <time class="clock" datetime={dateIso}>{mainTime}</time>
    <span class="clock-seconds" aria-hidden="true">{seconds}</span>
  </div>

  <p class="date-line">{dateLine}</p>
</section>
