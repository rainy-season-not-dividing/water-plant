import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

const AURA_SEGMENTS = 96;

type AuraVariant = 'edge' | 'supervisor';

interface AgentTechAuraProps {
  targetSize: number;
  variant?: AuraVariant;
}

function makeOrbitPoints(radiusX: number, radiusZ: number, y = 0): [number, number, number][] {
  return Array.from({ length: AURA_SEGMENTS + 1 }, (_, index) => {
    const angle = (index / AURA_SEGMENTS) * Math.PI * 2;
    return [Math.cos(angle) * radiusX, y, Math.sin(angle) * radiusZ];
  });
}

/**
 * Agent 科技风装饰层：蓝色轨道线、竖向能量线和节点光点。
 * 只增强可读性与科技感，不改 GLB 原始材质。
 */
export const AgentTechAura: React.FC<AgentTechAuraProps> = ({
  targetSize,
  variant = 'edge',
}) => {
  const auraRef = useRef<THREE.Group>(null);
  const counterAuraRef = useRef<THREE.Group>(null);
  const nodeRefs = useRef<THREE.Mesh[]>([]);

  const isSupervisor = variant === 'supervisor';
  const radius = Math.max(8, targetSize * (isSupervisor ? 0.72 : 0.58));
  const tallRadius = Math.max(9, targetSize * (isSupervisor ? 0.82 : 0.64));
  const lineTop = targetSize * (isSupervisor ? 0.68 : 0.42);
  const lineBottom = -targetSize * (isSupervisor ? 0.42 : 0.34);

  const lowOrbit = makeOrbitPoints(
    radius * (isSupervisor ? 1.22 : 1.12),
    radius * (isSupervisor ? 0.86 : 0.74),
    -targetSize * (isSupervisor ? 0.22 : 0.18)
  );
  const midOrbit = makeOrbitPoints(
    radius * (isSupervisor ? 1.12 : 1.02),
    radius * (isSupervisor ? 1 : 0.88),
    targetSize * (isSupervisor ? 0.04 : 0.1)
  );
  const highOrbit = makeOrbitPoints(
    radius * (isSupervisor ? 1 : 0.9),
    radius * (isSupervisor ? 0.7 : 0.62),
    targetSize * (isSupervisor ? 0.42 : 0.35)
  );
  const coreOrbit = makeOrbitPoints(radius * 0.64, radius * 0.64, targetSize * 0.18);

  const edgeLines = [
    { angle: 0.18, heightBias: 0.08 },
    { angle: 1.58, heightBias: -0.04 },
    { angle: 3.05, heightBias: 0.02 },
    { angle: 4.35, heightBias: -0.08 },
  ];
  const supervisorLines = [
    ...edgeLines,
    { angle: 0.92, heightBias: -0.02 },
    { angle: 2.28, heightBias: 0.06 },
    { angle: 5.55, heightBias: 0.02 },
  ];
  const energyLines = isSupervisor ? supervisorLines : edgeLines;

  const edgeNodes = [
    { angle: 0.72, y: targetSize * 0.34, r: tallRadius * 1.03 },
    { angle: 2.45, y: targetSize * 0.08, r: tallRadius * 0.94 },
    { angle: 3.8, y: -targetSize * 0.2, r: tallRadius * 1.08 },
    { angle: 5.2, y: targetSize * 0.2, r: tallRadius * 0.98 },
  ];
  const supervisorNodes = [
    ...edgeNodes,
    { angle: 1.42, y: targetSize * 0.52, r: tallRadius * 0.92 },
    { angle: 3.2, y: targetSize * 0.38, r: tallRadius * 1.12 },
    { angle: 4.78, y: targetSize * 0.04, r: tallRadius * 1.04 },
  ];
  const nodes = isSupervisor ? supervisorNodes : edgeNodes;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const speed = isSupervisor ? 0.34 : 0.23;

    if (auraRef.current) {
      auraRef.current.rotation.y = t * speed;
      auraRef.current.rotation.z = Math.sin(t * 0.7) * (isSupervisor ? 0.03 : 0.045);
    }

    if (counterAuraRef.current) {
      counterAuraRef.current.rotation.y = -t * 0.22;
      counterAuraRef.current.rotation.x = Math.sin(t * 0.55) * 0.06;
    }

    nodeRefs.current.forEach((node, index) => {
      const pulse = 0.8 + Math.sin(t * 2.4 + index * 0.9) * 0.22;
      node.scale.setScalar(pulse);
    });
  });

  return (
    <group>
      <pointLight
        position={[0, targetSize * 0.16, 0]}
        intensity={isSupervisor ? 70 : 42}
        distance={targetSize * (isSupervisor ? 2.8 : 2.2)}
        color="#38bdf8"
      />

      <group ref={auraRef}>
        <group rotation={[0.2, 0, -0.08]}>
          <Line
            points={lowOrbit}
            color="#38bdf8"
            lineWidth={isSupervisor ? 1.55 : 1.3}
            transparent
            opacity={isSupervisor ? 0.62 : 0.56}
            depthWrite={false}
          />
        </group>

        <group rotation={[-0.32, Math.PI / 5, 0.14]}>
          <Line
            points={midOrbit}
            color="#93c5fd"
            lineWidth={isSupervisor ? 1.25 : 1.1}
            transparent
            opacity={isSupervisor ? 0.54 : 0.48}
            depthWrite={false}
          />
        </group>

        <group rotation={[0.45, -Math.PI / 7, -0.18]}>
          <Line
            points={highOrbit}
            color="#67e8f9"
            lineWidth={isSupervisor ? 1.05 : 0.9}
            transparent
            opacity={isSupervisor ? 0.48 : 0.42}
            depthWrite={false}
          />
        </group>
      </group>

      {isSupervisor && (
        <group ref={counterAuraRef} rotation={[Math.PI / 2, 0, 0]}>
          <Line
            points={coreOrbit}
            color="#bfdbfe"
            lineWidth={1}
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </group>
      )}

      {energyLines.map(({ angle, heightBias }) => {
        const x = Math.cos(angle) * radius * 0.72;
        const z = Math.sin(angle) * radius * 0.72;
        return (
          <Line
            key={`${angle}-${heightBias}`}
            points={[
              [x, lineBottom + targetSize * heightBias, z],
              [x * 0.45, lineTop - targetSize * heightBias, z * 0.45],
            ]}
            color="#7dd3fc"
            lineWidth={isSupervisor ? 1 : 0.85}
            transparent
            opacity={isSupervisor ? 0.48 : 0.38}
            depthWrite={false}
          />
        );
      })}

      {isSupervisor && (
        <Line
          points={[
            [0, lineBottom * 0.72, 0],
            [0, lineTop * 0.88, 0],
          ]}
          color="#dbeafe"
          lineWidth={1.35}
          transparent
          opacity={0.62}
          depthWrite={false}
        />
      )}

      {nodes.map(({ angle, y, r }, index) => (
        <mesh
          key={`${angle}-${y}`}
          ref={(node) => {
            if (node) nodeRefs.current[index] = node;
          }}
          position={[Math.cos(angle) * r, y, Math.sin(angle) * r]}
        >
          <sphereGeometry args={[isSupervisor ? 0.68 : 0.55, 16, 16]} />
          <meshBasicMaterial color="#bfdbfe" transparent opacity={0.92} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
};
