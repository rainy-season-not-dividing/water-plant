// ─── 场景阶段枚举（唯一主控状态源）───

export enum ScenarioPhase {
  IDLE = 'idle',
  ANOMALY_DETECTED = 'detected',
  SUPERVISOR_ANALYZING = 'analyzing',
  DISPATCHING = 'dispatching',
  AGENT_ANALYZING = 'agent_analyzing',
  HUMAN_CONFIRMING = 'human_confirming',
  EXECUTING = 'executing',
  DEVICE_OPERATING = 'operating',
  RECOVERING = 'recovering',
  RECOVERED = 'recovered',
}

// ─── Agent 标识 ───

export type AgentId = 'supervisor' | 'dosing' | 'uf' | 'ro' | 'pump';

// ─── Agent 四态（UI 状态灯映射）───

export type AgentUIStatus = 'normal' | 'pending' | 'alarm' | 'recovering';

// ─── Agent 运行状态 ───

export type AgentRunStatus = 'idle' | 'monitoring' | 'thinking' | 'processing' | 'executing' | 'warning';

export type AgentStatusMap = Record<AgentId, 'idle' | 'monitoring' | 'processing' | 'warning'>;

// ─── 异常场景类型 ───

export type IncidentType = 'dosing_abnormal' | 'uf_clogging' | 'ro_fouling' | 'pump_overload';

// ─── 粒子颜色语义 ───

export type ParticleIntent = 'anomaly' | 'dispatch' | 'execute';

// ─── 思考气泡内容（流式文本） ───

export type StreamingStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface ThinkingContent {
  title: string;
  text: string;
  status: StreamingStatus;
}

// ─── 决策链步骤 ───

export interface DecisionStep {
  index: number;
  label: string;
  active: boolean;
  completed: boolean;
  confidence?: number;
  estimatedDuration?: number;
}

// ─── 事件日志条目 ───

export interface EventLogEntry {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface AgentLog {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

// ─── 通知条目 ───

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  agentId: AgentId;
  relatedAgentIds?: AgentId[];
  incidentCount?: number;
  level: 'info' | 'warning' | 'error' | 'success';
  autoDismissMs: number;
}

// ─── Agent 指标字段 ───

export type NormalRange =
  | { min: number; max: number }
  | { max: number }
  | { min: number }
  | string[]
  | null;

export interface MetricField {
  key: string;
  label: string;
  value: number | string;
  unit: string;
  normalRange: NormalRange;
  alarmRule: 'lower' | 'upper' | 'both' | null;
  shiftDirection?: 'up' | 'down';
}

export interface AgentMetric {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
}

// ─── Agent 元数据 ───

export interface AgentMeta {
  id: AgentId;
  name: string;
  englishName: string;
  color: string;
  role: string;
  metrics: MetricField[];
}

export interface AgentData {
  id: AgentId;
  name: string;
  englishName: string;
  role: string;
  status: AgentRunStatus;
  x: number;
  y: number;
  desc: string;
  capabilities: string[];
  metrics: AgentMetric[];
  logs: AgentLog[];
}

// ─── 前端遥测状态 ───

export interface TelemetryState {
  inletFlow: number;
  outletFlow: number;
  inletTurbidity: number;
  outletTurbidity: number;
  dosingRate: number;
  chemicalLevel: number;
  ufPressure: number;
  roPressureDiff: number;
  roFlux: number;
  roTds: number;
  roFlushMode: 'ready' | 'pending';
  roRecoveryTime: number;
  pumpSpeed: number;
  pumpCurrent: number;
  pumpTemperature: number;
  pumpStatus: 'normal' | 'overload';
  energyConsumption: number;
  healthScore: number;
  activeAgentsCount: number;
  onlineRate: number;
}

// ─── 演示场景状态 ───

export interface AnomalySimulation {
  active: boolean;
  type: IncidentType | null;
  step: number;
  title: string;
  description: string;
  logs: string[];
}

export interface ActiveAnimation {
  agentId: AgentId;
  type: 'step_transition' | 'manual_calibration';
  targetStep?: number;
  startTick: number;
  duration: number;
}

// ─── 2D 窗口/连线状态 ───

export interface CardState {
  x: number;
  y: number;
  isOpen: boolean;
  zIndex: number;
}

export interface FlowPoint {
  x: number;
  y: number;
}

// ─── 摄像机聚焦目标 ───

export interface CameraFocusTarget {
  position: [number, number, number];
  lookAt: [number, number, number];
  duration: number;
}

// ─── 粒子飞行路径 ───

export interface ParticlePath {
  from: AgentId | 'device';
  to: AgentId | 'device';
  intent: ParticleIntent;
  points: Array<{ x: number; y: number; z: number }>;
}

// ─── 窗口状态 ───

export interface WindowState {
  agentId: AgentId;
  isOpen: boolean;
  isMinimized: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

// ─── LOD 级别 ───

export type LODLevel = 'full' | 'lod1' | 'lod2' | 'lod3';
