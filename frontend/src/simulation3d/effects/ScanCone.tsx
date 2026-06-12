import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { AGENT_3D_ANCHORS, DEVICE_ANCHORS } from '../../data/constants';
import { toThreePos } from '../utils/coordinates';

const SCAN_DURATION = 2.6; // 扫描持续时间（秒）

/**
 * 锥形扫描波效果
 * 仅在 hopSubPhase === 'scanning' 时显示。
 * 扫描完成后自动调用 advanceHop，进入下一跳传输或后续阶段。
 */
export const ScanCone: React.FC = () => {
  const flashingDeviceId = useScenarioStore((s) => s.flashingDeviceId);
  const hopSubPhase = useScenarioStore((s) => s.hopSubPhase);

  if (hopSubPhase !== 'scanning' || !flashingDeviceId) return null;

  return <ScanConeBeam agentId={flashingDeviceId} />;
};

const ScanConeBeam: React.FC<{ agentId: string }> = ({ agentId }) => {
  const agentAnchor = AGENT_3D_ANCHORS[agentId as keyof typeof AGENT_3D_ANCHORS];
  const deviceAnchor = DEVICE_ANCHORS[agentId as keyof typeof DEVICE_ANCHORS];
  if (!agentAnchor || !deviceAnchor) return null;

  const devicePos = toThreePos(deviceAnchor.x, deviceAnchor.y, deviceAnchor.z);
  const agentPos = toThreePos(agentAnchor.x, agentAnchor.y, agentAnchor.z);

  const baseY = 2;
  const tipY = agentPos[1];
  const coneHeight = tipY - baseY;
  const coneCenterY = baseY + coneHeight / 2;

  const coneRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  const advanced = useRef(false);

  useEffect(() => {
    elapsed.current = 0;
    advanced.current = false;
  }, [agentId]);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const t = elapsed.current;

    if (coneRef.current) {
      const breathe = 0.9 + Math.sin(t * 3) * 0.1;
      coneRef.current.scale.set(breathe, 1, breathe);
      if (coneRef.current.material instanceof THREE.MeshStandardMaterial) {
        coneRef.current.material.opacity = 0.22 + Math.abs(Math.sin(t * 2.5)) * 0.13;
        coneRef.current.material.emissiveIntensity = 0.9 + Math.abs(Math.sin(t * 2.2)) * 0.5;
      }
    }

    if (ringRef.current) {
      ringRef.current.rotation.y = t * 1.5;
      const ringPulse = 0.8 + Math.sin(t * 4) * 0.2;
      ringRef.current.scale.setScalar(ringPulse);
      if (ringRef.current.material instanceof THREE.MeshStandardMaterial) {
        ringRef.current.material.opacity = 0.42 + Math.abs(Math.sin(t * 4)) * 0.45;
      }
    }

    // 扫描时间到，推进到下一跳传输或后续阶段
    if (elapsed.current >= SCAN_DURATION && !advanced.current) {
      advanced.current = true;
      const state = useScenarioStore.getState();
      if (state.hopSubPhase === 'scanning' && state.flashingDeviceId === agentId) {
        state.advanceHop();
      }
    }
  });

  return (
    <group position={[devicePos[0], 0, devicePos[2]]}>
      <Line
        points={[
          [agentPos[0] - devicePos[0], agentPos[1], agentPos[2] - devicePos[2]],
          [0, baseY + 1.2, 0],
        ]}
        color="#67e8f9"
        lineWidth={3}
        transparent
        opacity={0.82}
        depthWrite={false}
      />
      <mesh ref={coneRef} position={[0, coneCenterY, 0]}>
        <coneGeometry args={[12, coneHeight, 32, 1, true]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={1.2}
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={1}
        />
      </mesh>

      <mesh ref={ringRef} position={[0, baseY + 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[10, 0.4, 8, 48]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={1.0}
          transparent
          opacity={0.62}
          depthWrite={false}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
};
