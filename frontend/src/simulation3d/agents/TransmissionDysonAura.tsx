import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface TransmissionDysonAuraProps {
  targetSize: number;
  yOffset?: number;
}

const SEGMENTS = 112;

function makeOrbit(radius: number): [number, number, number][] {
  return Array.from({ length: SEGMENTS + 1 }, (_, index) => {
    const angle = (index / SEGMENTS) * Math.PI * 2;
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
  });
}

export const TransmissionDysonAura: React.FC<TransmissionDysonAuraProps> = ({ targetSize, yOffset = 0 }) => {
  const rootRef = useRef<THREE.Group>(null);
  const orbitARef = useRef<THREE.Group>(null);
  const orbitBRef = useRef<THREE.Group>(null);
  const orbitCRef = useRef<THREE.Group>(null);
  const radius = Math.max(9, targetSize * 0.88);
  const orbit = makeOrbit(radius);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 1 + Math.sin(t * 2.8) * 0.035;

    if (rootRef.current) {
      rootRef.current.scale.setScalar(pulse);
    }
    if (orbitARef.current) {
      orbitARef.current.rotation.y = t * 0.95;
    }
    if (orbitBRef.current) {
      orbitBRef.current.rotation.x = t * 0.78;
      orbitBRef.current.rotation.z = Math.PI / 2.8;
    }
    if (orbitCRef.current) {
      orbitCRef.current.rotation.y = -t * 0.62;
      orbitCRef.current.rotation.x = Math.PI / 2.5;
    }
  });

  return (
    <group ref={rootRef} position={[0, yOffset, 0]}>
      <pointLight
        position={[0, targetSize * 0.18, 0]}
        intensity={120}
        distance={targetSize * 2.4}
        color="#bae6fd"
      />
      <group ref={orbitARef} rotation={[0.18, 0, 0]}>
        <Line points={orbit} color="#bae6fd" lineWidth={2.4} transparent opacity={0.82} depthWrite={false} />
      </group>
      <group ref={orbitBRef}>
        <Line points={orbit} color="#ffffff" lineWidth={1.8} transparent opacity={0.62} depthWrite={false} />
      </group>
      <group ref={orbitCRef}>
        <Line points={orbit} color="#67e8f9" lineWidth={1.7} transparent opacity={0.56} depthWrite={false} />
      </group>
    </group>
  );
};
