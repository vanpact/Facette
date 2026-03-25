import type { HullGeometry, OKLab, Vec3, EdgeKey, AtlasQuery } from './types';
import {
  vec3Sub,
  vec3Dot,
  vec3Cross,
  vec3Norm,
  vec3Normalize,
  vec3Scale,
} from './math';

function oklabToVec3(c: OKLab): Vec3 {
  return [c.L, c.a, c.b];
}

interface FaceData {
  u: Vec3;
  v: Vec3;
  normal: Vec3;
  area: number;
  degenerate: boolean;
}

function computeFaceData(
  v0: OKLab,
  v1: OKLab,
  v2: OKLab,
): FaceData {
  const p0 = oklabToVec3(v0);
  const p1 = oklabToVec3(v1);
  const p2 = oklabToVec3(v2);

  const e1 = vec3Sub(p1, p0); // v1 - v0
  const e2 = vec3Sub(p2, p0); // v2 - v0

  // Area = 0.5 * |cross(e1, e2)|
  const crossE = vec3Cross(e1, e2);
  const area = 0.5 * vec3Norm(crossE);
  const degenerate = area < 1e-8;

  // Gram-Schmidt basis
  const u = vec3Normalize(e1);

  // w = e2 - dot(e2, u) * u  (project out u component)
  const proj = vec3Scale(u, vec3Dot(e2, u));
  const w: Vec3 = [e2[0] - proj[0], e2[1] - proj[1], e2[2] - proj[2]];
  const wLen = vec3Norm(w);

  let v: Vec3;
  if (wLen < 1e-8) {
    v = [0, 0, 0];
  } else {
    v = vec3Scale(w, 1 / wLen);
  }

  const normal = vec3Normalize(vec3Cross(u, v));

  return { u, v, normal, area, degenerate };
}

export function buildAtlas(hull: HullGeometry): AtlasQuery {
  const faceDataCache: (FaceData | undefined)[] = new Array(hull.faces.length).fill(undefined);

  function getFaceData(faceIndex: number): FaceData {
    let data = faceDataCache[faceIndex];
    if (data === undefined) {
      const face = hull.faces[faceIndex];
      const [i0, i1, i2] = face.vertexIndices;
      data = computeFaceData(hull.vertices[i0], hull.vertices[i1], hull.vertices[i2]);
      faceDataCache[faceIndex] = data;
    }
    return data;
  }

  return {
    getFaceBasis(faceIndex: number): { u: Vec3; v: Vec3; normal: Vec3 } {
      const { u, v, normal } = getFaceData(faceIndex);
      return { u, v, normal };
    },

    getFaceVertices(faceIndex: number): [OKLab, OKLab, OKLab] {
      const [i0, i1, i2] = hull.faces[faceIndex].vertexIndices;
      return [hull.vertices[i0], hull.vertices[i1], hull.vertices[i2]];
    },

    getAdjacentFace(faceIndex: number, edgeKey: EdgeKey): number | null {
      const pair = hull.adjacency.get(edgeKey);
      if (pair === undefined) return null;
      const [faceA, faceB] = pair;
      if (faceA === faceIndex) return faceB;
      if (faceB === faceIndex) return faceA;
      return null;
    },

    getFaceArea(faceIndex: number): number {
      return getFaceData(faceIndex).area;
    },

    isDegenerate(faceIndex: number): boolean {
      return getFaceData(faceIndex).degenerate;
    },

    faceCount(): number {
      return hull.faces.length;
    },
  };
}
