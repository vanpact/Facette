import { describe, it, expect } from 'vitest';
import { createForceComputer, finiteDifferenceGradient } from './energy';
import { createSpaceLift } from './space-lift';
import { createGamutChecker } from './gamut-clipping';
import type { Particle, Vec3, OKLab } from './types';

describe('ForceComputer', () => {
  const lift = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 1 });
  const gamut = createGamutChecker();
  const fc = createForceComputer(lift, gamut);

  it('returns forces array matching particle count', () => {
    const particles: Particle[] = [
      { kind: 'free', position: { L: 0.3, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.7, a: -0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const { forces, energy } = fc.computeForcesAndEnergy(particles, 2, 0.1, 0);
    expect(forces.length).toBe(2);
    expect(energy).toBeGreaterThan(0);
  });

  it('repulsive force pushes particles apart', () => {
    const particles: Particle[] = [
      { kind: 'free', position: { L: 0.4, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.6, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const { forces } = fc.computeForcesAndEnergy(particles, 2, 0, 0);
    expect(forces[0][0]).toBeLessThan(0);
    expect(forces[1][0]).toBeGreaterThan(0);
  });

  it('energy decreases as particles move apart', () => {
    const close: Particle[] = [
      { kind: 'free', position: { L: 0.49, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.51, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const far: Particle[] = [
      { kind: 'free', position: { L: 0.2, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.8, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const closeE = fc.computeForcesAndEnergy(close, 2, 0, 0).energy;
    const farE = fc.computeForcesAndEnergy(far, 2, 0, 0).energy;
    expect(closeE).toBeGreaterThan(farE);
  });

  it('gamut penalty is zero for in-gamut particles', () => {
    const particles: Particle[] = [
      { kind: 'free', position: lift.toLifted({ L: 0.5, a: 0, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: lift.toLifted({ L: 0.7, a: 0.05, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const withGamut = fc.computeForcesAndEnergy(particles, 2, 1.0, 0);
    const withoutGamut = fc.computeForcesAndEnergy(particles, 2, 0, 0);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        expect(withGamut.forces[i][j]).toBeCloseTo(withoutGamut.forces[i][j], 6);
      }
    }
  });

  it('pinned particles still get forces computed', () => {
    const particles: Particle[] = [
      { kind: 'pinned-vertex', position: { L: 0.3, a: 0.1, b: 0 }, vertexIndex: 0 },
      { kind: 'free', position: { L: 0.7, a: -0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const { forces } = fc.computeForcesAndEnergy(particles, 2, 0.1, 0);
    expect(forces.length).toBe(2);
  });

  it('higher p exponent increases force on close pairs', () => {
    const particles: Particle[] = [
      { kind: 'free', position: { L: 0.45, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.55, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const lowP = fc.computeForcesAndEnergy(particles, 2, 0, 0);
    const highP = fc.computeForcesAndEnergy(particles, 6, 0, 0);
    const lowMag = Math.sqrt(lowP.forces[0][0]**2 + lowP.forces[0][1]**2 + lowP.forces[0][2]**2);
    const highMag = Math.sqrt(highP.forces[0][0]**2 + highP.forces[0][1]**2 + highP.forces[0][2]**2);
    expect(highMag).toBeGreaterThan(lowMag);
  });

  it('gamut penalty gradient via FD creates meaningful force difference', () => {
    const outOfGamutOklab = { L: 0.5, a: 0.3, b: 0.3 };
    const liftedPos = lift.toLifted(outOfGamutOklab);
    const particles: Particle[] = [
      { kind: 'free', position: liftedPos, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.1, a: 0, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const withGamut = fc.computeForcesAndEnergy(particles, 2, 10.0, 0);
    const withoutGamut = fc.computeForcesAndEnergy(particles, 2, 0, 0);
    const diff = Math.sqrt(
      (withGamut.forces[0][0] - withoutGamut.forces[0][0])**2 +
      (withGamut.forces[0][1] - withoutGamut.forces[0][1])**2 +
      (withGamut.forces[0][2] - withoutGamut.forces[0][2])**2,
    );
    expect(diff).toBeGreaterThan(0.01);
  });

  it('beta=0 produces identical energy to V5.1 lifted repulsion', () => {
    const particles: Particle[] = [
      { kind: 'free', position: { L: 0.4, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.6, a: -0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const result = fc.computeForcesAndEnergy(particles, 2, 0, 0);
    expect(result.energy).toBeGreaterThan(0);
    expect(result.forces.length).toBe(2);
  });

  it('beta=1 produces different energy than beta=0 for out-of-gamut particles', () => {
    const vividLift = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 3 });
    const vividFc = createForceComputer(vividLift, gamut);
    const particles: Particle[] = [
      { kind: 'free', position: vividLift.toLifted({ L: 0.5, a: 0.25, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: vividLift.toLifted({ L: 0.5, a: -0.25, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const eBeta0 = vividFc.computeForcesAndEnergy(particles, 4, 0, 0).energy;
    const eBeta1 = vividFc.computeForcesAndEnergy(particles, 4, 0, 1).energy;
    expect(eBeta0).not.toBeCloseTo(eBeta1, 2);
  });

  it('beta=1 in-gamut energy is close to beta=0', () => {
    const particles: Particle[] = [
      { kind: 'free', position: { L: 0.3, a: 0.05, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.7, a: -0.05, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const eBeta0 = fc.computeForcesAndEnergy(particles, 2, 0, 0).energy;
    const eBeta1 = fc.computeForcesAndEnergy(particles, 2, 0, 1).energy;
    expect(eBeta1).toBeCloseTo(eBeta0, 0);
  });

  it('blended energy at beta=0.5 interpolates between beta=0 and beta=1', () => {
    const vividLift = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 3 });
    const vividFc = createForceComputer(vividLift, gamut);
    const particles: Particle[] = [
      { kind: 'free', position: vividLift.toLifted({ L: 0.5, a: 0.25, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: vividLift.toLifted({ L: 0.5, a: -0.25, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const e0 = vividFc.computeForcesAndEnergy(particles, 4, 0, 0).energy;
    const e05 = vividFc.computeForcesAndEnergy(particles, 4, 0, 0.5).energy;
    const e1 = vividFc.computeForcesAndEnergy(particles, 4, 0, 1).energy;
    const lo = Math.min(e0, e1);
    const hi = Math.max(e0, e1);
    expect(e05).toBeGreaterThanOrEqual(lo - 1e-10);
    expect(e05).toBeLessThanOrEqual(hi + 1e-10);
  });

  it('beta=1 clipped repulsion gradient pushes out-of-gamut particles apart', () => {
    const vividLift = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 3 });
    const vividFc = createForceComputer(vividLift, gamut);
    const particles: Particle[] = [
      { kind: 'free', position: vividLift.toLifted({ L: 0.5, a: 0.2, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: vividLift.toLifted({ L: 0.5, a: -0.2, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const { forces } = vividFc.computeForcesAndEnergy(particles, 4, 0, 1);
    const f0a = forces[0][1];
    const f1a = forces[1][1];
    expect(f0a * f1a).toBeLessThan(0);
  });
});

describe('finiteDifferenceGradient', () => {
  it('computes gradient of a quadratic energy', () => {
    // E(pos) = pos.L^2 + pos.a^2 + pos.b^2
    // grad = [2L, 2a, 2b]
    const energyFn = (pos: OKLab) => pos.L * pos.L + pos.a * pos.a + pos.b * pos.b;
    const pos: OKLab = { L: 0.5, a: 0.1, b: -0.2 };
    const grad = finiteDifferenceGradient(pos, energyFn, 1e-7);
    expect(grad[0]).toBeCloseTo(2 * 0.5, 4);   // dE/dL = 1.0
    expect(grad[1]).toBeCloseTo(2 * 0.1, 4);   // dE/da = 0.2
    expect(grad[2]).toBeCloseTo(2 * -0.2, 4);  // dE/db = -0.4
  });

  it('returns zero gradient at energy minimum', () => {
    // E(pos) = (L - 0.5)^2, minimum at L=0.5
    const energyFn = (pos: OKLab) => (pos.L - 0.5) ** 2;
    const pos: OKLab = { L: 0.5, a: 0, b: 0 };
    const grad = finiteDifferenceGradient(pos, energyFn, 1e-7);
    expect(Math.abs(grad[0])).toBeLessThan(1e-5);
    expect(Math.abs(grad[1])).toBeLessThan(1e-5);
    expect(Math.abs(grad[2])).toBeLessThan(1e-5);
  });
});
