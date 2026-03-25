import { describe, it, expect } from 'vitest';
import { classifySeeds } from './seed-classification';
import type { OKLab, HullGeometry, LineGeometry } from './types';

describe('seed classification', () => {
  describe('hull geometry', () => {
    const hull: HullGeometry = {
      kind: 'hull',
      vertices: [
        { L: 0, a: 0, b: 0 },
        { L: 1, a: 0, b: 0 },
        { L: 0, a: 1, b: 0 },
        { L: 0, a: 0, b: 1 },
      ],
      faces: [
        { vertexIndices: [0, 1, 2] },
        { vertexIndices: [0, 1, 3] },
        { vertexIndices: [0, 2, 3] },
        { vertexIndices: [1, 2, 3] },
      ],
      adjacency: new Map(),
    };

    it('classifies vertex seeds as pinned-vertex', () => {
      const seeds: OKLab[] = [
        { L: 0, a: 0, b: 0 },
        { L: 1, a: 0, b: 0 },
      ];
      const particles = classifySeeds(seeds, hull);
      expect(particles[0].kind).toBe('pinned-vertex');
      expect(particles[1].kind).toBe('pinned-vertex');
      if (particles[0].kind === 'pinned-vertex') {
        expect(particles[0].vertexIndex).toBe(0);
      }
    });

    it('classifies face-interior seeds as pinned-boundary', () => {
      // Centroid of face [0,1,2]
      const seeds: OKLab[] = [{ L: 1/3, a: 1/3, b: 0 }];
      const particles = classifySeeds(seeds, hull);
      expect(particles[0].kind).toBe('pinned-boundary');
    });

    it('classifies interior seeds as pinned-interior', () => {
      // Point clearly inside the tetrahedron
      const seeds: OKLab[] = [{ L: 0.1, a: 0.1, b: 0.1 }];
      const particles = classifySeeds(seeds, hull);
      expect(particles[0].kind).toBe('pinned-interior');
    });

    it('preserves seed positions', () => {
      const seeds: OKLab[] = [{ L: 0.5, a: 0, b: 0 }];
      const particles = classifySeeds(seeds, hull);
      expect(particles[0].position.L).toBeCloseTo(0.5);
      expect(particles[0].position.a).toBeCloseTo(0);
    });
  });

  describe('line geometry', () => {
    const line: LineGeometry = {
      kind: 'line',
      start: { L: 0.2, a: -0.1, b: 0 },
      end: { L: 0.8, a: 0.1, b: 0 },
    };

    it('classifies start seed as pinned-endpoint t=0', () => {
      const particles = classifySeeds([line.start], line);
      expect(particles[0].kind).toBe('pinned-endpoint');
      if (particles[0].kind === 'pinned-endpoint') {
        expect(particles[0].t).toBeCloseTo(0);
      }
    });

    it('classifies end seed as pinned-endpoint t=1', () => {
      const particles = classifySeeds([line.end], line);
      expect(particles[0].kind).toBe('pinned-endpoint');
      if (particles[0].kind === 'pinned-endpoint') {
        expect(particles[0].t).toBeCloseTo(1);
      }
    });

    it('classifies mid-segment seed', () => {
      const mid: OKLab = { L: 0.5, a: 0, b: 0 };
      const particles = classifySeeds([mid], line);
      expect(particles[0].kind).toBe('pinned-endpoint');
      if (particles[0].kind === 'pinned-endpoint') {
        expect(particles[0].t).toBeCloseTo(0.5);
      }
    });
  });
});
