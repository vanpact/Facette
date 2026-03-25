import { describe, it, expect } from 'vitest';
import { createWarpTransform } from './warp';

describe('WarpTransform', () => {
  const warp = createWarpTransform(0.04);

  describe('toWarped', () => {
    it('f(0) = 0: gray maps to gray', () => {
      const w = warp.toWarped({ L: 0.5, a: 0, b: 0 });
      expect(w.a).toBeCloseTo(0);
      expect(w.b).toBeCloseTo(0);
    });

    it('preserves L', () => {
      const w = warp.toWarped({ L: 0.7, a: 0.1, b: 0.05 });
      expect(w.L).toBeCloseTo(0.7);
    });

    it('contracts low chroma', () => {
      const pos = { L: 0.5, a: 0.01, b: 0 };
      const w = warp.toWarped(pos);
      const warpedR = Math.sqrt(w.a ** 2 + w.b ** 2);
      expect(warpedR).toBeLessThan(0.01);
    });

    it('approaches identity for high chroma', () => {
      const pos = { L: 0.5, a: 0.3, b: 0 };
      const w = warp.toWarped(pos);
      // f(0.3) = 0.09/0.34 ≈ 0.265, so warped a ≈ 0.265
      expect(w.a).toBeCloseTo(0.3, 1);
    });

    it('preserves hue angle', () => {
      const pos = { L: 0.5, a: 0.1, b: 0.1 };
      const w = warp.toWarped(pos);
      expect(Math.atan2(w.b, w.a)).toBeCloseTo(Math.atan2(pos.b, pos.a), 10);
    });
  });

  describe('fromWarped (inverse)', () => {
    it('round-trips through toWarped → fromWarped', () => {
      const pos = { L: 0.6, a: 0.08, b: -0.03 };
      const back = warp.fromWarped(warp.toWarped(pos));
      expect(back.L).toBeCloseTo(pos.L, 8);
      expect(back.a).toBeCloseTo(pos.a, 8);
      expect(back.b).toBeCloseTo(pos.b, 8);
    });

    it('round-trips gray', () => {
      const pos = { L: 0.5, a: 0, b: 0 };
      const back = warp.fromWarped(warp.toWarped(pos));
      expect(back.L).toBeCloseTo(0.5, 8);
      expect(back.a).toBeCloseTo(0, 8);
      expect(back.b).toBeCloseTo(0, 8);
    });

    it('round-trips high chroma', () => {
      const pos = { L: 0.5, a: 0.25, b: -0.15 };
      const back = warp.fromWarped(warp.toWarped(pos));
      expect(back.a).toBeCloseTo(pos.a, 8);
      expect(back.b).toBeCloseTo(pos.b, 8);
    });
  });

  describe('pullBackGradient', () => {
    it('matches finite-difference for non-gray point', () => {
      const pos = { L: 0.6, a: 0.08, b: -0.03 };
      const eps = 1e-7;

      // Test all 3 gradient components by perturbing warped coords
      for (let col = 0; col < 3; col++) {
        const gradWarped: [number, number, number] = [0, 0, 0];
        gradWarped[col] = 1;

        const pulled = warp.pullBackGradient(pos, gradWarped);

        // Finite diff: perturb OKLab component i, measure change in warped component col
        for (let row = 0; row < 3; row++) {
          const posPlus = { ...pos };
          if (row === 0) posPlus.L += eps;
          else if (row === 1) posPlus.a += eps;
          else posPlus.b += eps;

          const w0 = warp.toWarped(pos);
          const w1 = warp.toWarped(posPlus);
          const w0v = [w0.L, w0.a, w0.b];
          const w1v = [w1.L, w1.a, w1.b];
          const dTdx = (w1v[col] - w0v[col]) / eps; // J_T[col][row]
          // pullback is J_T^T * grad, so pulled[row] = sum_col J_T[col][row] * gradWarped[col]
          // With gradWarped = e_col, pulled[row] = J_T[col][row]
          expect(pulled[row]).toBeCloseTo(dTdx, 4);
        }
      }
    });

    it('returns zero chromatic gradient at exact gray', () => {
      const gray = { L: 0.5, a: 0, b: 0 };
      const grad = warp.pullBackGradient(gray, [0, 1, 0]);
      expect(grad[1]).toBeCloseTo(0);
      expect(grad[2]).toBeCloseTo(0);
    });

    it('L gradient passes through unchanged', () => {
      const pos = { L: 0.5, a: 0.1, b: 0.1 };
      const grad = warp.pullBackGradient(pos, [1, 0, 0]);
      expect(grad[0]).toBeCloseTo(1, 6);
    });
  });

  it('exposes rs', () => {
    expect(warp.rs).toBe(0.04);
  });
});
