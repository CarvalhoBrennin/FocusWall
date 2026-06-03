<script>
  import OpenCodeLauncher from './OpenCodeLauncher.svelte';
  import OpenCodeChat from './OpenCodeChat.svelte';
  import { setOpencodeSessionActive, showToast } from '../stores/ui-store.js';

  /** @type {{ active?: boolean }} */
  let { active = false } = $props();

  let workdir = $state('');
  let started = $state(false);
  let transitioning = $state(false);

  function handleStart(path) {
    workdir = path;
    started = true;
    setOpencodeSessionActive(true);
  }

  function handleSessionEnd() {
    started = false;
    workdir = '';
    setOpencodeSessionActive(false);
  }

  function handleSessionError(message) {
    showToast(message);
    started = false;
    workdir = '';
    setOpencodeSessionActive(false);
  }

  async function handleChangeProject() {
    transitioning = true;
    await handleSessionEnd();
    transitioning = false;
  }
</script>

{#if !started}
  <OpenCodeLauncher {active} onStart={handleStart} />
{:else}
  <div class="opencode-session" class:opencode-session--entering={transitioning}>
    <div class="opencode-session-bar">
      <div class="opencode-session-copy">
        <span class="opencode-session-label">Workspace</span>
        <span class="opencode-session-path">{workdir}</span>
      </div>
      <button class="ghost-button" type="button" disabled={transitioning} onclick={handleChangeProject}>
        Trocar pasta
      </button>
    </div>
    <OpenCodeChat {active} {workdir} onSessionEnd={handleSessionEnd} onSessionError={handleSessionError} />
  </div>
{/if}
