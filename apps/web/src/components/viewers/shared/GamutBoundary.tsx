import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import gamutUrl from '../../../assets/srgb-gamut.glb?url';

export function GamutBoundary() {
  const { nodes } = useGLTF(gamutUrl);

  const geometry = useMemo(() => {
    const mesh = Object.values(nodes).find(
      (n): n is THREE.Mesh => n instanceof THREE.Mesh,
    );
    return mesh?.geometry ?? null;
  }, [nodes]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color="#555555"
        wireframe
        transparent
        opacity={0.12}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
