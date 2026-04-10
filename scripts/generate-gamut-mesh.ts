/**
 * generate-gamut-mesh.ts
 *
 * Precomputes the sRGB gamut boundary as a triangulated mesh in OKLab space
 * and writes it as a GLB (binary glTF) to apps/web/src/assets/srgb-gamut.glb.
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

const HUE_STEPS = 360;     // samples around the hue wheel  (0 … 2π, periodic)
const L_STEPS   = 128;     // lightness samples from L_MIN to L_MAX

const L_MIN = 0.001;
const L_MAX = 0.999;

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

for (let hi = 0; hi < HUE_STEPS; hi++) {
  const hiNext = (hi + 1) % HUE_STEPS;

  for (let li = 0; li < L_STEPS - 1; li++) {
    const v00 = gridIndex(hi,     li    );
    const v10 = gridIndex(hiNext, li    );
    const v01 = gridIndex(hi,     li + 1);
    const v11 = gridIndex(hiNext, li + 1);

    indices.push(v00, v10, v01);
    indices.push(v10, v11, v01);
  }

  // Cap at black pole
  const vBot0 = gridIndex(hi,     0);
  const vBot1 = gridIndex(hiNext, 0);
  indices.push(BLACK_POLE, vBot1, vBot0);

  // Cap at white pole
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
console.assert(vertices.length % 3 === 0, 'vertices.length must be divisible by 3');
console.assert(indices.length % 3 === 0, 'indices.length must be divisible by 3');

// ---------------------------------------------------------------------------
// Write GLB (binary glTF 2.0)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const outPath = resolve(__dirname, '../apps/web/src/assets/srgb-gamut.glb');

mkdirSync(dirname(outPath), { recursive: true });

// Compute bounding box for accessor min/max
const vertCount = vertices.length / 3;
let minX = Infinity, minY = Infinity, minZ = Infinity;
let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
for (let i = 0; i < vertCount; i++) {
  const x = vertices[i * 3], y = vertices[i * 3 + 1], z = vertices[i * 3 + 2];
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}

// Binary buffer: vertices (f32) then indices (u32)
const vertBytes = vertices.length * 4;
const idxBytes  = indices.length * 4;
const binLength = vertBytes + idxBytes;

const binBuf = Buffer.alloc(binLength);
let off = 0;
for (const v of vertices) { binBuf.writeFloatLE(v, off); off += 4; }
for (const i of indices)  { binBuf.writeUInt32LE(i, off); off += 4; }

// glTF JSON
const gltf = {
  asset: { version: '2.0', generator: 'facette-gamut-mesh' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{
    primitives: [{
      attributes: { POSITION: 0 },
      indices: 1,
      mode: 4, // TRIANGLES
    }],
  }],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126, // FLOAT
      count: vertCount,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
    {
      bufferView: 1,
      componentType: 5125, // UNSIGNED_INT
      count: indices.length,
      type: 'SCALAR',
    },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: vertBytes, target: 34962 }, // ARRAY_BUFFER
    { buffer: 0, byteOffset: vertBytes, byteLength: idxBytes, target: 34963 }, // ELEMENT_ARRAY_BUFFER
  ],
  buffers: [{ byteLength: binLength }],
};

const jsonStr = JSON.stringify(gltf);
// GLB requires JSON chunk to be padded to 4-byte alignment with spaces
const jsonPadded = jsonStr + ' '.repeat((4 - (jsonStr.length % 4)) % 4);
const jsonBuf = Buffer.from(jsonPadded, 'utf8');
// BIN chunk must also be 4-byte aligned (already is since f32/u32 are 4 bytes)

// GLB header (12 bytes) + JSON chunk header (8) + JSON + BIN chunk header (8) + BIN
const glbLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
const glb = Buffer.alloc(glbLength);

let p = 0;
// GLB header
glb.writeUInt32LE(0x46546C67, p); p += 4; // magic "glTF"
glb.writeUInt32LE(2, p);          p += 4; // version
glb.writeUInt32LE(glbLength, p);  p += 4; // total length

// JSON chunk
glb.writeUInt32LE(jsonBuf.length, p); p += 4; // chunk length
glb.writeUInt32LE(0x4E4F534A, p);     p += 4; // chunk type "JSON"
jsonBuf.copy(glb, p); p += jsonBuf.length;

// BIN chunk
glb.writeUInt32LE(binBuf.length, p); p += 4; // chunk length
glb.writeUInt32LE(0x004E4942, p);     p += 4; // chunk type "BIN\0"
binBuf.copy(glb, p);

writeFileSync(outPath, glb);

const fileSizeKb = (glbLength / 1024).toFixed(1);
console.log(`Written: ${outPath}`);
console.log(`  Vertices: ${vertCount} (${vertices.length} floats)`);
console.log(`  Indices:  ${indices.length / 3} triangles (${indices.length} ints)`);
console.log(`  File size: ${fileSizeKb} KB`);
