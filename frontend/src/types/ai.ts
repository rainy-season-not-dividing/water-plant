import type { IncidentType, TelemetryState } from './scenario';

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
