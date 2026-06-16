import { useCallback, useRef } from 'react';
import { streamAnalysis } from '../api/services/aiService';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useLogStore } from '../stores/useLogStore';
import type { AIAnalysisPhase } from '../types/ai';
import type { AgentId, IncidentType, TelemetryState } from '../types';

const STREAM_IDLE_TIMEOUT_MS = 90_000;
const STREAM_HARD_TIMEOUT_MS = 10 * 60_000;

export function useStreamingAI() {
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startStream = useCallback(
    (params: {
      agentId: AgentId;
      incidentType: IncidentType;
      phase: AIAnalysisPhase;
      telemetry: TelemetryState;
      title: string;
      onDone?: () => void;
    }) => {
      abort();

      const { agentId, incidentType, phase, telemetry, title, onDone } = params;
      const store = useScenarioStore.getState();

      store.setThinking(agentId, { title, text: '', status: 'streaming' });

      const controller = new AbortController();
      abortRef.current = controller;

      const stopForTimeout = (message: string) => {
        if (controller.signal.aborted) return;
        controller.abort();
        const current = useScenarioStore.getState().thinking;
        if (current && current.status === 'streaming') {
          useScenarioStore.getState().setThinking(agentId, {
            ...current,
            text: current.text + `\n\n[${message}]`,
            status: 'error',
          });
        }
        clearTimeoutRef();
      };

      const refreshIdleTimeout = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          stopForTimeout('分析连接空闲超过 90 秒，已中断本次流式请求。可重试，或检查后端/模型服务是否仍在返回内容。');
        }, STREAM_IDLE_TIMEOUT_MS);
      };

      refreshIdleTimeout();
      hardTimeoutRef.current = setTimeout(() => {
        stopForTimeout('分析总耗时超过 10 分钟，已中断本次流式请求。建议缩短 prompt 或使用后台任务模式。');
      }, STREAM_HARD_TIMEOUT_MS);

      streamAnalysis(
        { incident_type: incidentType, phase, telemetry },
        (event) => {
          const state = useScenarioStore.getState();
          const current = state.thinking;
          if (!current) return;

          switch (event.type) {
            case 'token':
              refreshIdleTimeout();
              state.setThinking(agentId, {
                ...current,
                text: current.text + event.content,
                status: 'streaming',
              });
              break;
            case 'done':
              clearTimeoutRef();
              state.setThinking(agentId, { ...current, status: 'done' });
              useLogStore.getState().updateActiveScenarioLog(
                phase === 'supervisor'
                  ? { supervisorThinking: current.text }
                  : { edgeAgentThinking: current.text },
              );
              onDone?.();
              break;
            case 'error':
              clearTimeoutRef();
              state.setThinking(agentId, {
                ...current,
                text: current.text + `\n\n[错误: ${event.message}]`,
                status: 'error',
              });
              break;
          }
        },
        controller.signal,
      );
    },
    [],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearTimeoutRef();
  }, []);

  function clearTimeoutRef() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
  }

  return { startStream, abort };
}
