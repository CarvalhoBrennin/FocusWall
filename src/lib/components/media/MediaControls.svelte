<script>
  import MediaIcons from './icons/MediaIcons.svelte';

  let {
    isPlaying = false,
    canPlay = false,
    canPause = false,
    canNext = false,
    canPrevious = false,
    busy = false,
    onPrevious = () => {},
    onToggle = () => {},
    onNext = () => {}
  } = $props();
</script>

<div class="media-controls" aria-label="Controles de reprodução">
  <button
    type="button"
    class="media-transport-btn media-transport-btn--secondary"
    disabled={busy || !canPrevious}
    aria-label="Faixa anterior"
    title="Faixa anterior (←)"
    onclick={onPrevious}
  >
    <MediaIcons name="skipPrevious" />
  </button>
  <button
    type="button"
    class="media-transport-btn media-transport-btn--primary"
    disabled={busy || (!canPlay && !canPause)}
    aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
    title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
    onclick={onToggle}
  >
    <MediaIcons name={isPlaying ? 'pause' : 'play'} size={22} filled={true} />
  </button>
  <button
    type="button"
    class="media-transport-btn media-transport-btn--secondary"
    disabled={busy || !canNext}
    aria-label="Próxima faixa"
    title="Próxima faixa (→)"
    onclick={onNext}
  >
    <MediaIcons name="skipNext" />
  </button>
</div>
