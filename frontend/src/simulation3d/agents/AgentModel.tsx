import React, { useRef } from 'react';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import { useGLTFWithFallback } from '../useGLTFWithFallback';

interface AgentModelProps {
  /** GLB 模型路径（相对 /models/） */
  modelPath: string;
  /** 位置 */
  position?: [number, number, number];
  /** 转动 */
  rotation?: [number, number, number];
  /**
   * 目标尺寸（包围盒最长边的目标长度）
   * 不同 GLB 模型通过 Box3 自动缩放到此统一值
   */
  targetSize?: number;
  /**
   * 人工偏移微调（在 autoScale 空间内，叠加在 Box3 居中之后）
   * 用于修正包围盒视觉中心与锚点之间的偏差
   */
  offset?: [number, number, number];
}

/**
 * 克隆材质，确保每个 Agent 实例拥有独立材质实例
 */
function cloneMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => m.clone());
      } else if (child.material) {
        child.material = child.material.clone();
      }
    }
  });
}

/**
 * 可复用的 Agent 3D 模型加载器
 *
 * 核心特性：
 * - SkeletonUtils.clone 处理 SkinnedMesh
 * - cloneMaterials 解除材质共享
 * - Box3 包围盒自动归一化：所有模型缩放至同一 targetSize 尺寸
 * - 自动居中：模型包围盒中心对齐到原点
 */
export const AgentModel: React.FC<AgentModelProps> = ({
  modelPath,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  targetSize = 18,
  offset = [0, 0, 0],
}) => {
  const { scene } = useGLTFWithFallback(modelPath);

  // 使用 ref 存储计算后的变换值，避免每次渲染重算
  const normalized = useRef<{
    scene: THREE.Group;
    autoScale: number;
    centerOffset: [number, number, number];
  } | null>(null);

  // 首次渲染时做一次 Box3 计算
  if (!normalized.current) {
    const cloned = SkeletonUtils.clone(scene) as THREE.Group;
    cloneMaterials(cloned);

    // 计算包围盒
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // 自动缩放：最长边 = targetSize
    const maxDim = Math.max(size.x, size.y, size.z);
    const autoScale = maxDim > 0 ? targetSize / maxDim : 1;

    // 居中偏移：使包围盒中心移到原点
    const centerOffset: [number, number, number] = [
      -center.x,
      -center.y,
      -center.z,
    ];

    normalized.current = { scene: cloned, autoScale, centerOffset };

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[AgentModel] ${modelPath} box=${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)} ` +
        `center=${center.x.toFixed(1)},${center.y.toFixed(1)},${center.z.toFixed(1)} ` +
        `→ autoScale=${autoScale.toFixed(3)}`
      );
    }
  }

  const groupRef = useRef<THREE.Group>(null);

  const { autoScale, centerOffset, scene: clonedSc } = normalized.current || {};

  // 合并 Box3 自动居中 + 人工偏移微调
  const finalOffset: [number, number, number] = centerOffset
    ? [
        centerOffset[0] + offset[0],
        centerOffset[1] + offset[1],
        centerOffset[2] + offset[2],
      ]
    : offset;

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {clonedSc && (
        <group position={finalOffset} scale={autoScale}>
          <primitive object={clonedSc} />
        </group>
      )}
    </group>
  );
};
