import { CONFIG, VIEW } from '../../config.js';

export function clampViewOffset(offset) {
  const min = -(CONFIG.HISTORY_VIEW_DAYS - 1);
  return Math.max(min, Math.min(VIEW.TODAY, Number(offset) || 0));
}

export function buildPersistedUiSnapshot(state, currentDateKey, viewOffsetDays) {
  return {
    ...state,
    ui: {
      ...state.ui,
      lastViewedBaseDate: currentDateKey,
      viewOffsetDays
    }
  };
}

export function buildStartupToggleStatusMessage(enabled) {
  return 'Inicialização com Windows ' + (enabled ? 'ativada.' : 'desativada.');
}
