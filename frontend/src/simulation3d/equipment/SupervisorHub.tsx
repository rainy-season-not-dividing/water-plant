import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import { DEVICE_ANCHORS } from '../../data/constants';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { toThreePos } from '../utils/coordinates';

interface SupervisorHubProps {
  agentId?: 'supervisor';
}

const SUPERVISOR_MODEL_PATH = '/models/brain_tech.glb';

/**
 * 监管中枢：加载监管大脑模型，并保留双光环状态效果。
 */
export const SupervisorHub: React.FC<SupervisorHubProps> = () => {
  const anchor = DEVICE_ANCHORS.supervisor;
  const pos = toThreePos(anchor.x, anchor.y, anchor.z);
  const groundY = 0;

  const torusRef = useRef<THREE.Mesh>(null);
  const innerTorusRef = useRef<THREE.Mesh>(null);
  const modelGroupRef = useRef<THREE.Group>(null);

  // 加载 supervisor 模型
  const { scene } = useGLTF(SUPERVISOR_MODEL_PATH);
  const cloneRef = useRef<THREE.Group | null>(null);

  /** 期望模型高度 */
  const TARGET_MODEL_HEIGHT = 18;

  // 模型缩放和偏移，靠包围盒计算
  const [modelOffset, setModelOffset] = useState({ y: 0, scale: 0.7 });

  useEffect(() => {
    const cloned = SkeletonUtils.clone(scene) as THREE.Group;

    // 计算包围盒
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // 自动计算缩放：目标高度 / 实际高度
    const autoScale = TARGET_MODEL_HEIGHT / size.y;

    // 模型底部 Y = center.y - size.y/2，使模型直接落在地面上。
    const feetY = center.y - size.y / 2;
    const autoOffset = -feetY;

    cloneRef.current = cloned;
    setModelOffset({ y: autoOffset, scale: autoScale });

    console.log(
      `[SupervisorHub] Box3 size=${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)} ` +
      `center=${center.x.toFixed(1)},${center.y.toFixed(1)},${center.z.toFixed(1)} ` +
      `→ scale=${autoScale.toFixed(2)}, yOffset=${autoOffset.toFixed(1)}`
    );
  }, [scene]);

  // 读取 store：分析中/派发中 加速旋转
  const phase = useScenarioStore((s) => s.phase);

  useFrame((_, delta) => {
    const isActive = phase === 'analyzing' || phase === 'dispatching';
    const speed = isActive ? 2.4 : 0.8;

    // 光环旋转
    if (torusRef.current) {
      torusRef.current.rotation.y += delta * speed;
      torusRef.current.rotation.x += delta * 0.15;
    }
    if (innerTorusRef.current) {
      innerTorusRef.current.rotation.z += delta * speed * 0.6;
    }

    // 模型自转
    if (modelGroupRef.current) {
      modelGroupRef.current.rotation.y += delta * speed * 0.3;
    }
  });

  return (
    <group position={[pos[0], groundY, pos[2]]}>
      {/* 监管 Agent 模型（包围盒自动居中） */}
      <group
        ref={modelGroupRef}
        position={[0, modelOffset.y, 0]}
        scale={modelOffset.scale}
      >
        {cloneRef.current && <primitive object={cloneRef.current} />}
      </group>

      {/* 旋转光环 torus */}
      <mesh ref={torusRef} position={[0, 10, 0]}>
        <torusGeometry args={[10, 0.5, 16, 64]} />
        <meshStandardMaterial
          color="#60a5fa"
          emissive="#378ADD"
          emissiveIntensity={0.8}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>

      {/* 第二层光环（反向旋转） */}
      <mesh ref={innerTorusRef} position={[0, 5, 0]} rotation={[Math.PI / 6, 0, Math.PI / 3]}>
        <torusGeometry args={[8.5, 0.35, 16, 48]} />
        <meshStandardMaterial
          color="#93c5fd"
          emissive="#378ADD"
          emissiveIntensity={0.4}
          roughness={0.2}
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  );
};
