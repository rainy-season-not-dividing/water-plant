import React, { useState, useEffect, useRef } from 'react';
import type { AgentId, AgentLog, AgentStatusMap, IncidentType, TelemetryState, AnomalySimulation, ActiveAnimation, CardState } from '../../types/index';
import { getTimestamp } from '../../utils/format';
import { getScenarioMeta } from './simulationScripts';
import { applyDosingStep, applyUfStep, applyRoStep, applyPumpStep } from './stepAppliers';
import { DEFAULT_TELEMETRY } from '../../data/defaultTelemetry';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { ScenarioPhase } from '../../types/index';

interface UseSimulationDeps {
  animationTickRef: React.RefObject<number>;
  animationTick: number;
  telemetry: TelemetryState;
  setTelemetry: React.Dispatch<React.SetStateAction<TelemetryState>>;
  agentStatuses: AgentStatusMap;
  setAgentStatuses: React.Dispatch<React.SetStateAction<AgentStatusMap>>;
  agentLogs: Record<AgentId, AgentLog[]>;
  setAgentLogs: React.Dispatch<React.SetStateAction<Record<AgentId, AgentLog[]>>>;
  setCards: React.Dispatch<React.SetStateAction<Record<AgentId, CardState>>>;
  onStepComplete?: (step: number) => void;
}

export function useSimulation(deps: UseSimulationDeps) {
  const {
    animationTickRef, animationTick,
    telemetry, setTelemetry,
    agentStatuses, setAgentStatuses,
    agentLogs, setAgentLogs,
    setCards,
    onStepComplete,
  } = deps;

  const [simulation, setSimulation] = useState<AnomalySimulation>({
    active: false,
    type: null,
    step: 0,
    title: '系统状态良好',
    description: '全厂工艺链路平稳。四大子智能体协同巡检中。',
    logs: [
      '系统在线自检测完成，网络波动 < 5ms',
      '监管总管智能体完成例行拓扑评估，未见工艺指标偏倚'
    ]
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeAnim, setActiveAnim] = useState<ActiveAnimation | null>(null);

  const simulationRef = useRef(simulation);
  const telemetryRef = useRef(telemetry);
  const agentStatusesRef = useRef(agentStatuses);
  const agentLogsRef = useRef(agentLogs);
  const activeAnimRef = useRef(activeAnim);

  useEffect(() => { simulationRef.current = simulation; }, [simulation]);
  useEffect(() => { telemetryRef.current = telemetry; }, [telemetry]);
  useEffect(() => { agentStatusesRef.current = agentStatuses; }, [agentStatuses]);
  useEffect(() => { agentLogsRef.current = agentLogs; }, [agentLogs]);
  useEffect(() => { activeAnimRef.current = activeAnim; }, [activeAnim]);

  const getActiveAgentForStep = (type: IncidentType | null, step: number): AgentId => {
    if (!type) return 'supervisor';
    if (step === 3 || step === 4) return 'supervisor';
    if (type === 'dosing_abnormal') return 'dosing';
    if (type === 'uf_clogging') return 'uf';
    if (type === 'ro_fouling') return 'ro';
    if (type === 'pump_overload') return 'pump';
    return 'supervisor';
  };

  const isWaitingForAiPhase = () => {
    const phase = useScenarioStore.getState().phase;
    return phase === ScenarioPhase.SUPERVISOR_ANALYZING ||
      phase === ScenarioPhase.AGENT_ANALYZING ||
      phase === ScenarioPhase.SANDBOX_VALIDATING ||
      phase === ScenarioPhase.HUMAN_CONFIRMING;
  };

  const triggerCalibrationAnimation = (agentId: AgentId) => {
    setActiveAnim({
      agentId,
      type: 'manual_calibration',
      startTick: animationTickRef.current,
      duration: 120
    });
  };

  const executeActualCalibration = (agentId: AgentId) => {
    const stamp = getTimestamp();
    setAgentLogs(prev => ({
      ...prev,
      [agentId]: [
        { id: `man_success_${Math.random()}`, time: stamp, message: '✓【人工确认记录】现场已确认建议，执行结果回写完成。', type: 'success' },
        { id: `man_${Math.random()}`, time: stamp, message: '手动触发工艺单元复核记录。', type: 'info' },
        ...prev[agentId]
      ]
    }));
    setTelemetry(prev => {
      const copy = { ...prev };
      if (agentId === 'dosing') { copy.dosingRate = 4.8; copy.chemicalLevel = Math.min(copy.chemicalLevel + 5, 100); }
      else if (agentId === 'uf') { copy.ufPressure = 82; }
      else if (agentId === 'ro') { copy.roFlux = 75.2; }
      else if (agentId === 'pump') { copy.pumpCurrent = 28; copy.pumpTemperature = 55; copy.pumpStatus = 'normal'; }
      else if (agentId === 'supervisor') { copy.healthScore = 98; copy.onlineRate = 99.5; }
      return copy;
    });
    setAgentStatuses(prev => ({ ...prev, [agentId]: 'processing' }));
    setTimeout(() => {
      setAgentStatuses(prev => ({ ...prev, [agentId]: 'monitoring' }));
    }, 1500);
  };

  const runStepChange = (targetStep: number, options?: { force?: boolean }) => {
    const sim = simulationRef.current;
    if (!sim.active || !sim.type) return false;
    if (activeAnimRef.current) return false;
    if (!options?.force && isWaitingForAiPhase()) return false;
    if (targetStep <= sim.step || targetStep > 8) return false;
    const leadingAgent = getActiveAgentForStep(sim.type, targetStep);
    setActiveAnim({
      agentId: leadingAgent,
      type: 'step_transition',
      targetStep,
      startTick: animationTickRef.current,
      duration: 120
    });
    return true;
  };

  const executeActualStepChange = (targetStep: number) => {
    const sim = simulationRef.current;
    if (!sim.active || !sim.type) return;

    let payloadLogs: string[] = [...sim.logs];
    let stepTitle = '';
    let stepDesc = '';
    let t = { ...telemetryRef.current };
    let aStatuses = { ...agentStatusesRef.current };
    let aLogs = { ...agentLogsRef.current };
    const stamp = getTimestamp();

    if (sim.type === 'dosing_abnormal') {
      applyDosingStep(targetStep, stamp, t, aStatuses, aLogs, payloadLogs, s => { stepTitle = s; }, s => { stepDesc = s; }, p => { payloadLogs = p; });
    } else if (sim.type === 'uf_clogging') {
      applyUfStep(targetStep, stamp, t, aStatuses, aLogs, payloadLogs, s => { stepTitle = s; }, s => { stepDesc = s; }, p => { payloadLogs = p; });
    } else if (sim.type === 'ro_fouling') {
      applyRoStep(targetStep, stamp, t, aStatuses, aLogs, payloadLogs, s => { stepTitle = s; }, s => { stepDesc = s; }, p => { payloadLogs = p; });
    } else if (sim.type === 'pump_overload') {
      applyPumpStep(targetStep, stamp, t, aStatuses, aLogs, payloadLogs, s => { stepTitle = s; }, s => { stepDesc = s; }, p => { payloadLogs = p; });
    }

    if (targetStep === 8) setIsPlaying(false);

    setTelemetry(t);
    setAgentStatuses(aStatuses);
    setAgentLogs(aLogs);
    setSimulation(prev => ({
      ...prev,
      step: targetStep,
      title: stepTitle,
      description: stepDesc,
      logs: payloadLogs
    }));
    onStepComplete?.(targetStep);
  };

  // Animation completion detection
  useEffect(() => {
    if (!activeAnim) return;
    const elapsed = animationTick - activeAnim.startTick;
    if (elapsed >= activeAnim.duration || elapsed < 0) {
      const { type, targetStep, agentId } = activeAnim;
      setActiveAnim(null);
      if (type === 'step_transition' && targetStep !== undefined) {
        executeActualStepChange(targetStep);
      } else if (type === 'manual_calibration') {
        executeActualCalibration(agentId);
      }
    }
  }, [animationTick, activeAnim]);

  const triggerSimulationIncident = (incidentType: IncidentType) => {
    const meta = getScenarioMeta(incidentType);
    setSimulation({
      active: true,
      type: incidentType,
      step: 0,
      title: meta.title,
      description: meta.detail,
      logs: [`[场景激发] 仿真操作注入: ${meta.title}`]
    });
    setTimeout(() => {
      runStepChange(1, { force: true });
      setIsPlaying(true);
    }, 400);
  };

  const resetToNormal = () => {
    setIsPlaying(false);
    setActiveAnim(null);
    setTelemetry({ ...DEFAULT_TELEMETRY });
    setAgentStatuses({ supervisor: 'monitoring', dosing: 'monitoring', uf: 'monitoring', ro: 'monitoring', pump: 'monitoring' });
    setSimulation({
      active: false, type: null, step: 0,
      title: '系统状态良好',
      description: '全厂工艺链路平稳。四大子智能体协同巡检中。',
      logs: ['系统运行自检完毕：通信链路畅通，分布式控制响应 < 5ms。', '全系统多点监测参数已锚定，运行状态已同步。']
    });
    setCards({
      supervisor: { x: 50, y: 15, isOpen: false, zIndex: 10 },
      dosing: { x: 12, y: 38, isOpen: false, zIndex: 10 },
      uf: { x: 35, y: 55, isOpen: false, zIndex: 10 },
      ro: { x: 62, y: 38, isOpen: false, zIndex: 10 },
      pump: { x: 70, y: 58, isOpen: false, zIndex: 10 }
    });
  };

  return {
    simulation,
    isPlaying,
    setIsPlaying,
    activeAnim,
    runStepChange,
    triggerSimulationIncident,
    resetToNormal,
    triggerCalibrationAnimation
  };
}
