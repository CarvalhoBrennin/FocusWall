<script>
  import { clockTime } from '../stores/app-store.js';
  import { formatters } from '../config.js';

  $: now = (() => {
    $clockTime;
    return new Date();
  })();
  $: timeParts = String($clockTime || '00:00:00').split(':');
  $: mainTime = timeParts.length >= 2 ? `${timeParts[0]}:${timeParts[1]}` : $clockTime;
  $: seconds = timeParts[2] ?? '00';
  $: dateLine = formatters.longDate.format(now);
  $: dateIso = now.toISOString();
</script>

<section class="clock-block" aria-labelledby="clock-title">
  <div class="clock-header">
    <p id="clock-title" class="eyebrow">Tempo local</p>
  </div>

  <div class="clock-face">
    <time class="clock" datetime={dateIso}>{mainTime}</time>
    <span class="clock-seconds" aria-hidden="true">{seconds}</span>
  </div>

  <p class="date-line">{dateLine}</p>
</section>
