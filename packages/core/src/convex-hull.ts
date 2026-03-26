import type { OKLab, EdgeKey, HullGeometry } from './types';
import type { Vec3 } from './types';
import { vec3Sub, vec3Cross, vec3Dot } from './math';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeEdgeKey(i: number, j: number): EdgeKey {
  return i < j ? `${i}-${j}` : `${j}-${i}`;
}

function okLabToVec3(p: OKLab): Vec3 {
  return [p.L, p.a, p.b];
}

/** Signed volume of tetrahedron formed by points a, b, c, d. */
function signedVolume(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const ab = vec3Sub(b, a);
  const ac = vec3Sub(c, a);
  const ad = vec3Sub(d, a);
  return vec3Dot(ab, vec3Cross(ac, ad));
}

/** Face normal (not normalized) pointing according to winding order. */
function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return vec3Cross(vec3Sub(b, a), vec3Sub(c, a));
}

// ---------------------------------------------------------------------------
// Internal face representation
// ---------------------------------------------------------------------------

interface Face {
  /** Indices into the hull vertex array (output indices). */
  v: [number, number, number];
  /** Outward-pointing normal (not necessarily normalized). */
  normal: Vec3;
}

// ---------------------------------------------------------------------------
// Coplanar (2D) case
// ---------------------------------------------------------------------------

/**
 * Build a HullGeometry for a set of coplanar points by computing a 2D
 * convex hull, triangulating via a fan, and doubling the faces so both
 * sides are represented (important for visibility tests in later passes).
 */
function buildCoplanarHull(points: OKLab[]): HullGeometry {
  const verts = points.slice();
  const n = verts.length;

  // Project onto 2D using the first two linearly-independent directions.
  // Since points are coplanar we just pick the axes with the most variance.
  const vs = verts.map(okLabToVec3);

  // Centroid
  const cx = vs.reduce((s, v) => s + v[0], 0) / n;
  const cy = vs.reduce((s, v) => s + v[1], 0) / n;
  const cz = vs.reduce((s, v) => s + v[2], 0) / n;

  // Build two orthonormal axes in the plane.
  // First axis u: direction from centroid to the first non-coincident vertex.
  let u: Vec3 = [0, 0, 0];
  for (const v of vs) {
    const d: Vec3 = [v[0] - cx, v[1] - cy, v[2] - cz];
    const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    if (len > 1e-10) { u = [d[0] / len, d[1] / len, d[2] / len]; break; }
  }
  // Second axis w: perpendicular to u but still IN the plane.
  // Strategy: find a point whose projection off of u is non-zero, use that
  // component as w, then normalize.
  let w: Vec3 = [0, 0, 0];
  for (const v of vs) {
    const d: Vec3 = [v[0] - cx, v[1] - cy, v[2] - cz];
    const proj = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    const perp: Vec3 = [d[0] - proj * u[0], d[1] - proj * u[1], d[2] - proj * u[2]];
    const len = Math.sqrt(perp[0] * perp[0] + perp[1] * perp[1] + perp[2] * perp[2]);
    if (len > 1e-10) { w = [perp[0] / len, perp[1] / len, perp[2] / len]; break; }
  }
  // If w is still zero (all points collinear in 3D), fall back to a perpendicular
  // in an arbitrary direction — hull will degenerate but won't crash.
  if (w[0] === 0 && w[1] === 0 && w[2] === 0) {
    const tmp: Vec3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const wRaw = vec3Cross(u, tmp);
    const wLen = Math.sqrt(wRaw[0] * wRaw[0] + wRaw[1] * wRaw[1] + wRaw[2] * wRaw[2]);
    w = [wRaw[0] / wLen, wRaw[1] / wLen, wRaw[2] / wLen];
  }

  // Project each vertex to 2D coordinates (u, w)
  const pts2d = vs.map((v): [number, number] => {
    const dx = v[0] - cx, dy = v[1] - cy, dz = v[2] - cz;
    return [dx * u[0] + dy * u[1] + dz * u[2],
            dx * w[0] + dy * w[1] + dz * w[2]];
  });

  // 2D convex hull (Graham scan)
  const hullIndices = convexHull2D(pts2d);

  // Triangulate via fan from hullIndices[0]
  // Front faces get even indices (0, 2, 4, ...), back faces get odd (1, 3, 5, ...)
  const faces: Array<{ vertexIndices: [number, number, number] }> = [];

  const h0 = hullIndices[0];
  for (let k = 1; k + 1 < hullIndices.length; k++) {
    const h1 = hullIndices[k];
    const h2 = hullIndices[k + 1];
    faces.push({ vertexIndices: [h0, h1, h2] });      // front face (even index)
    faces.push({ vertexIndices: [h0, h2, h1] });       // back face (odd index)
  }

  // Build adjacency with correct same-side pairing for internal fan edges.
  // For each edge, collect all face indices that use it, then pair correctly:
  //   - Boundary edges (2 faces): pair front ↔ back of same triangle
  //   - Internal fan edges (4 faces): pair front ↔ front (adjacent triangles)
  //     Back faces connect to front faces via boundary edges, so the full
  //     surface remains navigable: B_k → F_k → F_{k+1} → B_{k+1}
  const edgeToFaces = new Map<EdgeKey, number[]>();
  for (let fi = 0; fi < faces.length; fi++) {
    const [a, b, c] = faces[fi].vertexIndices;
    for (const [ei, ej] of [[a, b], [b, c], [a, c]] as [number,number][]) {
      const key = makeEdgeKey(ei, ej);
      if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
      edgeToFaces.get(key)!.push(fi);
    }
  }

  const adj2 = new Map<EdgeKey, [number, number]>();
  for (const [key, fis] of edgeToFaces) {
    if (fis.length === 2) {
      // Boundary edge: connects front ↔ back of same triangle
      adj2.set(key, [fis[0], fis[1]]);
    } else if (fis.length >= 4) {
      // Internal fan edge shared by 4+ faces.
      // Pair the two front faces (even indices) for same-side navigation.
      const frontFaces = fis.filter(fi => fi % 2 === 0);
      if (frontFaces.length >= 2) {
        adj2.set(key, [frontFaces[0], frontFaces[1]]);
      } else {
        adj2.set(key, [fis[0], fis[1]]);
      }
    }
  }

  return { kind: 'hull', vertices: verts, faces, adjacency: adj2 };
}

/**
 * 2D convex hull using Graham scan.
 * Returns indices into `pts` in counter-clockwise order.
 */
function convexHull2D(pts: [number, number][]): number[] {
  const n = pts.length;
  if (n <= 2) return pts.map((_, i) => i);

  // Find bottom-most (then left-most) point as pivot
  let pivotIdx = 0;
  for (let i = 1; i < n; i++) {
    if (pts[i][1] < pts[pivotIdx][1] ||
        (pts[i][1] === pts[pivotIdx][1] && pts[i][0] < pts[pivotIdx][0])) {
      pivotIdx = i;
    }
  }

  const pivot = pts[pivotIdx];
  // Sort remaining points by polar angle relative to pivot
  const indices = Array.from({ length: n }, (_, i) => i)
    .filter(i => i !== pivotIdx)
    .sort((a, b) => {
      const ax = pts[a][0] - pivot[0], ay = pts[a][1] - pivot[1];
      const bx = pts[b][0] - pivot[0], by = pts[b][1] - pivot[1];
      const cross = ax * by - ay * bx;
      if (Math.abs(cross) > 1e-12) return -cross; // CCW first
      // Collinear: closer first
      return (ax * ax + ay * ay) - (bx * bx + by * by);
    });

  // Graham scan
  const stack: number[] = [pivotIdx, indices[0]];
  for (let i = 1; i < indices.length; i++) {
    while (stack.length >= 2) {
      const top = stack[stack.length - 1];
      const next = stack[stack.length - 2];
      const ax = pts[top][0] - pts[next][0], ay = pts[top][1] - pts[next][1];
      const bx = pts[indices[i]][0] - pts[next][0], by = pts[indices[i]][1] - pts[next][1];
      const cross = ax * by - ay * bx;
      if (cross <= 0) stack.pop(); // right turn or collinear: remove
      else break;
    }
    stack.push(indices[i]);
  }

  return stack;
}

// ---------------------------------------------------------------------------
// Main incremental 3D convex hull
// ---------------------------------------------------------------------------

export function buildConvexHull(points: OKLab[]): HullGeometry {
  if (points.length < 3) {
    throw new Error('buildConvexHull requires at least 3 points');
  }

  const verts = points.slice();
  const vs = verts.map(okLabToVec3);
  const n = vs.length;

  // -------------------------------------------------------------------------
  // Step 1: Find 4 non-coplanar points for initial tetrahedron
  // -------------------------------------------------------------------------

  // Find first two distinct points
  let i0 = 0;
  let i1 = -1;
  for (let i = 1; i < n; i++) {
    const d = vec3Sub(vs[i], vs[i0]);
    if (Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]) > 1e-10) { i1 = i; break; }
  }
  if (i1 === -1) {
    throw new Error('All points are identical');
  }

  // Find third point not collinear with i0, i1
  let i2 = -1;
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1) continue;
    const cross = vec3Cross(vec3Sub(vs[i1], vs[i0]), vec3Sub(vs[i], vs[i0]));
    if (Math.sqrt(cross[0]*cross[0]+cross[1]*cross[1]+cross[2]*cross[2]) > 1e-10) {
      i2 = i; break;
    }
  }
  if (i2 === -1) {
    throw new Error('All points are collinear');
  }

  // Find fourth point not coplanar with i0, i1, i2
  let i3 = -1;
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1 || i === i2) continue;
    const vol = signedVolume(vs[i0], vs[i1], vs[i2], vs[i]);
    if (Math.abs(vol) > 1e-10) { i3 = i; break; }
  }

  // -------------------------------------------------------------------------
  // Step 2: Coplanar case (no 4th non-coplanar point found)
  // -------------------------------------------------------------------------

  if (i3 === -1) {
    return buildCoplanarHull(points);
  }

  // -------------------------------------------------------------------------
  // Step 3: Build initial tetrahedron with consistent outward normals
  // -------------------------------------------------------------------------

  // Centroid of the 4 initial points
  const tetCentroid: Vec3 = [
    (vs[i0][0] + vs[i1][0] + vs[i2][0] + vs[i3][0]) / 4,
    (vs[i0][1] + vs[i1][1] + vs[i2][1] + vs[i3][1]) / 4,
    (vs[i0][2] + vs[i1][2] + vs[i2][2] + vs[i3][2]) / 4,
  ];

  /**
   * Create a face with outward-pointing normal.
   * `oppositeIdx` is the index of the point NOT on this face.
   */
  function makeFace(a: number, b: number, c: number, oppositeVert: Vec3): Face {
    const n = faceNormal(vs[a], vs[b], vs[c]);
    const toOpp: Vec3 = vec3Sub(oppositeVert, vs[a]);
    // If normal points toward opposite vertex, flip winding
    if (vec3Dot(n, toOpp) > 0) {
      return { v: [a, c, b], normal: [-n[0], -n[1], -n[2]] };
    }
    return { v: [a, b, c], normal: n };
  }

  const faces: Face[] = [
    makeFace(i0, i1, i2, vs[i3]),
    makeFace(i0, i1, i3, vs[i2]),
    makeFace(i0, i2, i3, vs[i1]),
    makeFace(i1, i2, i3, vs[i0]),
  ];

  // -------------------------------------------------------------------------
  // Step 4: Incremental insertion of remaining points
  // -------------------------------------------------------------------------

  const usedInitial = new Set([i0, i1, i2, i3]);

  for (let pi = 0; pi < n; pi++) {
    if (usedInitial.has(pi)) continue;
    const p = vs[pi];

    // Find visible faces
    const visible: boolean[] = faces.map(f => {
      const toP = vec3Sub(p, vs[f.v[0]]);
      return vec3Dot(f.normal, toP) > 1e-12;
    });

    if (!visible.some(Boolean)) continue; // point is inside or on hull

    // Find horizon edges: edges shared by exactly one visible and one non-visible face
    // An edge is a horizon edge if it belongs to a visible face but its "twin" belongs to a non-visible face.
    // We collect directed edges from visible faces. A horizon edge will appear only once
    // (the twin directed edge from the non-visible face won't appear in visible set).
    const horizonEdges: Array<[number, number]> = [];
    const directedEdgeSet = new Set<string>();

    for (let fi = 0; fi < faces.length; fi++) {
      if (!visible[fi]) continue;
      const [a, b, c] = faces[fi].v;
      for (const [ea, eb] of [[a, b], [b, c], [c, a]] as [number, number][]) {
        directedEdgeSet.add(`${ea}-${eb}`);
      }
    }

    for (let fi = 0; fi < faces.length; fi++) {
      if (!visible[fi]) continue;
      const [a, b, c] = faces[fi].v;
      for (const [ea, eb] of [[a, b], [b, c], [c, a]] as [number, number][]) {
        // The reverse directed edge (eb -> ea) is a horizon edge if it does NOT
        // appear in any visible face
        if (!directedEdgeSet.has(`${eb}-${ea}`)) {
          horizonEdges.push([ea, eb]);
        }
      }
    }

    // Remove visible faces (in reverse to preserve indices)
    const visibleIndices = faces
      .map((_, fi) => fi)
      .filter(fi => visible[fi])
      .reverse();
    for (const fi of visibleIndices) {
      faces.splice(fi, 1);
    }

    // Add new faces connecting pi to each horizon edge
    // The horizon edge [ea, eb] was a CCW-oriented edge of a visible face,
    // so the new face [ea, eb, pi] winds correctly with the outward normal.
    for (const [ea, eb] of horizonEdges) {
      const norm = faceNormal(vs[ea], vs[eb], p);
      // Sanity check: normal should point away from interior (tetCentroid)
      const toCenter = vec3Sub(tetCentroid, vs[ea]);
      if (vec3Dot(norm, toCenter) > 0) {
        // Flip
        faces.push({ v: [ea, pi, eb], normal: [-norm[0], -norm[1], -norm[2]] });
      } else {
        faces.push({ v: [ea, eb, pi], normal: norm });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Build output HullGeometry
  // -------------------------------------------------------------------------

  // Collect used vertex indices
  const usedVertices = new Set<number>();
  for (const f of faces) {
    usedVertices.add(f.v[0]);
    usedVertices.add(f.v[1]);
    usedVertices.add(f.v[2]);
  }

  // Remap to contiguous indices
  const oldToNew = new Map<number, number>();
  const newVertices: OKLab[] = [];
  for (const oi of [...usedVertices].sort((a, b) => a - b)) {
    oldToNew.set(oi, newVertices.length);
    newVertices.push(verts[oi]);
  }

  const outFaces: Array<{ vertexIndices: [number, number, number] }> = faces.map(f => ({
    vertexIndices: [oldToNew.get(f.v[0])!, oldToNew.get(f.v[1])!, oldToNew.get(f.v[2])!],
  }));

  // Build adjacency map
  const edgeToFaces = new Map<EdgeKey, number[]>();
  for (let fi = 0; fi < outFaces.length; fi++) {
    const [a, b, c] = outFaces[fi].vertexIndices;
    for (const [ei, ej] of [[a, b], [b, c], [a, c]] as [number, number][]) {
      const key = makeEdgeKey(ei, ej);
      if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
      edgeToFaces.get(key)!.push(fi);
    }
  }

  const adjacency = new Map<EdgeKey, [number, number]>();
  for (const [key, fis] of edgeToFaces) {
    if (fis.length >= 2) {
      adjacency.set(key, [fis[0], fis[1]]);
    }
  }

  return { kind: 'hull', vertices: newVertices, faces: outFaces, adjacency };
}
