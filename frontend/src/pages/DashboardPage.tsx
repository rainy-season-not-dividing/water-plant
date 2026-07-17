import { useEffect, useRef, useState } from 'react';
import { Activity, LayoutDashboard } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import type { AgentId, AgentRunStatus, AgentUIStatus, IncidentType, ScenarioLogRecord, TelemetryState } from '../types/index';
import { ScenarioPhase } from '../types/index';
import { DEFAULT_TELEMETRY } from '../data/defaultTelemetry';
import { useAnimationLoop } from '../hooks/useAnimationLoop';
import { useClock } from '../hooks/useClock';
import { useKeyboard } from '../hooks/useKeyboard';
import { usePhaseEffects } from '../hooks/usePhaseEffects';
import { useAgentState } from '../features/agents/useAgentState';
import { useAgentCards } from '../features/agents/useAgentCards';
import { useSimulation } from '../features/simulation/useSimulation';
import { AGENT_ORDER, AGENT_WINDOW_DATA } from '../data/agentWindowData';
import { HeaderHUD } from '../components/HeaderHUD';
import { AgentWindow } from '../components/AgentWindow';
import { Dock } from '../components/Dock';
import { HelpOverlay, type HelpShortcutItem } from '../components/HelpOverlay';
import { InfoPanel } from '../components/InfoPanel';
import type { RecommendationAction } from '../components/InfoPanel/InfoPanel';
import { Notification } from '../components/Notification';
import { Taskbar } from '../components/Taskbar';
import { LogDrawer, ReplayMiniPanel } from '../components/LogDrawer';
import { ParameterControlSidebar } from '../components/ParameterControlSidebar';
import { WaterPlantCanvas3D } from '../components/WaterPlantCanvas3D';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useSystemStore } from '../stores/useSystemStore';
import { useWindowStore } from '../stores/useWindowStore';
import { useLogStore } from '../stores/useLogStore';
import { useStreamingAI } from '../hooks/useStreamingAI';
import { useSandboxValidation } from '../features/sandbox/useSandboxValidation';
import { parseSandboxValidation, type SandboxValidationResult } from '../features/sandbox/sandboxSkill';
import type { SandboxStreamStatus } from '../features/sandbox/useSandboxValidation';
import { createScenarioLogEvent, listScenarioLogHistory } from '../api/services/logService';
import { getTimestamp } from '../utils/format';

// ─── 类型映射 ───

const RUN_STATUS_TO_UI: Record<AgentRunStatus, AgentUIStatus> = {
  idle: 'normal',
  monitoring: 'normal',
  thinking: 'pending',
  processing: 'pending',
  warning: 'alarm',
  executing: 'recovering',
};

const INCIDENT_TO_AGENT: Record<string, AgentId> = {
  dosing_abnormal: 'dosing',
  uf_clogging: 'uf',
  ro_fouling: 'ro',
  pump_overload: 'pump',
};

// ─── 阶段→演示步进映射（phase 是唯一流程主控，simulation.step 只做画面跟随） ───

const PHASE_TO_SIM_STEP: Partial<Record<ScenarioPhase, number>> = {
  [ScenarioPhase.ANOMALY_DETECTED]: 1,
  [ScenarioPhase.SUPERVISOR_ANALYZING]: 2,
  [ScenarioPhase.DISPATCHING]: 4,
  [ScenarioPhase.AGENT_ANALYZING]: 5,
  [ScenarioPhase.SANDBOX_VALIDATING]: 5,
  [ScenarioPhase.HUMAN_CONFIRMING]: 6,
  [ScenarioPhase.DEVICE_OPERATING]: 7,
  [ScenarioPhase.RECOVERING]: 7,
  [ScenarioPhase.RECOVERED]: 8,
};

const PHASE_DURATIONS_MS: Partial<Record<ScenarioPhase, number>> = {
  [ScenarioPhase.EXECUTING]: 2400,
  [ScenarioPhase.DEVICE_OPERATING]: 2600,
};

const PHASE_ORDER_FOR_REPLAY: ScenarioPhase[] = [
  ScenarioPhase.ANOMALY_DETECTED,
  ScenarioPhase.SUPERVISOR_ANALYZING,
  ScenarioPhase.DISPATCHING,
  ScenarioPhase.AGENT_ANALYZING,
  ScenarioPhase.SANDBOX_VALIDATING,
  ScenarioPhase.HUMAN_CONFIRMING,
  ScenarioPhase.EXECUTING,
  ScenarioPhase.DEVICE_OPERATING,
  ScenarioPhase.RECOVERING,
  ScenarioPhase.RECOVERED,
];

const INITIAL_LOG_HISTORY_LIMIT = 100;
const LOG_HISTORY_LIMIT_STEP = 100;
const MAX_LOG_HISTORY_LIMIT = 500;

const KEYBOARD_SHORTCUTS: HelpShortcutItem[] = [
  { keys: 'Ctrl+1', description: '触发加药异常场景' },
  { keys: 'Ctrl+2', description: '触发超滤异常场景' },
  { keys: 'Ctrl+3', description: '触发反渗透异常场景' },
  { keys: 'Ctrl+4', description: '触发泵组异常场景' },
  { keys: '?', description: '显示或隐藏快捷键帮助' },
  { keys: 'Ctrl+Tab', description: '切换到下一个窗口' },
  { keys: 'Ctrl+Shift+Tab', description: '切换到上一个窗口' },
  { keys: 'Ctrl+Shift+D', description: '打开或关闭调试面板' },
  { keys: 'Ctrl+Home', description: '回到 OS 桌面' },
  { keys: 'Esc', description: '按优先级关闭浮层、终止场景、关闭通知或最小化窗口' },
];

function getReplayTypingConfig(text: string) {
  const visibleLength = Math.max(1, text.trim().length);
  const intervalMs = 45;
  const targetDurationMs = Math.min(5200, Math.max(1800, visibleLength * 28));
  const tickCount = Math.max(1, Math.floor(targetDurationMs / intervalMs));
  return {
    intervalMs,
    step: Math.max(1, Math.ceil(visibleLength / tickCount)),
  };
}

function getNextReplayPhase(phase: ScenarioPhase): ScenarioPhase | null {
  const currentIndex = PHASE_ORDER_FOR_REPLAY.indexOf(phase);
  if (currentIndex < 0) return null;
  return PHASE_ORDER_FOR_REPLAY[currentIndex + 1] ?? null;
}

// ─── DashboardPage ───
// 兼容说明（2026-05-29 合并后）：
//   - thinking 数据由 A 的 useStreamingAI 流式写入，不再由 B 的 buildThinking 手动构造
//   - ANALYZING 阶段的 phase 推进由 AI onDone 触发，步进同步 useEffect 中的 guard 阻塞
//   - B 的 BubbleOverlay 从 store 读取 thinking.text + thinking.status 渲染

export default function DashboardPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [telemetry, setTelemetry] = useState<TelemetryState>(DEFAULT_TELEMETRY);
  const [activeTab, setActiveTab] = useState<'model' | 'simulation_studio'>('model');
  const [camera, setCamera] = useState({ yaw: -35, pitch: 35, zoom: 0.95 });
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const [isReplayPanelVisible, setIsReplayPanelVisible] = useState(false);
  const [activeReplayRecord, setActiveReplayRecord] = useState<ScenarioLogRecord | null>(null);
  const [replaySandbox, setReplaySandbox] = useState<{
    status: SandboxStreamStatus;
    text: string;
    result: SandboxValidationResult | null;
  }>({ status: 'idle', text: '', result: null });
  const [pulsingAgentId, setPulsingAgentId] = useState<AgentId | null>(null);
  const [windowStatusText, setWindowStatusText] = useState('');

  const { animationTick, animationTickRef } = useAnimationLoop();
  const currentTime = useClock();
  const lastIncidentRef = useRef<string | null>(null);
  const lastEventStepRef = useRef<number | null>(null);
  const lastPhaseStepRef = useRef<number | null>(null);
  const replayTypingKeyRef = useRef<string>('');
  const replaySessionIdRef = useRef(0);
  const replayStopTimerRef = useRef<number | null>(null);
  const { agentStatuses, setAgentStatuses, agentLogs, setAgentLogs } = useAgentState();
  const { cards, setCards, topZIndex, setTopZIndex, handleStartDrag, toggleAgentCard, closeAgentCard } =
    useAgentCards(containerRef);
  const handleSimulationStepComplete = (step: number) => {
    const currentPhase = useScenarioStore.getState().phase;

    if (activeReplayRecord && step === 8 && currentPhase === ScenarioPhase.RECOVERED) {
      if (replayStopTimerRef.current) window.clearTimeout(replayStopTimerRef.current);
      replayStopTimerRef.current = window.setTimeout(() => {
        replayStopTimerRef.current = null;
        stopLogReplay();
      }, 500);
      return;
    }

    if (step !== 7) return;
    if (currentPhase === ScenarioPhase.DEVICE_OPERATING) {
      if (activeReplayRecord) {
        const nextPhase = getNextReplayPhase(currentPhase);
        if (!canReplayEnterPhase(activeReplayRecord, nextPhase)) {
          setActiveReplayRecord(null);
          setReplaySandbox({ status: 'idle', text: '', result: null });
          resetToNormal();
          useScenarioStore.getState().forceIdle();
          useScenarioStore.getState().clearThinking();
          return;
        }
      }
      useScenarioStore.getState().advancePhase();
    }
  };

  const {
    simulation,
    activeAnim,
    runStepChange,
    triggerSimulationIncident,
    replaySimulationIncident,
    resetToNormal,
    triggerCalibrationAnimation,
  } = useSimulation({
    animationTickRef,
    animationTick,
    telemetry,
    setTelemetry,
    agentStatuses,
    setAgentStatuses,
    agentLogs,
    setAgentLogs,
    setCards,
    onStepComplete: handleSimulationStepComplete,
  });

  // ─── Zustand store 订阅 ───
  const windows = useWindowStore((state) => state.windows);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const openWindow = useWindowStore((state) => state.openWindow);
  const openAllWindowsTiled = useWindowStore((state) => state.openAllWindowsTiled);
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const minimizeWindow = useWindowStore((state) => state.minimizeWindow);
  const restoreWindow = useWindowStore((state) => state.restoreWindow);
  const focusWindow = useWindowStore((state) => state.focusWindow);
  const moveWindow = useWindowStore((state) => state.moveWindow);
  const resizeWindow = useWindowStore((state) => state.resizeWindow);
  const closeAllWindows = useWindowStore((state) => state.closeAllWindows);
  const cycleWindow = useWindowStore((state) => state.cycleWindow);
  const agentUIStatus = useScenarioStore((state) => state.agentUIStatus);
  const agentRunStatuses = useScenarioStore((state) => state.agentRunStatuses);
  const phase = useScenarioStore((state) => state.phase);
  const activeAgentId = useScenarioStore((state) => state.activeAgentId);
  const targetAgentId = useScenarioStore((state) => state.targetAgentId);
  const thinking = useScenarioStore((state) => state.thinking);
  const decisionSteps = useScenarioStore((state) => state.decisionSteps);
  const startScenarioIncident = useScenarioStore((state) => state.startIncident);
  const advanceScenarioPhase = useScenarioStore((state) => state.advancePhase);
  const clearScenarioThinking = useScenarioStore((state) => state.clearThinking);
  const forceScenarioIdle = useScenarioStore((state) => state.forceIdle);
  const confirmHumanAction = useScenarioStore((state) => state.confirmHumanAction);
  const rejectHumanAction = useScenarioStore((state) => state.rejectHumanAction);
  const eventLog = useSystemStore((state) => state.eventLog);
  const notifications = useSystemStore((state) => state.notifications);
  const pushEvent = useSystemStore((state) => state.pushEvent);
  const pushNotification = useSystemStore((state) => state.pushNotification);
  const dismissNotification = useSystemStore((state) => state.dismissNotification);
  const clearNotifications = useSystemStore((state) => state.clearNotifications);
  const logRecords = useLogStore((state) => state.records);
  const logHydratedFromBackend = useLogStore((state) => state.hydratedFromBackend);
  const isLogHydrating = useLogStore((state) => state.isHydrating);
  const isLogLoadingMore = useLogStore((state) => state.isLoadingMore);
  const logHistoryLimit = useLogStore((state) => state.historyLimit);
  const restoredEventCount = useLogStore((state) => state.restoredEventCount);
  const restoredRecordCount = useLogStore((state) => state.restoredRecordCount);
  const hasMoreLogHistory = useLogStore((state) => state.hasMoreHistory);
  const unreadLogCount = useLogStore((state) => state.unreadCount);
  const startScenarioLog = useLogStore((state) => state.startScenarioLog);
  const updateActiveScenarioLog = useLogStore((state) => state.updateActiveScenarioLog);
  const hydrateLogsFromBackend = useLogStore((state) => state.hydrateLogsFromBackend);
  const setLogHydrating = useLogStore((state) => state.setHydrating);
  const setLogLoadingMore = useLogStore((state) => state.setLoadingMore);
  const markLogsRead = useLogStore((state) => state.markLogsRead);

  // ─── AI 流式分析（A 的架构） ───
  const { startStream, abort: abortStream } = useStreamingAI();
  const { sandbox, startSandboxValidation, resetSandboxValidation } = useSandboxValidation();
  const incidentType = useScenarioStore((state) => state.incidentType);
  const isReplayMode = activeReplayRecord !== null;
  const visibleSandbox = isReplayMode ? replaySandbox : sandbox;

  const getReplayMaxPhase = (record: ScenarioLogRecord) => record.replayMaxPhase ?? ScenarioPhase.ANOMALY_DETECTED;
  const canReplayEnterPhase = (record: ScenarioLogRecord, nextPhase: ScenarioPhase | null) => {
    if (!nextPhase) return false;
    const nextIndex = PHASE_ORDER_FOR_REPLAY.indexOf(nextPhase);
    const maxIndex = PHASE_ORDER_FOR_REPLAY.indexOf(getReplayMaxPhase(record));
    return nextIndex >= 0 && maxIndex >= 0 && nextIndex <= maxIndex;
  };
  const advanceReplayPhase = () => {
    const record = activeReplayRecord;
    if (!record) return;
    const currentPhase = useScenarioStore.getState().phase;
    const nextPhase = getNextReplayPhase(currentPhase);
    if (!canReplayEnterPhase(record, nextPhase)) {
      stopLogReplay();
      return;
    }
    useScenarioStore.getState().advancePhase();
  };

  // 当 phase 进入 ANALYZING 时触发 AI 流式，完成后 onDone 推进一个阶段
  useEffect(() => {
    if (isReplayMode) return;

    if (phase === ScenarioPhase.SUPERVISOR_ANALYZING && incidentType) {
      startStream({
        agentId: 'supervisor',
        incidentType: incidentType as IncidentType,
        phase: 'supervisor',
        telemetry: telemetry,
        title: '监管智能体正在分析',
        onDone: () => advanceScenarioPhase(),
      });
    } else if (phase === ScenarioPhase.AGENT_ANALYZING && incidentType && targetAgentId) {
      startStream({
        agentId: targetAgentId,
        incidentType: incidentType as IncidentType,
        phase: 'agent',
        telemetry: telemetry,
        title: `${AGENT_WINDOW_DATA[targetAgentId].name}建议方案推演`,
        onDone: () => advanceScenarioPhase(),
      });
    } else if (phase === ScenarioPhase.SANDBOX_VALIDATING && incidentType && targetAgentId) {
      startSandboxValidation({
        agentId: targetAgentId,
        incidentType: incidentType as IncidentType,
        telemetry: telemetry,
        onDone: () => advanceScenarioPhase(),
      });
    } else if (phase === ScenarioPhase.IDLE) {
      abortStream();
      resetSandboxValidation();
    }
  }, [isReplayMode, phase]);

  // ─── 派生状态 ───
  const visibleAgentId = activeWindowId ?? activeAgentId ?? targetAgentId;
  const currentAgent = visibleAgentId
    ? {
        id: visibleAgentId,
        name: AGENT_WINDOW_DATA[visibleAgentId].name,
        status: agentUIStatus,
      }
    : null;
  const dockAgents = AGENT_ORDER.map((agentId) => {
    const uiStatus = RUN_STATUS_TO_UI[agentRunStatuses[agentId]];
    return {
      id: agentId,
      label: AGENT_WINDOW_DATA[agentId].englishName,
      status: uiStatus,
      badgeCount: uiStatus === 'alarm' && targetAgentId === agentId ? 1 : undefined,
      isActive: activeWindowId === agentId && !windows[agentId].isMinimized,
    };
  });
  const taskbarWindows = AGENT_ORDER.filter((agentId) => windows[agentId].isOpen).map((agentId) => ({
    agentId,
    title: AGENT_WINDOW_DATA[agentId].name,
    status: RUN_STATUS_TO_UI[agentRunStatuses[agentId]],
    isActive: activeWindowId === agentId,
    isMinimized: windows[agentId].isMinimized,
  }));
  const hasOpenAgentWindows = AGENT_ORDER.some((agentId) => windows[agentId].isOpen);

  // ─── 事件处理 ───

  const handleSelectTaskbarWindow = (agentId: AgentId) => {
    if (windows[agentId].isMinimized) {
      restoreWindow(agentId);
      return;
    }
    focusWindow(agentId);
  };

  const handleOpenAgent = (agentId: AgentId) => {
    openWindow(agentId);
    useScenarioStore.getState().setActiveAgent(agentId);
  };

  const handleOpenAllAgents = () => {
    openAllWindowsTiled({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  const handleOpenLogDrawer = () => {
    markLogsRead();
    if (activeReplayRecord) {
      setIsReplayPanelVisible(true);
      setIsLogDrawerOpen(false);
      return;
    }
    setIsLogDrawerOpen(true);
  };

  const handleLoadMoreLogs = () => {
    if (isLogLoadingMore || !hasMoreLogHistory) return;
    const nextLimit = Math.min(logHistoryLimit + LOG_HISTORY_LIMIT_STEP, MAX_LOG_HISTORY_LIMIT);
    setLogLoadingMore(true);
    listScenarioLogHistory(nextLimit)
      .then((result) => {
        hydrateLogsFromBackend(result);
      })
      .catch(() => {
        setLogLoadingMore(false);
      });
  };

  const handleReturnHome = () => {
    closeAllWindows();
    setIsHelpOpen(false);
    setIsDebugPanelOpen(false);
    setIsLogDrawerOpen(false);
    setIsReplayPanelVisible(false);
    setActiveReplayRecord(null);
  };

  const handleTerminateScene = () => {
    replaySessionIdRef.current += 1;
    replayTypingKeyRef.current = '';
    setActiveReplayRecord(null);
    setIsReplayPanelVisible(false);
    resetToNormal();
    forceScenarioIdle();
    clearScenarioThinking();
  };

  const stopLogReplay = (options: { keepPanel?: boolean } = {}) => {
    if (replayStopTimerRef.current) {
      window.clearTimeout(replayStopTimerRef.current);
      replayStopTimerRef.current = null;
    }
    replaySessionIdRef.current += 1;
    replayTypingKeyRef.current = '';
    setActiveReplayRecord(null);
    if (!options.keepPanel) setIsReplayPanelVisible(false);
    setReplaySandbox({ status: 'idle', text: '', result: null });
    resetToNormal();
    forceScenarioIdle();
    clearScenarioThinking();
  };

  const handleReplayLogRecord = (record: ScenarioLogRecord) => {
    if (activeReplayRecord?.id === record.id) {
      stopLogReplay();
      return;
    }

    replaySessionIdRef.current += 1;
    const sessionId = replaySessionIdRef.current;
    if (replayStopTimerRef.current) {
      window.clearTimeout(replayStopTimerRef.current);
      replayStopTimerRef.current = null;
    }
    replayTypingKeyRef.current = '';
    setActiveReplayRecord(null);
    resetToNormal();
    forceScenarioIdle();
    clearScenarioThinking();
    resetSandboxValidation();
    setReplaySandbox({ status: 'idle', text: '', result: null });
    setActiveReplayRecord(record);
    setIsReplayPanelVisible(true);
    setIsLogDrawerOpen(false);
    setActiveTab('model');
    replayTypingKeyRef.current = `${sessionId}:pending`;
    replaySimulationIncident(record.incidentType);
    startScenarioIncident(record.incidentType);
  };

  const handleConfirmHumanAction = (actions: RecommendationAction[] = []) => {
    const targetAgent = targetAgentId ?? activeAgentId ?? 'supervisor';
    const activeLog = useLogStore.getState().getActiveScenarioLog();
    const validActions = actions.filter((item) => item.action.trim());
    if (validActions.length === 0) {
      handleRejectHumanAction();
      return;
    }
    const actionSummary = validActions
      .map((item, index) => `${index + 1}. ${item.action}（${item.parameter}）`)
      .join('；');
    pushEvent({
      time: getTimestamp(),
      text: actionSummary
        ? `人工已确认处置步骤：${actionSummary}`
        : '人工已确认 AI 建议，进入执行记录与效果回写流程。',
      type: 'success',
    });
    pushNotification({
      title: '人工确认完成',
      description: '建议已确认，系统开始记录后续处置结果。',
      time: getTimestamp(),
      agentId: targetAgent,
      level: 'success',
      autoDismissMs: 2500,
    });
    updateActiveScenarioLog({
      planResult: {
        status: 'executed',
        summary: `已生成 ${validActions.length} 条方案`,
        detail: validActions
          .map((item, index) => `${index + 1}. ${item.action}\n参数：${item.parameter || '未填写'}\n依据：${item.basis || '未填写'}`)
          .join('\n\n'),
      },
    });
    if (activeLog) {
      void createScenarioLogEvent({
        scenarioId: activeLog.id,
        type: 'human_confirmation',
        agentId: targetAgent,
        incidentType: activeLog.incidentType,
        phase: 'human_confirming',
        summary: `已生成 ${validActions.length} 条方案`,
        payload: {
          actions: validActions,
        },
      });
    }
    clearScenarioThinking();
    confirmHumanAction();
  };

  const handleRejectHumanAction = () => {
    const targetAgent = targetAgentId ?? activeAgentId ?? 'supervisor';
    const activeLog = useLogStore.getState().getActiveScenarioLog();
    pushEvent({
      time: getTimestamp(),
      text: '人工驳回 AI 建议，处置单转入复核。',
      type: 'warning',
    });
    pushNotification({
      title: '建议已驳回',
      description: 'AI 建议未执行，需补充现场信息后复核。',
      time: getTimestamp(),
      agentId: targetAgent,
      level: 'warning',
      autoDismissMs: 3000,
    });
    updateActiveScenarioLog({
      planResult: {
        status: 'rejected',
        summary: '已驳回，未执行',
        detail: '当前方案未执行。需要补充现场信息或重新生成处置建议后再确认。',
      },
    });
    if (activeLog) {
      void createScenarioLogEvent({
        scenarioId: activeLog.id,
        type: 'human_rejection',
        agentId: targetAgent,
        incidentType: activeLog.incidentType,
        phase: 'human_confirming',
        summary: '已驳回，未执行',
      });
    }
    rejectHumanAction();
    resetToNormal();
  };

  const handleTriggerIncident = (incidentType: Parameters<typeof triggerSimulationIncident>[0]) => {
    if (useScenarioStore.getState().phase !== ScenarioPhase.IDLE || simulation.active) return;
    triggerSimulationIncident(incidentType);
  };

  // ─── Hooks ───

  useKeyboard({
    phase,
    isHelpOpen,
    isSceneRunning: simulation.active,
    hasNotifications: notifications.length > 0,
    activeWindowId,
    onTriggerIncident: handleTriggerIncident,
    onTerminateScene: handleTerminateScene,
    onToggleHelp: () => setIsHelpOpen((value) => !value),
    onCloseHelp: () => setIsHelpOpen(false),
    onToggleDebugPanel: () => setIsDebugPanelOpen((value) => !value),
    onReturnHome: handleReturnHome,
    onClearNotifications: clearNotifications,
    onMinimizeWindow: minimizeWindow,
    onCycleWindow: cycleWindow,
  });

  useEffect(() => {
    if (logHydratedFromBackend || isLogHydrating) return;

    let cancelled = false;
    setLogHydrating(true);
    listScenarioLogHistory(INITIAL_LOG_HISTORY_LIMIT)
      .then((result) => {
        if (!cancelled) hydrateLogsFromBackend(result);
      })
      .catch(() => {
        if (!cancelled) hydrateLogsFromBackend({ records: [], eventCount: 0, limit: INITIAL_LOG_HISTORY_LIMIT, hasMore: false });
      });

    return () => {
      cancelled = true;
      setLogHydrating(false);
    };
  }, [hydrateLogsFromBackend, logHydratedFromBackend, setLogHydrating]);

  usePhaseEffects({
    onPulsingAgentChange: setPulsingAgentId,
    onInfoPanelAgentSwitch: () => {},
    onWindowStatusText: setWindowStatusText,
  });

  // ─── 场景触发：simulation.active 变化时启动 incident ───
  useEffect(() => {
    if (isReplayMode) return;

    if (!simulation.active || !simulation.type) {
      lastIncidentRef.current = null;
      lastEventStepRef.current = null;
      lastPhaseStepRef.current = null;
      resetSandboxValidation();
      clearScenarioThinking();
      forceScenarioIdle();
      return;
    }

    if (lastIncidentRef.current === simulation.type) return;

    const targetAgent = INCIDENT_TO_AGENT[simulation.type];
    lastIncidentRef.current = simulation.type;
    startScenarioIncident(simulation.type);
    pushEvent({
      time: getTimestamp(),
      text: `${AGENT_WINDOW_DATA[targetAgent].name}检测到异常，监管智能体接入分析。`,
      type: 'warning',
    });
    pushNotification({
      title: '系统异常告警',
      description: `${AGENT_WINDOW_DATA[targetAgent].name}检测到异常，点击打开对应 Agent 窗口。`,
      time: getTimestamp(),
      agentId: targetAgent,
      level: 'error',
      autoDismissMs: 5000,
    });
    const scenarioId = startScenarioLog({
      startedAt: getTimestamp(),
      incidentTitle: `${AGENT_WINDOW_DATA[targetAgent].name}检测到异常`,
      incidentType: simulation.type as IncidentType,
      targetAgentId: targetAgent,
    });
    void createScenarioLogEvent({
      scenarioId,
      type: 'scenario_started',
      agentId: targetAgent,
      incidentType: simulation.type as IncidentType,
      phase: 'detected',
      summary: `${AGENT_WINDOW_DATA[targetAgent].name}检测到异常`,
      payload: {
        telemetry,
      },
    });
    resetSandboxValidation();
  }, [
    clearScenarioThinking,
    forceScenarioIdle,
    isReplayMode,
    pushEvent,
    pushNotification,
    simulation.active,
    simulation.type,
    startScenarioIncident,
    startScenarioLog,
    resetSandboxValidation,
    telemetry,
  ]);

  // ─── 单一流程编排：只有 phase 可以决定下一阶段，演示动画只跟随 phase ───
  useEffect(() => {
    if (!simulation.active) return;

    let timer: number | null = null;

    const duration = PHASE_DURATIONS_MS[phase];
    if (duration) {
      timer = window.setTimeout(() => {
        if (isReplayMode) {
          advanceReplayPhase();
          return;
        }

        useScenarioStore.getState().advancePhase();
      }, duration);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [isReplayMode, phase, simulation.active, activeReplayRecord]);

  // ─── phase 同步演示画面：phase 是唯一流程主控，simulation.step 不再反向推进 phase ───
  useEffect(() => {
    if (!simulation.active || isReplayMode) return;

    const expectedStep = PHASE_TO_SIM_STEP[phase];
    if (!expectedStep || lastPhaseStepRef.current === expectedStep) return;

    if (expectedStep > simulation.step) {
      const queued = runStepChange(expectedStep, { force: true });
      if (queued) {
        lastPhaseStepRef.current = expectedStep;
      }
    } else {
      lastPhaseStepRef.current = expectedStep;
    }
  }, [isReplayMode, phase, runStepChange, simulation.active, simulation.step]);

  useEffect(() => {
    if (!isReplayMode || !simulation.active) return;

    const expectedStep = PHASE_TO_SIM_STEP[phase];
    if (!expectedStep) return;

    if (expectedStep > simulation.step) {
      runStepChange(expectedStep, { force: true });
    }
  }, [isReplayMode, phase, runStepChange, simulation.active, simulation.step]);

  useEffect(() => {
    if (!isReplayMode || !activeReplayRecord) return;
    if (!canReplayEnterPhase(activeReplayRecord, phase)) {
      stopLogReplay();
    }
  }, [activeReplayRecord, isReplayMode, phase]);

  useEffect(() => {
    if (!isReplayMode || !activeReplayRecord) return;

    const targetAgent = activeReplayRecord.targetAgentId;
    const scenarioStore = useScenarioStore.getState();
    const typingKey = `${replaySessionIdRef.current}:${activeReplayRecord.id}:${phase}`;

    if (phase === ScenarioPhase.SUPERVISOR_ANALYZING) {
      replayTypingKeyRef.current = typingKey;
      const fullText = activeReplayRecord.supervisorThinking || '该历史记录暂无监管分析详情。';
      const typing = getReplayTypingConfig(fullText);
      let index = 0;
      scenarioStore.setThinking('supervisor', { title: '历史监管分析', text: '', status: 'streaming' });
      const typingTimer = window.setInterval(() => {
        if (replayTypingKeyRef.current !== typingKey) {
          window.clearInterval(typingTimer);
          return;
        }
        index = Math.min(fullText.length, index + typing.step);
        useScenarioStore.getState().setThinking('supervisor', {
          title: '历史监管分析',
          text: fullText.slice(0, index),
          status: index >= fullText.length ? 'done' : 'streaming',
        });
        if (index >= fullText.length) {
          window.clearInterval(typingTimer);
          advanceReplayPhase();
        }
      }, typing.intervalMs);
      return () => window.clearInterval(typingTimer);
    } else if (phase === ScenarioPhase.AGENT_ANALYZING) {
      replayTypingKeyRef.current = typingKey;
      const fullText = activeReplayRecord.edgeAgentThinking || '该历史记录暂无专项分析详情。';
      const typing = getReplayTypingConfig(fullText);
      let index = 0;
      scenarioStore.setThinking(targetAgent, { title: '历史专项分析', text: '', status: 'streaming' });
      const typingTimer = window.setInterval(() => {
        if (replayTypingKeyRef.current !== typingKey) {
          window.clearInterval(typingTimer);
          return;
        }
        index = Math.min(fullText.length, index + typing.step);
        useScenarioStore.getState().setThinking(targetAgent, {
          title: '历史专项分析',
          text: fullText.slice(0, index),
          status: index >= fullText.length ? 'done' : 'streaming',
        });
        if (index >= fullText.length) {
          window.clearInterval(typingTimer);
          advanceReplayPhase();
        }
      }, typing.intervalMs);
      return () => window.clearInterval(typingTimer);
    } else if (phase === ScenarioPhase.SANDBOX_VALIDATING) {
      const sandboxText = activeReplayRecord.sandboxThinking || '该历史记录暂无沙箱推演详情。';
      const parsedResult =
        activeReplayRecord.sandboxResult && typeof activeReplayRecord.sandboxResult === 'object'
          ? activeReplayRecord.sandboxResult as SandboxValidationResult
          : activeReplayRecord.sandboxThinking
            ? parseSandboxValidation(activeReplayRecord.sandboxThinking)
            : null;
      setReplaySandbox({
        status: parsedResult ? 'streaming' : 'idle',
        text: '',
        result: parsedResult,
      });
      replayTypingKeyRef.current = typingKey;
      const typing = getReplayTypingConfig(sandboxText);
      let index = 0;
      scenarioStore.setThinking(targetAgent, { title: '历史沙箱推演', text: '', status: 'streaming' });
      const typingTimer = window.setInterval(() => {
        if (replayTypingKeyRef.current !== typingKey) {
          window.clearInterval(typingTimer);
          return;
        }
        index = Math.min(sandboxText.length, index + typing.step);
        const nextText = sandboxText.slice(0, index);
        const done = index >= sandboxText.length;
        setReplaySandbox({
          status: parsedResult ? (done ? 'done' : 'streaming') : 'idle',
          text: nextText,
          result: parsedResult,
        });
        useScenarioStore.getState().setThinking(targetAgent, {
          title: '历史沙箱推演',
          text: nextText,
          status: done ? 'done' : 'streaming',
        });
        if (done) {
          window.clearInterval(typingTimer);
          advanceReplayPhase();
        }
      }, typing.intervalMs);
      return () => window.clearInterval(typingTimer);
    } else if (phase === ScenarioPhase.HUMAN_CONFIRMING && activeReplayRecord.planResult) {
      replayTypingKeyRef.current = typingKey;
      const fullText = `${activeReplayRecord.planResult.summary}\n\n${activeReplayRecord.planResult.detail}`;
      const typing = getReplayTypingConfig(fullText);
      let index = 0;
      scenarioStore.setThinking(targetAgent, { title: '历史处置结果', text: '', status: 'streaming' });
      const typingTimer = window.setInterval(() => {
        if (replayTypingKeyRef.current !== typingKey) {
          window.clearInterval(typingTimer);
          return;
        }
        index = Math.min(fullText.length, index + typing.step);
        useScenarioStore.getState().setThinking(targetAgent, {
          title: '历史处置结果',
          text: fullText.slice(0, index),
          status: index >= fullText.length ? 'done' : 'streaming',
        });
        if (index >= fullText.length) {
          window.clearInterval(typingTimer);
          advanceReplayPhase();
        }
      }, typing.intervalMs);
      return () => window.clearInterval(typingTimer);
    } else if (phase === ScenarioPhase.DISPATCHING || phase === ScenarioPhase.EXECUTING || phase === ScenarioPhase.RECOVERING || phase === ScenarioPhase.RECOVERED) {
      scenarioStore.clearThinking();
    }
  }, [activeReplayRecord, isReplayMode, phase]);

  useEffect(() => {
    if (!simulation.active || isReplayMode) return;
    if (simulation.step !== lastEventStepRef.current && simulation.step > 0) {
      lastEventStepRef.current = simulation.step;
      pushEvent({
        time: getTimestamp(),
        text: simulation.title,
        type: simulation.step === 8 ? 'success' : 'info',
      });

      if (simulation.step === 8 && simulation.type) {
        const targetAgent = INCIDENT_TO_AGENT[simulation.type];
        const activeLog = useLogStore.getState().getActiveScenarioLog();
        pushNotification({
          title: '异常已恢复',
          description: `${AGENT_WINDOW_DATA[targetAgent].name}处置完成，系统恢复稳定巡检。`,
          time: getTimestamp(),
          agentId: targetAgent,
          level: 'success',
          autoDismissMs: 2000,
        });
        if (activeLog) {
          void createScenarioLogEvent({
            scenarioId: activeLog.id,
            type: 'scenario_closed',
            agentId: targetAgent,
            incidentType: simulation.type,
            phase: 'recovered',
            summary: `${AGENT_WINDOW_DATA[targetAgent].name}处置完成，系统恢复稳定巡检。`,
            payload: {
              telemetry,
            },
          });
        }
        window.setTimeout(() => {
          resetToNormal();
          useScenarioStore.getState().forceIdle();
          useScenarioStore.getState().clearThinking();
        }, 2000);
      }
    }
  }, [
    pushEvent,
    pushNotification,
    resetToNormal,
    isReplayMode,
    simulation.active,
    simulation.step,
    simulation.title,
    simulation.type,
  ]);

  // ─── JSX ───

  return (
    <>
      <HeaderHUD
        simulation={simulation}
        telemetry={telemetry}
        currentTime={currentTime}
        resetToNormal={resetToNormal}
        hasOpenAgentWindows={hasOpenAgentWindows}
        onOpenAllAgents={handleOpenAllAgents}
        onCloseAllAgents={closeAllWindows}
      />

      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 pb-24" id="main-control-board">
        <div className="grid min-h-[760px] flex-1 grid-cols-[72px_minmax(0,1fr)_300px] gap-4">
          <aside className="flex min-h-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/75">
            <Dock agents={dockAgents} pulsingAgentId={pulsingAgentId} onOpenAgent={handleOpenAgent} />
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between px-1" id="tab-nav">
              <div className="flex space-x-1.5 rounded-lg border border-slate-800/80 bg-slate-950/80 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('model')}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 ${
                    activeTab === 'model'
                      ? 'border border-teal-500/40 bg-teal-500/15 text-teal-300 shadow-lg shadow-teal-500/5'
                      : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
                  }`}
                  id="tab-view-model"
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span>智能水厂 3D 数字孪生视图</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('simulation_studio')}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 ${
                    activeTab === 'simulation_studio'
                      ? 'border border-teal-500/40 bg-teal-500/15 text-teal-300 shadow-lg shadow-teal-500/5'
                      : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
                  }`}
                  id="tab-view-simulator"
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span>精细化参数控制面板</span>
                </button>
              </div>

              <div className="flex items-center">
                <a
                  href="/cockpit"
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold tracking-[0.2em] text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-500/15 hover:text-white"
                >
                  <LayoutDashboard className="h-3.5 w-3.5 transition group-hover:scale-110" />
                  <span>集团驾驶舱</span>
                </a>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-12 gap-4">
              <WaterPlantCanvas3D
                containerRef={containerRef}
                telemetry={telemetry}
                setTelemetry={setTelemetry}
                simulation={simulation}
                agentStatuses={agentStatuses}
                agentLogs={agentLogs}
                cards={cards}
                setCards={setCards}
                camera={camera}
                setCamera={setCamera}
                animationTick={animationTick}
                toggleAgentCard={toggleAgentCard}
                closeAgentCard={closeAgentCard}
                handleStartDrag={handleStartDrag}
                setAgentLogs={setAgentLogs}
                activeTab={activeTab}
                activeAnim={activeAnim}
                triggerCalibrationAnimation={triggerCalibrationAnimation}
              />

              {activeTab === 'simulation_studio' && (
                <ParameterControlSidebar
                  telemetry={telemetry}
                  setTelemetry={setTelemetry}
                  resetToNormal={resetToNormal}
                />
              )}
            </div>

          </section>

          <InfoPanel
            currentAgent={currentAgent}
            thinking={thinking}
            telemetry={telemetry}
            decisionSteps={decisionSteps}
            events={eventLog}
            incidentType={incidentType as IncidentType | null}
            sandboxStatus={visibleSandbox.status}
            sandboxText={visibleSandbox.text}
            sandboxValidation={visibleSandbox.result}
            awaitingHumanConfirmation={phase === ScenarioPhase.HUMAN_CONFIRMING}
            readOnly={isReplayMode}
            onConfirmHumanAction={handleConfirmHumanAction}
            onRejectHumanAction={handleRejectHumanAction}
            className="min-h-0 rounded-lg border border-slate-800"
          />
        </div>

        <AnimatePresence>
          {AGENT_ORDER.map((agentId) => {
            const windowState = windows[agentId];
            const agent = AGENT_WINDOW_DATA[agentId];
            if (!windowState.isOpen) return null;

            return (
              <AgentWindow
                key={agentId}
                agentId={agentId}
                title={agent.name}
                status={agentUIStatus}
                role={agent.role}
                metrics={agent.metrics}
                capabilities={agent.capabilities}
                logs={agentLogs[agentId]}
                footerText={windowStatusText || (windowState.isMinimized ? '已最小化' : '等待分析 · 决策链同步')}
                isActive={activeWindowId === agentId}
                isMinimized={windowState.isMinimized}
                position={windowState.position}
                size={windowState.size}
                zIndex={windowState.zIndex}
                onFocus={focusWindow}
                onMinimize={minimizeWindow}
                onClose={closeWindow}
                onMove={moveWindow}
                onResize={resizeWindow}
              />
            );
          })}
        </AnimatePresence>

        {isDebugPanelOpen ? (
          <section className="absolute bottom-20 right-84 z-40 w-72 rounded-lg border border-cyan-500/40 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-cyan-200">调试面板</h2>
              <button
                type="button"
                onClick={() => setIsDebugPanelOpen(false)}
                className="h-7 w-7 rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                aria-label="关闭调试面板"
              >
                x
              </button>
            </div>
            <dl className="mt-3 grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-slate-500">Phase</dt>
              <dd className="font-mono text-slate-200">{phase}</dd>
              <dt className="text-slate-500">Active</dt>
              <dd>{activeWindowId ? AGENT_WINDOW_DATA[activeWindowId].name : '无窗口'}</dd>
              <dt className="text-slate-500">Scene</dt>
              <dd>{simulation.active ? simulation.title : '空闲'}</dd>
            </dl>
          </section>
        ) : null}

        <Taskbar
          windows={taskbarWindows}
          notificationCount={unreadLogCount}
          currentTime={currentTime}
          onHome={handleReturnHome}
          onSelectWindow={handleSelectTaskbarWindow}
          onOpenNotifications={handleOpenLogDrawer}
          className="mt-3 rounded-lg border border-slate-800"
        />
      </main>
      <HelpOverlay isOpen={isHelpOpen} shortcuts={KEYBOARD_SHORTCUTS} onClose={() => setIsHelpOpen(false)} />
      <LogDrawer
        isOpen={isLogDrawerOpen}
        records={logRecords}
        isLoading={isLogHydrating}
        isLoadingMore={isLogLoadingMore}
        restoredRecordCount={restoredRecordCount}
        restoredEventCount={restoredEventCount}
        hasMoreHistory={hasMoreLogHistory}
        activeReplayRecordId={activeReplayRecord?.id ?? null}
        onLoadMore={handleLoadMoreLogs}
        onReplayRecord={handleReplayLogRecord}
        onClose={() => {
          setIsLogDrawerOpen(false);
          if (activeReplayRecord) setIsReplayPanelVisible(true);
        }}
      />
      {activeReplayRecord && isReplayPanelVisible && !isLogDrawerOpen ? (
        <ReplayMiniPanel
          record={activeReplayRecord}
          onExpand={() => {
            setIsReplayPanelVisible(false);
            setIsLogDrawerOpen(true);
          }}
          onHide={() => setIsReplayPanelVisible(false)}
          onStopReplay={() => stopLogReplay()}
        />
      ) : null}
      <Notification notifications={notifications} onDismiss={dismissNotification} onOpenAgent={handleOpenAgent} />
    </>
  );
}
