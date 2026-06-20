<script>

  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';

  import InfoRail from './lib/components/InfoRail.svelte';

  import TaskPanel from './lib/components/TaskPanel.svelte';

  import Toast from './lib/components/Toast.svelte';

  import Modal from './lib/components/Modal.svelte';

  import SettingsModal from './lib/components/SettingsModal.svelte';
  import ShortcutsHelp from './lib/components/ShortcutsHelp.svelte';

  import { settingsModal, panelTab } from './lib/stores/ui-store.js';

  import {

    bootstrapApp,

    startAllTimers,

    stopAllAppTimers,

    setClockTime,

    onDayChange,

    onFullscreenPause,

    updateExchangeRates,

    setViewOffset,

    viewOffsetDays,

    paused,

    bootstrapLoading,

    bootstrapError

  } from './lib/stores/app-store.js';

  import { t } from './lib/i18n/index.js';
  import { isTauri } from './lib/utils/tauri.js';
  import { checkForUpdates } from './lib/services/updater.js';
  import { CONFIG, VIEW } from './lib/config.js';



  let fatalError = $state('');
  let showShortcuts = $state(false);
  let bootstrapDone = false;

  function checkShouldPause() {
    if (!bootstrapDone) return false;
    if (document.fullscreenElement) return false;
    if (window.outerHeight === 0 && window.outerWidth === 0) return true;
    if (document.hidden) return true;
    return false;
  }



  function onClockTick() {

    if ($paused) return;

    setClockTime(new Date());

  }



  function onDayCheck() {

    onDayChange();

  }



  function onRatesTick() {

    updateExchangeRates();

  }



  function onFullscreenCheck() {

    onFullscreenPause(checkShouldPause());

  }



  function handleKeydown(e) {

    const target = e.target instanceof Element ? e.target : null;

    const inTextInput = target?.closest('input, textarea, [contenteditable="true"]');

    if (inTextInput) return;



    if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      showShortcuts = true;
      return;
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {

      e.preventDefault();

      document.getElementById('task-input')?.focus();

    } else if (e.key === 'ArrowLeft' && e.altKey && $panelTab === 'execution') {

      e.preventDefault();

      if ($viewOffsetDays > -(CONFIG.HISTORY_VIEW_DAYS - 1)) {

        setViewOffset($viewOffsetDays - 1);

      }

    } else if (e.key === 'ArrowRight' && e.altKey && $panelTab === 'execution') {

      e.preventDefault();

      if ($viewOffsetDays < VIEW.TODAY) {

        setViewOffset($viewOffsetDays + 1);

      }

    }

  }



  function handleGlobalError(event) {

    fatalError = event?.error?.message || event?.message || get(t)('app.fatalError');

  }



  function handleUnhandledRejection(event) {

    fatalError = event?.reason?.message || String(event.reason || get(t)('app.unhandledRejection'));

  }



  onMount(async () => {
    if (isTauri()) {
      document.documentElement.classList.add('is-tauri');
    }

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    await bootstrapApp();
    startAllTimers(onClockTick, onDayCheck, onRatesTick, onFullscreenCheck, updateExchangeRates);
    onClockTick();
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('beforeunload', stopAllAppTimers);

    if (isTauri()) {
      checkForUpdates().catch(() => {});
    }

    setTimeout(() => { bootstrapDone = true; }, 1000);
  });



  onDestroy(() => {

    window.removeEventListener('error', handleGlobalError);

    window.removeEventListener('unhandledrejection', handleUnhandledRejection);

    document.removeEventListener('keydown', handleKeydown);

    window.removeEventListener('beforeunload', stopAllAppTimers);

    stopAllAppTimers();

  });

</script>



<Toast />

<Modal />



{#if $settingsModal}
  <SettingsModal />
{/if}

{#if showShortcuts}
  <ShortcutsHelp onClose={() => showShortcuts = false} />
{/if}



{#if fatalError}

  <div class="app-error" role="alert">

    <p>{fatalError}</p>

    <button type="button" class="primary-button" onclick={() => location.reload()}>{$t('app.reload')}</button>

  </div>

{:else if $bootstrapLoading}

  <div class="app-loading" role="status" aria-live="polite">

    <p>{$t('app.loading')}</p>

  </div>

{:else}

  <svelte:boundary

    onerror={(error) => {

      fatalError = error?.message || String(error);

    }}

  >

    <main class="app-shell" aria-label={$t('app.shellLabel')}>

      <div class="app-shell-frame">

        <InfoRail />

        <TaskPanel />

      </div>

      {#if $bootstrapError}

        <p class="app-bootstrap-warning" role="status">{$bootstrapError}</p>

      {/if}

    </main>

  </svelte:boundary>

{/if}



<style>

  .app-loading,

  .app-error {

    display: grid;

    place-items: center;

    min-height: 100vh;

    padding: 2rem;

    text-align: center;

    gap: 1rem;

  }



  .app-bootstrap-warning {

    position: fixed;

    left: 1rem;

    bottom: 1rem;

    margin: 0;

    padding: 0.65rem 0.85rem;

    border: 1px solid rgba(181, 92, 80, 0.24);

    background: rgba(181, 92, 80, 0.08);

    color: var(--danger);

    font-size: 0.82rem;

  }

</style>

