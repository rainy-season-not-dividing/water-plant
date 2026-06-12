import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentId } from '../../types';
import { AGENT_3D_ANCHORS } from '../../data/constants';
import { toThreePos } from '../utils/coordinates';
import { AgentModel } from './AgentModel';
import { AgentTechAura } from './AgentTechAura';

interface AgentNodeProps {
  agentId: AgentId;
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
  supervisor: { path: '/models/brain_tech.glb', targetSize: 18 },
  dosing: {
    path: '/models/do_tech.glb',
    targetSize: 27,
    rotation: [0, Math.PI, 0],
  },
  uf: {
    path: '/models/uf_tech.glb',
    targetSize: 15,
    rotation: [Math.PI, 0, 0],
    offset: [0, -2.0, 0],
  },
  ro: {
    path: '/models/ro_tech.glb',
    targetSize: 20,
    rotation: [0, Math.PI, 0],
    offset: [0, 1.5, 0],
  },
  pump: {
    path: '/models/pump_tech.glb',
    targetSize: 20,
    rotation: [0, -Math.PI / 2, 0],
  },
};

const AGENT_LOCAL_LIGHTS = {
  key: {
    position: [0, 38, 34] as [number, number, number],
    intensity: 220,
    distance: 140,
    color: '#dbeafe',
  },
  rim: {
    position: [-32, 24, -30] as [number, number, number],
    intensity: 75,
    distance: 120,
    color: '#38bdf8',
  },
  fill: {
    position: [28, 10, 18] as [number, number, number],
    intensity: 35,
    distance: 110,
    color: '#93c5fd',
  },
} as const;

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

  const auraYOffset =
    agentId === 'uf'
      ? -config.targetSize * 0.22
      : agentId === 'ro'
        ? config.targetSize * 0.18
        : 0;

  return (
    <group ref={groupRef} position={pos}>
      <pointLight
        position={AGENT_LOCAL_LIGHTS.key.position}
        intensity={AGENT_LOCAL_LIGHTS.key.intensity}
        distance={AGENT_LOCAL_LIGHTS.key.distance}
        color={AGENT_LOCAL_LIGHTS.key.color}
      />
      <pointLight
        position={AGENT_LOCAL_LIGHTS.rim.position}
        intensity={AGENT_LOCAL_LIGHTS.rim.intensity}
        distance={AGENT_LOCAL_LIGHTS.rim.distance}
        color={AGENT_LOCAL_LIGHTS.rim.color}
      />
      <pointLight
        position={AGENT_LOCAL_LIGHTS.fill.position}
        intensity={AGENT_LOCAL_LIGHTS.fill.intensity}
        distance={AGENT_LOCAL_LIGHTS.fill.distance}
        color={AGENT_LOCAL_LIGHTS.fill.color}
      />
      <AgentModel
        modelPath={config.path}
        targetSize={config.targetSize}
        offset={config.offset}
        rotation={config.rotation}
      />
      <group position={[0, auraYOffset, 0]}>
        <AgentTechAura targetSize={config.targetSize} />
      </group>
    </group>
  );
};
