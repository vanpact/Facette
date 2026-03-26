import { describe, it, expect } from 'vitest';
import {
  srgbToLinear,
  linearToSrgb,
  linearRgbToOklab,
  oklabToLinearRgb,
  hexToOklab,
  oklabToHex,
  oklabToOklch,
  oklchToOklab,
} from './color-conversion';
import type { OKLab, OKLCh, LinRGB } from './types';

// ── 1. sRGB gamma round-trip ─────────────────────────────────────────────────
describe('srgbToLinear / linearToSrgb round-trip', () => {
  const cases = [0, 0.04045, 0.5, 1.0];

  for (const v of cases) {
    it(`round-trips ${v}`, () => {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
      expect(srgbToLinear(linearToSrgb(v))).toBeCloseTo(v, 6);
    });
  }

  it('maps 0 → 0', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(linearToSrgb(0)).toBe(0);
  });

  it('maps 1 → 1', () => {
    expect(srgbToLinear(1)).toBeCloseTo(1, 10);
    expect(linearToSrgb(1)).toBeCloseTo(1, 10);
  });

  it('uses threshold at 0.04045 (below → linear divide)', () => {
    // 0.04045 is the boundary; just below should use linear branch
    const justBelow = 0.04044;
    const linear = srgbToLinear(justBelow);
    expect(linear).toBeCloseTo(justBelow / 12.92, 10);
  });
});

// ── 2. White #ffffff → OKLab ─────────────────────────────────────────────────
describe('hexToOklab – white', () => {
  it('#ffffff maps to L≈1, a≈0, b≈0', () => {
    const lab = hexToOklab('#ffffff');
    expect(lab.L).toBeCloseTo(1, 4);
    expect(lab.a).toBeCloseTo(0, 4);
    expect(lab.b).toBeCloseTo(0, 4);
  });
});

// ── 3. Black #000000 → OKLab ─────────────────────────────────────────────────
describe('hexToOklab – black', () => {
  it('#000000 maps to L≈0, a≈0, b≈0', () => {
    const lab = hexToOklab('#000000');
    expect(lab.L).toBeCloseTo(0, 4);
    expect(lab.a).toBeCloseTo(0, 4);
    expect(lab.b).toBeCloseTo(0, 4);
  });
});

// ── 4. Red #ff0000 → OKLab ──────────────────────────────────────────────────
describe('hexToOklab – red', () => {
  it('#ff0000 maps to L≈0.6279, a≈0.2248, b≈0.1258', () => {
    const lab = hexToOklab('#ff0000');
    expect(lab.L).toBeCloseTo(0.6279, 3);
    expect(lab.a).toBeCloseTo(0.2248, 3);
    expect(lab.b).toBeCloseTo(0.1258, 3);
  });
});

// ── 5. Hex → OKLab → Hex round-trips ─────────────────────────────────────────
describe('hexToOklab / oklabToHex round-trip', () => {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#808080', '#ffaa33'];

  for (const hex of colors) {
    it(`round-trips ${hex}`, () => {
      expect(oklabToHex(hexToOklab(hex))).toBe(hex);
    });
  }
});

// ── 6. OKLab → OKLCh: known values ──────────────────────────────────────────
describe('oklabToOklch – known values', () => {
  it('{L:0.5, a:0.1, b:0} → {L:0.5, C:0.1, h:0}', () => {
    const lch = oklabToOklch({ L: 0.5, a: 0.1, b: 0 });
    expect(lch.L).toBeCloseTo(0.5, 10);
    expect(lch.C).toBeCloseTo(0.1, 10);
    expect(lch.h).toBeCloseTo(0, 10);
  });

  it('{L:0.5, a:0, b:0.1} → h ≈ π/2', () => {
    const lch = oklabToOklch({ L: 0.5, a: 0, b: 0.1 });
    expect(lch.h).toBeCloseTo(Math.PI / 2, 10);
  });

  it('{L:0.5, a:-0.1, b:0} → h ≈ π', () => {
    const lch = oklabToOklch({ L: 0.5, a: -0.1, b: 0 });
    expect(lch.h).toBeCloseTo(Math.PI, 10);
  });
});

// ── 7. OKLab ↔ OKLCh round-trip ─────────────────────────────────────────────
describe('oklabToOklch / oklchToOklab round-trip', () => {
  const labs: OKLab[] = [
    { L: 0.5, a: 0.1, b: 0.05 },
    { L: 0.8, a: -0.05, b: 0.15 },
    { L: 0.3, a: 0.0, b: -0.1 },
    { L: 1.0, a: 0.0, b: 0.0 },
  ];

  for (const lab of labs) {
    it(`round-trips OKLab(${lab.L}, ${lab.a}, ${lab.b})`, () => {
      const recovered = oklchToOklab(oklabToOklch(lab));
      expect(recovered.L).toBeCloseTo(lab.L, 10);
      expect(recovered.a).toBeCloseTo(lab.a, 10);
      expect(recovered.b).toBeCloseTo(lab.b, 10);
    });
  }
});

// ── 8. Zero chroma (gray) OKLab→OKLCh: C≈0, h is finite ────────────────────
describe('oklabToOklch – zero chroma (gray)', () => {
  it('C ≈ 0 and h is finite (no NaN) for a pure gray', () => {
    const lch = oklabToOklch({ L: 0.5, a: 0, b: 0 });
    expect(lch.C).toBeCloseTo(0, 10);
    expect(Number.isFinite(lch.h)).toBe(true);
  });
});

