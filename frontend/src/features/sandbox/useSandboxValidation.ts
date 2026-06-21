import { useCallback, useRef, useState } from 'react';
import { streamAnalysis } from '../../api/services/aiService';
import type { AgentId, IncidentType, TelemetryState } from '../../types';
import { buildSandboxFallbackResult, parseSandboxValidation, type SandboxValidationResult } from './sandboxSkill';

export type SandboxStreamStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface SandboxValidationState {
  status: SandboxStreamStatus;
  text: string;
  result: SandboxValidationResult | null;
  errorMessage: string | null;
}

const INITIAL_STATE: SandboxValidationState = {
  status: 'idle',
  text: '',
  result: null,
  errorMessage: null,
};

export function useSandboxValidation() {
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<SandboxValidationState>(INITIAL_STATE);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const start = useCallback((params: {
    agentId: AgentId;
    incidentType: IncidentType;
    telemetry: TelemetryState;
    onDone?: () => void;
  }) => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulatedText = '';

    setState({
      status: 'streaming',
      text: '',
      result: null,
      errorMessage: null,
    });

    streamAnalysis(
      {
        incident_type: params.incidentType,
        phase: 'sandbox',
        telemetry: params.telemetry,
      },
      (event) => {
        if (event.type === 'token') {
          accumulatedText += event.content;
          setState((current) => ({
            ...current,
            status: 'streaming',
            text: accumulatedText,
          }));
          return;
        }

        if (event.type === 'done') {
          const result = parseSandboxValidation(accumulatedText);
          setState({
            status: 'done',
            text: accumulatedText,
            result,
            errorMessage: null,
          });
          params.onDone?.();
          return;
        }

        setState((current) => ({
          status: 'error',
          text: current.text,
          result: buildSandboxFallbackResult(event.message),
          errorMessage: event.message,
        }));
        params.onDone?.();
      },
      controller.signal,
    );
  }, []);

  return {
    sandbox: state,
    startSandboxValidation: start,
    resetSandboxValidation: reset,
  };
}
