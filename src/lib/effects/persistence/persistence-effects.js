import { buildPersistedUiSnapshot } from '../../domain/settings/settings-domain.js';

export async function saveAppStateSnapshot(storage, state, currentDateKey, viewOffsetDays) {
  const nextState = buildPersistedUiSnapshot(state, currentDateKey, viewOffsetDays);
  await storage.saveState(nextState);
  return nextState;
}
