import { describe, it, expect } from 'vitest';
import { createForceComputer } from './energy';
import { createSpaceLift } from './space-lift';
import { createGamutChecker } from './gamut-clipping';
import type { Particle, Vec3 } from './types';

describe('ForceComputer', () => {
  const lift = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 1 });
  const gamut = createGamutChecker();
  const fc = createForceComputer(lift, gamut);

  it('returns forces array matching particle count', () => {
    const particles: Particle[] = [
      { kind: 'free', position: { L: 0.3, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.7, a: -0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const { forces, energy } = fc.computeForcesAndEnergy(particles, 2, 0.1);
    expect(forces.length).toBe(2);
    expect(energy).toBeGreaterThan(0);
  });

  it('repulsive force pushes particles apart', () => {
    const particles: Particle[] = [
      { kind: 'free', position: { L: 0.4, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.6, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const { forces } = fc.computeForcesAndEnergy(particles, 2, 0);
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
    const closeE = fc.computeForcesAndEnergy(close, 2, 0).energy;
    const farE = fc.computeForcesAndEnergy(far, 2, 0).energy;
    expect(closeE).toBeGreaterThan(farE);
  });

  it('gamut penalty is zero for in-gamut particles', () => {
    const particles: Particle[] = [
      { kind: 'free', position: lift.toLifted({ L: 0.5, a: 0, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: lift.toLifted({ L: 0.7, a: 0.05, b: 0 }), faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const withGamut = fc.computeForcesAndEnergy(particles, 2, 1.0);
    const withoutGamut = fc.computeForcesAndEnergy(particles, 2, 0);
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
    const { forces } = fc.computeForcesAndEnergy(particles, 2, 0.1);
    expect(forces.length).toBe(2);
  });

  it('higher p exponent increases force on close pairs', () => {
    const particles: Particle[] = [
      { kind: 'free', position: { L: 0.45, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
      { kind: 'free', position: { L: 0.55, a: 0.1, b: 0 }, faceIndex: 0, bary: { w0: 1/3, w1: 1/3, w2: 1/3 } },
    ];
    const lowP = fc.computeForcesAndEnergy(particles, 2, 0);
    const highP = fc.computeForcesAndEnergy(particles, 6, 0);
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
    const withGamut = fc.computeForcesAndEnergy(particles, 2, 10.0);
    const withoutGamut = fc.computeForcesAndEnergy(particles, 2, 0);
    const diff = Math.sqrt(
      (withGamut.forces[0][0] - withoutGamut.forces[0][0])**2 +
      (withGamut.forces[0][1] - withoutGamut.forces[0][1])**2 +
      (withGamut.forces[0][2] - withoutGamut.forces[0][2])**2,
    );
    expect(diff).toBeGreaterThan(0.01);
  });
});
