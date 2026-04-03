import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import { createPaletteStepper } from 'facette';

beforeEach(() => {
  useStore.setState({
    seeds: ['#ff0000', '#0000ff'],
    paletteSize: 4,
    vividness: 2,
    spread: 1.2,
    trace: null,
    isComputing: false,
  });
});

describe('palette engine integration', () => {
  it('creates trace from store seeds', () => {
    const { seeds, paletteSize } = useStore.getState();
    const stepper = createPaletteStepper(seeds, paletteSize);
    const trace = stepper.run();
    expect(trace.frames.length).toBeGreaterThan(0);
    expect(trace.finalColors.length).toBe(4);
  });

  it('trace can be stored and retrieved', () => {
    const { seeds, paletteSize } = useStore.getState();
    const stepper = createPaletteStepper(seeds, paletteSize);
    const trace = stepper.run();
    useStore.getState().setTrace(trace);
    expect(useStore.getState().trace).toBe(trace);
    expect(useStore.getState().trace!.finalColors.length).toBe(4);
  });

  it('trace has valid geometry', () => {
    const { seeds, paletteSize } = useStore.getState();
    const stepper = createPaletteStepper(seeds, paletteSize);
    const trace = stepper.run();
    expect(trace.geometry.kind).toBe('line'); // 2 seeds = 1D
  });

  it('trace frames have oklabPositions', () => {
    const { seeds, paletteSize } = useStore.getState();
    const stepper = createPaletteStepper(seeds, paletteSize);
    const trace = stepper.run();
    expect(trace.frames[0].oklabPositions.length).toBe(paletteSize);
  });

  it('trace includes liftConfig metadata', () => {
    const { seeds, paletteSize } = useStore.getState();
    const stepper = createPaletteStepper(seeds, paletteSize);
    const trace = stepper.run();
    expect(trace.liftConfig.gamma).toBeGreaterThanOrEqual(1);
    expect(trace.liftConfig.R).toBeGreaterThan(0);
    expect(trace.liftConfig.spread).toBe(1.2);
    expect(trace.liftConfig.Lc).toBeDefined();
    expect(trace.vividness).toBe(2);
  });
});
