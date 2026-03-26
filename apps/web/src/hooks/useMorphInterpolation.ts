import { useMemo } from 'react';
import { useStore } from '../store';
import type { OKLab, Particle } from 'facette';

function lerpOKLab(a: OKLab, b: OKLab, t: number): OKLab {
  return {
    L: a.L + (b.L - a.L) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function useMorphInterpolation(): {
  particles: Particle[];
  interpolatedPositions: OKLab[];
} | null {
  const trace = useStore((s) => s.trace);
  const currentFrame = useStore((s) => s.currentFrame);
  const morphT = useStore((s) => s.morphT);

  return useMemo(() => {
    if (!trace || currentFrame >= trace.frames.length) return null;
    const frame = trace.frames[currentFrame];
    const interpolated = frame.particles.map((p, i) =>
      lerpOKLab(p.position, frame.warpedPositions[i], morphT)
    );
    return { particles: frame.particles, interpolatedPositions: interpolated };
  }, [trace, currentFrame, morphT]);
}
