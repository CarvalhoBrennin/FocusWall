<script>
  import { t } from '../../i18n/index.js';
  import MusicIcons from './MusicIcons.svelte';

  let {
    connecting = false,
    failed = false,
    onReconnect = () => {},
    onOpenSettings = () => {}
  } = $props();
</script>

<section class="music-auth-recovery-shell" aria-labelledby="music-auth-recovery-title">
  <div class="music-auth-recovery-card">
    <div class="music-auth-recovery-rail" aria-hidden="true">
      <span>YT</span>
      <i></i>
      <span>OAUTH</span>
    </div>

    <div class="music-auth-recovery-main">
      <div class="music-auth-recovery-topline">
        <div class="music-auth-recovery-mark" aria-hidden="true">
          <span>YT</span>
          <MusicIcons name="refresh" size={16} />
        </div>
        <span class="music-auth-recovery-status"><i aria-hidden="true"></i>{$t('music.reconnectStatus')}</span>
      </div>

      <div class="music-auth-recovery-copy">
        <p class="music-eyebrow">{$t('music.reconnectEyebrow')}</p>
        <h2 id="music-auth-recovery-title">{$t('music.reconnectTitle')}</h2>
        <p>{$t('music.reconnectBody')}</p>
      </div>

      <div class="music-auth-recovery-assurance">
        <span class="music-auth-recovery-assurance-icon" aria-hidden="true">
          <MusicIcons name="settings" size={16} />
        </span>
        <div>
          <strong>{$t('music.reconnectReasonTitle')}</strong>
          <span>{$t('music.reconnectReasonBody')}</span>
        </div>
      </div>

      <ol class="music-auth-recovery-steps">
        <li><span>01</span><strong>{$t('music.reconnectStepAuthorize')}</strong></li>
        <li><span>02</span><strong>{$t('music.reconnectStepBrowser')}</strong></li>
        <li><span>03</span><strong>{$t('music.reconnectStepReturn')}</strong></li>
      </ol>

      <div class="music-auth-recovery-actions">
        <button class="music-primary-action" type="button" onclick={onReconnect} disabled={connecting}>
          {#if connecting}
            <span class="music-loader music-loader--button" aria-hidden="true"></span>
          {:else}
            <MusicIcons name="refresh" size={15} />
          {/if}
          <span>{connecting ? $t('music.connecting') : $t('music.reconnectAction')}</span>
        </button>
        <button class="music-secondary-action" type="button" onclick={onOpenSettings} disabled={connecting}>
          <MusicIcons name="settings" size={15} />
          <span>{$t('music.reconnectSettings')}</span>
        </button>
      </div>

      {#if connecting}
        <p class="music-auth-recovery-feedback" role="status">
          {$t('music.reconnectBrowser')}
        </p>
      {:else if failed}
        <p class="music-auth-recovery-feedback is-error" role="alert">
          {$t('music.reconnectFailed')}
        </p>
      {/if}
    </div>

    <aside class="music-auth-recovery-meta" aria-hidden="true">
      <div>
        <small>STATUS</small>
        <strong>REAUTH</strong>
      </div>
      <div>
        <small>OAUTH</small>
        <strong>LOCAL</strong>
      </div>
      <div>
        <small>SCOPE</small>
        <strong>READ ONLY</strong>
      </div>
      <span class="music-auth-recovery-meta-line"></span>
      <span class="music-auth-recovery-meta-brand">YOUTUBE / FOCUSWALL</span>
    </aside>
  </div>
</section>

