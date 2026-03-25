import { describe, it, expect } from 'vitest';
import { createGamutChecker } from './gamut-clipping';
import { oklabToLinearRgb } from './color-conversion';

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

  describe('penaltyGradient', () => {
    it('returns zero gradient for in-gamut colors', () => {
      const grad = checker.penaltyGradient({ L: 0.5, a: 0, b: 0 });
      expect(grad[0]).toBeCloseTo(0);
      expect(grad[1]).toBeCloseTo(0);
      expect(grad[2]).toBeCloseTo(0);
    });

    it('returns non-zero gradient for out-of-gamut colors', () => {
      const grad = checker.penaltyGradient({ L: 0.5, a: 0.4, b: 0.4 });
      const magnitude = Math.sqrt(grad[0] ** 2 + grad[1] ** 2 + grad[2] ** 2);
      expect(magnitude).toBeGreaterThan(0);
    });

    it('matches finite-difference approximation', () => {
      const pos = { L: 0.5, a: 0.3, b: 0.2 };
      const grad = checker.penaltyGradient(pos);
      const eps = 1e-6;

      // Scalar penalty function
      const penalty = (p: { L: number; a: number; b: number }): number => {
        const rgb = oklabToLinearRgb(p);
        let pen = 0;
        for (const ch of [rgb.r, rgb.g, rgb.b]) {
          if (ch < 0) pen += ch * ch;
          if (ch > 1) pen += (ch - 1) * (ch - 1);
        }
        return pen;
      };

      const p0 = penalty(pos);
      const fdL = (penalty({ L: pos.L + eps, a: pos.a, b: pos.b }) - p0) / eps;
      const fda = (penalty({ L: pos.L, a: pos.a + eps, b: pos.b }) - p0) / eps;
      const fdb = (penalty({ L: pos.L, a: pos.a, b: pos.b + eps }) - p0) / eps;

      expect(grad[0]).toBeCloseTo(fdL, 3);
      expect(grad[1]).toBeCloseTo(fda, 3);
      expect(grad[2]).toBeCloseTo(fdb, 3);
    });
  });
});
