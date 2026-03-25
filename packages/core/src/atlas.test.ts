import { describe, it, expect } from 'vitest';
import { buildAtlas } from './atlas';
import type { HullGeometry, EdgeKey } from './types';

function makeEdgeKey(i: number, j: number): EdgeKey {
  return i < j ? `${i}-${j}` : `${j}-${i}`;
}

describe('atlas', () => {
  // Simple tetrahedron
  const adjacency = new Map<EdgeKey, [number, number]>();
  // 4 faces of tetrahedron: [0,1,2], [0,1,3], [0,2,3], [1,2,3]
  // Edge 0-1 is shared by face 0 and face 1
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

  it('computes orthonormal basis for each face', () => {
    const atlas = buildAtlas(hull);
    for (let i = 0; i < atlas.faceCount(); i++) {
      const { u, v, normal } = atlas.getFaceBasis(i);
      // u and v orthogonal
      const dot_uv = u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
      expect(dot_uv).toBeCloseTo(0, 6);
      // u and normal orthogonal
      const dot_un = u[0]*normal[0] + u[1]*normal[1] + u[2]*normal[2];
      expect(dot_un).toBeCloseTo(0, 6);
      // v and normal orthogonal
      const dot_vn = v[0]*normal[0] + v[1]*normal[1] + v[2]*normal[2];
      expect(dot_vn).toBeCloseTo(0, 6);
      // All unit length
      const uLen = Math.sqrt(u[0]**2 + u[1]**2 + u[2]**2);
      const vLen = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
      const nLen = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
      expect(uLen).toBeCloseTo(1, 6);
      expect(vLen).toBeCloseTo(1, 6);
      expect(nLen).toBeCloseTo(1, 6);
    }
  });

  it('computes positive face area for non-degenerate faces', () => {
    const atlas = buildAtlas(hull);
    for (let i = 0; i < atlas.faceCount(); i++) {
      expect(atlas.getFaceArea(i)).toBeGreaterThan(0);
    }
  });

  it('returns correct face count', () => {
    const atlas = buildAtlas(hull);
    expect(atlas.faceCount()).toBe(4);
  });

  it('returns correct vertices', () => {
    const atlas = buildAtlas(hull);
    const [v0, v1, v2] = atlas.getFaceVertices(0);
    expect(v0).toEqual({ L: 0, a: 0, b: 0 });
    expect(v1).toEqual({ L: 1, a: 0, b: 0 });
    expect(v2).toEqual({ L: 0, a: 1, b: 0 });
  });

  it('finds adjacent face across shared edge', () => {
    const atlas = buildAtlas(hull);
    // Face 0 shares edge 0-1 with face 1
    const adj = atlas.getAdjacentFace(0, makeEdgeKey(0, 1));
    expect(adj).toBe(1);
    // And vice versa
    const adj2 = atlas.getAdjacentFace(1, makeEdgeKey(0, 1));
    expect(adj2).toBe(0);
  });

  it('returns null for non-existent edge', () => {
    const atlas = buildAtlas(hull);
    expect(atlas.getAdjacentFace(0, '99-100')).toBeNull();
  });

  it('flags degenerate faces', () => {
    const degHull: HullGeometry = {
      kind: 'hull',
      vertices: [
        { L: 0, a: 0, b: 0 },
        { L: 1, a: 0, b: 0 },
        { L: 0.5, a: 1e-12, b: 0 },
        { L: 0, a: 0, b: 1 },
      ],
      faces: [
        { vertexIndices: [0, 1, 2] }, // nearly collinear = degenerate
        { vertexIndices: [0, 1, 3] },
        { vertexIndices: [0, 2, 3] },
        { vertexIndices: [1, 2, 3] },
      ],
      adjacency: new Map(),
    };
    const atlas = buildAtlas(degHull);
    expect(atlas.isDegenerate(0)).toBe(true);
    expect(atlas.isDegenerate(1)).toBe(false);
  });
});
