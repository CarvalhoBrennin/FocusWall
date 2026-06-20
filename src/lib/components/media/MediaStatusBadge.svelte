<script>
  let { isPlaying = false } = $props();
</script>

<span class="media-status-badge" class:is-playing={isPlaying} class:is-idle={!isPlaying}>
  {isPlaying ? 'A tocar' : 'Pausado'}
</span>
