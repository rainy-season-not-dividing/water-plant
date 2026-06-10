import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { REAL_DEVICE_ANCHORS } from '../plantAnchors';
import { toThreePos } from '../utils/coordinates';

export const PumpAction: React.FC = () => {
  const phase = useScenarioStore((s) => s.phase);
  const targetAgentId = useScenarioStore((s) => s.targetAgentId);

  const isActive = targetAgentId === 'pump' && (phase === 'executing' || phase === 'operating');
  if (!isActive) return null;

  return <PumpEffect />;
};

const PumpEffect: React.FC = () => {
  const anchor = REAL_DEVICE_ANCHORS.pump;
  const pos = toThreePos(anchor.x, anchor.y, anchor.z);
  const basePos = [pos[0], 0, pos[2]] as [number, number, number];

  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const indicatorRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    ringRefs.current.forEach((ref, i) => {
      if (ref) ref.rotation.z += 0.05 + i * 0.012;
    });

    if (indicatorRef.current && indicatorRef.current.material instanceof THREE.MeshStandardMaterial) {
      const flash = Math.sin(t * 4) > 0;
      indicatorRef.current.material.color.set(flash ? '#10b981' : '#ef4444');
      indicatorRef.current.material.emissive.set(flash ? '#10b981' : '#ef4444');
      indicatorRef.current.material.emissiveIntensity = flash ? 1.2 : 0.6;
    }
  });

  return (
    <group position={basePos}>
      {[0, 1, 2].map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { ringRefs.current[i] = el; }}
          position={[0, 4 + i * 2.4, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[8 + i * 2.8, 0.35, 8, 56]} />
          <meshStandardMaterial
            color="#38bdf8"
            emissive="#38bdf8"
            emissiveIntensity={0.8}
            transparent
            opacity={0.42 - i * 0.06}
            depthWrite={false}
            roughness={0.2}
          />
        </mesh>
      ))}

      <mesh ref={indicatorRef} position={[0, 12, 0]}>
        <sphereGeometry args={[1.1, 16, 12]} />
        <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1.1} />
      </mesh>
    </group>
  );
};
