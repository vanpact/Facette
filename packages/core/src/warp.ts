import type { OKLab, Vec3, WarpTransform } from './types';
import { mat3MulVec3, mat3Transpose } from './math';
import type { Mat3 } from './math';

/**
 * Creates a WarpTransform that maps chroma via f(r) = r² / (r + r_s).
 *
 * The transform T(L, a, b) = (L, a', b') contracts low-chroma colors toward
 * gray, implementing the gray-avoidance mechanism described in Section 4.2–4.3.
 */
export function createWarpTransform(rs: number): WarpTransform {
  /** Forward warp: scale chroma by f(r)/r = r/(r + r_s). */
  function toWarped(pos: OKLab): OKLab {
    const { L, a, b } = pos;
    const r = Math.sqrt(a * a + b * b);
    if (r < 1e-15) return { L, a: 0, b: 0 };
    const scale = r / (r + rs);
    return { L, a: a * scale, b: b * scale };
  }

  /**
   * Inverse warp: given warped chroma r', solve r²/(r + r_s) = r' to recover r.
   * Quadratic: r² - r'·r - r'·r_s = 0  →  r = (r' + sqrt(r'² + 4·r'·r_s)) / 2
   */
  function fromWarped(pos: OKLab): OKLab {
    const { L, a, b } = pos;
    const rp = Math.sqrt(a * a + b * b);
    if (rp < 1e-15) return { L, a: 0, b: 0 };
    const r = (rp + Math.sqrt(rp * rp + 4 * rp * rs)) / 2;
    // Original scale was r/(r+rs), so inverse scale is (r+rs)/r
    const invScale = (r + rs) / r;
    return { L, a: a * invScale, b: b * invScale };
  }

  /**
   * Computes J_T at pos, then returns J_T^T · gradWarped.
   *
   * J_T is the 3×3 Jacobian of toWarped w.r.t. (L, a, b):
   *   Row 0 (L component): [1, 0, 0]
   *   Rows 1–2 (chromatic block):
   *     ∂a'/∂a = r/(r+rs) + a²·rs / (r·(r+rs)²)
   *     ∂a'/∂b = a·b·rs / (r·(r+rs)²)
   *     ∂b'/∂a = a·b·rs / (r·(r+rs)²)
   *     ∂b'/∂b = r/(r+rs) + b²·rs / (r·(r+rs)²)
   *   At r < 1e-15: chromatic block is all zeros.
   */
  function pullBackGradient(pos: OKLab, gradWarped: Vec3): Vec3 {
    const { a, b } = pos;
    const r = Math.sqrt(a * a + b * b);

    let J: Mat3;

    if (r < 1e-15) {
      // Jacobian has zero chromatic block; only L row is non-trivial
      J = [
        [1, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
    } else {
      const rPlusRs = r + rs;
      const baseScale = r / rPlusRs;                         // r/(r+rs)
      const sharedFactor = rs / (r * rPlusRs * rPlusRs);    // rs / (r·(r+rs)²)

      const dApDa = baseScale + a * a * sharedFactor;
      const dApDb = a * b * sharedFactor;
      const dBpDa = a * b * sharedFactor;  // same as dApDb by symmetry
      const dBpDb = baseScale + b * b * sharedFactor;

      // J_T rows: J[row] = [∂(output_row)/∂L, ∂(output_row)/∂a, ∂(output_row)/∂b]
      J = [
        [1,      0,      0     ],  // ∂L'/∂(L,a,b)
        [0,      dApDa, dApDb ],   // ∂a'/∂(L,a,b)
        [0,      dBpDa, dBpDb ],   // ∂b'/∂(L,a,b)
      ];
    }

    // pullback = J_T^T · gradWarped
    const Jt = mat3Transpose(J);
    return mat3MulVec3(Jt, gradWarped);
  }

  return { toWarped, fromWarped, pullBackGradient, rs };
}
