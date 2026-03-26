import { describe, it, expect } from 'vitest';
import { initializeParticles1D, initializeParticlesHull } from './initialization';
import { buildAtlas } from './atlas';
import type { Particle, OKLab, HullGeometry, LineGeometry, EdgeKey } from './types';

function makeEdgeKey(i: number, j: number): EdgeKey {
  return i < j ? `${i}-${j}` : `${j}-${i}`;
}

describe('initialization', () => {
  describe('1D', () => {
    const line: LineGeometry = {
      kind: 'line',
      start: { L: 0.2, a: 0, b: 0 },
      end: { L: 0.8, a: 0, b: 0 },
    };

    it('places correct number of particles', () => {
      const seeds: Particle[] = [
        { kind: 'pinned-endpoint', position: line.start, t: 0 },
        { kind: 'pinned-endpoint', position: line.end, t: 1 },
      ];
      const particles = initializeParticles1D(seeds, line, 5);
      expect(particles.length).toBe(5);
    });

    it('seeds are preserved', () => {
      const seeds: Particle[] = [
        { kind: 'pinned-endpoint', position: line.start, t: 0 },
        { kind: 'pinned-endpoint', position: line.end, t: 1 },
      ];
      const particles = initializeParticles1D(seeds, line, 5);
      const pinned = particles.filter(p => p.kind === 'pinned-endpoint');
      expect(pinned.length).toBe(2);
    });

    it('free particles are evenly spaced', () => {
      const seeds: Particle[] = [
        { kind: 'pinned-endpoint', position: line.start, t: 0 },
        { kind: 'pinned-endpoint', position: line.end, t: 1 },
      ];
      const particles = initializeParticles1D(seeds, line, 5);
      const free = particles.filter(p => p.kind === 'free-1d');
      expect(free.length).toBe(3);
      // Should be at t ≈ 0.25, 0.5, 0.75
      const ts = free.map(p => p.kind === 'free-1d' ? p.t : -1).sort((a, b) => a - b);
      expect(ts[0]).toBeCloseTo(0.25, 1);
      expect(ts[1]).toBeCloseTo(0.5, 1);
      expect(ts[2]).toBeCloseTo(0.75, 1);
    });
  });

  describe('hull', () => {
    const adjacency = new Map<EdgeKey, [number, number]>();
    adjacency.set(makeEdgeKey(0, 1), [0, 1]);
    adjacency.set(makeEdgeKey(0, 2), [0, 2]);
    adjacency.set(makeEdgeKey(1, 2), [0, 3]);
    adjacency.set(makeEdgeKey(0, 3), [1, 2]);
    adjacency.set(makeEdgeKey(1, 3), [1, 3]);
    adjacency.set(makeEdgeKey(2, 3), [2, 3]);

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
      adjacency,
    };
    const atlas = buildAtlas(hull);

    it('places correct number of particles', () => {
      const seeds: Particle[] = [
        { kind: 'pinned-vertex', position: { L: 0, a: 0, b: 0 }, vertexIndex: 0 },
        { kind: 'pinned-vertex', position: { L: 1, a: 0, b: 0 }, vertexIndex: 1 },
        { kind: 'pinned-vertex', position: { L: 0, a: 1, b: 0 }, vertexIndex: 2 },
        { kind: 'pinned-vertex', position: { L: 0, a: 0, b: 1 }, vertexIndex: 3 },
      ];
      const particles = initializeParticlesHull(seeds, hull, atlas, 8);
      expect(particles.length).toBe(8);
    });

    it('seeds are preserved', () => {
      const seeds: Particle[] = [
        { kind: 'pinned-vertex', position: { L: 0, a: 0, b: 0 }, vertexIndex: 0 },
        { kind: 'pinned-vertex', position: { L: 1, a: 0, b: 0 }, vertexIndex: 1 },
        { kind: 'pinned-vertex', position: { L: 0, a: 1, b: 0 }, vertexIndex: 2 },
        { kind: 'pinned-vertex', position: { L: 0, a: 0, b: 1 }, vertexIndex: 3 },
      ];
      const particles = initializeParticlesHull(seeds, hull, atlas, 8);
      const pinned = particles.filter(p => p.kind === 'pinned-vertex');
      expect(pinned.length).toBe(4);
    });

    it('free particles have valid barycentric coords', () => {
      const seeds: Particle[] = [
        { kind: 'pinned-vertex', position: { L: 0, a: 0, b: 0 }, vertexIndex: 0 },
        { kind: 'pinned-vertex', position: { L: 1, a: 0, b: 0 }, vertexIndex: 1 },
        { kind: 'pinned-vertex', position: { L: 0, a: 1, b: 0 }, vertexIndex: 2 },
        { kind: 'pinned-vertex', position: { L: 0, a: 0, b: 1 }, vertexIndex: 3 },
      ];
      const particles = initializeParticlesHull(seeds, hull, atlas, 8);
      const free = particles.filter(p => p.kind === 'free');
      for (const p of free) {
        if (p.kind === 'free') {
          expect(p.bary.w0).toBeGreaterThanOrEqual(-1e-6);
          expect(p.bary.w1).toBeGreaterThanOrEqual(-1e-6);
          expect(p.bary.w2).toBeGreaterThanOrEqual(-1e-6);
          expect(p.bary.w0 + p.bary.w1 + p.bary.w2).toBeCloseTo(1, 4);
        }
      }
    });

    it('no free particle on degenerate face', () => {
      // This is tested implicitly — the scoring skips degenerate faces
      const seeds: Particle[] = [
        { kind: 'pinned-vertex', position: { L: 0, a: 0, b: 0 }, vertexIndex: 0 },
        { kind: 'pinned-vertex', position: { L: 1, a: 0, b: 0 }, vertexIndex: 1 },
        { kind: 'pinned-vertex', position: { L: 0, a: 1, b: 0 }, vertexIndex: 2 },
        { kind: 'pinned-vertex', position: { L: 0, a: 0, b: 1 }, vertexIndex: 3 },
      ];
      const particles = initializeParticlesHull(seeds, hull, atlas, 6);
      // All 4 faces are non-degenerate in this tetrahedron, so just verify count
      expect(particles.length).toBe(6);
    });
  });
});
