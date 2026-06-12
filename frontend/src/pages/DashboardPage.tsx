import { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import type { AgentId, AgentRunStatus, AgentUIStatus, IncidentType, TelemetryState } from '../types/index';
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
import { ParameterControlSidebar } from '../components/ParameterControlSidebar';
import { WaterPlantCanvas3D } from '../components/WaterPlantCanvas3D';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useSystemStore } from '../stores/useSystemStore';
import { useWindowStore } from '../stores/useWindowStore';
import { useStreamingAI } from '../hooks/useStreamingAI';
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
  [ScenarioPhase.HUMAN_CONFIRMING]: 6,
  [ScenarioPhase.DEVICE_OPERATING]: 7,
  [ScenarioPhase.RECOVERING]: 7,
  [ScenarioPhase.RECOVERED]: 8,
};

const PHASE_DURATIONS_MS: Partial<Record<ScenarioPhase, number>> = {
  [ScenarioPhase.EXECUTING]: 2400,
  [ScenarioPhase.DEVICE_OPERATING]: 2600,
  [ScenarioPhase.RECOVERING]: 1200,
};

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
  const [pulsingAgentId, setPulsingAgentId] = useState<AgentId | null>(null);
  const [windowStatusText, setWindowStatusText] = useState('');

  const { animationTick, animationTickRef } = useAnimationLoop();
  const currentTime = useClock();
  const lastIncidentRef = useRef<string | null>(null);
  const lastEventStepRef = useRef<number | null>(null);
  const lastPhaseStepRef = useRef<number | null>(null);
  const { agentStatuses, setAgentStatuses, agentLogs, setAgentLogs } = useAgentState();
  const { cards, setCards, topZIndex, setTopZIndex, handleStartDrag, toggleAgentCard, closeAgentCard } =
    useAgentCards(containerRef);
  const {
    simulation,
    activeAnim,
    runStepChange,
    triggerSimulationIncident,
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
  });

  // ─── Zustand store 订阅 ───
  const windows = useWindowStore((state) => state.windows);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const openWindow = useWindowStore((state) => state.openWindow);
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

  // ─── AI 流式分析（A 的架构） ───
  const { startStream, abort: abortStream } = useStreamingAI();
  const incidentType = useScenarioStore((state) => state.incidentType);

  // 当 phase 进入 ANALYZING 时触发 AI 流式，完成后 onDone 推进一个阶段
  useEffect(() => {
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
    } else if (phase === ScenarioPhase.IDLE) {
      abortStream();
    }
  }, [phase]);

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

  const handleReturnHome = () => {
    closeAllWindows();
    setIsHelpOpen(false);
    setIsDebugPanelOpen(false);
  };

  const handleTerminateScene = () => {
    resetToNormal();
    forceScenarioIdle();
    clearScenarioThinking();
  };

  const handleConfirmHumanAction = (actions: RecommendationAction[] = []) => {
    const targetAgent = targetAgentId ?? activeAgentId ?? 'supervisor';
    const actionSummary = actions
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
    clearScenarioThinking();
    confirmHumanAction();
  };

  const handleRejectHumanAction = () => {
    const targetAgent = targetAgentId ?? activeAgentId ?? 'supervisor';
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

  usePhaseEffects({
    onPulsingAgentChange: setPulsingAgentId,
    onInfoPanelAgentSwitch: () => {},
    onWindowStatusText: setWindowStatusText,
  });

  // ─── 场景触发：simulation.active 变化时启动 incident ───
  useEffect(() => {
    if (!simulation.active || !simulation.type) {
      lastIncidentRef.current = null;
      lastEventStepRef.current = null;
      lastPhaseStepRef.current = null;
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
  }, [
    clearScenarioThinking,
    forceScenarioIdle,
    pushEvent,
    pushNotification,
    simulation.active,
    simulation.type,
    startScenarioIncident,
  ]);

  // ─── 单一流程编排：只有 phase 可以决定下一阶段，演示动画只跟随 phase ───
  useEffect(() => {
    if (!simulation.active) return;

    let timer: number | null = null;

    const duration = PHASE_DURATIONS_MS[phase];
    if (duration) {
      timer = window.setTimeout(() => {
        useScenarioStore.getState().advancePhase();
      }, duration);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [phase, simulation.active]);

  // ─── phase 同步演示画面：phase 是唯一流程主控，simulation.step 不再反向推进 phase ───
  useEffect(() => {
    if (!simulation.active) return;

    const expectedStep = PHASE_TO_SIM_STEP[phase];
    if (!expectedStep || lastPhaseStepRef.current === expectedStep) return;
    lastPhaseStepRef.current = expectedStep;

    if (expectedStep > simulation.step) {
      runStepChange(expectedStep, { force: true });
    }
  }, [phase, runStepChange, simulation.active, simulation.step]);

  useEffect(() => {
    if (!simulation.active) return;
    if (simulation.step !== lastEventStepRef.current && simulation.step > 0) {
      lastEventStepRef.current = simulation.step;
      pushEvent({
        time: getTimestamp(),
        text: simulation.title,
        type: simulation.step === 8 ? 'success' : 'info',
      });

      if (simulation.step === 8 && simulation.type) {
        const targetAgent = INCIDENT_TO_AGENT[simulation.type];
        pushNotification({
          title: '异常已恢复',
          description: `${AGENT_WINDOW_DATA[targetAgent].name}处置完成，系统恢复稳定巡检。`,
          time: getTimestamp(),
          agentId: targetAgent,
          level: 'success',
          autoDismissMs: 2000,
        });
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
        cards={cards}
        setCards={setCards}
        topZIndex={topZIndex}
        setTopZIndex={setTopZIndex}
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

              <div className="hidden items-center gap-4 text-xs font-mono text-slate-400 lg:flex">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full border border-blue-500 bg-blue-500/20" />
                  安全供水
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full border border-emerald-500 bg-emerald-500/20" />
                  优化分析中
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full border border-yellow-500 bg-yellow-500/20" />
                  异常决策流
                </span>
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
            awaitingHumanConfirmation={phase === ScenarioPhase.HUMAN_CONFIRMING}
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
          notificationCount={notifications.length}
          currentTime={currentTime}
          onHome={handleReturnHome}
          onSelectWindow={handleSelectTaskbarWindow}
          onOpenNotifications={() => undefined}
          className="mt-3 rounded-lg border border-slate-800"
        />
      </main>
      <HelpOverlay isOpen={isHelpOpen} shortcuts={KEYBOARD_SHORTCUTS} onClose={() => setIsHelpOpen(false)} />
      <Notification notifications={notifications} onDismiss={dismissNotification} onOpenAgent={handleOpenAgent} />
    </>
  );
}
