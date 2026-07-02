import type { PanelTab } from './types/app.js';
import type { MessageKey } from './i18n/messages.js';

/** Flip only these flags to re-enable archived panels — TaskHeader and TaskPanel react automatically. */
export const OPENCODE_TAB_ENABLED = false;
export const VIVARIUM_ENABLED = false;
export const NEURAL_TAB_ENABLED = false;
export const ASSISTANT_TAB_ENABLED = true;

export type PanelTabDefinition = {
  id: PanelTab;
  labelKey: MessageKey;
  panelId: string;
  enabled: boolean;
};

/** Single source of truth for panel tabs (order, labels, visibility). */
export const PANEL_TAB_DEFINITIONS: PanelTabDefinition[] = [
  { id: 'execution', labelKey: 'tasks.execution', panelId: 'execution-panel', enabled: true },
  { id: 'calendar', labelKey: 'tasks.calendar', panelId: 'calendar-panel', enabled: true },
  { id: 'files', labelKey: 'tasks.files', panelId: 'files-panel', enabled: true },
  { id: 'system', labelKey: 'tasks.system', panelId: 'system-panel', enabled: true },
  { id: 'media', labelKey: 'tasks.media', panelId: 'media-panel', enabled: true },
  { id: 'assistant', labelKey: 'tasks.assistant', panelId: 'assistant-panel', enabled: ASSISTANT_TAB_ENABLED },
  { id: 'opencode', labelKey: 'tasks.opencode', panelId: 'opencode-panel', enabled: OPENCODE_TAB_ENABLED },
  { id: 'neural', labelKey: 'tasks.neural', panelId: 'neural-panel', enabled: NEURAL_TAB_ENABLED },
  { id: 'vivarium', labelKey: 'tasks.vivarium', panelId: 'vivarium-panel', enabled: VIVARIUM_ENABLED }
];

export function getVisiblePanelTabs(): PanelTabDefinition[] {
  return PANEL_TAB_DEFINITIONS.filter((tab) => tab.enabled);
}

export function isPanelTabEnabled(tab: PanelTab): boolean {
  return PANEL_TAB_DEFINITIONS.some((entry) => entry.id === tab && entry.enabled);
}
