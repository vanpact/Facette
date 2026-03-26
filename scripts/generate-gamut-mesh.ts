/**
 * generate-gamut-mesh.ts
 *
 * Precomputes the sRGB gamut boundary as a triangulated mesh in OKLab space
 * and writes it to apps/web/src/assets/srgb-gamut.json.
 *
 * Run with:  npx tsx scripts/generate-gamut-mesh.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { oklabToLinearRgb } from '../packages/core/src/color-conversion';

// ---------------------------------------------------------------------------
// Grid parameters
// ---------------------------------------------------------------------------

const HUE_STEPS = 72;      // samples around the hue wheel  (0 … 2π, periodic)
const L_STEPS   = 25;      // lightness samples from 0.01 to 0.99

const L_MIN = 0.01;
const L_MAX = 0.99;

const C_MAX_INIT = 0.5;    // starting upper bound for binary search
const BINARY_SEARCH_ITER = 20;
const GAMUT_TOL = 1e-6;    // channel must be in [-tol, 1+tol]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when all linear-RGB channels are within gamut tolerance. */
function isInGamut(L: number, a: number, b: number): boolean {
  const rgb = oklabToLinearRgb({ L, a, b });
  return (
    rgb.r >= -GAMUT_TOL && rgb.r <= 1 + GAMUT_TOL &&
    rgb.g >= -GAMUT_TOL && rgb.g <= 1 + GAMUT_TOL &&
    rgb.b >= -GAMUT_TOL && rgb.b <= 1 + GAMUT_TOL
  );
}

/**
 * Binary-search for the maximum chroma C at a given (L, hue angle h).
 * Returns the OKLab coordinates (a, b) at the gamut boundary.
 */
function findMaxChroma(L: number, h: number): { a: number; b: number } {
  const cosH = Math.cos(h);
  const sinH = Math.sin(h);

  let lo = 0;
  let hi = C_MAX_INIT;

  // Ensure hi is actually outside gamut (extend if needed)
  while (isInGamut(L, hi * cosH, hi * sinH)) {
    hi *= 2;
  }

  for (let i = 0; i < BINARY_SEARCH_ITER; i++) {
    const mid = (lo + hi) * 0.5;
    if (isInGamut(L, mid * cosH, mid * sinH)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const C = (lo + hi) * 0.5;
  return { a: C * cosH, b: C * sinH };
}

// ---------------------------------------------------------------------------
// Build vertices
// ---------------------------------------------------------------------------

/**
 * Vertex layout:
 *   index 0          → black pole (0, 0, 0)
 *   indices 1 … H*L  → grid[hue][L] stored row-major (hue-major)
 *   last index       → white pole (0, 1, 0)
 *
 * Scene coordinates: [a, L, b]  (y-up, a/b in horizontal plane)
 */

const vertices: number[] = [];
const indices:  number[] = [];

// --- Black pole (L=0) ---
vertices.push(0, 0, 0); // vertex 0
const BLACK_POLE = 0;

// --- Grid vertices ---
// gridIndex(hi, li) returns the flat vertex index for hue-step hi, L-step li
function gridIndex(hi: number, li: number): number {
  return 1 + hi * L_STEPS + li;
}

const lValues: number[] = [];
for (let li = 0; li < L_STEPS; li++) {
  lValues.push(L_MIN + (li / (L_STEPS - 1)) * (L_MAX - L_MIN));
}

const hValues: number[] = [];
for (let hi = 0; hi < HUE_STEPS; hi++) {
  hValues.push((hi / HUE_STEPS) * 2 * Math.PI);
}

for (let hi = 0; hi < HUE_STEPS; hi++) {
  const h = hValues[hi];
  for (let li = 0; li < L_STEPS; li++) {
    const L = lValues[li];
    const { a, b } = findMaxChroma(L, h);
    // scene coords: [a, L, b]
    vertices.push(a, L, b);
  }
}

// --- White pole (L=1) ---
const WHITE_POLE = 1 + HUE_STEPS * L_STEPS;
vertices.push(0, 1, 0);

// ---------------------------------------------------------------------------
// Triangulate
// ---------------------------------------------------------------------------

// Quads between adjacent hue strips (wrapping around) and adjacent L rings.
// For each quad (hi, li) → (hi+1, li) with the hue axis wrapping:
//
//   v00 = gridIndex(hi,     li    )
//   v10 = gridIndex(hi+1,   li    )  ← next hue (wraps)
//   v01 = gridIndex(hi,     li + 1)
//   v11 = gridIndex(hi+1,   li + 1)
//
// Split into two triangles: (v00, v10, v01) and (v10, v11, v01)

for (let hi = 0; hi < HUE_STEPS; hi++) {
  const hiNext = (hi + 1) % HUE_STEPS;

  // Side quads (between adjacent L samples)
  for (let li = 0; li < L_STEPS - 1; li++) {
    const v00 = gridIndex(hi,     li    );
    const v10 = gridIndex(hiNext, li    );
    const v01 = gridIndex(hi,     li + 1);
    const v11 = gridIndex(hiNext, li + 1);

    indices.push(v00, v10, v01);
    indices.push(v10, v11, v01);
  }

  // Cap at black pole (L_MIN ring = li=0)
  const vBot0 = gridIndex(hi,     0);
  const vBot1 = gridIndex(hiNext, 0);
  indices.push(BLACK_POLE, vBot1, vBot0);

  // Cap at white pole (L_MAX ring = li=L_STEPS-1)
  const vTop0 = gridIndex(hi,     L_STEPS - 1);
  const vTop1 = gridIndex(hiNext, L_STEPS - 1);
  indices.push(WHITE_POLE, vTop0, vTop1);
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

const expectedVertexCount = 1 + HUE_STEPS * L_STEPS + 1;
console.assert(vertices.length === expectedVertexCount * 3,
  `Expected ${expectedVertexCount * 3} vertex floats, got ${vertices.length}`);
console.assert(vertices.length % 3 === 0,
  'vertices.length must be divisible by 3');
console.assert(indices.length % 3 === 0,
  'indices.length must be divisible by 3');

// ---------------------------------------------------------------------------
// Write JSON
// ---------------------------------------------------------------------------

// Resolve output path relative to this script's location
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const outPath = resolve(__dirname, '../apps/web/src/assets/srgb-gamut.json');

mkdirSync(dirname(outPath), { recursive: true });

// Round to 4 decimal places to keep file size under ~50 KB
const roundedVertices = vertices.map(v => Math.round(v * 1e4) / 1e4);

writeFileSync(outPath, JSON.stringify({ vertices: roundedVertices, indices }), 'utf8');

const fileSizeKb = (JSON.stringify({ vertices: roundedVertices, indices }).length / 1024).toFixed(1);
console.log(`Written: ${outPath}`);
console.log(`  Vertices: ${vertices.length / 3} (${vertices.length} floats)`);
console.log(`  Indices:  ${indices.length / 3} triangles (${indices.length} ints)`);
console.log(`  File size: ~${fileSizeKb} KB`);
