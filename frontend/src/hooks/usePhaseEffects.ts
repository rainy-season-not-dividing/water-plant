import { useEffect, useRef } from 'react';
import { ScenarioPhase, type AgentId, type ScenarioPhase as ScenarioPhaseType } from '../types/index';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useSystemStore } from '../stores/useSystemStore';
import { AGENT_WINDOW_DATA } from '../data/agentWindowData';
import { getTimestamp } from '../utils/format';

export interface PhaseEffectCallbacks {
  onPulsingAgentChange: (agentId: AgentId | null) => void;
  onInfoPanelAgentSwitch: (agentId: AgentId) => void;
  onWindowStatusText: (text: string) => void;
}

export function usePhaseEffects(callbacks: PhaseEffectCallbacks) {
  const prevPhaseRef = useRef<ScenarioPhaseType>(ScenarioPhase.IDLE);

  useEffect(() => {
    const unsubscribe = useScenarioStore.subscribe((state, prevState) => {
      if (state.phase === prevState.phase) return;

      const { phase, targetAgentId, activeAgentId } = state;
      const { onPulsingAgentChange, onInfoPanelAgentSwitch, onWindowStatusText } = callbacks;

      switch (phase) {
        case ScenarioPhase.ANOMALY_DETECTED:
          if (targetAgentId) {
            onPulsingAgentChange(targetAgentId);
            onInfoPanelAgentSwitch(targetAgentId);
          }
          onWindowStatusText('异常检测中...');
          break;

        case ScenarioPhase.SUPERVISOR_ANALYZING:
          onPulsingAgentChange('supervisor');
          onInfoPanelAgentSwitch('supervisor');
          onWindowStatusText('监管分析中...');
          break;

        case ScenarioPhase.DISPATCHING:
          if (targetAgentId) {
            onPulsingAgentChange(targetAgentId);
          }
          onWindowStatusText('任务派发中...');
          break;

        case ScenarioPhase.AGENT_ANALYZING:
          if (targetAgentId) {
            onPulsingAgentChange(null);
            onInfoPanelAgentSwitch(targetAgentId);
          }
          onWindowStatusText('智能体分析中...');
          break;

        case ScenarioPhase.SANDBOX_VALIDATING:
          if (targetAgentId) {
            onPulsingAgentChange(targetAgentId);
            onInfoPanelAgentSwitch(targetAgentId);
          }
          onWindowStatusText('安全沙箱推演中...');
          break;

        case ScenarioPhase.EXECUTING:
          onPulsingAgentChange(null);
          onWindowStatusText('执行中...');
          break;

        case ScenarioPhase.DEVICE_OPERATING:
          onWindowStatusText('效果回写中...');
          break;

        case ScenarioPhase.RECOVERING:
          onWindowStatusText('恢复中...');
          break;

        case ScenarioPhase.RECOVERED:
          onPulsingAgentChange(null);
          onWindowStatusText('已恢复');
          break;

        case ScenarioPhase.IDLE:
          onPulsingAgentChange(null);
          onWindowStatusText('');
          break;
      }

      prevPhaseRef.current = phase;
    });

    return unsubscribe;
  }, [callbacks]);
}
