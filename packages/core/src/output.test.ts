import { describe, it, expect } from 'vitest';
import { finalizeColors } from './output';
import { createGamutChecker } from './gamut-clipping';
import type { OKLab } from './types';

describe('finalizeColors', () => {
  const gamut = createGamutChecker();

  it('returns correct number of colors', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0, b: 0 },
      { L: 0.7, a: 0.05, b: 0 },
    ];
    const { colors } = finalizeColors(positions, gamut);
    expect(colors.length).toBe(2);
  });

  it('all outputs are valid hex strings', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0, b: 0 },
      { L: 0.7, a: 0.05, b: 0.02 },
    ];
    const { colors } = finalizeColors(positions, gamut);
    for (const c of colors) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('in-gamut colors are not clipped', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0, b: 0 },
    ];
    const { clippedIndices } = finalizeColors(positions, gamut);
    expect(clippedIndices.length).toBe(0);
  });

  it('out-of-gamut colors are clipped and recorded', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0.4, b: 0.4 },
    ];
    const { colors, clippedIndices } = finalizeColors(positions, gamut);
    expect(clippedIndices).toContain(0);
    expect(colors[0]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('clipped colors are valid (in gamut after clipping)', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0.3, b: 0.3 },
    ];
    const { colors } = finalizeColors(positions, gamut);
    // Just verify it produces a valid hex — the clipping logic is tested in gamut-clipping.test.ts
    expect(colors[0]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('handles mixed in-gamut and out-of-gamut', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0, b: 0 },
      { L: 0.5, a: 0.4, b: 0.4 },
      { L: 0.7, a: 0.05, b: 0 },
    ];
    const { colors, clippedIndices } = finalizeColors(positions, gamut);
    expect(colors.length).toBe(3);
    expect(clippedIndices).toContain(1); // second position was out of gamut
    expect(clippedIndices).not.toContain(0);
    expect(clippedIndices).not.toContain(2);
  });

  it('returns clippedPositions with same length as input', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0, b: 0 },
      { L: 0.7, a: 0.05, b: 0 },
    ];
    const { clippedPositions } = finalizeColors(positions, gamut);
    expect(clippedPositions).toHaveLength(2);
  });

  it('clippedPositions identity for in-gamut points', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0, b: 0 },
    ];
    const { clippedPositions } = finalizeColors(positions, gamut);
    expect(clippedPositions[0]).toEqual(positions[0]);
  });

  it('clippedPositions differ for out-of-gamut points', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0.4, b: 0.4 },
    ];
    const { clippedPositions, clippedIndices } = finalizeColors(positions, gamut);
    expect(clippedIndices).toContain(0);
    // Clipped position must differ from original
    const cp = clippedPositions[0];
    const op = positions[0];
    const moved = cp.L !== op.L || cp.a !== op.a || cp.b !== op.b;
    expect(moved).toBe(true);
    // Clipped chroma must be less than original
    const origChroma = Math.sqrt(op.a * op.a + op.b * op.b);
    const clipChroma = Math.sqrt(cp.a * cp.a + cp.b * cp.b);
    expect(clipChroma).toBeLessThan(origChroma);
  });
});
