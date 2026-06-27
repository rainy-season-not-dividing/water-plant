import type { IncidentType, TelemetryState } from './scenario';
import type { CockpitSectionKey } from './cockpit';

export type AIAnalysisPhase = 'supervisor' | 'agent' | 'sandbox';

export interface AIAnalyzeRequest {
  incident_type: IncidentType;
  phase: AIAnalysisPhase;
  telemetry: TelemetryState;
}

export interface AIStreamToken {
  type: 'token';
  content: string;
}

export interface AIStreamDone {
  type: 'done';
}

export interface AIStreamError {
  type: 'error';
  message: string;
}

export type AIStreamEvent = AIStreamToken | AIStreamDone | AIStreamError;

export interface CockpitChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface CockpitChatRequest {
  section: CockpitSectionKey;
  selected_tab?: string | null;
  question: string;
  history: Array<Pick<CockpitChatMessage, 'role' | 'content'>>;
  archived_summary?: string | null;
}
