import React from 'react';

interface GroundProps {
  radius?: number;
  divisions?: number;
  showGrid?: boolean;
}

export const Ground: React.FC<GroundProps> = ({
  radius = 300,
  divisions = 30,
  showGrid = false,
}) => {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -12, 0]} receiveShadow>
        <planeGeometry args={[radius * 2, radius * 2]} />
        <meshStandardMaterial color="#0f172a" transparent opacity={0.6} />
      </mesh>

      {showGrid && (
        <gridHelper
          args={[radius, divisions, '#1e293b', '#0f172a']}
        />
      )}
    </group>
  );
};
