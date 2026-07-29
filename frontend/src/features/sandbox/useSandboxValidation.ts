import { useCallback, useRef, useState } from 'react';
import { streamAnalysis } from '../../api/services/aiService';
import { createScenarioLogEvent } from '../../api/services/logService';
import { useLogStore } from '../../stores/useLogStore';
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
          const activeLog = useLogStore.getState().getActiveScenarioLog();
          if (activeLog) {
            void createScenarioLogEvent({
              scenarioId: activeLog.id,
              type: 'sandbox_result',
              agentId: params.agentId,
              incidentType: params.incidentType,
              phase: 'sandbox',
              summary: result.summary,
              payload: {
                text: accumulatedText,
                result,
              },
            });
          }
          params.onDone?.();
          return;
        }

        const fallbackResult = buildSandboxFallbackResult(event.message);
        setState((current) => ({
          status: 'error',
          text: current.text,
          result: fallbackResult,
          errorMessage: event.message,
        }));
        const activeLog = useLogStore.getState().getActiveScenarioLog();
        if (activeLog) {
          const text = accumulatedText || `[错误: ${event.message}]`;
          useLogStore.getState().updateActiveScenarioLog({ sandboxThinking: text });
          void createScenarioLogEvent({
            scenarioId: activeLog.id,
            type: 'sandbox_error',
            agentId: params.agentId,
            incidentType: params.incidentType,
            phase: 'sandbox',
            summary: event.message,
            payload: {
              status: 'error',
              ragStatus: event.ragStatus,
              failedSources: event.failedSources,
              errorMessage: event.errorMessage ?? event.message,
              text,
              result: fallbackResult,
            },
          });
        }
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
