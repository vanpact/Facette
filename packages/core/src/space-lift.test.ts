import { describe, it, expect } from 'vitest';
import { createSpaceLift } from './space-lift';

describe('SpaceLift', () => {
  const liftV50 = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 1, spread: 1, Lc: 0.5 });

  describe('radial lift (inherited from V5.0)', () => {
    it('rho(0) = 0: gray maps to gray', () => {
      const l = liftV50.toLifted({ L: 0.5, a: 0, b: 0 });
      expect(l.a).toBeCloseTo(0);
      expect(l.b).toBeCloseTo(0);
    });

    it('rho(R) = R: reference chroma is a fixed point', () => {
      const l = liftV50.toLifted({ L: 0.5, a: 0.15, b: 0 });
      expect(l.a).toBeCloseTo(0.15, 6);
      expect(l.b).toBeCloseTo(0, 10);
    });

    it('preserves hue angle', () => {
      const pos = { L: 0.5, a: 0.1, b: 0.1 };
      const l = liftV50.toLifted(pos);
      expect(Math.atan2(l.b, l.a)).toBeCloseTo(Math.atan2(pos.b, pos.a), 10);
    });

    it('contracts low chroma', () => {
      const pos = { L: 0.5, a: 0.01, b: 0 };
      const l = liftV50.toLifted(pos);
      expect(Math.sqrt(l.a ** 2 + l.b ** 2)).toBeLessThan(0.01);
    });

    it('rho is monotonically increasing', () => {
      const r1 = 0.02, r2 = 0.05, r3 = 0.12;
      const l1 = liftV50.toLifted({ L: 0.5, a: r1, b: 0 });
      const l2 = liftV50.toLifted({ L: 0.5, a: r2, b: 0 });
      const l3 = liftV50.toLifted({ L: 0.5, a: r3, b: 0 });
      expect(l1.a).toBeLessThan(l2.a);
      expect(l2.a).toBeLessThan(l3.a);
    });

    it('round-trips through toLifted → fromLifted', () => {
      const pos = { L: 0.6, a: 0.08, b: -0.03 };
      const back = liftV50.fromLifted(liftV50.toLifted(pos));
      expect(back.L).toBeCloseTo(pos.L, 8);
      expect(back.a).toBeCloseTo(pos.a, 8);
      expect(back.b).toBeCloseTo(pos.b, 8);
    });

    it('round-trips gray', () => {
      const pos = { L: 0.5, a: 0, b: 0 };
      const back = liftV50.fromLifted(liftV50.toLifted(pos));
      expect(back.L).toBeCloseTo(0.5, 8);
      expect(back.a).toBeCloseTo(0, 8);
      expect(back.b).toBeCloseTo(0, 8);
    });
  });

  describe('gamma > 1', () => {
    const liftG2 = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 2, spread: 1, Lc: 0.5 });

    it('rho(R) = R still holds at gamma=2', () => {
      const l = liftG2.toLifted({ L: 0.5, a: 0.15, b: 0 });
      expect(l.a).toBeCloseTo(0.15, 6);
    });

    it('stronger contraction at low chroma with gamma=2', () => {
      const pos = { L: 0.5, a: 0.05, b: 0 };
      const l1 = liftV50.toLifted(pos);
      const l2 = liftG2.toLifted(pos);
      expect(Math.abs(l2.a)).toBeLessThan(Math.abs(l1.a));
    });

    it('round-trips at gamma=2', () => {
      const pos = { L: 0.6, a: 0.08, b: -0.03 };
      const back = liftG2.fromLifted(liftG2.toLifted(pos));
      expect(back.L).toBeCloseTo(pos.L, 8);
      expect(back.a).toBeCloseTo(pos.a, 8);
      expect(back.b).toBeCloseTo(pos.b, 8);
    });
  });

  describe('L-stretch', () => {
    const liftStretch = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 1, spread: 1.5, Lc: 0.5 });

    it('toLifted applies L-stretch: L moves away from Lc', () => {
      const l = liftStretch.toLifted({ L: 0.7, a: 0.1, b: 0 });
      expect(l.L).toBeCloseTo(0.5 + 1.5 * (0.7 - 0.5), 10);
      expect(l.L).toBeGreaterThan(0.7);
    });

    it('toLifted pushes dark seeds darker', () => {
      const l = liftStretch.toLifted({ L: 0.3, a: 0.1, b: 0 });
      expect(l.L).toBeCloseTo(0.5 + 1.5 * (0.3 - 0.5), 10);
      expect(l.L).toBeLessThan(0.3);
    });

    it('fromLifted does NOT invert L-stretch (one-directional)', () => {
      const pos = { L: 0.7, a: 0.08, b: -0.03 };
      const lifted = liftStretch.toLifted(pos);
      const back = liftStretch.fromLifted(lifted);
      // L stays at stretched value (not inverted back to 0.7)
      expect(back.L).toBeCloseTo(lifted.L, 8);
      // (a, b) are radially inverted
      expect(back.a).toBeCloseTo(pos.a, 8);
      expect(back.b).toBeCloseTo(pos.b, 8);
    });

    it('Lc is fixed point of L-stretch', () => {
      const l = liftStretch.toLifted({ L: 0.5, a: 0.1, b: 0 });
      expect(l.L).toBeCloseTo(0.5, 10);
    });

    it('spread=1 produces same result as V5.0 RadialLift', () => {
      const pos = { L: 0.6, a: 0.08, b: -0.03 };
      const v50 = liftV50.toLifted(pos);
      const noStretch = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 1, spread: 1, Lc: 0.6 });
      const v51 = noStretch.toLifted(pos);
      expect(v51.L).toBeCloseTo(v50.L, 10);
      expect(v51.a).toBeCloseTo(v50.a, 10);
      expect(v51.b).toBeCloseTo(v50.b, 10);
    });

    it('round-trip inverts (a,b) but preserves stretched L', () => {
      const lift = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 2, spread: 1.8, Lc: 0.45 });
      const pos = { L: 0.75, a: 0.12, b: -0.06 };
      const lifted = lift.toLifted(pos);
      const back = lift.fromLifted(lifted);
      // L remains stretched
      expect(back.L).toBeCloseTo(0.45 + 1.8 * (0.75 - 0.45), 8);
      // (a, b) round-trip correctly
      expect(back.a).toBeCloseTo(pos.a, 8);
      expect(back.b).toBeCloseTo(pos.b, 8);
    });

    it('output L extends beyond seed range for hull surface points', () => {
      // Simulates a particle at the hull extreme in working space
      const lift = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 1, spread: 2, Lc: 0.5 });
      // Seed at L=0.6 → working L = 0.5 + 2*(0.6-0.5) = 0.7
      const seedLifted = lift.toLifted({ L: 0.6, a: 0.1, b: 0 });
      expect(seedLifted.L).toBeCloseTo(0.7, 10);
      // fromLifted preserves L=0.7 (beyond seed L=0.6)
      const output = lift.fromLifted(seedLifted);
      expect(output.L).toBeCloseTo(0.7, 10);
    });

    it('toLifted preserves hue angle with L-stretch active', () => {
      const pos = { L: 0.7, a: 0.1, b: 0.1 };
      const l = liftStretch.toLifted(pos);
      expect(Math.atan2(l.b, l.a)).toBeCloseTo(Math.atan2(pos.b, pos.a), 10);
    });
  });

  describe('config', () => {
    it('exposes config with all parameters', () => {
      const lift = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 2, spread: 1.5, Lc: 0.5 });
      expect(lift.config.rs).toBe(0.04);
      expect(lift.config.R).toBe(0.15);
      expect(lift.config.gamma).toBe(2);
      expect(lift.config.spread).toBe(1.5);
      expect(lift.config.Lc).toBe(0.5);
    });
  });
});
