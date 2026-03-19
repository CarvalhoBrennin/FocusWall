<script>
  import { onMount, onDestroy } from 'svelte';
  import InfoRail from './lib/components/InfoRail.svelte';
  import TaskPanel from './lib/components/TaskPanel.svelte';
  import Toast from './lib/components/Toast.svelte';
  import Modal from './lib/components/Modal.svelte';
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
    paused
  } from './lib/stores/app-store.js';
  import { CONFIG, VIEW } from './lib/config.js';

  function checkShouldPause() {
    if (document.fullscreenElement) return false;
    if (window.outerHeight === 0 && window.outerWidth === 0) return true;
    if (document.hidden) return true;
    return false;
  }

  function onClockTick() {
    if ($paused) return;
    const now = new Date();
    setClockTime(now);
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
    if (e.target.matches('input, textarea, select')) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('task-input')?.focus();
      }
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById('task-input')?.focus();
    } else if (e.key === 'ArrowLeft' && e.altKey) {
      e.preventDefault();
      if ($viewOffsetDays > -(CONFIG.HISTORY_VIEW_DAYS - 1)) {
        setViewOffset($viewOffsetDays - 1);
      }
    } else if (e.key === 'ArrowRight' && e.altKey) {
      e.preventDefault();
      if ($viewOffsetDays < VIEW.TODAY) {
        setViewOffset($viewOffsetDays + 1);
      }
    }
  }

  onMount(async () => {
    await bootstrapApp();
    startAllTimers(onClockTick, onDayCheck, onRatesTick, onFullscreenCheck, updateExchangeRates);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('beforeunload', stopAllAppTimers);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('beforeunload', stopAllAppTimers);
    stopAllAppTimers();
  });
</script>

<div class="background-orb background-orb--left" aria-hidden="true"></div>
<div class="background-orb background-orb--right" aria-hidden="true"></div>
<div class="background-grid" aria-hidden="true"></div>
<div class="background-noise" aria-hidden="true"></div>

<Toast />
<Modal />

<main class="app-shell" aria-label="Painel pessoal de produtividade">
  <div class="app-shell-frame">
    <InfoRail />
    <TaskPanel />
  </div>
</main>
