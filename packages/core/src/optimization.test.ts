import { describe, it, expect } from 'vitest';
import { createOptimizationStepper, createAnnealingSchedule, pairwiseMinDeltaE } from './optimization';
import { createForceComputer } from './energy';
import { createRadialLift } from './radial-lift';
import { createGamutChecker } from './gamut-clipping';
import { createLineConstraint } from './line-segment';
import type { Particle, OKLab } from './types';

describe('pairwiseMinDeltaE', () => {
  it('computes minimum distance between positions', () => {
    const positions: OKLab[] = [
      { L: 0.2, a: 0, b: 0 },
      { L: 0.5, a: 0, b: 0 },
      { L: 0.9, a: 0, b: 0 },
    ];
    const minDE = pairwiseMinDeltaE(positions);
    expect(minDE).toBeCloseTo(0.3, 4); // 0.2-0.5 = 0.3
  });
});

describe('createAnnealingSchedule', () => {
  const schedule = createAnnealingSchedule();

  it('step size decreases over iterations', () => {
    const s0 = schedule.getStepSize(0);
    const s100 = schedule.getStepSize(100);
    expect(s0).toBeGreaterThan(s100);
  });

  it('Riesz exponent starts at 2', () => {
    expect(schedule.getRieszExponent(0)).toBeCloseTo(2, 2);
  });

  it('Riesz exponent ends at 6', () => {
    expect(schedule.getRieszExponent(1999)).toBeCloseTo(6, 2);
  });

  it('gamut penalty weight is positive', () => {
    expect(schedule.getGamutPenaltyWeight(0)).toBeGreaterThan(0);
  });
});

describe('createOptimizationStepper', () => {
  it('yields frames with correct structure', () => {
    const lift = createRadialLift(0.04, 0.15, 1);
    const gamut = createGamutChecker();
    const forces = createForceComputer(lift, gamut);
    const line = { kind: 'line' as const, start: { L: 0.2, a: 0.1, b: 0 }, end: { L: 0.8, a: -0.1, b: 0 } };
    const constraint = createLineConstraint(line.start, line.end);
    const schedule = createAnnealingSchedule({ maxIterations: 50 });

    const particles: Particle[] = [
      { kind: 'pinned-endpoint', position: line.start, t: 0 },
      { kind: 'free-1d', position: { L: 0.5, a: 0, b: 0 }, t: 0.5 },
      { kind: 'pinned-endpoint', position: line.end, t: 1 },
    ];

    const gen = createOptimizationStepper(particles, forces, constraint, lift.fromLifted, schedule);
    const first = gen.next();
    expect(first.done).toBe(false);
    expect(first.value.iteration).toBe(0);
    expect(first.value.particles.length).toBe(3);
    expect(first.value.oklabPositions.length).toBe(3);
    expect(first.value.energy).toBeGreaterThan(0);
    expect(first.value.minDeltaE).toBeGreaterThan(0);
  });

  it('pinned particles do not move', () => {
    const lift = createRadialLift(0.04, 0.15, 1);
    const gamut = createGamutChecker();
    const forces = createForceComputer(lift, gamut);
    const line = { kind: 'line' as const, start: { L: 0.2, a: 0.1, b: 0 }, end: { L: 0.8, a: -0.1, b: 0 } };
    const constraint = createLineConstraint(line.start, line.end);
    const schedule = createAnnealingSchedule({ maxIterations: 10 });

    const particles: Particle[] = [
      { kind: 'pinned-endpoint', position: { ...line.start }, t: 0 },
      { kind: 'free-1d', position: { L: 0.5, a: 0, b: 0 }, t: 0.5 },
      { kind: 'pinned-endpoint', position: { ...line.end }, t: 1 },
    ];

    const gen = createOptimizationStepper(particles, forces, constraint, lift.fromLifted, schedule);
    let lastFrame;
    for (const frame of gen) {
      lastFrame = frame;
    }
    // Pinned endpoints should not have moved
    expect(lastFrame!.particles[0].position.L).toBeCloseTo(line.start.L, 6);
    expect(lastFrame!.particles[2].position.L).toBeCloseTo(line.end.L, 6);
  });

  it('final energy is lower than initial energy', () => {
    const lift = createRadialLift(0.04, 0.15, 1);
    const gamut = createGamutChecker();
    const forces = createForceComputer(lift, gamut);
    const line = { kind: 'line' as const, start: { L: 0.2, a: 0.1, b: 0 }, end: { L: 0.8, a: -0.1, b: 0 } };
    const constraint = createLineConstraint(line.start, line.end);
    const schedule = createAnnealingSchedule({ maxIterations: 200 });

    const particles: Particle[] = [
      { kind: 'pinned-endpoint', position: line.start, t: 0 },
      { kind: 'free-1d', position: { L: 0.3, a: 0.06, b: 0 }, t: 0.17 },
      { kind: 'free-1d', position: { L: 0.35, a: 0.05, b: 0 }, t: 0.25 },
      { kind: 'pinned-endpoint', position: line.end, t: 1 },
    ];

    const gen = createOptimizationStepper(particles, forces, constraint, lift.fromLifted, schedule);
    let firstEnergy: number | null = null;
    let lastEnergy = 0;
    for (const frame of gen) {
      if (firstEnergy === null) firstEnergy = frame.energy;
      lastEnergy = frame.energy;
    }
    expect(lastEnergy).toBeLessThan(firstEnergy!);
  });
});
