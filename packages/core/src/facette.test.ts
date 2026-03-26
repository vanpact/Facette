import { describe, it, expect } from 'vitest';
import { generatePalette, createPaletteStepper } from './facette';

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

  it('rejects vividness above max', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0.5 })).toThrow('Vividness');
  });

  it('rejects vividness below min', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0.003 })).toThrow('Vividness');
  });

  it('accepts vividness at boundaries', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0.005 })).not.toThrow();
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0.10 })).not.toThrow();
  });

  it('accepts vividness=0 as auto', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0 })).not.toThrow();
  });

  it('rejects gamma below 1', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { gamma: 0.5 })).toThrow('Gamma');
  });

  it('accepts gamma >= 1', () => {
    const result = generatePalette(['#ff0000', '#00ff00'], 4, { gamma: 1.5 });
    expect(result.colors).toHaveLength(4);
  });

  it('gamma=1 produces valid output (V4.4 equivalence)', () => {
    const result = generatePalette(['#e63946', '#457b9d', '#1d3557'], 6, { gamma: 1 });
    expect(result.colors).toHaveLength(6);
    expect(result.metadata.minDeltaE).toBeGreaterThan(0);
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

  it('run() returns complete trace', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const trace = stepper.run();
    expect(trace.frames.length).toBeGreaterThan(0);
    expect(trace.finalColors).toHaveLength(4);
    expect(trace.rs).toBeGreaterThan(0);
  });

  it('frames() returns the same cached generator on repeated calls', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const gen1 = stepper.frames();
    const gen2 = stepper.frames();
    expect(gen1).toBe(gen2);
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
