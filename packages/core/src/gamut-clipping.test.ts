import { describe, it, expect } from 'vitest';
import { createGamutChecker } from './gamut-clipping';
import { hexToOklab } from './color-conversion';

describe('GamutChecker', () => {
  const checker = createGamutChecker();

  describe('isInGamut', () => {
    it('returns true for mid-gray', () => {
      expect(checker.isInGamut({ L: 0.5, a: 0, b: 0 })).toBe(true);
    });
    it('returns true for white', () => {
      expect(checker.isInGamut({ L: 1, a: 0, b: 0 })).toBe(true);
    });
    it('returns true for black', () => {
      expect(checker.isInGamut({ L: 0, a: 0, b: 0 })).toBe(true);
    });
    it('returns false for extreme chroma', () => {
      expect(checker.isInGamut({ L: 0.5, a: 0.4, b: 0.4 })).toBe(false);
    });

    it('treats round-tripped sRGB primaries as in gamut', () => {
      expect(checker.isInGamut(hexToOklab('#ff0000'))).toBe(true);
      expect(checker.isInGamut(hexToOklab('#00ff00'))).toBe(true);
      expect(checker.isInGamut(hexToOklab('#0000ff'))).toBe(true);
    });
  });

  describe('clipPreserveChroma', () => {
    it('returns in-gamut colors unchanged', () => {
      const color = { L: 0.5, a: 0, b: 0 };
      const clipped = checker.clipPreserveChroma(color);
      expect(clipped.L).toBeCloseTo(color.L, 6);
      expect(clipped.a).toBeCloseTo(color.a, 6);
      expect(clipped.b).toBeCloseTo(color.b, 6);
    });

    it('preserves hue for out-of-gamut', () => {
      const color = { L: 0.5, a: 0.3, b: 0.3 };
      const clipped = checker.clipPreserveChroma(color);
      const origHue = Math.atan2(color.b, color.a);
      const clipHue = Math.atan2(clipped.b, clipped.a);
      expect(clipHue).toBeCloseTo(origHue, 3);
    });

    it('preserves lightness for out-of-gamut', () => {
      const color = { L: 0.5, a: 0.3, b: 0.3 };
      const clipped = checker.clipPreserveChroma(color);
      expect(clipped.L).toBeCloseTo(color.L, 3);
    });

    it('reduces chroma for out-of-gamut', () => {
      const color = { L: 0.5, a: 0.3, b: 0.3 };
      const clipped = checker.clipPreserveChroma(color);
      const origC = Math.sqrt(color.a ** 2 + color.b ** 2);
      const clipC = Math.sqrt(clipped.a ** 2 + clipped.b ** 2);
      expect(clipC).toBeLessThanOrEqual(origC + 1e-6);
    });

    it('result is in gamut', () => {
      const color = { L: 0.5, a: 0.3, b: 0.3 };
      const clipped = checker.clipPreserveChroma(color);
      expect(checker.isInGamut(clipped)).toBe(true);
    });
  });

});
