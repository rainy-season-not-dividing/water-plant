import type { AgentId, CardState, AnomalySimulation } from '../types/index';
import {
  REAL_AGENT_ANCHORS,
  REAL_BUBBLE_ANCHORS,
  REAL_DEVICE_CENTERS,
  REAL_DEVICE_ANCHORS,
} from '../simulation3d/plantAnchors';

export const DEFAULT_CARDS: Record<AgentId, CardState> = {
  supervisor: { x: 50, y: 15, isOpen: false, zIndex: 10 },
  dosing: { x: 12, y: 38, isOpen: false, zIndex: 10 },
  uf: { x: 35, y: 55, isOpen: false, zIndex: 10 },
  ro: { x: 62, y: 38, isOpen: false, zIndex: 10 },
  pump: { x: 70, y: 58, isOpen: false, zIndex: 10 }
};

export const DEFAULT_SIMULATION: AnomalySimulation = {
  active: false,
  type: null,
  step: 0,
  title: '系统状态良好',
  description: '全厂工艺链路平稳。四大子智能体协同巡检中。',
  logs: [
    '系统在线自检测完成，网络波动 < 5ms',
    '监管总管智能体完成例行拓扑评估，未见工艺指标偏倚'
  ]
};

export const PIPE_PATHS = {
  in: [
    { x: -120, y: -30, z: -50 },
    { x: -60, y: -40, z: -50 },
    { x: -60, y: -50, z: -70 }
  ],
  dose: [
    { x: -60, y: -70, z: -70 },
    { x: -60, y: -40, z: -70 },
    { x: -30, y: -20, z: 15 },
    { x: -10, y: -5, z: 25 }
  ],
  coag: [
    { x: -20, y: 0, z: -10 },
    { x: 0, y: -10, z: -10 },
    { x: 10, y: -10, z: -25 }
  ],
  clari: [
    { x: 0, y: 0, z: -40 },
    { x: 0, y: 30, z: -40 },
    { x: 20, y: 55, z: -50 }
  ],
  uf: [
    { x: 20, y: 75, z: -50 },
    { x: 50, y: 75, z: -50 },
    { x: 65, y: 40, z: -40 }
  ],
  ro: [
    { x: 90, y: 10, z: -30 },
    { x: 110, y: 10, z: -30 }
  ],
  pump: [
    { x: 65, y: 40, z: -40 },
    { x: 70, y: -55, z: -40 }
  ]
} as const;

/**
 * 设备地理锚点（data 空间 x/y 坐标）
 * 与 AGENT_3D_ANCHORS 分离，仅用于定位设备模块的位置
 * z 固定为 0（设备贴地），不再耦合 Agent 球体的悬浮高度
 */
export const DEVICE_ANCHORS = {
  ...REAL_DEVICE_ANCHORS,
} as const;

/**
 * 气泡标注锚点（思考气泡的屏幕投影锚定位置）
 * 与 AGENT_3D_ANCHORS（Agent 球体位置）和设备锚点分离
 *
 * rationale：
 * - supervisor：指向可见的 SupervisorHub 顶部（z≈30，中枢高度 0~23）
 *   而非不可见的 Agent 球体悬浮高度（AGENT_3D_ANCHORS z=85），
 *   避免气泡锚定到空中不可见点。
 * - 边缘 agent：与 AGENT_3D_ANCHORS 一致（有可见 AgentNode 球体）
 */
export const BUBBLE_ANCHORS = {
  ...REAL_BUBBLE_ANCHORS,
} as const;

export const AGENT_3D_ANCHORS = {
  ...REAL_AGENT_ANCHORS,
} as const;

export const PARTICLE_ANIM_COORDS: Record<AgentId, { origin: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }> = {
  dosing: {
    origin: REAL_DEVICE_CENTERS.dosing,
    target: REAL_AGENT_ANCHORS.dosing,
  },
  uf: {
    origin: REAL_DEVICE_CENTERS.uf,
    target: REAL_AGENT_ANCHORS.uf,
  },
  ro: {
    origin: REAL_DEVICE_CENTERS.ro,
    target: REAL_AGENT_ANCHORS.ro,
  },
  supervisor: {
    origin: REAL_DEVICE_CENTERS.supervisor,
    target: REAL_AGENT_ANCHORS.supervisor,
  },
  pump: {
    origin: REAL_DEVICE_CENTERS.pump,
    target: REAL_AGENT_ANCHORS.pump,
  }
};
