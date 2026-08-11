<script>
  import { onMount } from 'svelte';
  import {
    connectYouTubeMusic,
    disconnectYouTubeMusic,
    getMusicAuthStatus,
    openGoogleOAuthConsole,
    openYouTubeApiLibrary,
    saveMusicClientId
  } from '../../services/youtube-music.js';
  import { notifyMusicSettingsChanged } from '../../stores/ui-store.js';
  import { t } from '../../i18n/index.js';

  let auth = $state({ configured: false, clientSecretConfigured: false, authenticated: false, clientId: '', authInProgress: false });
  let clientIdDraft = $state('');
  let clientSecretDraft = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let connecting = $state(false);
  let disconnecting = $state(false);
  let errorMessage = $state('');
  let infoMessage = $state('');

  const busy = $derived(saving || connecting || disconnecting);

  async function loadStatus() {
    loading = true;
    errorMessage = '';

    try {
      auth = await getMusicAuthStatus();
      clientIdDraft = auth.clientId || '';
    } catch (error) {
      errorMessage = error?.message || String(error);
    } finally {
      loading = false;
    }
  }

  async function saveConfig() {
    saving = true;
    errorMessage = '';
    infoMessage = '';

    try {
      auth = await saveMusicClientId(clientIdDraft, clientSecretDraft);
      clientIdDraft = auth.clientId;
      clientSecretDraft = '';
      infoMessage = $t('music.settingsSaved');
      notifyMusicSettingsChanged();
    } catch (error) {
      errorMessage = error?.message || String(error);
    } finally {
      saving = false;
    }
  }

  async function connect() {
    connecting = true;
    errorMessage = '';
    infoMessage = $t('music.authorizationBrowser');

    try {
      auth = await connectYouTubeMusic();
      infoMessage = $t('music.accountConnected');
      notifyMusicSettingsChanged();
    } catch (error) {
      errorMessage = error?.message || String(error);
      infoMessage = '';
    } finally {
      connecting = false;
    }
  }

  async function disconnect() {
    disconnecting = true;
    errorMessage = '';
    infoMessage = '';

    try {
      auth = await disconnectYouTubeMusic();
      infoMessage = $t('music.accountDisconnected');
      notifyMusicSettingsChanged();
    } catch (error) {
      errorMessage = error?.message || String(error);
    } finally {
      disconnecting = false;
    }
  }

  async function openLink(action) {
    errorMessage = '';
    try {
      await action();
    } catch (error) {
      errorMessage = error?.message || String(error);
    }
  }

  onMount(loadStatus);
</script>

<section class="youtube-music-settings" aria-labelledby="youtube-music-settings-title">
  <div class="youtube-music-settings-heading">
    <div>
      <p class="eyebrow">{$t('music.settingsEyebrow')}</p>
      <h3 id="youtube-music-settings-title">{$t('music.settingsTitle')}</h3>
    </div>
    <span class:is-connected={auth.authenticated} class="youtube-music-settings-status">
      {auth.authenticated ? $t('music.connected') : $t('music.notConnected')}
    </span>
  </div>

  <div class="youtube-music-security-note">
    <span class="youtube-music-security-mark" aria-hidden="true">DPAPI</span>
    <p>{$t('music.settingsSecurity')}</p>
  </div>

  {#if loading}
    <p class="youtube-music-settings-feedback" aria-live="polite">{$t('music.settingsLoading')}</p>
  {:else}
    <div class="youtube-music-fields">
      <label class="settings-field" for="youtube-settings-client-id">
        <span>OAuth Client ID</span>
        <input
          id="youtube-settings-client-id"
          type="text"
          bind:value={clientIdDraft}
          placeholder="000000000000-xxxx.apps.googleusercontent.com"
          autocomplete="off"
          spellcheck="false"
          disabled={busy}
        />
      </label>

      <label class="settings-field" for="youtube-settings-client-secret">
        <span>OAuth Client Secret</span>
        <input
          id="youtube-settings-client-secret"
          type="password"
          bind:value={clientSecretDraft}
          placeholder={auth.clientSecretConfigured ? $t('music.settingsKeepSecret') : $t('music.settingsPasteSecret')}
          autocomplete="off"
          spellcheck="false"
          disabled={busy}
        />
      </label>
    </div>

    <p class="youtube-music-settings-note">
      {auth.clientSecretConfigured ? $t('music.settingsSecretStored') : $t('music.settingsDesktopCredential')}
    </p>

    <div class="youtube-music-settings-actions">
      <button type="button" class="ghost-button" onclick={saveConfig} disabled={busy || !clientIdDraft.trim() || (!auth.clientSecretConfigured && !clientSecretDraft.trim())}>
        {saving ? $t('music.settingsSaving') : $t('music.settingsSave')}
      </button>
      <button type="button" class="ghost-button" onclick={() => openLink(openYouTubeApiLibrary)} disabled={busy}>{$t('music.settingsOpenApi')}</button>
      <button type="button" class="ghost-button" onclick={() => openLink(openGoogleOAuthConsole)} disabled={busy}>{$t('music.settingsOpenOauth')}</button>
    </div>

    <div class="youtube-music-account-actions">
      {#if auth.configured && auth.clientSecretConfigured && !auth.authenticated}
        <button type="button" class="primary-button" onclick={connect} disabled={busy}>
          {connecting ? $t('music.connecting') : $t('music.settingsConnect')}
        </button>
      {:else if auth.authenticated}
        <button type="button" class="ghost-button youtube-music-disconnect" onclick={disconnect} disabled={busy}>
          {disconnecting ? $t('music.settingsDisconnecting') : $t('music.settingsDisconnect')}
        </button>
      {/if}
    </div>

    {#if errorMessage}
      <p class="youtube-music-settings-feedback is-error" role="alert">{errorMessage}</p>
    {:else if infoMessage}
      <p class="youtube-music-settings-feedback" role="status">{infoMessage}</p>
    {/if}
  {/if}
</section>

<style>
  .youtube-music-settings {
    padding: var(--space-3) 0;
  }

  .youtube-music-settings-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .youtube-music-settings-heading h3 {
    margin: 0.2rem 0 0;
    color: var(--light-strong);
    font-size: 1rem;
  }

  .youtube-music-settings-status {
    padding: 0.32rem 0.48rem;
    border: 1px solid var(--control-border-strong);
    color: var(--light-muted);
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .youtube-music-settings-status.is-connected {
    border-color: color-mix(in srgb, var(--success) 60%, var(--control-border-strong));
    color: var(--success);
  }

  .youtube-music-security-note {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 0.62rem;
    margin-top: 0.78rem;
    padding: 0.65rem 0.7rem;
    border: 1px solid var(--divider);
    background: var(--card-bg-muted);
  }

  .youtube-music-security-mark {
    padding: 0.18rem 0.28rem;
    border: 1px solid var(--control-border-strong);
    color: var(--light-muted);
    font-family: var(--font-mono);
    font-size: 0.5rem;
    letter-spacing: 0.06em;
  }

  .youtube-music-security-note p,
  .youtube-music-settings-note,
  .youtube-music-settings-feedback {
    margin: 0;
    color: var(--light-muted);
    font-size: 0.74rem;
    line-height: 1.5;
  }

  .youtube-music-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.7rem;
    margin-top: 0.82rem;
  }

  .youtube-music-settings .settings-field {
    display: grid;
    gap: 0.35rem;
    margin: 0;
  }

  .youtube-music-settings .settings-field span {
    color: var(--light-main);
    font-size: 0.73rem;
    font-weight: 700;
  }

  .youtube-music-settings .settings-field input {
    width: 100%;
    min-height: 2.38rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--control-border-strong);
    border-radius: 0;
    outline: 0;
    background: var(--field-bg);
    color: var(--light-strong);
  }

  .youtube-music-settings .settings-field input:focus {
    border-color: var(--accent);
    box-shadow: inset 2px 0 var(--accent-strong);
  }

  .youtube-music-settings .settings-field input:disabled {
    opacity: 0.55;
  }

  .youtube-music-settings-note,
  .youtube-music-settings-feedback {
    margin-top: 0.65rem;
  }

  .youtube-music-settings-note {
    color: var(--light-soft);
    font-size: 0.68rem;
  }

  .youtube-music-settings-actions,
  .youtube-music-account-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.8rem;
  }

  .youtube-music-account-actions {
    padding-top: 0.8rem;
    border-top: 1px solid var(--divider);
  }

  .youtube-music-disconnect {
    color: var(--danger);
  }

  .youtube-music-settings-feedback.is-error {
    color: var(--danger);
  }
</style>
