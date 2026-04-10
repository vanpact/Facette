import * as THREE from 'three';
import type { OKLab, Particle } from 'facette';
import { useStore } from '../../../store';

interface ParticlePointsProps {
  particles: Particle[];
  positions: OKLab[];
  positionMapper: (pos: OKLab) => [number, number, number];
  colors: string[];
  clippedIndices?: Set<number> | null;
}

export function ParticlePoints({ particles, positions, positionMapper, colors, clippedIndices }: ParticlePointsProps) {
  const selectedIndex = useStore((s) => s.selectedIndex);
  const setSelectedIndex = useStore((s) => s.setSelectedIndex);
  const setHoveredIndex = useStore((s) => s.setHoveredIndex);
  const showSeeds = useStore((s) => s.showSeeds);
  const showGenerated = useStore((s) => s.showGenerated);

  return (
    <group>
      {particles.map((p, i) => {
        const isSeed = p.kind.startsWith('pinned');
        if (isSeed && !showSeeds) return null;
        if (!isSeed && !showGenerated) return null;

        const pos = positionMapper(positions[i]);
        const radius = isSeed ? 0.015 : 0.01;
        const isSelected = selectedIndex === i;
        const isClipped = clippedIndices?.has(i) ?? false;

        return (
          <group key={i}>
            {isClipped && (
              <mesh position={pos}>
                <sphereGeometry args={[radius * 1.8, 16, 16]} />
                <meshBasicMaterial
                  color="#ffffff"
                  transparent
                  opacity={0.4}
                  wireframe
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}
            <mesh
              position={pos}
              onClick={(e) => { e.stopPropagation(); setSelectedIndex(i); }}
              onPointerEnter={() => setHoveredIndex(i)}
              onPointerLeave={() => setHoveredIndex(null)}
            >
              <sphereGeometry args={[isSelected ? radius * 1.5 : radius, 16, 16]} />
              <meshStandardMaterial
                color={colors[i] ?? '#ffffff'}
                emissive={isSelected ? '#ffffff' : '#000000'}
                emissiveIntensity={isSelected ? 0.3 : 0}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
