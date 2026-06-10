import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentId, AgentRunStatus } from '../../types';
import { AGENT_3D_ANCHORS } from '../../data/constants';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { toThreePos } from '../utils/coordinates';
import { AgentModel } from './AgentModel';

interface AgentNodeProps {
  agentId: AgentId;
}

/** Agent 颜色映射 */
const AGENT_COLORS: Record<AgentId, string> = {
  supervisor: '#378ADD',
  dosing: '#BA7517',
  uf: '#1D9E75',
  ro: '#D85A30',
  pump: '#534AB7',
};

/** 根据 Agent 运行状态决定发光色 */
function getAgentEmissive(
  agentId: AgentId,
  runStatus: AgentRunStatus,
): string {
  if (runStatus === 'warning') return '#f59e0b';
  if (runStatus === 'executing' || runStatus === 'processing') return '#10b981';
  if (runStatus === 'thinking') return '#60a5fa';
  return AGENT_COLORS[agentId];
}

interface ModelConfig {
  path: string;
  /** 包围盒归一化目标尺寸（最长边长度） */
  targetSize: number;
  /** 人工偏移微调（autoScale 空间内，Box3 居中后叠加） */
  offset?: [number, number, number];
  /** 模型朝向修正 */
  rotation?: [number, number, number];
}

/**
 * 各边缘 Agent 的模型配置
 *
 * 三层控制：
 * - targetSize: 整体大小
 * - offset: 视觉中心微调（叠在 Box3 自居中之后）
 * - rotation: 朝向修正
 */
const AGENT_MODEL_CONFIG: Record<AgentId, ModelConfig> = {
  supervisor: { path: '/models/surprior_model.glb', targetSize: 18 },
  dosing: {
    path: '/models/edge_model_dosing.glb',
    targetSize: 27,   // ↑ 18×1.5，视觉偏小加大
    rotation: [0, Math.PI, 0],  // ← 绕 Y 轴旋转 90°
  },
  uf: {
    path: '/models/edge_model1_exchange.glb',
    targetSize: 15,
    rotation: [Math.PI, 0, 0],  
  },
  ro: {
    path: '/models/edge_model2.glb',
    targetSize: 12,
    offset: [0, -8, 0], // ↑ 反推 Box3 的向下居中偏移，回到锚点附近
    rotation: [0, Math.PI/2, 0], 
  },
  pump: {
    path: '/models/edge_model3_exchange.glb',
    targetSize: 20,
    offset: [-5, 80, 180], // ↑ 反推 Box3 的向下居中偏移，回到锚点附近
    rotation: [0, -Math.PI/2, 0],  
  },
};

/** 呼吸动画幅度（相对 1.0 的百分比偏移） */
const BREATH = 0.08;
const SPEED = 1.8;

/**
 * 边缘 Agent 3D 模型节点
 *
 * 模型通过 AgentModel 的 Box3 包围盒归一化 + 人工 offset 微调，
 * 外层只做呼吸动画（±8% 调制）。
 */
export const AgentNode: React.FC<AgentNodeProps> = ({ agentId }) => {
  const anchor = AGENT_3D_ANCHORS[agentId];
  const pos = toThreePos(anchor.x, anchor.y, anchor.z);

  const runStatus = useScenarioStore((s) => s.agentRunStatuses[agentId]);

  const emissiveColor = useMemo(
    () => getAgentEmissive(agentId, runStatus),
    [agentId, runStatus],
  );

  const config = AGENT_MODEL_CONFIG[agentId];

  const groupRef = useRef<THREE.Group>(null);

  // 呼吸动画：围绕 1.0 微幅调制，基础缩放由 AgentModel 内部处理
  useFrame(({ clock }) => {
    if (groupRef.current) {
      const t = clock.getElapsedTime();
      const breath = 1 + Math.sin(t * SPEED) * BREATH;
      groupRef.current.scale.setScalar(breath);
    }
  });

  return (
    <group ref={groupRef} position={pos}>
      <AgentModel
        modelPath={config.path}
        targetSize={config.targetSize}
        offset={config.offset}
        rotation={config.rotation}
        emissiveColor={emissiveColor}
        emissiveIntensity={0.8}
      />
    </group>
  );
};
