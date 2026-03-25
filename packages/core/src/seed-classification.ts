import type { OKLab, Geometry, Particle, HullGeometry, LineGeometry, Barycentric } from './types';
import { computeBarycentric, clampAndRenormalize } from './barycentric';
import { vec3Dot, vec3Sub, vec3Norm, vec3Cross } from './math';
import type { Vec3 } from './types';

const EPSILON = 1e-6;

function oklabDist(a: OKLab, b: OKLab): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

function oklabToVec3(c: OKLab): Vec3 {
  return [c.L, c.a, c.b];
}

/**
 * Compute the signed distance from point p to the plane of a triangle (v0, v1, v2).
 * The plane normal is computed as cross(v1-v0, v2-v0), then normalized.
 */
function planeDistance(p: OKLab, v0: OKLab, v1: OKLab, v2: OKLab): number {
  const pv  = oklabToVec3(p);
  const v0v = oklabToVec3(v0);
  const v1v = oklabToVec3(v1);
  const v2v = oklabToVec3(v2);

  const e1 = vec3Sub(v1v, v0v);
  const e2 = vec3Sub(v2v, v0v);
  const normal = vec3Cross(e1, e2);
  const len = vec3Norm(normal);

  if (len < 1e-14) return 0; // degenerate triangle

  const d = vec3Sub(pv, v0v);
  return Math.abs(vec3Dot(d, normal) / len);
}

function classifyHull(seed: OKLab, geometry: HullGeometry): Particle {
  const { vertices, faces } = geometry;

  // 1. Vertex check
  for (let i = 0; i < vertices.length; i++) {
    if (oklabDist(seed, vertices[i]) < EPSILON) {
      return { kind: 'pinned-vertex', position: seed, vertexIndex: i };
    }
  }

  // 2. Boundary check
  for (let fi = 0; fi < faces.length; fi++) {
    const face = faces[fi];
    const [i0, i1, i2] = face.vertexIndices;
    const v0 = vertices[i0];
    const v1 = vertices[i1];
    const v2 = vertices[i2];

    const dist = planeDistance(seed, v0, v1, v2);
    if (dist >= EPSILON) continue;

    const bary = computeBarycentric(seed, v0, v1, v2);
    if (bary.w0 >= -EPSILON && bary.w1 >= -EPSILON && bary.w2 >= -EPSILON) {
      const clamped = clampAndRenormalize(bary);
      return { kind: 'pinned-boundary', position: seed, faceIndex: fi, bary: clamped };
    }
  }

  // 3. Interior
  return { kind: 'pinned-interior', position: seed };
}

/**
 * Project seed onto the line segment [start, end] and return parameter t.
 * t is clamped to [0, 1].
 */
function projectOntoLine(seed: OKLab, start: OKLab, end: OKLab): number {
  const s = oklabToVec3(start);
  const e = oklabToVec3(end);
  const p = oklabToVec3(seed);

  const seg = vec3Sub(e, s);
  const segLenSq = vec3Dot(seg, seg);

  if (segLenSq < 1e-14) return 0; // degenerate segment

  const d = vec3Sub(p, s);
  return Math.max(0, Math.min(1, vec3Dot(d, seg) / segLenSq));
}

function classifyLine(seed: OKLab, geometry: LineGeometry): Particle {
  const { start, end } = geometry;
  let t = projectOntoLine(seed, start, end);

  if (Math.abs(t) < EPSILON) t = 0;
  else if (Math.abs(t - 1) < EPSILON) t = 1;

  return { kind: 'pinned-endpoint', position: seed, t };
}

/**
 * Classify each seed in `seeds` against `geometry`, returning one Particle per seed.
 */
export function classifySeeds(seeds: OKLab[], geometry: Geometry): Particle[] {
  if (geometry.kind === 'hull') {
    return seeds.map(seed => classifyHull(seed, geometry));
  } else {
    return seeds.map(seed => classifyLine(seed, geometry));
  }
}
