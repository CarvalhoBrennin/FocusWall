import type { RadarPreferences } from './radar.js';
export type Priority = 'high' | 'medium' | 'low';
export type RateStatus = 'live' | 'updating' | 'cached' | 'unavailable';
export type PanelTab =
  | 'execution'
  | 'opencode'
  | 'calendar'
  | 'files'
  | 'system'
  | 'radar'
  | 'media'
  | 'assistant'
  | 'neural'
  | 'vivarium';
export type ThemeId = 'dark' | 'light' | 'olive';
export type LocaleId = 'pt-BR' | 'en-US';
export type CalendarColor = 'neutral' | 'accent' | 'success' | 'danger';
export type CalendarRecurrence = 'none' | 'weekly' | 'monthly' | 'yearly';

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  pinned: boolean;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  dateKey: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  color?: CalendarColor;
  recurrence?: CalendarRecurrence;
  /** Data da ocorrência expandida para eventos recorrentes; não deve ser persistida. */
  occurrenceDateKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RatesCache {
  usd: number;
  eur: number;
  usdVarBid: number | null;
  usdPctChange: number | null;
  eurVarBid: number | null;
  eurPctChange: number | null;
  updatedAt: string;
  fetchedAt: string;
}

export interface RatesBaseline {
  dayKey: string;
  usd: number;
  eur: number;
}

export interface NeuralNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NeuralLink {
  target: string;
  alias?: string;
  subpath?: string;
  raw: string;
  index: number;
}

export interface NeuralMention {
  note: NeuralNote | null;
  title: string;
  linked: boolean;
  index: number;
}

export interface NeuralBacklink {
  note: NeuralNote;
  linked: boolean;
  excerpt: string;
}

export interface NeuralGraphNode {
  id: string;
  title: string;
  active: boolean;
  degree: number;
  missing?: boolean;
}

export interface NeuralGraphEdge {
  sourceId: string;
  targetId: string;
}

export interface UiState {
  lastViewedBaseDate: string;
  viewOffsetDays: number;
  calendarMonth: string;
  preferredMonitor: number | null;
  filesLastPath: string;
  filesFavorites: string[];
  filesRecents: string[];
  lastNeuralNoteId: string | null;
  theme: ThemeId;
  locale: LocaleId;
}

export interface AppState {
  version: number;
  tasksByDate: Record<string, Task[]>;
  calendarEvents: CalendarEvent[];
  neuralNotes: NeuralNote[];
  ratesCache: RatesCache | null;
  ratesBaseline: RatesBaseline | null;
  radarPreferences: RadarPreferences;
  ui: UiState;
}

export interface ToastState {
  message: string;
  undoCallback?: () => void;
}

export interface ModalState {
  title: string;
  body: string;
  confirmLabel: string;
  confirmDanger: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
