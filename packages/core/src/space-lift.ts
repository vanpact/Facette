import type { OKLab, SpaceLift, SpaceLiftConfig } from './types';

/**
 * Creates a SpaceLift that maps OKLab to working space via the radial lift:
 *   rho(r) = R * (f(r)/f(R))^gamma, where f(r) = r^2/(r + r_s)
 *
 * Operates only on the chromatic plane (a, b). L passes through unchanged.
 * fromLifted is the exact algebraic inverse of toLifted.
 *
 * The L-stretch (lightness expansion for hull shaping) is NOT part of this
 * transform — it is a seed preprocessing step in the orchestrator. This keeps
 * the SpaceLift a proper coordinate transform with a true inverse.
 *
 * At gamma=1, equivalent to V4.4's warp scaled by R/f(R).
 */
export function createSpaceLift(config: SpaceLiftConfig): SpaceLift {
  const { rs, R, gamma } = config;
  const fR = (R * R) / (R + rs);

  function f(r: number): number {
    return (r * r) / (r + rs);
  }

  function toLifted(pos: OKLab): OKLab {
    const { L, a, b } = pos;
    const r = Math.sqrt(a * a + b * b);
    if (r < 1e-15) return { L, a: 0, b: 0 };
    const rho = R * Math.pow(f(r) / fR, gamma);
    const scale = rho / r;
    return { L, a: a * scale, b: b * scale };
  }

  function fromLifted(pos: OKLab): OKLab {
    const { L, a, b } = pos;
    const rhoVal = Math.sqrt(a * a + b * b);
    if (rhoVal < 1e-15) return { L, a: 0, b: 0 };
    const u = fR * Math.pow(rhoVal / R, 1 / gamma);
    const r = (u + Math.sqrt(u * u + 4 * u * rs)) / 2;
    const scale = r / rhoVal;
    return { L, a: a * scale, b: b * scale };
  }

  return { toLifted, fromLifted, config };
}
