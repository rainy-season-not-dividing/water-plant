import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface ThinkingHighlightProps {
  targetSize: number;
  yOffset?: number;
}

const SEGMENTS = 96;

function makeRing(radius: number, y = 0): [number, number, number][] {
  return Array.from({ length: SEGMENTS + 1 }, (_, index) => {
    const angle = (index / SEGMENTS) * Math.PI * 2;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  });
}

export const ThinkingHighlight: React.FC<ThinkingHighlightProps> = ({ targetSize, yOffset = 0 }) => {
  const groupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const radius = Math.max(8, targetSize * 0.72);
  const ring = makeRing(radius, yOffset);
  const upperRing = makeRing(radius * 0.72, yOffset + targetSize * 0.32);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 1.03 + Math.sin(t * 3.1) * 0.1;

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.72;
      groupRef.current.scale.setScalar(pulse);
    }

    if (haloRef.current) {
      const material = haloRef.current.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = 0.3 + Math.sin(t * 4.2) * 0.08;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <pointLight
        position={[0, yOffset + targetSize * 0.42, 0]}
        intensity={420}
        distance={targetSize * 3.6}
        color="#ffffff"
      />
      <mesh ref={haloRef} position={[0, yOffset + targetSize * 0.12, 0]}>
        <sphereGeometry args={[targetSize * 0.74, 32, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>
      <Line points={ring} color="#ffffff" lineWidth={1.8} transparent opacity={0.52} depthWrite={false} />
      <group rotation={[0.38, 0, 0.18]}>
        <Line points={upperRing} color="#e0f2fe" lineWidth={1.25} transparent opacity={0.42} depthWrite={false} />
      </group>
      <group rotation={[-0.34, Math.PI / 3, -0.12]}>
        <Line points={upperRing} color="#ffffff" lineWidth={1.15} transparent opacity={0.36} depthWrite={false} />
      </group>
    </group>
  );
};
