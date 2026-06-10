import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { REAL_DEVICE_ANCHORS } from '../plantAnchors';
import { toThreePos } from '../utils/coordinates';

export const UFAction: React.FC = () => {
  const phase = useScenarioStore((s) => s.phase);
  const targetAgentId = useScenarioStore((s) => s.targetAgentId);

  const isActive = targetAgentId === 'uf' && (phase === 'executing' || phase === 'operating');
  if (!isActive) return null;

  return <UFEffect />;
};

const UFEffect: React.FC = () => {
  const anchor = REAL_DEVICE_ANCHORS.uf;
  const pos = toThreePos(anchor.x, anchor.y, anchor.z);
  const basePos = [pos[0], 0, pos[2]] as [number, number, number];

  const ringRef = useRef<THREE.Mesh>(null);
  const washRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (ringRef.current) {
      ringRef.current.rotation.z += 0.02;
    }

    washRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const phase = i * Math.PI * 0.45;
      ref.position.y = 7 + Math.sin(t * 5 + phase) * 1.2;
      if (ref.material instanceof THREE.MeshStandardMaterial) {
        ref.material.opacity = 0.18 + Math.abs(Math.sin(t * 4 + phase)) * 0.34;
      }
    });
  });

  return (
    <group position={basePos}>
      <mesh ref={ringRef} position={[0, 2.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[16, 0.35, 8, 72]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#22d3ee"
          emissiveIntensity={1}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      {[-11, -5.5, 0, 5.5, 11].map((cx, i) => (
        <mesh
          key={i}
          ref={(el) => { washRefs.current[i] = el; }}
          position={[cx, 7, 0]}
        >
          <cylinderGeometry args={[0.55, 0.55, 16, 12]} />
          <meshStandardMaterial
            color="#14b8a6"
            emissive="#14b8a6"
            emissiveIntensity={0.7}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};
