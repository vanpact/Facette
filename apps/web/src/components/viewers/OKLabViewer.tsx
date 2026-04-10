import { useStore } from '../../store';
import { useMorphInterpolation } from '../../hooks/useMorphInterpolation';
import { useMorphToggle } from './shared/MorphAnimator';
import { SceneSetup } from './shared/SceneSetup';
import { AxisHelper } from './shared/AxisHelper';
import { ParticlePoints } from './shared/ParticlePoints';
import { HullMesh } from './shared/HullMesh';
import { GamutBoundary } from './shared/GamutBoundary';
import { oklabToScene } from './transforms/oklabToScene';
import type { OKLab, HullGeometry } from 'facette';
import type { RefObject, ElementRef } from 'react';
import type { OrbitControls } from '@react-three/drei';

interface OKLabViewerProps {
  controlsRef?: RefObject<ElementRef<typeof OrbitControls> | null>;
}

export function OKLabViewer({ controlsRef }: OKLabViewerProps) {
  const trace = useStore((s) => s.trace);
  const showHull = useStore((s) => s.showHull);
  const showGamut = useStore((s) => s.showGamut);
  const showAxes = useStore((s) => s.showAxes);
  const { isWarped, toggle } = useMorphToggle();
  const showClipping = useStore((s) => s.showClipping);
  const morphData = useMorphInterpolation();

  const posMapper = (pos: OKLab): [number, number, number] => oklabToScene(pos);

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-2 left-2 z-10 text-xs font-mono text-gray-400">
        {isWarped ? 'Lifted' : 'OKLab'}
      </div>
      <button
        onClick={toggle}
        className="absolute top-2 right-2 z-10 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-600"
      >
        {isWarped ? 'Unlift' : 'Lift'}
      </button>
      <SceneSetup controlsRef={controlsRef}>
        {showAxes && <AxisHelper labels={['a', 'L', 'b']} />}
        {showGamut && <GamutBoundary />}
        {showHull && trace && trace.geometry.kind === 'hull' && (
          <HullMesh
            vertices={(trace.geometry as HullGeometry).vertices}
            faceIndices={(trace.geometry as HullGeometry).faces}
            positionMapper={posMapper}
          />
        )}
        {morphData && (
          <ParticlePoints
            particles={morphData.particles}
            positions={morphData.interpolatedPositions}
            positionMapper={posMapper}
            colors={trace?.finalColors ?? []}
            clippedIndices={showClipping && trace ? new Set(trace.clippedIndices) : null}
          />
        )}
      </SceneSetup>
    </div>
  );
}
