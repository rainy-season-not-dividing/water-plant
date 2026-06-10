import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const MODEL_PATH = '/models/real_water_plant.glb';
const DRACO_PATH = '/draco/';
const BASE_TARGET_WIDTH = 136;

// Adjust this value to scale the real plant model.
// 1.0 keeps the original fitted width; 1.25 makes it 25% larger.
export const REAL_PLANT_MODEL_SCALE_MULTIPLIER = 3.0;

useGLTF.setDecoderPath(DRACO_PATH);

export const RealPlantModel: React.FC = () => {
  const { scene } = useGLTF(MODEL_PATH, DRACO_PATH);
  const model = useMemo(() => scene.clone(true), [scene]);
  const [transform, setTransform] = useState({
    scale: 1,
    offset: new THREE.Vector3(),
  });
  const loggedRef = useRef(false);

  useEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = true;

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        material.side = THREE.DoubleSide;
        if ('roughness' in material) material.roughness = Math.max(material.roughness ?? 0.6, 0.45);
        if ('metalness' in material) material.metalness = Math.min(material.metalness ?? 0.2, 0.65);
      });
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const width = Math.max(size.x, size.z, 1);
    const scale = (BASE_TARGET_WIDTH * REAL_PLANT_MODEL_SCALE_MULTIPLIER) / width;
    const offset = center.multiplyScalar(-1);
    setTransform({ scale, offset });

    if (!loggedRef.current) {
      loggedRef.current = true;
      console.info(
        `[RealPlantModel] size=${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)} ` +
        `scale=${scale.toFixed(3)} center=${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)}`
      );
    }
  }, [model]);

  return (
    <group scale={transform.scale} rotation={[0, 0, 0]}>
      <primitive object={model} position={transform.offset} />
    </group>
  );
};

useGLTF.preload(MODEL_PATH, DRACO_PATH);
