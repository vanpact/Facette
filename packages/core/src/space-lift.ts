import type { OKLab, SpaceLift, SpaceLiftConfig } from './types';

/**
 * Creates a SpaceLift that maps OKLab to working space via:
 * - Radial lift: rho(r) = R * (f(r)/f(R))^gamma on the (a, b) plane
 * - L-stretch: Lc + spread * (L - Lc) on the L axis
 *
 * The two components act on independent coordinates and commute.
 *
 * The L-stretch is intentionally one-directional: toLifted expands L for
 * hull construction, but fromLifted does NOT contract L back. This allows
 * free particles to output L values beyond the seed range. Only the radial
 * lift is inverted (it's nonlinear and must be undone for correct chroma).
 *
 * At spread=1, gamma=1 this is equivalent to V5.0's RadialLift.
 */
export function createSpaceLift(config: SpaceLiftConfig): SpaceLift {
  const { rs, R, gamma, spread, Lc } = config;
  const fR = (R * R) / (R + rs);

  function f(r: number): number {
    return (r * r) / (r + rs);
  }

  function toLifted(pos: OKLab): OKLab {
    const { L, a, b } = pos;

    // L-stretch
    const liftedL = Lc + spread * (L - Lc);

    // Radial lift
    const r = Math.sqrt(a * a + b * b);
    if (r < 1e-15) return { L: liftedL, a: 0, b: 0 };
    const rho = R * Math.pow(f(r) / fR, gamma);
    const scale = rho / r;
    return { L: liftedL, a: a * scale, b: b * scale };
  }

  function fromLifted(pos: OKLab): OKLab {
    const { L, a, b } = pos;

    // L is NOT un-stretched: the L-stretch is one-directional.
    // This lets free particles output L values beyond the seed range.

    // Inverse radial lift only
    const rhoVal = Math.sqrt(a * a + b * b);
    if (rhoVal < 1e-15) return { L, a: 0, b: 0 };
    const u = fR * Math.pow(rhoVal / R, 1 / gamma);
    const r = (u + Math.sqrt(u * u + 4 * u * rs)) / 2;
    const scale = r / rhoVal;
    return { L, a: a * scale, b: b * scale };
  }

  return { toLifted, fromLifted, config };
}
