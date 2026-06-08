import { ScenarioPhase } from '../types/index';
import type {
  AgentId,
  AgentStatusMap,
  DecisionStep,
  EventLogEntry,
  IncidentType,
  NotificationItem,
  TelemetryState,
  ThinkingContent,
} from '../types/index';

export type DemoState = 'normal' | 'abnormal' | 'recovered';

export interface DemoSnapshot {
  telemetry: Partial<TelemetryState>;
  agentStatuses: Partial<AgentStatusMap>;
  phase: ScenarioPhase;
  incidentType: IncidentType | null;
  thinking: ThinkingContent | null;
  decisionSteps: DecisionStep[];
  events: Omit<EventLogEntry, 'id'>[];
  notification: Omit<NotificationItem, 'id'> | null;
}

const DECISION_LABELS = [
  '异常检测',
  '数据上报',
  'AI 分析',
  '智能体调度',
  '执行恢复',
];

function buildSteps(completedUpTo: number, activeIndex: number): DecisionStep[] {
  return DECISION_LABELS.map((label, i) => ({
    index: i,
    label,
    active: i === activeIndex,
    completed: i < completedUpTo,
  }));
}

export const DEMO_SNAPSHOTS: Record<DemoState, DemoSnapshot> = {
  normal: {
    telemetry: {
      inletTurbidity: 10,
      outletTurbidity: 0.08,
      dosingRate: 4.0,
      chemicalLevel: 72,
      healthScore: 98,
      energyConsumption: 0.22,
    },
    agentStatuses: {
      supervisor: 'monitoring',
      dosing: 'monitoring',
      uf: 'monitoring',
      ro: 'monitoring',
      pump: 'monitoring',
    },
    phase: ScenarioPhase.IDLE,
    incidentType: null,
    thinking: null,
    decisionSteps: buildSteps(0, -1),
    events: [],
    notification: null,
  },

  abnormal: {
    telemetry: {
      inletTurbidity: 15,
      outletTurbidity: 1.6,
      dosingRate: 4.0,
      chemicalLevel: 72,
      healthScore: 85,
      energyConsumption: 0.28,
    },
    agentStatuses: {
      supervisor: 'processing',
      dosing: 'warning',
      uf: 'monitoring',
      ro: 'monitoring',
      pump: 'monitoring',
    },
    phase: ScenarioPhase.SUPERVISOR_ANALYZING,
    incidentType: 'dosing_abnormal',
    thinking: {
      title: '监管智能体正在分析',
      text: '检测到 UF 产水浊度升至 1.6 NTU，超过 PPT 给出的 UF 产水浊度 <1 NTU。正在关联 UF TMP、SDI、阻垢剂投加和 RO 进水风险，生成需要人工确认的建议单...\n\n读取实时遥测：UF 产水浊度 1.6 NTU，阻垢剂投加 4.0 ppm\n对照阈值：UF 产水浊度应 <1 NTU，UF 出水 SDI 应 <3\n关联分析：前端颗粒负荷升高可能增加 RO 污染风险\n初步建议：人工确认后复核自清洗过滤器、执行 UF 反洗或 CEB 评估',
      status: 'done',
    },
    decisionSteps: buildSteps(2, 2),
    events: [
      { time: '', text: 'UF/加药链路检测到产水浊度异常（1.6 NTU），监管智能体接入分析。', type: 'warning' },
      { time: '', text: '数据已上报至云端管理平台，等待 AI 分析结果。', type: 'info' },
      { time: '', text: '监管智能体正在执行根因定位与方案生成...', type: 'info' },
    ],
    notification: {
      title: '系统异常告警',
      description: 'UF/加药链路检测到产水浊度异常（1.6 NTU），点击查看详情。',
      time: '',
      agentId: 'dosing' as AgentId,
      level: 'error',
      autoDismissMs: 5000,
    },
  },

  recovered: {
    telemetry: {
      inletTurbidity: 20,
      outletTurbidity: 0.08,
      dosingRate: 6.0,
      chemicalLevel: 70,
      healthScore: 99,
      energyConsumption: 0.22,
    },
    agentStatuses: {
      supervisor: 'monitoring',
      dosing: 'monitoring',
      uf: 'monitoring',
      ro: 'monitoring',
      pump: 'monitoring',
    },
    phase: ScenarioPhase.RECOVERED,
    incidentType: null,
    thinking: null,
    decisionSteps: buildSteps(5, -1),
    events: [
      { time: '', text: 'UF/加药链路检测到产水浊度异常（1.6 NTU），监管智能体接入分析。', type: 'warning' },
      { time: '', text: 'AI 分析完成：建议复核 UF 反洗效果与阻垢剂投加状态，生成待人工确认处置单。', type: 'info' },
      { time: '', text: '监管智能体已生成建议单，等待人工确认。', type: 'info' },
      { time: '', text: '人工确认后，执行记录与效果回写已完成。', type: 'success' },
      { time: '', text: '系统恢复稳定，出水浊度回归 0.04 NTU。', type: 'success' },
    ],
    notification: {
      title: '异常已恢复',
      description: '处置建议确认完成，系统恢复稳定巡检。',
      time: '',
      agentId: 'dosing' as AgentId,
      level: 'success',
      autoDismissMs: 3000,
    },
  },
};
