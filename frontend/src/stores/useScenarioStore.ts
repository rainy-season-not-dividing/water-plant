import { create } from 'zustand';
import type {
  ScenarioPhase,
  AgentId,
  AgentUIStatus,
  AgentRunStatus,
  IncidentType,
  ThinkingContent,
  DecisionStep,
  CameraFocusTarget,
  ParticleIntent,
} from '../types/index';
import { ScenarioPhase as Phase } from '../types/index';
import { DEVICE_FOCUS_PRESETS } from '../simulation3d/config';

// 调试日志：阶段转换
const logPhase = (from: string, to: string, extra?: Record<string, unknown>) => {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    console.log(
      `%c[3d:phase]%c ${from} → ${to}`,
      'color:#60a5fa;font-weight:600',
      'color:inherit',
      extra ?? '',
    );
  }
};

// ─── Phase → Agent UI 四态映射 ───

const PHASE_TO_UI_STATUS: Record<ScenarioPhase, AgentUIStatus> = {
  [Phase.IDLE]: 'normal',
  [Phase.ANOMALY_DETECTED]: 'pending',
  [Phase.SUPERVISOR_ANALYZING]: 'alarm',
  [Phase.DISPATCHING]: 'alarm',
  [Phase.AGENT_ANALYZING]: 'alarm',
  [Phase.HUMAN_CONFIRMING]: 'pending',
  [Phase.EXECUTING]: 'recovering',
  [Phase.DEVICE_OPERATING]: 'alarm',
  [Phase.RECOVERING]: 'recovering',
  [Phase.RECOVERED]: 'recovering',
};

// ─── 决策链模板 ───

const DEFAULT_DECISION_STEPS: DecisionStep[] = [
  { index: 0, label: '异常感知', active: false, completed: false },
  { index: 1, label: '数据上送', active: false, completed: false },
  { index: 2, label: 'AI 分析', active: false, completed: false },
  { index: 3, label: '建议生成', active: false, completed: false },
  { index: 4, label: '人工确认', active: false, completed: false },
  { index: 5, label: '执行记录/效果回写', active: false, completed: false },
];

// ─── Store 接口 ───

export interface ScenarioState {
  // 核心状态
  phase: ScenarioPhase;
  incidentType: IncidentType | null;
  activeAgentId: AgentId | null;
  targetAgentId: AgentId | null;

  // Agent 状态
  agentRunStatuses: Record<AgentId, AgentRunStatus>;
  agentUIStatus: AgentUIStatus;

  // 思考气泡
  thinking: ThinkingContent | null;
  thinkingAgentId: AgentId | null;

  // 决策链
  decisionSteps: DecisionStep[];

  // 3D 动画控制
  particleIntent: ParticleIntent | null;
  cameraFocus: CameraFocusTarget | null;
  /** 正在闪烁的设备 ID（控制 AlarmFlash 光环），仅异常初期对设备闪红 */
  flashingDeviceId: AgentId | null;

  // 时间戳
  phaseStartTime: number;
}

export interface ScenarioActions {
  // A 写入（状态转换逻辑）
  startIncident: (type: IncidentType) => void;
  advancePhase: () => void;
  forceIdle: () => void;
  setThinking: (agentId: AgentId, content: ThinkingContent) => void;
  clearThinking: () => void;
  setCameraFocus: (target: CameraFocusTarget | null) => void;
  setActiveAgent: (agentId: AgentId | null) => void;
  setTargetAgent: (agentId: AgentId | null) => void;
  updateDecisionStep: (index: number, patch: Partial<DecisionStep>) => void;
  confirmHumanAction: () => void;
  rejectHumanAction: () => void;

  // B 只读消费（computed helpers）
  getAgentUIStatus: () => AgentUIStatus;
  getParticleIntent: () => ParticleIntent | null;
  isPhaseActive: () => boolean;
}

const INITIAL_RUN_STATUSES: Record<AgentId, AgentRunStatus> = {
  supervisor: 'monitoring',
  dosing: 'monitoring',
  uf: 'monitoring',
  ro: 'monitoring',
  pump: 'monitoring',
};

// ─── Phase 推进顺序 ───

const PHASE_ORDER: ScenarioPhase[] = [
  Phase.IDLE,
  Phase.ANOMALY_DETECTED,
  Phase.SUPERVISOR_ANALYZING,
  Phase.DISPATCHING,
  Phase.AGENT_ANALYZING,
  Phase.HUMAN_CONFIRMING,
  Phase.EXECUTING,
  Phase.DEVICE_OPERATING,
  Phase.RECOVERING,
  Phase.RECOVERED,
];

const PHASE_TO_STEP_INDEX: Partial<Record<ScenarioPhase, number>> = {
  [Phase.ANOMALY_DETECTED]: 0,
  [Phase.SUPERVISOR_ANALYZING]: 2,
  [Phase.DISPATCHING]: 3,
  [Phase.AGENT_ANALYZING]: 3,
  [Phase.HUMAN_CONFIRMING]: 4,
  [Phase.EXECUTING]: 5,
  [Phase.DEVICE_OPERATING]: 5,
  [Phase.RECOVERING]: 5,
  [Phase.RECOVERED]: 5,
};

// ─── 场景类型 → 目标 Agent 映射 ───

const INCIDENT_TO_AGENT: Record<IncidentType, AgentId> = {
  dosing_abnormal: 'dosing',
  uf_clogging: 'uf',
  ro_fouling: 'ro',
  pump_overload: 'pump',
};

export const useScenarioStore = create<ScenarioState & ScenarioActions>((set, get) => ({
  // 初始状态
  phase: Phase.IDLE,
  incidentType: null,
  activeAgentId: null,
  targetAgentId: null,
  agentRunStatuses: { ...INITIAL_RUN_STATUSES },
  agentUIStatus: 'normal',
  thinking: null,
  thinkingAgentId: null,
  decisionSteps: DEFAULT_DECISION_STEPS.map(s => ({ ...s })),
  particleIntent: null,
  cameraFocus: null,
  flashingDeviceId: null,
  phaseStartTime: Date.now(),

  // ─── Actions ───

  startIncident: (type) => {
    if (get().phase !== Phase.IDLE) return;

    const targetAgent = INCIDENT_TO_AGENT[type];
    logPhase('IDLE', 'ANOMALY_DETECTED', { incidentType: type, targetAgent });
    set({
      phase: Phase.ANOMALY_DETECTED,
      incidentType: type,
      activeAgentId: 'supervisor',
      targetAgentId: targetAgent,
      agentUIStatus: 'pending',
      particleIntent: 'anomaly',
      // 故障设备闪红（AlarmFlash），但 Agent 球体暂不变色（还没感知到）
      flashingDeviceId: targetAgent,
      thinking: null,
      thinkingAgentId: null,
      decisionSteps: DEFAULT_DECISION_STEPS.map((s, i) =>
        i === 0 ? { ...s, active: true } : { ...s }
      ),
      phaseStartTime: Date.now(),
      // Agent 全部保持 monitoring，等待监管者分析
      agentRunStatuses: { ...INITIAL_RUN_STATUSES },
    });
  },

  advancePhase: () => {
    const { phase, targetAgentId } = get();
    const currentIndex = PHASE_ORDER.indexOf(phase);
    if (currentIndex < 0 || currentIndex >= PHASE_ORDER.length - 1) return;

    const nextPhase = PHASE_ORDER[currentIndex + 1];
    logPhase(phase, nextPhase, { targetAgentId });
    const uiStatus = PHASE_TO_UI_STATUS[nextPhase];

    const patch: Partial<ScenarioState> = {
      phase: nextPhase,
      agentUIStatus: uiStatus,
      phaseStartTime: Date.now(),
    };

    const activeStepIndex = PHASE_TO_STEP_INDEX[nextPhase];
    if (activeStepIndex !== undefined) {
      patch.decisionSteps = get().decisionSteps.map((step, index) => ({
        ...step,
        active: index === activeStepIndex,
        completed: index < activeStepIndex || nextPhase === Phase.RECOVERED,
      }));
    }

    switch (nextPhase) {
      case Phase.ANOMALY_DETECTED:
        patch.particleIntent = 'anomaly';
        break;
      case Phase.SUPERVISOR_ANALYZING:
        patch.particleIntent = null;
        patch.activeAgentId = 'supervisor';
        // 监管者进入思考状态（蓝色），目标 Agent 仍 monitoring，设备继续闪红
        patch.agentRunStatuses = {
          ...INITIAL_RUN_STATUSES,
          supervisor: 'thinking',
        };
        break;
      case Phase.DISPATCHING:
        patch.particleIntent = 'dispatch';
        // 监管者仍 thinking，设备继续闪红
        break;
      case Phase.AGENT_ANALYZING:
        patch.particleIntent = null;
        patch.activeAgentId = targetAgentId;
        // 建议已生成：Agent 接手分析，停止设备闪红
        patch.flashingDeviceId = null;
        // 目标 Agent 变 warning（橙色）
        if (targetAgentId) {
          patch.agentRunStatuses = {
            ...INITIAL_RUN_STATUSES,
            supervisor: 'thinking',
            [targetAgentId]: 'warning',
          };
        }
        break;
      case Phase.HUMAN_CONFIRMING:
        patch.particleIntent = null;
        patch.activeAgentId = targetAgentId;
        patch.flashingDeviceId = null;
        if (targetAgentId) {
          patch.agentRunStatuses = {
            ...INITIAL_RUN_STATUSES,
            supervisor: 'processing',
            [targetAgentId]: 'processing',
          };
        }
        break;
      case Phase.EXECUTING: {
        patch.particleIntent = 'execute';
        // Agent 进入执行状态（绿色），设备不闪红
        if (targetAgentId) {
          patch.agentRunStatuses = {
            ...INITIAL_RUN_STATUSES,
            supervisor: 'thinking',
            [targetAgentId]: 'executing',
          };
        }
        // 自动聚焦：从设备前上方俯视整体，而非贴近设备中心
        if (targetAgentId) {
          const preset = DEVICE_FOCUS_PRESETS[targetAgentId];
          if (preset) {
            const target: CameraFocusTarget = {
              position: preset.cameraPos,
              lookAt: preset.lookAt,
              duration: preset.duration ?? 2000,
            };
            patch.cameraFocus = target;
          }
        }
        break;
      }
      case Phase.DEVICE_OPERATING:
        patch.particleIntent = null;
        // Agent 保持 executing 状态（设备操作中）
        if (targetAgentId) {
          patch.agentRunStatuses = {
            ...INITIAL_RUN_STATUSES,
            [targetAgentId]: 'executing',
          };
        }
        break;
      case Phase.RECOVERING:
        patch.particleIntent = null;
        // 恢复阶段：Agent 保持 executing，设备不闪
        break;
      case Phase.RECOVERED:
        patch.particleIntent = null;
        patch.cameraFocus = null;
        // 全部恢复正常
        patch.agentRunStatuses = { ...INITIAL_RUN_STATUSES };
        break;
    }

    set(patch);
  },

  forceIdle: () => {
    set({
      phase: Phase.IDLE,
      incidentType: null,
      activeAgentId: null,
      targetAgentId: null,
      agentUIStatus: 'normal',
      agentRunStatuses: { ...INITIAL_RUN_STATUSES },
      thinking: null,
      thinkingAgentId: null,
      decisionSteps: DEFAULT_DECISION_STEPS.map(s => ({ ...s })),
      particleIntent: null,
      cameraFocus: null,
      flashingDeviceId: null,
      phaseStartTime: Date.now(),
    });
  },

  setThinking: (agentId, content) => {
    set({ thinking: content, thinkingAgentId: agentId });
  },

  clearThinking: () => {
    set({ thinking: null, thinkingAgentId: null });
  },

  setCameraFocus: (target) => {
    set({ cameraFocus: target });
  },

  setActiveAgent: (agentId) => {
    set({ activeAgentId: agentId });
  },

  setTargetAgent: (agentId) => {
    set({ targetAgentId: agentId });
  },

  updateDecisionStep: (index, patch) => {
    const steps = get().decisionSteps.map((s, i) =>
      i === index ? { ...s, ...patch } : s
    );
    set({ decisionSteps: steps });
  },

  confirmHumanAction: () => {
    const state = get();
    if (state.phase !== Phase.HUMAN_CONFIRMING) return;
    set({
      decisionSteps: state.decisionSteps.map((step, index) => ({
        ...step,
        active: index === 5,
        completed: index < 5,
      })),
    });
    get().advancePhase();
  },

  rejectHumanAction: () => {
    const state = get();
    if (state.phase !== Phase.HUMAN_CONFIRMING) return;
    set({
      phase: Phase.IDLE,
      incidentType: null,
      activeAgentId: null,
      targetAgentId: null,
      agentUIStatus: 'normal',
      agentRunStatuses: { ...INITIAL_RUN_STATUSES },
      particleIntent: null,
      cameraFocus: null,
      flashingDeviceId: null,
      decisionSteps: state.decisionSteps.map((step, index) => ({
        ...step,
        active: false,
        completed: index < 4,
      })),
      phaseStartTime: Date.now(),
    });
  },

  // ─── Computed helpers (B 消费) ───

  getAgentUIStatus: () => get().agentUIStatus,

  getParticleIntent: () => get().particleIntent,

  isPhaseActive: () => get().phase !== Phase.IDLE,
}));
