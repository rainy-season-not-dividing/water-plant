import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { REAL_DEVICE_ANCHORS } from '../plantAnchors';
import { toThreePos } from '../utils/coordinates';

export const ROAction: React.FC = () => {
  const phase = useScenarioStore((s) => s.phase);
  const targetAgentId = useScenarioStore((s) => s.targetAgentId);

  const isActive = targetAgentId === 'ro' && (phase === 'executing' || phase === 'operating');
  if (!isActive) return null;

  return <ROEffect />;
};

const ROEffect: React.FC = () => {
  const anchor = REAL_DEVICE_ANCHORS.ro;
  const pos = toThreePos(anchor.x, anchor.y, anchor.z);
  const basePos = [pos[0], 0, pos[2]] as [number, number, number];

  const flowRingRef = useRef<THREE.Mesh>(null);
  const pulseRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (flowRingRef.current) {
      flowRingRef.current.rotation.y += 0.02;
    }

    pulseRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const phase = i * Math.PI * 0.5;
      ref.scale.setScalar(0.8 + Math.abs(Math.sin(t * 2.8 + phase)) * 0.45);
      if (ref.material instanceof THREE.MeshStandardMaterial) {
        ref.material.opacity = 0.16 + Math.abs(Math.sin(t * 2.8 + phase)) * 0.24;
      }
    });
  });

  return (
    <group position={basePos}>
      <mesh ref={flowRingRef} position={[0, 6, 0]} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[13, 0.3, 8, 48]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={0.6}
          transparent
          opacity={0.5}
          depthWrite={false}
          roughness={0.1}
        />
      </mesh>

      <mesh position={[0, 4, 0]} rotation={[-Math.PI / 4, 0, 0]}>
        <torusGeometry args={[10, 0.25, 8, 48]} />
        <meshStandardMaterial
          color="#60a5fa"
          emissive="#60a5fa"
          emissiveIntensity={0.4}
          transparent
          opacity={0.35}
          depthWrite={false}
          roughness={0.1}
        />
      </mesh>

      {[-7, 0, 7].map((mx, i) => (
        <mesh
          key={i}
          ref={(el) => { pulseRefs.current[i] = el; }}
          position={[mx, 7, 0]}
        >
          <sphereGeometry args={[3.2, 18, 12]} />
          <meshStandardMaterial
            color="#d85a30"
            emissive="#f97316"
            emissiveIntensity={0.8}
            transparent
            opacity={0.26}
            depthWrite={false}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
};
