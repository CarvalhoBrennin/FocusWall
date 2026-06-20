<script>
  import { formatMediaTime } from '../../services/media-session.js';

  let {
    positionMs = 0,
    durationMs = 0,
    percent = 0,
    isPlaying = false
  } = $props();

  const hasDuration = $derived(durationMs > 0);
</script>

<div class="media-progress">
  <span class="sr-only">Progresso</span>
  <div
    class="media-progress-track"
    class:is-playing={isPlaying}
    role={hasDuration ? 'progressbar' : undefined}
    aria-valuemin={hasDuration ? 0 : undefined}
    aria-valuemax={hasDuration ? 100 : undefined}
    aria-valuenow={hasDuration ? Math.round(percent) : undefined}
    aria-label={hasDuration ? 'Progresso da faixa' : undefined}
    aria-hidden={hasDuration ? undefined : true}
  >
    <div class="media-progress-fill" style:width="{percent}%">
      <span class="media-progress-knob" aria-hidden="true"></span>
    </div>
  </div>
  <div class="media-progress-times">
    <span>{formatMediaTime(positionMs)}</span>
    <span>{formatMediaTime(durationMs, !durationMs)}</span>
  </div>
</div>
