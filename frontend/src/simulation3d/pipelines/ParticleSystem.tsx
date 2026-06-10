/**
 * 数据传输粒子系统（DataLink v4）
 *
 * 工业智慧大屏风格 - 数据包阵列沿路径匀速流动。
 *
 * 路径语义与时序协调：
 *   anomaly:  设备 → supervisor（持续循环，排空退出）
 *   dispatch: 当前跳的单段传输（一次性跑完后调 advanceHop）
 *   execute:  Agent → 设备（持续循环，排空退出）
 *
 * 关键行为：
 * - anomaly/execute: 持续循环产生新数据包；intent 变 null 时排空
 * - dispatch: 只发一波包，全部到达终点后自动 advanceHop（不循环）
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { AGENT_3D_ANCHORS } from '../../data/constants';
import { REAL_DEVICE_CENTERS } from '../plantAnchors';
import type { ParticleIntent, AgentId } from '../../types';
import { toThreePosTuple } from '../utils/coordinates';

// ─── 常量 ───

const PACKET_COUNT = 6;
const TAIL_LENGTH = 3;
const FLOW_SPEED = 0.6;
const TAIL_SPACING = 0.018;
const LINE_OPACITY = 0.3;
const LINE_WIDTH = 2;
const RING_EXPAND_DURATION = 1.0;
const RING_MAX_RADIUS = 16;

const INTENT_COLORS: Record<ParticleIntent, string> = {
  anomaly: '#ef4444',
  dispatch: '#f59e0b',
  execute: '#10b981',
};

// ─── 路径构建 ───

function getAgentWorldPos(agentId: AgentId): THREE.Vector3 {
  const a = AGENT_3D_ANCHORS[agentId];
  const p = toThreePosTuple(a);
  return new THREE.Vector3(...p);
}

function getDeviceWorldPos(agentId: AgentId): THREE.Vector3 {
  const c = REAL_DEVICE_CENTERS[agentId];
  const p = toThreePosTuple(c);
  return new THREE.Vector3(...p);
}

function getSupervisorWorldPos(): THREE.Vector3 {
  const c = REAL_DEVICE_CENTERS.supervisor;
  return new THREE.Vector3(...toThreePosTuple(c));
}

function buildCurvedSegment(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const mid = new THREE.Vector3(
    (from.x + to.x) / 2,
    Math.max(from.y, to.y) + 18,
    (from.z + to.z) / 2,
  );
  return [from, mid, to];
}

/**
 * 构建当前跳的单段路径（dispatch 模式）
 * hop 0: supervisor → agent[0]
 * hop N: agent[N-1] → agent[N]
 */
function buildCurrentHopPath(
  hopIndex: number,
  highlightSequence: AgentId[],
): THREE.Vector3[] {
  if (highlightSequence.length === 0) return [];
  if (hopIndex === 0) {
    return buildCurvedSegment(getSupervisorWorldPos(), getAgentWorldPos(highlightSequence[0]));
  }
  const from = highlightSequence[hopIndex - 1];
  const to = highlightSequence[hopIndex];
  if (!from || !to) return [];
  return buildCurvedSegment(getAgentWorldPos(from), getAgentWorldPos(to));
}

function buildAnomalyPath(targetAgentId: AgentId): THREE.Vector3[] {
  return buildCurvedSegment(getDeviceWorldPos(targetAgentId), getSupervisorWorldPos());
}

function buildExecutePath(targetAgentId: AgentId): THREE.Vector3[] {
  const agentPos = getAgentWorldPos(targetAgentId);
  const devicePos = getDeviceWorldPos(targetAgentId);
  return [agentPos, devicePos];
}

function interpolatePath(points: THREE.Vector3[], t: number): THREE.Vector3 {
  if (points.length < 2) return points[0]?.clone() ?? new THREE.Vector3();
  const clampedT = Math.max(0, Math.min(1, t));
  if (clampedT <= 0) return points[0].clone();
  if (clampedT >= 1) return points[points.length - 1].clone();

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = points[i].distanceTo(points[i + 1]);
    segmentLengths.push(len);
    totalLength += len;
  }
  if (totalLength <= 0) return points[0].clone();

  const targetDist = clampedT * totalLength;
  let accumulated = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    if (accumulated + segmentLengths[i] >= targetDist) {
      const localT = (targetDist - accumulated) / segmentLengths[i];
      return new THREE.Vector3().lerpVectors(points[i], points[i + 1], localT);
    }
    accumulated += segmentLengths[i];
  }
  return points[points.length - 1].clone();
}

// ─── 单链路流动组件 ───

interface FlowLinkProps {
  path: THREE.Vector3[];
  color: string;
  /** oneshot: 包跑完不循环，全部到达后调 onComplete */
  oneshot: boolean;
  onComplete?: () => void;
  /** draining: 不再产生新包，现有包跑完后调 onComplete */
  draining?: boolean;
}

const FlowLink: React.FC<FlowLinkProps> = ({ path, color, oneshot, onComplete, draining }) => {
  const flowOffset = useRef(0);
  const completed = useRef(false);
  const endRingRef = useRef<THREE.Mesh>(null);
  const endRingTimer = useRef(-1);

  const packetRefs = useRef<(THREE.Mesh | null)[]>(new Array(PACKET_COUNT).fill(null));
  const tailRefs = useRef<(THREE.Mesh | null)[][]>(
    Array.from({ length: PACKET_COUNT }, () => new Array(TAIL_LENGTH).fill(null))
  );

  useFrame((_, delta) => {
    if (path.length < 2) return;
    if (completed.current) return;

    flowOffset.current += FLOW_SPEED * delta;

    const spacing = 1 / PACKET_COUNT;
    // 最后一个包到达终点的时间：1 + (PACKET_COUNT-1)*spacing
    const allArrived = flowOffset.current >= 1 + (PACKET_COUNT - 1) * spacing;

    if ((oneshot || draining) && allArrived) {
      completed.current = true;
      // 隐藏所有包
      packetRefs.current.forEach((p) => { if (p) p.visible = false; });
      tailRefs.current.forEach((tails) => tails.forEach((t) => { if (t) t.visible = false; }));
      onComplete?.();
      return;
    }

    // 循环模式：头包到达时重置
    if (!oneshot && !draining && flowOffset.current >= 1 + (PACKET_COUNT - 1) * spacing) {
      flowOffset.current = 0;
      endRingTimer.current = 0;
    }

    for (let i = 0; i < PACKET_COUNT; i++) {
      const baseT = flowOffset.current - i * spacing;
      const visible = baseT >= 0 && baseT <= 1;
      const pos = visible ? interpolatePath(path, baseT) : null;

      const packet = packetRefs.current[i];
      if (packet) {
        if (pos) {
          packet.position.copy(pos);
          packet.visible = true;
          packet.scale.setScalar(1.6 + Math.sin(baseT * Math.PI * 2) * 0.3);
        } else {
          packet.visible = false;
        }
      }

      for (let j = 0; j < TAIL_LENGTH; j++) {
        const tailT = baseT - (j + 1) * TAIL_SPACING;
        const tailVisible = tailT >= 0 && tailT <= 1;
        const tailMesh = tailRefs.current[i]?.[j];
        if (tailMesh) {
          if (tailVisible && visible) {
            const tailPos = interpolatePath(path, tailT);
            tailMesh.position.copy(tailPos);
            tailMesh.visible = true;
            const fade = 1 - (j + 1) / (TAIL_LENGTH + 1);
            tailMesh.scale.setScalar(1.0 * fade);
            if (tailMesh.material instanceof THREE.MeshBasicMaterial) {
              tailMesh.material.opacity = 0.5 * fade;
            }
          } else {
            tailMesh.visible = false;
          }
        }
      }
    }

    // 终点波纹（循环模式时每轮触发一次）
    if (endRingRef.current) {
      endRingRef.current.position.copy(path[path.length - 1]);
      const elapsed = endRingTimer.current;
      if (elapsed >= 0 && elapsed < RING_EXPAND_DURATION) {
        const p = elapsed / RING_EXPAND_DURATION;
        endRingRef.current.scale.setScalar(1 + p * RING_MAX_RADIUS);
        endRingRef.current.visible = true;
        if (endRingRef.current.material instanceof THREE.MeshBasicMaterial) {
          endRingRef.current.material.opacity = (1 - p) * 0.6;
        }
        endRingTimer.current += delta;
      } else {
        endRingRef.current.visible = false;
      }
    }
  });

  if (path.length < 2) return null;

  return (
    <group>
      <Line
        points={path}
        color={color}
        lineWidth={LINE_WIDTH}
        transparent
        opacity={LINE_OPACITY}
      />

      {Array.from({ length: PACKET_COUNT }, (_, i) => (
        <group key={`pkt-${i}`}>
          <mesh ref={(el) => { packetRefs.current[i] = el; }}>
            <sphereGeometry args={[0.7, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
          </mesh>
          {Array.from({ length: TAIL_LENGTH }, (_, j) => (
            <mesh
              key={`t-${j}`}
              ref={(el) => {
                if (!tailRefs.current[i]) tailRefs.current[i] = [];
                tailRefs.current[i][j] = el;
              }}
            >
              <sphereGeometry args={[0.4, 6, 6]} />
              <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}

      <mesh ref={endRingRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[1, 0.3, 8, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
};

// ─── 排空容器（旧路径跑完消失） ───

interface DrainingLinkProps {
  path: THREE.Vector3[];
  color: string;
  onDrained: () => void;
}

const DrainingLink: React.FC<DrainingLinkProps> = ({ path, color, onDrained }) => {
  return <FlowLink path={path} color={color} oneshot={false} draining onComplete={onDrained} />;
};

// ─── 主组件 ───

export const ParticleSystem: React.FC = () => {
  const particleIntent = useScenarioStore((s) => s.particleIntent);
  const targetAgentId = useScenarioStore((s) => s.targetAgentId);
  const highlightSequence = useScenarioStore((s) => s.highlightSequence);
  const hopIndex = useScenarioStore((s) => s.hopIndex);
  const hopSubPhase = useScenarioStore((s) => s.hopSubPhase);

  const prevIntent = useRef<ParticleIntent | null>(null);
  const prevPath = useRef<THREE.Vector3[]>([]);
  const drainingPaths = useRef<{ path: THREE.Vector3[]; color: string; id: number }[]>([]);
  const nextDrainId = useRef(0);
  // 标记 dispatch oneshot 是否正常完成（不需要 drain）
  const oneshotCompleted = useRef(false);

  // 构建当前路径
  const currentPath = useMemo(() => {
    if (!particleIntent || !targetAgentId) return [];
    switch (particleIntent) {
      case 'anomaly':
        return buildAnomalyPath(targetAgentId);
      case 'dispatch':
        if (hopSubPhase === 'transmitting') {
          return buildCurrentHopPath(hopIndex, highlightSequence);
        }
        if (hopSubPhase === 'returning') {
          // 闭环：最后一个 agent → targetAgent
          const lastAgent = highlightSequence[highlightSequence.length - 1];
          if (lastAgent && lastAgent !== targetAgentId) {
            return buildCurvedSegment(getAgentWorldPos(lastAgent), getAgentWorldPos(targetAgentId));
          }
          return [];
        }
        return [];
      case 'execute':
        return buildExecutePath(targetAgentId);
    }
  }, [particleIntent, targetAgentId, hopIndex, hopSubPhase, highlightSequence]);

  const intentColor = particleIntent ? INTENT_COLORS[particleIntent] : '#10b981';

  // intent 变化时排空旧路径（仅循环模式被中断时需要 drain）
  if (prevIntent.current !== particleIntent) {
    if (prevIntent.current && prevPath.current.length >= 2 && !oneshotCompleted.current) {
      drainingPaths.current.push({
        path: prevPath.current,
        color: INTENT_COLORS[prevIntent.current],
        id: nextDrainId.current++,
      });
    }
    oneshotCompleted.current = false;
    prevIntent.current = particleIntent;
  }
  prevPath.current = currentPath;

  const handleDrained = (drainId: number) => {
    drainingPaths.current = drainingPaths.current.filter((d) => d.id !== drainId);
  };

  const handleDispatchComplete = () => {
    oneshotCompleted.current = true;
    useScenarioStore.getState().advanceHop();
  };

  const handleAnomalyComplete = () => {
    oneshotCompleted.current = true;
    useScenarioStore.getState().advancePhase();
  };

  const isOneshot = particleIntent === 'dispatch' || particleIntent === 'anomaly';
  const showActive = currentPath.length >= 2;

  const handleComplete = () => {
    if (particleIntent === 'dispatch') {
      handleDispatchComplete();
    } else if (particleIntent === 'anomaly') {
      handleAnomalyComplete();
    }
  };

  return (
    <group>
      {/* 活跃链路 */}
      {showActive && (
        <FlowLink
          key={`active-${particleIntent}-${hopIndex}-${hopSubPhase}`}
          path={currentPath}
          color={intentColor}
          oneshot={isOneshot}
          onComplete={isOneshot ? handleComplete : undefined}
        />
      )}

      {/* 排空中的旧链路 */}
      {drainingPaths.current.map((drain) => (
        <DrainingLink
          key={`drain-${drain.id}`}
          path={drain.path}
          color={drain.color}
          onDrained={() => handleDrained(drain.id)}
        />
      ))}
    </group>
  );
};
