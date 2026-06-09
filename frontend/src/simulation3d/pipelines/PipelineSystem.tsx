import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { AGENT_3D_ANCHORS } from '../../data/constants';
import type { AgentId } from '../../types';
import { toThreePos } from '../utils/coordinates';

const SPECIALISTS: AgentId[] = ['dosing', 'uf', 'ro', 'pump'];

function buildModulePipes(agentId: AgentId): THREE.Vector3[][] {
  const module = AGENT_3D_ANCHORS[agentId];
  const supervisor = AGENT_3D_ANCHORS.supervisor;

  const mBase = toThreePos(module.x, module.y, 15);
  const sBase = toThreePos(supervisor.x, supervisor.y, 20);

  const midX = (mBase[0] + sBase[0]) / 2;
  const midZ = (mBase[2] + sBase[2]) / 2;

  return [
    [
      new THREE.Vector3(mBase[0], 2, mBase[2]),
      new THREE.Vector3(midX, 3, mBase[2]),
      new THREE.Vector3(midX, 3, midZ),
      new THREE.Vector3(sBase[0], 2, midZ),
      new THREE.Vector3(sBase[0], 2, sBase[2]),
    ],
  ];
}

export const PipelineSystem: React.FC = () => {
  const pipeLines = useMemo(() => {
    return SPECIALISTS.flatMap((id) => {
      const paths = buildModulePipes(id);
      return paths.map((points, i) => ({ key: `${id}-pipe-${i}`, points }));
    });
  }, []);

  return (
    <group>
      {pipeLines.map(({ key, points }) => (
        <Line
          key={key}
          points={points}
          color="#475569"
          lineWidth={4}
          transparent
          opacity={0.7}
        />
      ))}

      {pipeLines.flatMap(({ key, points }) =>
        points.map((pt, i) => (
          <mesh key={`${key}-joint-${i}`} position={pt}>
            <sphereGeometry args={[0.8, 8, 8]} />
            <meshStandardMaterial
              color="#334155"
              roughness={0.3}
              metalness={0.7}
              transparent
              opacity={0.8}
            />
          </mesh>
        )),
      )}
    </group>
  );
};
