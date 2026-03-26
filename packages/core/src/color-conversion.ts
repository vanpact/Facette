import type { OKLab, OKLCh, LinRGB } from './types';
import { mat3MulVec3, type Mat3 } from './math';

// ── Ottosson OKLab matrices ──────────────────────────────────────────────────

// M1: linear sRGB → LMS
const M1: Mat3 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];

// M2: LMS^(1/3) → OKLab
const M2: Mat3 = [
  [ 0.2104542553,  0.7936177850, -0.0040720468],
  [ 1.9779984951, -2.4285922050,  0.4505937099],
  [ 0.0259040371,  0.7827717662, -0.8086757660],
];

// M1 inverse: LMS → linear sRGB
// Computed analytically (Ottosson's published values)
const M1_INV: Mat3 = [
  [ 4.0767416621, -3.3077115913,  0.2309699292],
  [-1.2684380046,  2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147,  1.7076147010],
];

// M2 inverse: OKLab → LMS^(1/3)
// Computed analytically (Ottosson's published values)
const M2_INV: Mat3 = [
  [1.0000000000,  0.3963377774,  0.2158037573],
  [1.0000000000, -0.1055613458, -0.0638541728],
  [1.0000000000, -0.0894841775, -1.2914855480],
];

// ── sRGB gamma conversions ───────────────────────────────────────────────────

/** sRGB gamma-encoded value → linear light value. */
export function srgbToLinear(c: number): number {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear light value → sRGB gamma-encoded value. */
export function linearToSrgb(c: number): number {
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ── Core color space conversions ─────────────────────────────────────────────

/** Linear sRGB → OKLab via LMS intermediate. */
export function linearRgbToOklab(rgb: LinRGB): OKLab {
  const rgbVec = [rgb.r, rgb.g, rgb.b] as [number, number, number];

  // Step 1: linear RGB → LMS
  const lms = mat3MulVec3(M1, rgbVec);

  // Step 2: LMS → LMS^(1/3) (cube root, sign-preserving)
  const lmsCbrt: [number, number, number] = [
    Math.cbrt(lms[0]),
    Math.cbrt(lms[1]),
    Math.cbrt(lms[2]),
  ];

  // Step 3: LMS^(1/3) → OKLab
  const lab = mat3MulVec3(M2, lmsCbrt);
  return { L: lab[0], a: lab[1], b: lab[2] };
}

/** OKLab → linear sRGB via LMS intermediate. */
export function oklabToLinearRgb(lab: OKLab): LinRGB {
  const labVec = [lab.L, lab.a, lab.b] as [number, number, number];

  // Step 1: OKLab → LMS^(1/3)
  const lmsCbrt = mat3MulVec3(M2_INV, labVec);

  // Step 2: LMS^(1/3) → LMS (cube)
  const lms: [number, number, number] = [
    lmsCbrt[0] * lmsCbrt[0] * lmsCbrt[0],
    lmsCbrt[1] * lmsCbrt[1] * lmsCbrt[1],
    lmsCbrt[2] * lmsCbrt[2] * lmsCbrt[2],
  ];

  // Step 3: LMS → linear sRGB
  const rgb = mat3MulVec3(M1_INV, lms);
  return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

// ── Hex string ↔ OKLab ───────────────────────────────────────────────────────

/** Parse #rrggbb hex string → sRGB → linear → OKLab. */
export function hexToOklab(hex: string): OKLab {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return linearRgbToOklab({
    r: srgbToLinear(r),
    g: srgbToLinear(g),
    b: srgbToLinear(b),
  });
}

/** OKLab → linear → sRGB → #rrggbb, clamping each channel to [0, 255]. */
export function oklabToHex(lab: OKLab): string {
  const lin = oklabToLinearRgb(lab);
  const toU8 = (c: number): number =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(c) * 255)));
  const r = toU8(lin.r);
  const g = toU8(lin.g);
  const b = toU8(lin.b);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── OKLab ↔ OKLCh ────────────────────────────────────────────────────────────

/** OKLab → OKLCh: C = sqrt(a²+b²), h = atan2(b, a) in radians. */
export function oklabToOklch(lab: OKLab): OKLCh {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  const h = Math.atan2(lab.b, lab.a);  // atan2(0, 0) = 0, which is finite
  return { L: lab.L, C, h };
}

/** OKLCh → OKLab: a = C*cos(h), b = C*sin(h). */
export function oklchToOklab(lch: OKLCh): OKLab {
  return {
    L: lch.L,
    a: lch.C * Math.cos(lch.h),
    b: lch.C * Math.sin(lch.h),
  };
}

