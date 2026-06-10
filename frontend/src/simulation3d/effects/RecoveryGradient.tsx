import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScenarioStore } from '../../stores/useScenarioStore';
import type { AgentId } from '../../types';
import { REAL_DEVICE_ANCHORS } from '../plantAnchors';
import { toThreePos } from '../utils/coordinates';

/**
 * 恢复渐变效果
 * 当 phase === RECOVERING 时，在对应设备上方显示红→绿渐变光环
 * 使用 targetAgentId 定位（deviceFlashing 在 DEVICE_OPERATING 已被清除）
 */
export const RecoveryGradient: React.FC = () => {
  const phase = useScenarioStore((s) => s.phase);
  const targetAgentId = useScenarioStore((s) => s.targetAgentId);

  const isRecovering = phase === 'recovering' && targetAgentId !== null;

  if (!isRecovering || !targetAgentId) return null;

  return <RecoveryRing key={phase + targetAgentId} agentId={targetAgentId} />;
};

const RecoveryRing: React.FC<{ agentId: AgentId }> = ({ agentId }) => {
  const anchor = REAL_DEVICE_ANCHORS[agentId];
  if (!anchor) return null;

  const pos = toThreePos(anchor.x, anchor.y, anchor.z);
  const ringPos: [number, number, number] = [pos[0], 2.5, pos[2]];

  const meshRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0); // ✅ ref 替代 setState，避免 useFrame 中 re-render

  // agentId 变化时重置进度
  useEffect(() => {
    progressRef.current = 0;
  }, [agentId]);

  useFrame((_, delta) => {
    // lerp 进度
    progressRef.current = Math.min(1, progressRef.current + delta * 0.4);

    if (!meshRef.current) return;

    const p = progressRef.current;
    const red = new THREE.Color('#ef4444');
    const green = new THREE.Color('#10b981');
    const current = red.clone().lerp(green, p);

    if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
      const mat = meshRef.current.material;
      mat.color.copy(current);
      mat.emissive.copy(current);
      mat.emissiveIntensity = 0.3 + (1 - p) * 0.8;
      mat.opacity = 0.3 + p * 0.5;
    }
  });

  return (
    <mesh ref={meshRef} position={ringPos} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[9.5, 0.6, 8, 48]} />
      <meshStandardMaterial
        color="#ef4444"
        emissive="#ef4444"
        emissiveIntensity={0.6}
        transparent
        opacity={0.4}
        roughness={0.2}
        depthWrite={false}
      />
    </mesh>
  );
};
