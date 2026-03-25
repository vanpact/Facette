import type { OKLab, Vec3, GamutChecker } from './types';
import {
  oklabToLinearRgb,
  oklabToLinearRgbJacobian,
  oklabToOklch,
  oklchToOklab,
} from './color-conversion';
import { mat3MulVec3, mat3Transpose } from './math';

const GAMUT_TOLERANCE = 1e-10;
const BINARY_SEARCH_ITERATIONS = 20;

/**
 * Check whether a linear RGB value is within the [0, 1] gamut
 * (with a small numerical tolerance).
 */
function isChannelInGamut(c: number): boolean {
  return c >= -GAMUT_TOLERANCE && c <= 1 + GAMUT_TOLERANCE;
}

export function createGamutChecker(): GamutChecker {
  return {
    /**
     * Convert pos to linear RGB and verify all channels are in [0, 1]
     * (within a tiny tolerance).
     */
    isInGamut(pos: OKLab): boolean {
      const rgb = oklabToLinearRgb(pos);
      return (
        isChannelInGamut(rgb.r) &&
        isChannelInGamut(rgb.g) &&
        isChannelInGamut(rgb.b)
      );
    },

    /**
     * Binary search on chroma at fixed hue and lightness to find the maximum
     * in-gamut chroma. Hue and lightness are preserved exactly.
     */
    clipPreserveChroma(pos: OKLab): OKLab {
      // If already in gamut, return as-is
      if (this.isInGamut(pos)) {
        return pos;
      }

      const lch = oklabToOklch(pos);
      const { L, h } = lch;
      let lo = 0;
      let hi = lch.C;

      for (let i = 0; i < BINARY_SEARCH_ITERATIONS; i++) {
        const mid = (lo + hi) / 2;
        const candidate = oklchToOklab({ L, C: mid, h });
        if (this.isInGamut(candidate)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }

      return oklchToOklab({ L, C: lo, h });
    },

    /**
     * Compute the gradient of the quadratic out-of-gamut penalty with respect
     * to OKLab coordinates, using the chain rule through the Jacobian.
     *
     * Penalty: P = sum_c { c^2 if c < 0, (c-1)^2 if c > 1, 0 otherwise }
     * gradOKLab = J^T · gradLinRGB   where J = d(linRGB)/d(OKLab)
     */
    penaltyGradient(pos: OKLab): Vec3 {
      const rgb = oklabToLinearRgb(pos);

      // dP/dc for each linear RGB channel
      const dPdr = rgb.r < 0 ? 2 * rgb.r : rgb.r > 1 ? 2 * (rgb.r - 1) : 0;
      const dPdg = rgb.g < 0 ? 2 * rgb.g : rgb.g > 1 ? 2 * (rgb.g - 1) : 0;
      const dPdb = rgb.b < 0 ? 2 * rgb.b : rgb.b > 1 ? 2 * (rgb.b - 1) : 0;

      const gradLinRGB: Vec3 = [dPdr, dPdg, dPdb];

      // J = d(linRGB)/d(OKLab), shape 3×3
      const J = oklabToLinearRgbJacobian(pos);

      // gradOKLab = J^T · gradLinRGB
      const JT = mat3Transpose(J);
      return mat3MulVec3(JT, gradLinRGB);
    },
  };
}
