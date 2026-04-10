import type { OKLab, GamutChecker } from './types';
import { oklabToHex } from './color-conversion';

export { oklabToHex } from './color-conversion';

/**
 * Convert an array of OKLab positions to sRGB hex strings, clipping any
 * out-of-gamut positions to the sRGB boundary while preserving hue and lightness.
 *
 * @returns colors - one #rrggbb string per position, in the same order
 * @returns clippedIndices - indices of positions that required gamut clipping
 * @returns clippedPositions - OKLab positions after gamut clipping (same as input for in-gamut points)
 */
export function finalizeColors(
  positions: OKLab[],
  gamut: GamutChecker,
): { colors: string[]; clippedIndices: number[]; clippedPositions: OKLab[] } {
  const colors: string[] = [];
  const clippedIndices: number[] = [];
  const clippedPositions: OKLab[] = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];

    if (gamut.isInGamut(pos)) {
      colors.push(oklabToHex(pos));
      clippedPositions.push(pos);
    } else {
      const clipped = gamut.clipPreserveChroma(pos);
      colors.push(oklabToHex(clipped));
      clippedPositions.push(clipped);
      clippedIndices.push(i);
    }
  }

  return { colors, clippedIndices, clippedPositions };
}
