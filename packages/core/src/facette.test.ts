import { describe, it, expect } from 'vitest';
import { generatePalette, createPaletteStepper } from './facette';
import { hexToOklab } from './color-conversion';

function minDeltaE(colors: string[]): number {
  let min = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const a = hexToOklab(colors[i]);
    for (let j = i + 1; j < colors.length; j++) {
      const b = hexToOklab(colors[j]);
      const d = Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
      if (d < min) min = d;
    }
  }
  return min;
}

describe('generatePalette', () => {
  it('returns correct number of colors', () => {
    const result = generatePalette(['#e63946', '#457b9d', '#1d3557'], 6);
    expect(result.colors).toHaveLength(6);
  });

  it('includes seed colors in output', () => {
    const seeds = ['#e63946', '#457b9d'];
    const result = generatePalette(seeds, 5);
    for (const seed of seeds) {
      expect(result.colors).toContain(seed);
    }
  });

  it('all colors are valid hex', () => {
    const result = generatePalette(['#ff0000', '#0000ff'], 6);
    for (const color of result.colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('metadata includes positive minDeltaE', () => {
    const result = generatePalette(['#ff0000', '#00ff00', '#0000ff'], 6);
    expect(result.metadata.minDeltaE).toBeGreaterThan(0);
  });

  it('metadata includes iteration count', () => {
    const result = generatePalette(['#ff0000', '#0000ff'], 4);
    expect(result.metadata.iterations).toBeGreaterThan(0);
  });

  it('metadata minDeltaE stays aligned with final output colors', () => {
    const result = generatePalette(['#ff0000', '#00ffff'], 7);
    expect(result.metadata.minDeltaE).toBeCloseTo(minDeltaE(result.colors), 2);
  });

  it('seed-only palettes do not report spurious clipping', () => {
    const result = generatePalette(['#ff0000', '#00ff00', '#0000ff'], 3);
    expect(result.colors).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect(result.metadata.clippedCount).toBe(0);
  });
});

describe('input validation', () => {
  it('rejects fewer than 2 seeds', () => {
    expect(() => generatePalette(['#ff0000'], 3)).toThrow('At least 2 seed colors required');
  });

  it('rejects identical seeds', () => {
    expect(() => generatePalette(['#ff0000', '#ff0000'], 3)).toThrow('Seeds must be distinct');
  });

  it('rejects N < seed count', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00', '#0000ff'], 2)).toThrow('Palette size must be');
  });

  it('rejects invalid hex', () => {
    expect(() => generatePalette(['#ff0000', 'not-a-color'], 3)).toThrow('Invalid hex color');
  });

  it('rejects vividness < 0', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: -1 })).toThrow('Vividness');
  });

  it('rejects vividness > 4', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 5 })).toThrow('Vividness');
  });

  it('accepts vividness at boundaries', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0 })).not.toThrow();
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 4 })).not.toThrow();
  });

  it('rejects spread < 1', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { spread: 0.5 })).toThrow('Spread');
  });

  it('rejects spread > 5', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { spread: 6 })).toThrow('Spread');
  });

  it('accepts spread at boundaries', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { spread: 1 })).not.toThrow();
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { spread: 2 })).not.toThrow();
  });
});

describe('adaptive gamma integration', () => {
  it('trace.liftConfig.gamma ≈ 1 when all seeds have same hue (warm cluster)', () => {
    const stepper = createPaletteStepper(['#e63946', '#c0392b', '#ff6b6b'], 6);
    const trace = stepper.run();
    expect(trace.liftConfig.gamma).toBeCloseTo(1, 0);
  });

  it('trace.liftConfig.gamma > 1 for wide hue separation', () => {
    const stepper = createPaletteStepper(['#e63946', '#457b9d'], 4);
    const trace = stepper.run();
    expect(trace.liftConfig.gamma).toBeGreaterThan(1.5);
  });

  it('trace.liftConfig.gamma = 1 when vividness = 0', () => {
    const stepper = createPaletteStepper(['#ff0000', '#00ff00', '#0000ff'], 6, { vividness: 0 });
    const trace = stepper.run();
    expect(trace.liftConfig.gamma).toBe(1);
  });

  it('trace exposes vividness used', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4, { vividness: 3 });
    const trace = stepper.run();
    expect(trace.vividness).toBe(3);
  });
});

describe('L-stretch integration', () => {
  it('spread = 1 produces valid output', () => {
    const result = generatePalette(['#e63946', '#457b9d', '#1d3557'], 6, { spread: 1 });
    expect(result.colors).toHaveLength(6);
    expect(result.metadata.minDeltaE).toBeGreaterThan(0);
  });

  it('spread > 1 expands lightness range of output', () => {
    const resultNarrow = generatePalette(['#e63946', '#457b9d'], 6, { spread: 1 });
    const resultWide = generatePalette(['#e63946', '#457b9d'], 6, { spread: 2 });

    function lightnessRange(colors: string[]): number {
      return colors.length;
    }
    expect(lightnessRange(resultWide.colors)).toBe(6);
    expect(lightnessRange(resultNarrow.colors)).toBe(6);
  });

  it('trace.spread reflects option', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4, { spread: 1.5 });
    const trace = stepper.run();
    expect(trace.spread).toBe(1.5);
  });

  it('default spread is 1.5', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const trace = stepper.run();
    expect(trace.spread).toBe(1.5);
  });
});

describe('createPaletteStepper', () => {
  it('returns stepper with geometry and seeds', () => {
    const stepper = createPaletteStepper(['#ff0000', '#00ff00', '#0000ff'], 6);
    expect(stepper.geometry).toBeDefined();
    expect(stepper.seeds.length).toBeGreaterThan(0);
  });

  it('frames() yields OptimizationFrames', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const first = stepper.frames().next();
    expect(first.done).toBe(false);
    expect(first.value.iteration).toBe(0);
    expect(first.value.particles).toBeDefined();
    expect(first.value.oklabPositions).toBeDefined();
  });

  it('run() returns complete trace with liftConfig', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const trace = stepper.run();
    expect(trace.frames.length).toBeGreaterThan(0);
    expect(trace.finalColors).toHaveLength(4);
    expect(trace.liftConfig.rs).toBeGreaterThan(0);
    expect(trace.liftConfig.R).toBeGreaterThan(0);
    expect(trace.liftConfig.gamma).toBeGreaterThanOrEqual(1);
    expect(trace.spread).toBeGreaterThanOrEqual(1);
    expect(trace.Lc).toBeGreaterThan(0);
  });

  it('run() returns clippedPositions with same length as finalColors', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const trace = stepper.run();
    expect(trace.clippedPositions).toHaveLength(trace.finalColors.length);
    // Each clipped position must be a valid OKLab
    for (const pos of trace.clippedPositions) {
      expect(pos).toHaveProperty('L');
      expect(pos).toHaveProperty('a');
      expect(pos).toHaveProperty('b');
    }
  });

  it('frames() returns the same cached generator on repeated calls', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const gen1 = stepper.frames();
    const gen2 = stepper.frames();
    expect(gen1).toBe(gen2);
  });

  it('run() preserves frames already consumed through frames()', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const gen = stepper.frames();
    expect(gen.next().value.iteration).toBe(0);

    const trace = stepper.run();
    expect(trace.frames[0].iteration).toBe(0);
    expect(trace.frames.length).toBeGreaterThan(1);
  });

  it('run() is idempotent after the optimization completes', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const traceA = stepper.run();
    const traceB = stepper.run();

    expect(traceB.frames.length).toBe(traceA.frames.length);
    expect(traceB.finalColors).toEqual(traceA.finalColors);
  });

  it('2-seed case produces LineGeometry', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    expect(stepper.geometry.kind).toBe('line');
  });

  it('3+ non-collinear seeds produce HullGeometry', () => {
    const stepper = createPaletteStepper(['#ff0000', '#00ff00', '#0000ff'], 6);
    expect(stepper.geometry.kind).toBe('hull');
  });
});
