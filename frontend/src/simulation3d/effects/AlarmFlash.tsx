import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScenarioStore } from '../../stores/useScenarioStore';
import type { AgentId } from '../../types';
import { REAL_DEVICE_ANCHORS } from '../plantAnchors';
import { toThreePos } from '../utils/coordinates';

/**
 * 设备红色闪烁效果
 * 当 flashingDeviceId 不为 null 时，在对应设备位置显示红色脉冲光环
 */
export const AlarmFlash: React.FC = () => {
  const flashingDeviceId = useScenarioStore((s) => s.flashingDeviceId);

  if (!flashingDeviceId) return null;

  return <AlarmFlashRing agentId={flashingDeviceId} />;
};

const AlarmFlashRing: React.FC<{ agentId: AgentId }> = ({ agentId }) => {
  const anchor = REAL_DEVICE_ANCHORS[agentId];
  const pos = toThreePos(anchor.x, anchor.y, anchor.z);
  const ringPos: [number, number, number] = [pos[0], 2.5, pos[2]];

  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();

    const pulse = 0.5 + Math.abs(Math.sin(t * 6)) * 1.0;
    meshRef.current.scale.setScalar(1 + pulse * 0.3);

    if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
      const mat = meshRef.current.material;
      mat.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 8)) * 1.2;
      mat.opacity = 0.3 + Math.abs(Math.sin(t * 6)) * 0.5;
    }
  });

  return (
    <mesh ref={meshRef} position={ringPos} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[9, 0.8, 8, 32]} />
      <meshStandardMaterial
        color="#ef4444"
        emissive="#ef4444"
        emissiveIntensity={0.8}
        transparent
        opacity={0.5}
        roughness={0.2}
        depthWrite={false}
      />
    </mesh>
  );
};
