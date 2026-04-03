import { CONFIG } from '../config.js';
import { startTimer, stopAllTimers } from '../services/timer.js';

export function shouldPauseRuntime({ isFullscreen, outerHeight, outerWidth, isDocumentHidden }) {
  if (isFullscreen) return false;
  if (outerHeight === 0 && outerWidth === 0) return true;
  return Boolean(isDocumentHidden);
}

export function readRuntimePauseSignal() {
  return shouldPauseRuntime({
    isFullscreen: Boolean(document.fullscreenElement),
    outerHeight: window.outerHeight,
    outerWidth: window.outerWidth,
    isDocumentHidden: document.hidden
  });
}

export function startAppRuntimeTimers({ onClockTick, onDayCheck, onRatesTick, onFullscreenCheck, onFirstRatesFetch }) {
  let ratesTickCount = 0;

  startTimer('clock', CONFIG.CLOCK_TICK_MS, onClockTick);
  startTimer('day', CONFIG.DAY_CHECK_MS, onDayCheck);
  startTimer('rates', CONFIG.RATE_REFRESH_MS, () => {
    if (ratesTickCount++ === 0) return;
    onRatesTick();
  });
  startTimer('fullscreen', CONFIG.FULLSCREEN_CHECK_MS, onFullscreenCheck);
  onFirstRatesFetch();
}

export function stopAppRuntimeTimers() {
  stopAllTimers();
}
