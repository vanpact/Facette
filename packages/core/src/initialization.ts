import type {
  Particle,
  OKLab,
  Barycentric,
  HullGeometry,
  LineGeometry,
  AtlasQuery,
  Vec3,
} from './types';
import { interpolate, computeBarycentric, clampAndRenormalize } from './barycentric';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function oklabDistSq(a: OKLab, b: OKLab): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dL * dL + da * da + db * db;
}

/**
 * Count how many particles are currently on a given face.
 * Pinned-vertex particles are considered to be on all faces that include
 * their vertex, but for simplicity we count particles whose faceIndex matches.
 * Pinned-vertex particles are not counted per-face (they are corner anchors).
 */
function countParticlesOnFace(
  particles: Particle[],
  faceIndex: number,
  hull: HullGeometry,
): number {
  let count = 0;
  for (const p of particles) {
    if (p.kind === 'free' && p.faceIndex === faceIndex) {
      count++;
    } else if (p.kind === 'pinned-boundary' && p.faceIndex === faceIndex) {
      count++;
    } else if (p.kind === 'pinned-vertex') {
      // Count the pinned vertex as on the face if the vertex is one of the face's vertices
      const face = hull.faces[faceIndex];
      if (face.vertexIndices.includes(p.vertexIndex)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Generate a 5×5 grid of barycentric coordinates inside the triangle
 * (staying away from degenerate edges). Skips samples outside the triangle.
 */
function generate5x5BaryGrid(): Barycentric[] {
  const samples: Barycentric[] = [];
  const N = 5;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N - i; j++) {
      const w0 = i / N;
      const w1 = j / N;
      const w2 = 1 - w0 - w1;
      if (w2 < -1e-9) continue;
      samples.push({ w0, w1, w2: Math.max(0, w2) });
    }
  }
  return samples;
}

// ---------------------------------------------------------------------------
// 1D initialization
// ---------------------------------------------------------------------------

/**
 * Place N particles along a line segment. Seeds (pinned-endpoint particles)
 * are preserved as-is. Remaining N - seeds.length particles are placed at
 * equal parametric intervals as free-1d particles, avoiding seed positions.
 *
 * Generates N evenly-spaced t values along [0, 1], assigns seeds to the
 * closest slots, and fills the remaining slots with free particles.
 */
export function initializeParticles1D(
  seeds: Particle[],
  line: LineGeometry,
  n: number,
): Particle[] {
  const result: Particle[] = [...seeds];
  const needed = n - seeds.length;
  if (needed <= 0) return result;

  // Generate n evenly-spaced t slots: 0, 1/(n-1), 2/(n-1), ..., 1
  const totalIntervals = n - 1;
  const slots: number[] = [];
  for (let i = 0; i < n; i++) {
    slots.push(i / totalIntervals);
  }

  // Collect seed t values
  const seedTs = new Set<number>();
  for (const s of seeds) {
    if (s.kind === 'pinned-endpoint' || s.kind === 'free-1d') {
      seedTs.add(s.t);
    }
  }

  // Find free slots: those not within 1e-9 of any seed t
  for (const slotT of slots) {
    let occupiedBySeed = false;
    for (const seedT of seedTs) {
      if (Math.abs(slotT - seedT) < 1e-9) {
        occupiedBySeed = true;
        break;
      }
    }
    if (occupiedBySeed) continue;
    if (result.length >= n) break;

    const position: OKLab = {
      L: line.start.L + slotT * (line.end.L - line.start.L),
      a: line.start.a + slotT * (line.end.a - line.start.a),
      b: line.start.b + slotT * (line.end.b - line.start.b),
    };
    result.push({ kind: 'free-1d', position, t: slotT });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 2D/3D hull initialization
// ---------------------------------------------------------------------------

/**
 * Greedy particle placement with atlas area scoring.
 *
 * Algorithm:
 * 1. Start with pinned seeds.
 * 2. For each remaining free particle to place:
 *    a. Score each non-degenerate face: score = atlas.getFaceArea(fi) / (1 + particlesOnFace)
 *    b. Select the face with highest score.
 *    c. Sample a 5x5 grid of barycentric coords on that face; pick the point
 *       maximizing minimum OKLab distance to all existing particles.
 *    d. Create a `free` particle at that position.
 * 3. Gray jitter: for any free particle with chroma < 1e-6, perturb along the
 *    face tangent direction by 1e-5 and recompute barycentric coords.
 */
export function initializeParticlesHull(
  seeds: Particle[],
  hull: HullGeometry,
  atlas: AtlasQuery,
  n: number,
): Particle[] {
  const particles: Particle[] = [...seeds];
  const faceCount = atlas.faceCount();

  while (particles.length < n) {
    // --- Score each non-degenerate face ---
    let bestFaceIndex = -1;
    let bestScore = -Infinity;

    for (let fi = 0; fi < faceCount; fi++) {
      if (atlas.isDegenerate(fi)) continue;

      const area = atlas.getFaceArea(fi);
      const count = countParticlesOnFace(particles, fi, hull);
      const score = area / (1 + count);

      if (score > bestScore) {
        bestScore = score;
        bestFaceIndex = fi;
      }
    }

    if (bestFaceIndex === -1) {
      // All faces degenerate — fallback: place on first face centroid
      break;
    }

    // --- Find best position on selected face via 5x5 grid ---
    const [v0, v1, v2] = atlas.getFaceVertices(bestFaceIndex);
    const gridSamples = generate5x5BaryGrid();

    let bestBary: Barycentric = { w0: 1 / 3, w1: 1 / 3, w2: 1 / 3 };
    let bestMinDist = -Infinity;

    for (const bary of gridSamples) {
      const pos = interpolate(bary, v0, v1, v2);

      let minDist = Infinity;
      if (particles.length === 0) {
        minDist = Infinity;
      } else {
        for (const existing of particles) {
          const d = Math.sqrt(oklabDistSq(pos, existing.position));
          if (d < minDist) minDist = d;
        }
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestBary = bary;
      }
    }

    const position = interpolate(bestBary, v0, v1, v2);
    particles.push({
      kind: 'free',
      position,
      faceIndex: bestFaceIndex,
      bary: bestBary,
    });
  }

  // --- Gray jitter pass (spec Section 4.5) ---
  // For particles at near-zero chroma: project lifted-space +a direction onto
  // the face tangent plane. If negligible, use e_1. Alternate sign by index.
  const plusA: Vec3 = [0, 1, 0]; // +a direction in (L, a, b) space

  for (let i = seeds.length; i < particles.length; i++) {
    const p = particles[i];
    if (p.kind !== 'free') continue;

    const chroma = Math.sqrt(p.position.a * p.position.a + p.position.b * p.position.b);
    if (chroma >= 1e-6) continue;

    const freeIndex = i - seeds.length;
    const { u, v: vDir } = atlas.getFaceBasis(p.faceIndex);

    // Project +a onto tangent plane: proj = dot(+a, u)*u + dot(+a, v)*v
    const projU = plusA[0] * u[0] + plusA[1] * u[1] + plusA[2] * u[2];
    const projV = plusA[0] * vDir[0] + plusA[1] * vDir[1] + plusA[2] * vDir[2];
    let dir: Vec3 = [
      projU * u[0] + projV * vDir[0],
      projU * u[1] + projV * vDir[1],
      projU * u[2] + projV * vDir[2],
    ];

    // If projection is negligible, fall back to e_1 (u)
    const projMag = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
    if (projMag < 1e-8) {
      dir = u;
    } else {
      // Normalize the projection direction
      dir = [dir[0] / projMag, dir[1] / projMag, dir[2] / projMag];
    }

    // Alternate sign by particle index to avoid systematic hue bias
    const sign = freeIndex % 2 === 0 ? 1 : -1;

    const perturbedPos: OKLab = {
      L: p.position.L + sign * dir[0] * 1e-5,
      a: p.position.a + sign * dir[1] * 1e-5,
      b: p.position.b + sign * dir[2] * 1e-5,
    };

    const [fv0, fv1, fv2] = atlas.getFaceVertices(p.faceIndex);
    let newBary = computeBarycentric(perturbedPos, fv0, fv1, fv2);

    // Clamp if needed (perturbation might push slightly outside)
    if (newBary.w0 < 0 || newBary.w1 < 0 || newBary.w2 < 0) {
      newBary = clampAndRenormalize(newBary);
    }

    const newPos = interpolate(newBary, fv0, fv1, fv2);

    particles[i] = {
      kind: 'free',
      position: newPos,
      faceIndex: p.faceIndex,
      bary: newBary,
    };
  }

  return particles;
}
