<script>
  import MediaIcons from './icons/MediaIcons.svelte';
  import MediaTrackSkeleton from './MediaTrackSkeleton.svelte';

  let { variant = 'empty', message = '', reducedMotion = false } = $props();
</script>

<div class="media-empty-stage" data-variant={variant}>
  <div class="media-empty-art-panel" aria-hidden={variant !== 'loading'}>
    {#if variant === 'loading'}
      <MediaTrackSkeleton variant="art" {reducedMotion} />
    {:else}
      <div class="media-empty-art-texture">
        <MediaIcons name="note" size={64} />
      </div>
    {/if}
    <div class="media-empty-art-scrim" aria-hidden="true"></div>
  </div>

  <div class="media-empty-info-panel">
    <div class="media-empty-info-bg" aria-hidden="true"></div>
    <div class="media-empty-grain" aria-hidden="true"></div>

    <div class="media-empty-state">
      {#if variant === 'loading'}
        <MediaTrackSkeleton variant="info" {reducedMotion} />
        <p class="media-empty-state-copy">Sincronizando sessão de mídia…</p>
      {:else if variant === 'unsupported'}
        <div class="media-empty-state-icon">
          <MediaIcons name="monitor" size={36} />
        </div>
        <h2 class="media-empty-state-title">Indisponível nesta plataforma</h2>
        <p class="media-empty-state-copy">
          O now playing usa a API de mídia do Windows (SMTC). Abre o app desktop no Windows para ver o
          que está a tocar.
        </p>
        <p class="media-empty-state-cta">Abrir app desktop</p>
      {:else if variant === 'error'}
        <div class="media-empty-state-icon">
          <MediaIcons name="note" size={36} />
        </div>
        <h2 class="media-empty-state-title">Erro de mídia</h2>
        <p class="media-empty-state-copy">{message}</p>
      {:else}
        <div class="media-empty-state-icon">
          <MediaIcons name="note" size={36} />
        </div>
        <h2 class="media-empty-state-title">Nada a tocar</h2>
        <p class="media-empty-state-copy">
          Inicia música no Spotify, browser, VLC ou outro app compatível. A faixa aparece aqui
          automaticamente.
        </p>
      {/if}
    </div>
  </div>
</div>
