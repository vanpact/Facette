import { useStore } from '../../store';
import { useMorphInterpolation } from '../../hooks/useMorphInterpolation';
import { SceneSetup } from './shared/SceneSetup';
import { AxisHelper } from './shared/AxisHelper';
import { ParticlePoints } from './shared/ParticlePoints';
import { oklchToScene } from './transforms/oklchToScene';
import { useMemo } from 'react';
import { oklabToOklch } from 'facette';
import type { OKLab } from 'facette';
import type { RefObject, ElementRef } from 'react';
import type { OrbitControls } from '@react-three/drei';

interface OKLChViewerProps {
  controlsRef?: RefObject<ElementRef<typeof OrbitControls> | null>;
}

export function OKLChViewer({ controlsRef }: OKLChViewerProps) {
  const trace = useStore((s) => s.trace);
  const showAxes = useStore((s) => s.showAxes);
  const showClipping = useStore((s) => s.showClipping);
  const morphData = useMorphInterpolation();
  const clippedSet = useMemo(
    () => showClipping && trace ? new Set(trace.clippedIndices) : null,
    [showClipping, trace],
  );

  const posMapper = (pos: OKLab): [number, number, number] =>
    oklchToScene(oklabToOklch(pos));

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-2 left-2 z-10 text-xs font-mono text-gray-400">
        OKLCh
      </div>
      <SceneSetup controlsRef={controlsRef}>
        {showAxes && <AxisHelper labels={['C·cos(h)', 'L', 'C·sin(h)']} />}
        {morphData && (
          <ParticlePoints
            particles={morphData.particles}
            positions={morphData.interpolatedPositions}
            positionMapper={posMapper}
            colors={trace?.finalColors ?? []}
            clippedIndices={clippedSet}
          />
        )}
      </SceneSetup>
    </div>
  );
}
