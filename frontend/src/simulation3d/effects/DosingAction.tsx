import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { REAL_DEVICE_ANCHORS } from '../plantAnchors';
import { toThreePos } from '../utils/coordinates';

export const DosingAction: React.FC = () => {
  const phase = useScenarioStore((s) => s.phase);
  const targetAgentId = useScenarioStore((s) => s.targetAgentId);

  const isActive = targetAgentId === 'dosing' && (phase === 'executing' || phase === 'operating');
  if (!isActive) return null;

  return <DosingEffect />;
};

const DosingEffect: React.FC = () => {
  const anchor = REAL_DEVICE_ANCHORS.dosing;
  const pos = toThreePos(anchor.x, anchor.y, anchor.z);
  const basePos = [pos[0], 0, pos[2]] as [number, number, number];

  const pulseRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (pulseRef.current) {
      pulseRef.current.scale.setScalar(0.9 + Math.abs(Math.sin(t * 3.2)) * 0.35);
      if (pulseRef.current.material instanceof THREE.MeshStandardMaterial) {
        pulseRef.current.material.opacity = 0.18 + Math.abs(Math.sin(t * 3.2)) * 0.28;
      }
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += 0.025;
    }
  });

  return (
    <group position={basePos}>
      <mesh ref={pulseRef} position={[0, 8, 0]}>
        <sphereGeometry args={[8, 24, 16]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#f59e0b"
          emissiveIntensity={0.6}
          transparent
          opacity={0.26}
          depthWrite={false}
          roughness={0.3}
        />
      </mesh>

      <mesh ref={ringRef} position={[0, 2.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[12, 0.35, 8, 64]} />
        <meshStandardMaterial
          color="#f59e0b"
          emissive="#f59e0b"
          emissiveIntensity={1.0}
          transparent
          opacity={0.58}
          depthWrite={false}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
};
