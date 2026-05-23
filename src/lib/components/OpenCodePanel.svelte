<script>
  import OpenCodeLauncher from './OpenCodeLauncher.svelte';
  import OpenCodeTerminal from './OpenCodeTerminal.svelte';
  import { setOpencodeSessionActive } from '../stores/ui-store.js';

  /** @type {{ active?: boolean }} */
  let { active = false } = $props();

  let workdir = $state('');
  let started = $state(false);

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

  function handleChangeProject() {
    handleSessionEnd();
  }
</script>

{#if !started}
  <OpenCodeLauncher {active} onStart={handleStart} />
{:else}
  <div class="opencode-session">
    <div class="opencode-session-bar">
      <div class="opencode-session-copy">
        <span class="opencode-session-label">Workspace</span>
        <span class="opencode-session-path">{workdir}</span>
      </div>
      <button class="ghost-button" type="button" onclick={handleChangeProject}>
        Trocar pasta
      </button>
    </div>
    <OpenCodeTerminal {active} {workdir} onSessionEnd={handleSessionEnd} />
  </div>
{/if}
