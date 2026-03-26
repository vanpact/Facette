import type { OKLab, GamutChecker } from './types';
import {
  oklabToLinearRgb,
  oklabToOklch,
  oklchToOklab,
} from './color-conversion';

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

  };
}
