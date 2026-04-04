import { describe, it, expect } from 'vitest';
import { createSpaceLift } from './space-lift';

describe('SpaceLift', () => {
  const lift = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 1 });

  describe('toLifted', () => {
    it('rho(0) = 0: gray maps to gray', () => {
      const l = lift.toLifted({ L: 0.5, a: 0, b: 0 });
      expect(l.a).toBeCloseTo(0);
      expect(l.b).toBeCloseTo(0);
    });

    it('rho(R) = R: reference chroma is a fixed point', () => {
      const l = lift.toLifted({ L: 0.5, a: 0.15, b: 0 });
      expect(l.a).toBeCloseTo(0.15, 6);
      expect(l.b).toBeCloseTo(0, 10);
    });

    it('preserves L unchanged', () => {
      const l = lift.toLifted({ L: 0.7, a: 0.1, b: 0.05 });
      expect(l.L).toBeCloseTo(0.7);
    });

    it('preserves hue angle', () => {
      const pos = { L: 0.5, a: 0.1, b: 0.1 };
      const l = lift.toLifted(pos);
      expect(Math.atan2(l.b, l.a)).toBeCloseTo(Math.atan2(pos.b, pos.a), 10);
    });

    it('contracts low chroma (rho\'(0) = 0)', () => {
      const pos = { L: 0.5, a: 0.01, b: 0 };
      const l = lift.toLifted(pos);
      expect(Math.sqrt(l.a ** 2 + l.b ** 2)).toBeLessThan(0.01);
    });

    it('rho is monotonically increasing', () => {
      const r1 = 0.02, r2 = 0.05, r3 = 0.12;
      const l1 = lift.toLifted({ L: 0.5, a: r1, b: 0 });
      const l2 = lift.toLifted({ L: 0.5, a: r2, b: 0 });
      const l3 = lift.toLifted({ L: 0.5, a: r3, b: 0 });
      expect(l1.a).toBeLessThan(l2.a);
      expect(l2.a).toBeLessThan(l3.a);
    });
  });

  describe('fromLifted (inverse)', () => {
    it('round-trips through toLifted → fromLifted', () => {
      const pos = { L: 0.6, a: 0.08, b: -0.03 };
      const back = lift.fromLifted(lift.toLifted(pos));
      expect(back.L).toBeCloseTo(pos.L, 8);
      expect(back.a).toBeCloseTo(pos.a, 8);
      expect(back.b).toBeCloseTo(pos.b, 8);
    });

    it('round-trips gray', () => {
      const pos = { L: 0.5, a: 0, b: 0 };
      const back = lift.fromLifted(lift.toLifted(pos));
      expect(back.L).toBeCloseTo(0.5, 8);
      expect(back.a).toBeCloseTo(0, 8);
      expect(back.b).toBeCloseTo(0, 8);
    });

    it('round-trips high chroma', () => {
      const pos = { L: 0.5, a: 0.25, b: -0.15 };
      const back = lift.fromLifted(lift.toLifted(pos));
      expect(back.a).toBeCloseTo(pos.a, 8);
      expect(back.b).toBeCloseTo(pos.b, 8);
    });

    it('round-trips reference chroma exactly', () => {
      const pos = { L: 0.5, a: 0.15, b: 0 };
      const back = lift.fromLifted(lift.toLifted(pos));
      expect(back.a).toBeCloseTo(pos.a, 10);
    });
  });

  describe('gamma > 1', () => {
    const liftG2 = createSpaceLift({ rs: 0.04, R: 0.15, gamma: 2 });

    it('rho(R) = R still holds at gamma=2', () => {
      const l = liftG2.toLifted({ L: 0.5, a: 0.15, b: 0 });
      expect(l.a).toBeCloseTo(0.15, 6);
    });

    it('rho(0) = 0 still holds at gamma=2', () => {
      const l = liftG2.toLifted({ L: 0.5, a: 0, b: 0 });
      expect(l.a).toBeCloseTo(0);
    });

    it('stronger contraction at low chroma with gamma=2', () => {
      const pos = { L: 0.5, a: 0.05, b: 0 };
      const l1 = lift.toLifted(pos);
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

  describe('gamma=1 matches V4.4 warp (up to R scaling)', () => {
    it('contraction ratio rho(r)/r increases with r', () => {
      const r1 = 0.02, r2 = 0.08, r3 = 0.15;
      const l1 = lift.toLifted({ L: 0.5, a: r1, b: 0 });
      const l2 = lift.toLifted({ L: 0.5, a: r2, b: 0 });
      const l3 = lift.toLifted({ L: 0.5, a: r3, b: 0 });
      expect(l1.a / r1).toBeLessThan(l2.a / r2);
      expect(l2.a / r2).toBeLessThan(l3.a / r3);
    });
  });

  it('exposes config with all parameters', () => {
    expect(lift.config.rs).toBe(0.04);
    expect(lift.config.R).toBe(0.15);
    expect(lift.config.gamma).toBe(1);
  });
});
