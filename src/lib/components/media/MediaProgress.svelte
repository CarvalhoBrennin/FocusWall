<script>
  import { formatMediaTime } from '../../services/media-session.js';

  let {
    positionMs = 0,
    durationMs = 0,
    percent = 0,
    isPlaying = false
  } = $props();
</script>

<div class="media-progress">
  <span class="sr-only">Progresso</span>
  <div
    class="media-progress-track"
    class:is-playing={isPlaying}
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax={durationMs || 100}
    aria-valuenow={positionMs}
    aria-label="Progresso da faixa"
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
