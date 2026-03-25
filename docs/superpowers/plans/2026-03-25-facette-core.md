# Facette Core Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Facette perceptual color palette generation algorithm as a zero-dependency TypeScript package, fully tested with unit and integration tests.

**Architecture:** Monorepo with pnpm workspaces + Turborepo. The core package (`packages/core`) contains 17 modules following the dependency flow in the design spec. Each module depends on narrow interfaces defined in `types.ts`, with `facette.ts` as the sole composition root. TDD throughout: test first, implement second.

**Tech Stack:** TypeScript 5.x (strict), tsup (ESM+CJS build), vitest (testing), pnpm workspaces, Turborepo

**Reference docs:**
- Design spec: `docs/superpowers/specs/2026-03-25-facette-design.md`
- Algorithm spec: `Specs/Facette_algorithm_v4.4.md`

---

## File Structure

All files are created under `packages/core/src/`. Each `.ts` module has a colocated `.test.ts`.

| File | Responsibility |
|------|---------------|
| `types.ts` | All shared types + interface definitions |
| `math.ts` | Vec3/Mat3 operations |
| `color-conversion.ts` | sRGB ↔ linear RGB ↔ OKLab ↔ OKLCh + Jacobians |
| `gamut-clipping.ts` | Bottosson's gamut_clip_preserve_chroma → GamutChecker |
| `barycentric.ts` | Barycentric coordinate utilities |
| `svd.ts` | Jacobi SVD for small matrices |
| `dimensionality.ts` | SVD-based dimensionality detection |
| `convex-hull.ts` | 3D incremental convex hull |
| `seed-classification.ts` | hull-vertex / boundary / interior classification |
| `atlas.ts` | Face atlas → AtlasQuery |
| `line-segment.ts` | 1D MotionConstraint |
| `surface-navigation.ts` | 2D/3D MotionConstraint |
| `warp.ts` | Warp transform T, Jacobian J_T → WarpTransform |
| `energy.ts` | Riesz repulsion + gamut penalty → ForceComputer |
| `initialization.ts` | Greedy placement with warped area scoring |
| `optimization.ts` | Main optimization loop generator |
| `output.ts` | Final gamut clip → sRGB conversion |
| `facette.ts` | Composition root + public API |
| `index.ts` | Re-exports |
| `__integration__/benchmarks.test.ts` | Section 12 validation benchmarks |

---

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json` (workspace root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/vitest.config.ts`

- [ ] **Step 1: Create workspace root `package.json`**

```json
{
  "name": "facette-monorepo",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "dev": "turbo dev",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5.7"
  },
  "packageManager": "pnpm@9.15.0"
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.turbo/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 6: Create `.npmrc`**

```
auto-install-peers=true
```

- [ ] **Step 7: Create `packages/core/package.json`**

```json
{
  "name": "facette",
  "version": "0.1.0",
  "description": "Perceptual color palette generation via particle repulsion on convex hulls in OKLab space",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "dev": "tsup --watch"
  },
  "devDependencies": {
    "tsup": "^8",
    "typescript": "^5.7",
    "vitest": "^3"
  },
  "license": "MIT"
}
```

- [ ] **Step 8: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 9: Create `packages/core/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

- [ ] **Step 10: Create `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 11: Install dependencies and verify**

```bash
cd C:/Users/yves-/code/Facette && pnpm install
```

Expected: lockfile created, no errors.

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat: scaffold monorepo with pnpm workspaces + Turborepo + tsup + vitest"
```

---

### Task 2: Types Module

**Files:**
- Create: `packages/core/src/types.ts`

This module has no tests — it contains only type definitions and interfaces. It is tested transitively by every other module's tests.

- [ ] **Step 1: Write `types.ts`**

Write all types and interfaces exactly as specified in design spec Section 2 (Data Types + Narrow Interfaces + Optimization Trace Types). This includes:

```ts
// === Primitives ===
export type Vec3 = [number, number, number];
export interface OKLab { L: number; a: number; b: number }
export interface OKLCh { L: number; C: number; h: number }
export interface LinRGB { r: number; g: number; b: number }
export interface Barycentric { w0: number; w1: number; w2: number }
export type EdgeKey = string;

// === Geometry ===
export interface HullGeometry {
  kind: 'hull';
  vertices: OKLab[];
  faces: Array<{ vertexIndices: [number, number, number] }>;
  adjacency: Map<EdgeKey, [number, number]>;  // edge → [faceA, faceB]
}
export interface LineGeometry {
  kind: 'line';
  start: OKLab;
  end: OKLab;
}
export type Geometry = HullGeometry | LineGeometry;

// === Particles ===
export type Particle =
  | { kind: 'pinned-vertex';   position: OKLab; vertexIndex: number }
  | { kind: 'pinned-boundary'; position: OKLab; faceIndex: number; bary: Barycentric }
  | { kind: 'pinned-interior'; position: OKLab }
  | { kind: 'free';            position: OKLab; faceIndex: number; bary: Barycentric }
  | { kind: 'pinned-endpoint'; position: OKLab; t: number }
  | { kind: 'free-1d';         position: OKLab; t: number };

// === Interfaces (ISP) ===
// WarpTransform, AtlasQuery, MotionConstraint,
// GamutChecker, AnnealingSchedule — all exactly as in design spec.
//
// ForceComputer — extended from design spec to also return energy:
export interface ForceComputer {
  /** Returns forces on each particle AND the total scalar energy.
   *  Forces and energy share the pairwise distance computation (no waste). */
  computeForcesAndEnergy(
    particles: readonly Particle[],
    p: number,
    kappa: number,
  ): { forces: Vec3[]; energy: number };
}

// === Trace Types ===
// OptimizationFrame, OptimizationTrace — as in design spec.

// === Public API Types ===
export interface PaletteOptions { vividness?: number }
export interface PaletteResult {
  colors: string[];
  seeds: string[];
  metadata: { minDeltaE: number; iterations: number; clippedCount: number };
}
export interface PaletteStepper {
  geometry: Geometry;
  seeds: Particle[];
  frames(): Generator<OptimizationFrame>;
  run(): OptimizationTrace;
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts && git commit -m "feat(core): add all type definitions and interface contracts"
```

---

### Task 3: Math Module

**Files:**
- Create: `packages/core/src/math.ts`
- Create: `packages/core/src/math.test.ts`

Pure Vec3 and Mat3 operations. No imports except types.

- [ ] **Step 1: Write failing tests in `math.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { vec3Add, vec3Sub, vec3Scale, vec3Dot, vec3Cross, vec3Norm, vec3Normalize, mat3MulVec3, mat3Transpose } from './math';

describe('vec3 operations', () => {
  it('adds two vectors', () => {
    expect(vec3Add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
  });

  it('subtracts two vectors', () => {
    expect(vec3Sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
  });

  it('scales a vector', () => {
    expect(vec3Scale([1, 2, 3], 2)).toEqual([2, 4, 6]);
  });

  it('computes dot product', () => {
    expect(vec3Dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(vec3Dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it('computes cross product', () => {
    expect(vec3Cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(vec3Cross([0, 1, 0], [1, 0, 0])).toEqual([0, 0, -1]);
  });

  it('computes norm', () => {
    expect(vec3Norm([3, 4, 0])).toBe(5);
    expect(vec3Norm([0, 0, 0])).toBe(0);
  });

  it('normalizes a vector', () => {
    const n = vec3Normalize([3, 4, 0]);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
    expect(n[2]).toBeCloseTo(0);
  });

  it('returns zero vector when normalizing zero vector', () => {
    expect(vec3Normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('mat3 operations', () => {
  it('multiplies matrix by vector', () => {
    // Identity matrix
    const I = [[1,0,0],[0,1,0],[0,0,1]] as const;
    expect(mat3MulVec3(I as any, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('transposes a matrix', () => {
    const M = [[1,2,3],[4,5,6],[7,8,9]];
    const T = mat3Transpose(M as any);
    expect(T).toEqual([[1,4,7],[2,5,8],[3,6,9]]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/math.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `math.ts`**

```ts
import type { Vec3 } from './types';

export type Mat3 = [Vec3, Vec3, Vec3];

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}
export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function vec3Norm(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
export function vec3Normalize(v: Vec3): Vec3 {
  const n = vec3Norm(v);
  return n === 0 ? [0, 0, 0] : vec3Scale(v, 1 / n);
}
export function mat3MulVec3(m: Mat3, v: Vec3): Vec3 {
  return [vec3Dot(m[0], v), vec3Dot(m[1], v), vec3Dot(m[2], v)];
}
export function mat3Transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/math.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/math.ts packages/core/src/math.test.ts && git commit -m "feat(core): add Vec3/Mat3 math utilities with tests"
```

---

### Task 4: Color Conversion Module

**Files:**
- Create: `packages/core/src/color-conversion.ts`
- Create: `packages/core/src/color-conversion.test.ts`

Implements sRGB ↔ linear RGB ↔ OKLab ↔ OKLCh conversions and the OKLab→linear RGB Jacobian. Reference: Ottosson's OKLab (https://bottosson.github.io/posts/oklab/) and algorithm spec Section 2 and 5.2a.

- [ ] **Step 1: Write failing tests**

Tests use known color values:
- Pure white `#ffffff` → OKLab `{L: 1, a: 0, b: 0}`
- Pure black `#000000` → OKLab `{L: 0, a: 0, b: 0}`
- sRGB red `#ff0000` → OKLab approx `{L: 0.6279, a: 0.2248, b: 0.1258}`
- Round-trip: any hex → OKLab → hex should match (within rounding)
- OKLab→OKLCh: `{L: 0.5, a: 0.1, b: 0}` → `{L: 0.5, C: 0.1, h: 0}`
- OKLCh→OKLab round-trip
- Jacobian: verify via finite-difference (perturb each OKLab component by ε=1e-6, compare with analytic Jacobian column)

```ts
import { describe, it, expect } from 'vitest';
import {
  hexToOklab, oklabToHex,
  srgbToLinear, linearToSrgb,
  linearRgbToOklab, oklabToLinearRgb,
  oklabToOklch, oklchToOklab,
  oklabToLinearRgbJacobian,
} from './color-conversion';

describe('sRGB gamma', () => {
  it('round-trips srgbToLinear/linearToSrgb', () => {
    for (const v of [0, 0.04045, 0.5, 1.0]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 10);
    }
  });
});

describe('OKLab conversion', () => {
  it('converts white correctly', () => {
    const lab = hexToOklab('#ffffff');
    expect(lab.L).toBeCloseTo(1.0, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  it('converts black correctly', () => {
    const lab = hexToOklab('#000000');
    expect(lab.L).toBeCloseTo(0, 3);
  });

  it('converts red approximately', () => {
    const lab = hexToOklab('#ff0000');
    expect(lab.L).toBeCloseTo(0.6279, 2);
    expect(lab.a).toBeCloseTo(0.2248, 2);
    expect(lab.b).toBeCloseTo(0.1258, 2);
  });

  it('round-trips hex→OKLab→hex', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#808080', '#ffaa33']) {
      expect(oklabToHex(hexToOklab(hex))).toBe(hex);
    }
  });
});

describe('OKLCh conversion', () => {
  it('converts OKLab to OKLCh', () => {
    const lch = oklabToOklch({ L: 0.5, a: 0.1, b: 0 });
    expect(lch.L).toBeCloseTo(0.5);
    expect(lch.C).toBeCloseTo(0.1);
    expect(lch.h).toBeCloseTo(0);
  });

  it('round-trips OKLab↔OKLCh', () => {
    const original = { L: 0.7, a: -0.05, b: 0.1 };
    const back = oklchToOklab(oklabToOklch(original));
    expect(back.L).toBeCloseTo(original.L);
    expect(back.a).toBeCloseTo(original.a);
    expect(back.b).toBeCloseTo(original.b);
  });

  it('handles zero chroma (gray)', () => {
    const lch = oklabToOklch({ L: 0.5, a: 0, b: 0 });
    expect(lch.C).toBeCloseTo(0);
    // h is arbitrary for gray, just verify no NaN
    expect(Number.isFinite(lch.h)).toBe(true);
  });
});

describe('Jacobian', () => {
  it('matches finite-difference approximation', () => {
    const pos = { L: 0.7, a: 0.1, b: -0.05 };
    const J = oklabToLinearRgbJacobian(pos);
    const eps = 1e-6;
    const rgb0 = oklabToLinearRgb(pos);

    // Perturb L
    const rgbdL = oklabToLinearRgb({ L: pos.L + eps, a: pos.a, b: pos.b });
    expect(J[0][0]).toBeCloseTo((rgbdL.r - rgb0.r) / eps, 3);
    expect(J[1][0]).toBeCloseTo((rgbdL.g - rgb0.g) / eps, 3);
    expect(J[2][0]).toBeCloseTo((rgbdL.b - rgb0.b) / eps, 3);

    // Perturb a
    const rgbda = oklabToLinearRgb({ L: pos.L, a: pos.a + eps, b: pos.b });
    expect(J[0][1]).toBeCloseTo((rgbda.r - rgb0.r) / eps, 3);

    // Perturb b
    const rgbdb = oklabToLinearRgb({ L: pos.L, a: pos.a, b: pos.b + eps });
    expect(J[0][2]).toBeCloseTo((rgbdb.r - rgb0.r) / eps, 3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/color-conversion.test.ts
```

- [ ] **Step 3: Implement `color-conversion.ts`**

Implement using Ottosson's reference:
- `srgbToLinear(c)` / `linearToSrgb(c)`: sRGB gamma transfer functions
- `linearRgbToOklab({r,g,b})`: linear RGB → LMS (M1 matrix) → cube root → OKLab (M2 matrix)
- `oklabToLinearRgb({L,a,b})`: OKLab → LMS (M2⁻¹) → cube → linear RGB (M1⁻¹)
- `hexToOklab(hex)` / `oklabToHex(lab)`: convenience wrappers parsing/formatting `#rrggbb`
- `oklabToOklch({L,a,b})`: `C = sqrt(a²+b²)`, `h = atan2(b,a)`
- `oklchToOklab({L,C,h})`: `a = C*cos(h)`, `b = C*sin(h)`
- `oklabToLinearRgbJacobian(pos)`: J = M1⁻¹ · diag(3l̂², 3m̂², 3ŝ²) · M2⁻¹ where (l̂,m̂,ŝ) = M2⁻¹ · (L,a,b)

The M1 and M2 matrices are constant 3×3 matrices from Ottosson's reference. Precompute M1⁻¹ and M2⁻¹.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/color-conversion.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/color-conversion.ts packages/core/src/color-conversion.test.ts && git commit -m "feat(core): add sRGB/linear RGB/OKLab/OKLCh conversions with Jacobian"
```

---

### Task 5: Gamut Clipping Module

**Files:**
- Create: `packages/core/src/gamut-clipping.ts`
- Create: `packages/core/src/gamut-clipping.test.ts`

Implements GamutChecker interface: `isInGamut`, `clipPreserveChroma`, `penaltyGradient` (quadratic penalty on out-of-range linear RGB channels, chain-ruled through OKLab→linear RGB Jacobian). Reference: algorithm spec Sections 5.2 and 9.1.

Note: `clipPreserveChroma` preserves hue (h) and lightness (L) as stated in the algorithm spec Section 9.1, reducing only chroma until in-gamut. This is a binary search on chroma at fixed h and L — simpler than Bottosson's full `gamut_clip_preserve_chroma` (which may adjust L). The name follows the algorithm spec's description of the behavior.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { createGamutChecker } from './gamut-clipping';

describe('GamutChecker', () => {
  const checker = createGamutChecker();

  describe('isInGamut', () => {
    it('returns true for in-gamut colors', () => {
      // mid-gray is in gamut
      expect(checker.isInGamut({ L: 0.5, a: 0, b: 0 })).toBe(true);
      // white
      expect(checker.isInGamut({ L: 1, a: 0, b: 0 })).toBe(true);
    });

    it('returns false for out-of-gamut colors', () => {
      // extreme chroma at mid-lightness
      expect(checker.isInGamut({ L: 0.5, a: 0.4, b: 0.4 })).toBe(false);
    });
  });

  describe('clipPreserveChroma', () => {
    it('returns in-gamut colors unchanged', () => {
      const color = { L: 0.5, a: 0, b: 0 };
      const clipped = checker.clipPreserveChroma(color);
      expect(clipped.L).toBeCloseTo(color.L);
      expect(clipped.a).toBeCloseTo(color.a);
      expect(clipped.b).toBeCloseTo(color.b);
    });

    it('preserves hue and lightness for out-of-gamut', () => {
      const color = { L: 0.5, a: 0.3, b: 0.3 };
      const clipped = checker.clipPreserveChroma(color);
      // hue preserved
      const origHue = Math.atan2(color.b, color.a);
      const clipHue = Math.atan2(clipped.b, clipped.a);
      expect(clipHue).toBeCloseTo(origHue, 3);
      // lightness preserved
      expect(clipped.L).toBeCloseTo(color.L, 3);
      // chroma reduced
      const origC = Math.sqrt(color.a ** 2 + color.b ** 2);
      const clipC = Math.sqrt(clipped.a ** 2 + clipped.b ** 2);
      expect(clipC).toBeLessThanOrEqual(origC + 1e-6);
      // result is in gamut
      expect(checker.isInGamut(clipped)).toBe(true);
    });
  });

  describe('penaltyGradient', () => {
    it('returns zero gradient for in-gamut colors', () => {
      const grad = checker.penaltyGradient({ L: 0.5, a: 0, b: 0 });
      expect(grad[0]).toBeCloseTo(0);
      expect(grad[1]).toBeCloseTo(0);
      expect(grad[2]).toBeCloseTo(0);
    });

    it('returns non-zero gradient for out-of-gamut colors', () => {
      const grad = checker.penaltyGradient({ L: 0.5, a: 0.4, b: 0.4 });
      const magnitude = Math.sqrt(grad[0] ** 2 + grad[1] ** 2 + grad[2] ** 2);
      expect(magnitude).toBeGreaterThan(0);
    });

    it('matches finite-difference approximation', () => {
      // Pick a point outside gamut
      const pos = { L: 0.5, a: 0.3, b: 0.2 };
      const grad = checker.penaltyGradient(pos);
      const eps = 1e-6;

      // Helper: compute scalar penalty (sum of quadratic channel violations)
      // We import oklabToLinearRgb for this
      const { oklabToLinearRgb } = require('./color-conversion');
      const penalty = (p: { L: number; a: number; b: number }): number => {
        const rgb = oklabToLinearRgb(p);
        let pen = 0;
        for (const ch of [rgb.r, rgb.g, rgb.b]) {
          if (ch < 0) pen += ch * ch;
          if (ch > 1) pen += (ch - 1) * (ch - 1);
        }
        return pen;
      };

      // Finite difference for each OKLab component
      const p0 = penalty(pos);
      const fdL = (penalty({ L: pos.L + eps, a: pos.a, b: pos.b }) - p0) / eps;
      const fda = (penalty({ L: pos.L, a: pos.a + eps, b: pos.b }) - p0) / eps;
      const fdb = (penalty({ L: pos.L, a: pos.a, b: pos.b + eps }) - p0) / eps;

      expect(grad[0]).toBeCloseTo(fdL, 3);
      expect(grad[1]).toBeCloseTo(fda, 3);
      expect(grad[2]).toBeCloseTo(fdb, 3);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/gamut-clipping.test.ts
```

- [ ] **Step 3: Implement `gamut-clipping.ts`**

Factory function `createGamutChecker()` returns a `GamutChecker`:
- `isInGamut`: convert to linear RGB, check all channels in [0, 1]
- `clipPreserveChroma`: Bottosson's algorithm — binary search on chroma at fixed hue and L to find maximum in-gamut chroma. Reference: https://bottosson.github.io/posts/gamutclipping/
- `penaltyGradient`: compute κ · ∇E_gamut in OKLab:
  1. Convert to linear RGB
  2. Compute per-channel penalty derivatives: `dP/dR = 2·max(0,-R) · (-1) + 2·max(0,R-1) · 1` (and similarly for G, B)
  3. Chain-rule through Jacobian: `∇_OKLab = J^T · ∇_linRGB`

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/gamut-clipping.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/gamut-clipping.ts packages/core/src/gamut-clipping.test.ts && git commit -m "feat(core): add GamutChecker with Bottosson clip and penalty gradient"
```

---

### Task 6: Barycentric Module

**Files:**
- Create: `packages/core/src/barycentric.ts`
- Create: `packages/core/src/barycentric.test.ts`

Utility functions for barycentric coordinates on triangles in 3D.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computeBarycentric, interpolate, isValid, clampAndRenormalize } from './barycentric';
import type { OKLab, Barycentric } from './types';

describe('barycentric', () => {
  // Triangle: v0=(0,0,0), v1=(1,0,0), v2=(0,1,0)
  const v0: OKLab = { L: 0, a: 0, b: 0 };
  const v1: OKLab = { L: 1, a: 0, b: 0 };
  const v2: OKLab = { L: 0, a: 1, b: 0 };

  it('vertex maps to (1,0,0)', () => {
    const b = computeBarycentric(v0, v0, v1, v2);
    expect(b.w0).toBeCloseTo(1);
    expect(b.w1).toBeCloseTo(0);
    expect(b.w2).toBeCloseTo(0);
  });

  it('centroid maps to (1/3, 1/3, 1/3)', () => {
    const centroid: OKLab = { L: 1/3, a: 1/3, b: 0 };
    const b = computeBarycentric(centroid, v0, v1, v2);
    expect(b.w0).toBeCloseTo(1/3);
    expect(b.w1).toBeCloseTo(1/3);
    expect(b.w2).toBeCloseTo(1/3);
  });

  it('interpolate reconstructs the point', () => {
    const bary: Barycentric = { w0: 0.5, w1: 0.3, w2: 0.2 };
    const p = interpolate(bary, v0, v1, v2);
    expect(p.L).toBeCloseTo(0.3);
    expect(p.a).toBeCloseTo(0.2);
  });

  it('isValid returns true for valid coords', () => {
    expect(isValid({ w0: 0.5, w1: 0.3, w2: 0.2 })).toBe(true);
  });

  it('isValid returns false for negative coord', () => {
    expect(isValid({ w0: -0.1, w1: 0.5, w2: 0.6 })).toBe(false);
  });

  it('clampAndRenormalize fixes negative coords', () => {
    const b = clampAndRenormalize({ w0: -0.1, w1: 0.6, w2: 0.5 });
    expect(b.w0).toBeGreaterThanOrEqual(0);
    expect(b.w0 + b.w1 + b.w2).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/barycentric.test.ts
```

- [ ] **Step 3: Implement `barycentric.ts`**

- `computeBarycentric(p, v0, v1, v2)`: solve the 3×3 system using Cramer's rule (project onto the triangle's plane)
- `interpolate(bary, v0, v1, v2)`: `w0*v0 + w1*v1 + w2*v2`
- `isValid(bary)`: all weights ≥ 0 and sum ≈ 1
- `clampAndRenormalize(bary)`: clamp negatives to 0, renormalize so sum = 1

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/barycentric.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/barycentric.ts packages/core/src/barycentric.test.ts && git commit -m "feat(core): add barycentric coordinate utilities"
```

---

### Task 7: SVD Module

**Files:**
- Create: `packages/core/src/svd.ts`
- Create: `packages/core/src/svd.test.ts`

Jacobi SVD for small matrices (up to 8×3). Returns U, Σ (as array of singular values), V. Reference: algorithm spec Section 3.1.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { svd } from './svd';

describe('SVD', () => {
  it('reconstructs a known 3×3 matrix', () => {
    const A = [[1, 2, 3], [4, 5, 6], [7, 8, 10]];
    const { U, S, V } = svd(A);
    // Reconstruct: U * diag(S) * V^T ≈ A
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) {
          sum += U[i][k] * S[k] * V[j][k];
        }
        expect(sum).toBeCloseTo(A[i][j], 6);
      }
    }
  });

  it('returns sorted singular values (descending)', () => {
    const A = [[1, 0, 0], [0, 3, 0], [0, 0, 2]];
    const { S } = svd(A);
    expect(S[0]).toBeGreaterThanOrEqual(S[1]);
    expect(S[1]).toBeGreaterThanOrEqual(S[2]);
  });

  it('handles rank-deficient matrix (rank 2)', () => {
    // Row 3 = Row 1 + Row 2
    const A = [[1, 0, 0], [0, 1, 0], [1, 1, 0]];
    const { S } = svd(A);
    expect(S[2]).toBeCloseTo(0, 6);
  });

  it('handles 2×3 matrix', () => {
    const A = [[1, 2, 3], [4, 5, 6]];
    const { U, S, V } = svd(A);
    expect(S.length).toBe(2);
    // Reconstruct
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let k = 0; k < 2; k++) {
          sum += U[i][k] * S[k] * V[j][k];
        }
        expect(sum).toBeCloseTo(A[i][j], 6);
      }
    }
  });

  it('handles 1×3 matrix', () => {
    const A = [[3, 4, 0]];
    const { S } = svd(A);
    expect(S[0]).toBeCloseTo(5, 6);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/svd.test.ts
```

- [ ] **Step 3: Implement `svd.ts`**

Implement one-sided Jacobi SVD:
1. Compute A^T A (3×3 symmetric matrix, always — A is at most 8×3)
2. Eigendecompose A^T A via Jacobi rotations to get V and Σ²
3. Compute U = A V Σ⁻¹
4. Sort singular values descending, reorder U and V columns accordingly

Export: `svd(A: number[][]): { U: number[][], S: number[], V: number[][] }`

- [ ] **Step 4: Run, verify pass**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/svd.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/svd.ts packages/core/src/svd.test.ts && git commit -m "feat(core): add Jacobi SVD for small matrices"
```

---

### Task 8: Dimensionality Detection Module

**Files:**
- Create: `packages/core/src/dimensionality.ts`
- Create: `packages/core/src/dimensionality.test.ts`

Reference: algorithm spec Section 3.1. Computes SVD of mean-centered seed cloud, counts singular values above τ_dim = 1e-4 · σ₁.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { detectDimensionality } from './dimensionality';
import type { OKLab } from './types';

describe('dimensionality detection', () => {
  it('returns 0 for identical points', () => {
    const seeds: OKLab[] = [
      { L: 0.5, a: 0.1, b: 0.1 },
      { L: 0.5, a: 0.1, b: 0.1 },
    ];
    expect(detectDimensionality(seeds).dimension).toBe(0);
  });

  it('returns 1 for collinear points', () => {
    const seeds: OKLab[] = [
      { L: 0.2, a: 0, b: 0 },
      { L: 0.8, a: 0, b: 0 },
    ];
    expect(detectDimensionality(seeds).dimension).toBe(1);
  });

  it('returns 2 for coplanar points', () => {
    const seeds: OKLab[] = [
      { L: 0, a: 0, b: 0 },
      { L: 1, a: 0, b: 0 },
      { L: 0, a: 1, b: 0 },
    ];
    expect(detectDimensionality(seeds).dimension).toBe(2);
  });

  it('returns 3 for full 3D points', () => {
    const seeds: OKLab[] = [
      { L: 0, a: 0, b: 0 },
      { L: 1, a: 0, b: 0 },
      { L: 0, a: 1, b: 0 },
      { L: 0, a: 0, b: 1 },
    ];
    expect(detectDimensionality(seeds).dimension).toBe(3);
  });

  it('returns 2 for near-coplanar points', () => {
    const seeds: OKLab[] = [
      { L: 0, a: 0, b: 0 },
      { L: 1, a: 0, b: 0 },
      { L: 0, a: 1, b: 0 },
      { L: 0.5, a: 0.5, b: 1e-8 }, // barely off the plane
    ];
    expect(detectDimensionality(seeds).dimension).toBe(2);
  });
});
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `dimensionality.ts`**

```ts
export function detectDimensionality(seeds: OKLab[]): {
  dimension: number;
  singularValues: number[];
  principalAxes: number[][];
} {
  // 1. Mean-center
  // 2. Build N×3 design matrix
  // 3. SVD
  // 4. Count singular values ≥ τ_dim = 1e-4 * σ₁
  // 5. Return dimension + singular values + principal axes (V columns)
}
```

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dimensionality.ts packages/core/src/dimensionality.test.ts && git commit -m "feat(core): add SVD-based dimensionality detection"
```

---

### Task 9: Convex Hull Module

**Files:**
- Create: `packages/core/src/convex-hull.ts`
- Create: `packages/core/src/convex-hull.test.ts`

3D convex hull for small point sets. Called only when dimensionality ≥ 2 (the composition root in `facette.ts` routes dim=1 to `LineConstraint` before ever calling this). For dim=2 (coplanar input), constructs a flat polygon triangulated into faces. Returns HullGeometry with vertices, face indices, and adjacency map. Reference: algorithm spec Section 3.1.

- [ ] **Step 1: Write failing tests**

Test cases:
- Tetrahedron (4 non-coplanar points) → 4 triangular faces
- Cube corners (8 points) → valid closed hull (12 triangular faces). Don't assert specific triangulation; instead verify all input points lie on or inside hull, face count = 12, and manifold is closed.
- Coplanar points (dim=2) → flat polygon triangulated into triangular faces (e.g., 4 coplanar points → 2-4 triangular faces depending on triangulation)
- All face normals point outward (orientation check: normal · (face_centroid - hull_centroid) > 0)
- All input points are inside or on the hull (convexity verification)
- Adjacency map: each edge maps to exactly 2 face indices (closed manifold for 3D), or 1 face for boundary edges (2D flat polygon)

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `convex-hull.ts`**

Incremental 3D convex hull algorithm:
1. Start with initial tetrahedron from 4 non-coplanar points
2. For each remaining point, find visible faces, remove them, build new faces
3. Build adjacency map using EdgeKey format `${min(i,j)}-${max(i,j)}`
4. Ensure consistent outward-pointing normals

Export: `buildConvexHull(points: OKLab[]): HullGeometry`

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/convex-hull.ts packages/core/src/convex-hull.test.ts && git commit -m "feat(core): add 3D incremental convex hull"
```

---

### Task 10: Seed Classification Module

**Files:**
- Create: `packages/core/src/seed-classification.ts`
- Create: `packages/core/src/seed-classification.test.ts`

Classifies seeds into pinned-vertex, pinned-boundary, and pinned-interior. Reference: algorithm spec Section 3.1.1.

- [ ] **Step 1: Write failing tests**

Test cases:
- Vertex seeds (on hull vertex) → `pinned-vertex`
- Seeds on face interior → `pinned-boundary` with correct faceIndex and bary
- Seeds on edge between two faces → `pinned-boundary`
- Seeds strictly inside hull → `pinned-interior`
- 1D case: endpoint seeds → `pinned-endpoint`

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement**

`classifySeeds(seeds: OKLab[], geometry: Geometry): Particle[]`

For hull geometry: test each seed against hull vertices (distance < ε), then against each face (barycentric coords valid + plane distance < 1e-6), then classify remainder as interior.

For line geometry: project onto segment, classify as endpoint (t ≈ 0 or ≈ 1) or boundary.

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/seed-classification.ts packages/core/src/seed-classification.test.ts && git commit -m "feat(core): add seed classification (vertex/boundary/interior)"
```

---

### Task 11: Atlas Module

**Files:**
- Create: `packages/core/src/atlas.ts`
- Create: `packages/core/src/atlas.test.ts`

Builds the face atlas from HullGeometry and implements AtlasQuery. Precomputes orthonormal bases, face areas, degeneracy flags. Reference: algorithm spec Sections 3.2.2, 3.2.3, 3.2.4, 6.2.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { buildAtlas } from './atlas';
import type { HullGeometry } from './types';

describe('atlas', () => {
  // Simple tetrahedron
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
    adjacency: new Map(), // will be built by hull construction
  };

  it('computes orthonormal basis for each face', () => {
    const atlas = buildAtlas(hull);
    const basis = atlas.getFaceBasis(0);
    // u and v are orthogonal
    const dot = basis.u[0]*basis.v[0] + basis.u[1]*basis.v[1] + basis.u[2]*basis.v[2];
    expect(dot).toBeCloseTo(0, 6);
    // u and v are unit length
    const uLen = Math.sqrt(basis.u[0]**2 + basis.u[1]**2 + basis.u[2]**2);
    expect(uLen).toBeCloseTo(1, 6);
  });

  it('computes non-zero face area', () => {
    const atlas = buildAtlas(hull);
    expect(atlas.getFaceArea(0)).toBeGreaterThan(0);
  });

  it('flags degenerate faces', () => {
    // Create hull with a sliver face (area < 1e-8)
    const degenerateHull: HullGeometry = {
      kind: 'hull',
      vertices: [
        { L: 0, a: 0, b: 0 },
        { L: 1, a: 0, b: 0 },
        { L: 0.5, a: 1e-12, b: 0 }, // nearly collinear
        { L: 0, a: 0, b: 1 },
      ],
      faces: [{ vertexIndices: [0, 1, 2] }, { vertexIndices: [0, 1, 3] },
              { vertexIndices: [0, 2, 3] }, { vertexIndices: [1, 2, 3] }],
      adjacency: new Map(),
    };
    const atlas = buildAtlas(degenerateHull);
    expect(atlas.isDegenerate(0)).toBe(true);
  });

  it('returns correct face count', () => {
    const atlas = buildAtlas(hull);
    expect(atlas.faceCount()).toBe(4);
  });
});
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `atlas.ts`**

`buildAtlas(hull: HullGeometry): AtlasQuery`

For each face:
1. Get vertices v0, v1, v2
2. Compute u = normalize(v1 - v0)
3. Compute w = (v2 - v0) - dot(v2-v0, u)*u; v = normalize(w)
4. normal = cross(u, v)
5. area = 0.5 * |cross(v1-v0, v2-v0)|
6. degenerate = area < 1e-8

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/atlas.ts packages/core/src/atlas.test.ts && git commit -m "feat(core): add face atlas implementing AtlasQuery"
```

---

### Task 12: Line Segment Module

**Files:**
- Create: `packages/core/src/line-segment.ts`
- Create: `packages/core/src/line-segment.test.ts`

1D MotionConstraint for the line segment case. Reference: algorithm spec Section 3.2.1.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { createLineConstraint } from './line-segment';
import type { Particle, OKLab } from './types';

describe('LineConstraint', () => {
  const start: OKLab = { L: 0.2, a: -0.1, b: 0 };
  const end: OKLab = { L: 0.8, a: 0.1, b: 0 };
  const constraint = createLineConstraint(start, end);

  it('projects force onto segment direction', () => {
    const particle: Particle = { kind: 'free-1d', position: { L: 0.5, a: 0, b: 0 }, t: 0.5 };
    // Force perpendicular to segment should project to zero
    const perpForce = [0, 0, 1] as [number, number, number];
    const projected = constraint.projectToTangent(perpForce, particle);
    expect(Math.abs(projected[0]) + Math.abs(projected[1]) + Math.abs(projected[2])).toBeCloseTo(0, 6);
  });

  it('projects force along segment direction', () => {
    const particle: Particle = { kind: 'free-1d', position: { L: 0.5, a: 0, b: 0 }, t: 0.5 };
    // Force along segment direction should be preserved
    const alongForce = [0.6, 0.2, 0] as [number, number, number]; // parallel to (end - start)
    const projected = constraint.projectToTangent(alongForce, particle);
    const mag = Math.sqrt(projected[0]**2 + projected[1]**2 + projected[2]**2);
    expect(mag).toBeGreaterThan(0);
  });

  it('clamps displacement to [0, 1]', () => {
    // Particle near end, large positive displacement should clamp to t=1
    const particle: Particle = { kind: 'free-1d', position: end, t: 0.95 };
    const bigDisplacement = [0.6, 0.2, 0] as [number, number, number];
    const result = constraint.applyDisplacement(particle, bigDisplacement);
    expect(result.kind).toBe('free-1d');
    if (result.kind === 'free-1d') {
      expect(result.t).toBeLessThanOrEqual(1);
      expect(result.t).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not move pinned-endpoint particles', () => {
    const particle: Particle = { kind: 'pinned-endpoint', position: start, t: 0 };
    const result = constraint.applyDisplacement(particle, [1, 1, 1]);
    expect(result.kind).toBe('pinned-endpoint');
    if (result.kind === 'pinned-endpoint') {
      expect(result.t).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `line-segment.ts`**

`createLineConstraint(start: OKLab, end: OKLab): MotionConstraint`

- `projectToTangent`: project force onto the normalized segment direction `d = normalize(end - start)`
- `applyDisplacement`: convert displacement to Δt = dot(displacement, d) / |end - start|, update t, clamp to [0, 1], recompute position as `lerp(start, end, t)`
- Pinned particles return unchanged

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/line-segment.ts packages/core/src/line-segment.test.ts && git commit -m "feat(core): add 1D line segment MotionConstraint"
```

---

### Task 13: Surface Navigation Module

**Files:**
- Create: `packages/core/src/surface-navigation.ts`
- Create: `packages/core/src/surface-navigation.test.ts`

2D/3D MotionConstraint: tangent projection, barycentric update, edge crossing with face transitions. Reference: algorithm spec Sections 6.2–6.4.

- [ ] **Step 1: Write failing tests**

Test cases:
- Force normal to face → tangent projection yields zero
- Force in face plane → tangent projection preserves it
- Small displacement within face → barycentric update stays valid
- Displacement past face edge → edge crossing transitions to adjacent face
- Displacement past hull boundary → clamps to boundary edge
- Pinned particles (vertex, boundary) are not moved

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `surface-navigation.ts`**

`createSurfaceConstraint(atlas: AtlasQuery, hull: HullGeometry): MotionConstraint`

- `projectToTangent(force, particle)`: use `atlas.getFaceBasis(faceIndex)` to project force into tangent plane
- `applyDisplacement(particle, displacement)`:
  1. Convert displacement to barycentric delta
  2. Update barycentric coords
  3. If any coord < 0: clamp, find crossed edge, look up adjacent face via `atlas.getAdjacentFace`
  4. If adjacent face exists: transform to new face's barycentric coords, continue
  5. If no adjacent face (boundary): clamp to boundary edge

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/surface-navigation.ts packages/core/src/surface-navigation.test.ts && git commit -m "feat(core): add surface MotionConstraint with edge crossing"
```

---

### Task 14: Warp Module

**Files:**
- Create: `packages/core/src/warp.ts`
- Create: `packages/core/src/warp.test.ts`

Implements WarpTransform: f(r) = r²/(r+r_s), coordinate transform T, Jacobian J_T, warped distance. Reference: algorithm spec Sections 4.2–4.8 and 8.1.1.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { createWarpTransform } from './warp';

describe('WarpTransform', () => {
  const warp = createWarpTransform(0.04); // r_s = 0.04

  describe('warping function f(r)', () => {
    it('f(0) = 0', () => {
      const warped = warp.toWarped({ L: 0.5, a: 0, b: 0 });
      expect(warped.a).toBeCloseTo(0);
      expect(warped.b).toBeCloseTo(0);
    });

    it('preserves L', () => {
      const warped = warp.toWarped({ L: 0.7, a: 0.1, b: 0.05 });
      expect(warped.L).toBeCloseTo(0.7);
    });

    it('contracts low chroma (f(r) < r for small r)', () => {
      const pos = { L: 0.5, a: 0.01, b: 0 };
      const warped = warp.toWarped(pos);
      const originalR = 0.01;
      const warpedR = Math.sqrt(warped.a ** 2 + warped.b ** 2);
      expect(warpedR).toBeLessThan(originalR);
    });

    it('approaches identity for high chroma (f(r) ≈ r for r >> r_s)', () => {
      const pos = { L: 0.5, a: 0.3, b: 0 };
      const warped = warp.toWarped(pos);
      expect(warped.a).toBeCloseTo(0.3, 1); // roughly unchanged
    });

    it('preserves hue angle', () => {
      const pos = { L: 0.5, a: 0.1, b: 0.1 };
      const warped = warp.toWarped(pos);
      const origHue = Math.atan2(pos.b, pos.a);
      const warpHue = Math.atan2(warped.b, warped.a);
      expect(warpHue).toBeCloseTo(origHue, 10);
    });
  });

  describe('round-trip', () => {
    it('toWarped → fromWarped recovers original', () => {
      const pos = { L: 0.6, a: 0.08, b: -0.03 };
      const back = warp.fromWarped(warp.toWarped(pos));
      expect(back.L).toBeCloseTo(pos.L, 8);
      expect(back.a).toBeCloseTo(pos.a, 8);
      expect(back.b).toBeCloseTo(pos.b, 8);
    });
  });

  describe('Jacobian pullback', () => {
    it('matches finite-difference', () => {
      const pos = { L: 0.6, a: 0.08, b: -0.03 };
      const eps = 1e-7;
      const w0 = warp.toWarped(pos);

      // Perturb L
      const wL = warp.toWarped({ L: pos.L + eps, a: pos.a, b: pos.b });
      // dT/dL column
      const dTdL = [(wL.L - w0.L) / eps, (wL.a - w0.a) / eps, (wL.b - w0.b) / eps];

      // Test pullback: J_T^T * gradWarped should equal finite-diff gradient
      const gradWarped = [1, 0, 0] as [number, number, number]; // unit in L direction
      const pulled = warp.pullBackGradient(pos, gradWarped);
      expect(pulled[0]).toBeCloseTo(dTdL[0] * 1, 4); // J_T^T[0,:] * gradWarped
    });

    it('returns zero chromatic block at r=0', () => {
      const gray = { L: 0.5, a: 0, b: 0 };
      const grad = warp.pullBackGradient(gray, [0, 1, 0]);
      // chromatic gradient should be zero at exact gray
      expect(grad[1]).toBeCloseTo(0);
      expect(grad[2]).toBeCloseTo(0);
    });
  });

  it('exposes r_s', () => {
    expect(warp.rs).toBe(0.04);
  });
});
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `warp.ts`**

`createWarpTransform(rs: number): WarpTransform`

- `toWarped({L, a, b})`: r = sqrt(a²+b²), f(r) = r²/(r+rs), scale = f(r)/r, return {L, a: a*scale, b: b*scale}. At r=0, return {L, 0, 0}.
- `fromWarped({L, a', b'})`: inverse of f. Given r' = sqrt(a'²+b'²), solve r²/(r+rs) = r' for r. This is a quadratic: r² - r'·r - r'·rs = 0, so r = (r' + sqrt(r'² + 4·r'·rs)) / 2.
- `pullBackGradient(pos, gradWarped)`: compute J_T analytically (Section 8.1.1 of algorithm spec), return J_T^T · gradWarped.

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/warp.ts packages/core/src/warp.test.ts && git commit -m "feat(core): add warp transform with Jacobian pullback"
```

---

### Task 15: Energy Module

**Files:**
- Create: `packages/core/src/energy.ts`
- Create: `packages/core/src/energy.test.ts`

Implements ForceComputer: Riesz repulsion in warped space + gamut penalty. Constructed with WarpTransform and GamutChecker (DIP). Reference: algorithm spec Sections 5.1–5.3 and 8.1 steps 1-8.

- [ ] **Step 1: Write failing tests**

Test cases:
- Two particles: force on each points away from the other (repulsive)
- Three particles: forces balanced by symmetry when equidistant
- Energy decreases as particles move apart
- Gamut penalty force pushes out-of-gamut toward gamut
- Gradient matches finite-difference approximation for total energy
- Pinned particles receive forces (they're used for force computation) but their forces can be discarded by caller

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `energy.ts`**

`createForceComputer(warp: WarpTransform, gamut: GamutChecker): ForceComputer`

`computeForcesAndEnergy(particles, p, kappa)`:
1. Map all particle positions to warped coordinates via `warp.toWarped`
2. Compute pairwise warped distances d_ij
3. Compute total repulsion energy: `E_rep = Σ_{i<j} 1/d_ij^p`
4. For each particle i, compute repulsion gradient in warped space: `∇_{T(xi)} E_rep = Σ_{j≠i} -p · d_ij^{-(p+2)} · (T(xi) - T(xj))`
5. Pull back to OKLab via `warp.pullBackGradient(xi, grad_warped)`
6. Compute gamut penalty: scalar `E_gamut` + gradient via `gamut.penaltyGradient(xi)`
7. Total force = -(repulsion_grad + kappa * gamut_grad)
8. Total energy = E_rep + kappa * E_gamut
9. Return `{ forces, energy }`

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/energy.ts packages/core/src/energy.test.ts && git commit -m "feat(core): add Riesz repulsion + gamut penalty ForceComputer"
```

---

### Task 16: Initialization Module

**Files:**
- Create: `packages/core/src/initialization.ts`
- Create: `packages/core/src/initialization.test.ts`

Greedy placement with warped area scoring. Reference: algorithm spec Section 7.

- [ ] **Step 1: Write failing tests**

Test cases:
- All seeds are pinned at their correct positions
- Free particles count = N - |seeds|
- No free particle placed on a degenerate face
- Face with higher warped area gets more particles
- Gray-crossing face gets lower warped area (subdivided area captures interior contraction)
- Particles below chroma threshold receive jitter (manifold-respecting)
- 1D case: particles placed at equal parametric intervals

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `initialization.ts`**

For 1D: place at equal t intervals between endpoints.

For 2D/3D:
1. Pin seeds (already classified)
2. For each non-degenerate face, compute subdivided warped area (1 level of barycentric subdivision → 4 sub-triangles in warped space)
3. Greedy loop: select face with highest score = warped_area / (1 + particles_on_it), place particle at sampled maximin position within face (5×5 barycentric grid)
4. Apply gray jitter to particles with chroma < 1e-6

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/initialization.ts packages/core/src/initialization.test.ts && git commit -m "feat(core): add greedy initialization with warped area scoring"
```

---

### Task 17: Optimization Module

**Files:**
- Create: `packages/core/src/optimization.ts`
- Create: `packages/core/src/optimization.test.ts`

Main optimization loop as a generator. Depends only on interfaces: ForceComputer, MotionConstraint, WarpTransform, AnnealingSchedule. Reference: algorithm spec Section 8.

- [ ] **Step 1: Write failing tests**

Test cases:
- Generator yields OptimizationFrame with correct fields
- Final energy is significantly lower than initial energy (not strictly monotonic — small increases possible due to finite step sizes and piecewise-smooth surface)
- Pinned particles never move (positions unchanged across all frames)
- Free particles stay on hull surface (barycentric coords valid in every frame)
- Converges within max iterations (hard cap 2000)
- warpedPositions array matches warp.toWarped(particle.position) for each particle
- Annealing: p ramps from p_start to p_end over first ~50% of iterations
- Step size decreases geometrically

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `optimization.ts`**

```ts
export function* createOptimizationStepper(
  particles: Particle[],
  forces: ForceComputer,
  constraint: MotionConstraint,
  warp: WarpTransform,
  schedule: AnnealingSchedule,
): Generator<OptimizationFrame> {
  let prevEnergy = Infinity;
  for (let iter = 0; iter < 2000; iter++) {
    const p = schedule.getRieszExponent(iter);
    const kappa = schedule.getGamutPenaltyWeight(iter);
    const stepSize = schedule.getStepSize(iter);

    // Compute forces and energy in one pass (shared pairwise distances)
    const { forces: forceVecs, energy } = forces.computeForcesAndEnergy(particles, p, kappa);

    // Apply forces to free particles
    let maxDisplacement = 0;
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (particle.kind === 'free' || particle.kind === 'free-1d') {
        const projected = constraint.projectToTangent(forceVecs[i], particle);
        const scaled = vec3Scale(projected, stepSize);
        particles[i] = constraint.applyDisplacement(particle, scaled);
        maxDisplacement = Math.max(maxDisplacement, vec3Norm(scaled));
      }
    }

    // Compute frame metadata
    const warpedPositions = particles.map(p => warp.toWarped(p.position));
    const minDeltaE = pairwiseMinDeltaE(particles); // local helper: Euclidean in OKLab

    yield { iteration: iter, particles: [...particles], warpedPositions, energy, minDeltaE, p, stepSize };

    if (schedule.isConverged(iter, energy, prevEnergy, maxDisplacement)) break;
    prevEnergy = energy;
  }
}
```

Also implement:
- `createAnnealingSchedule(options)` returning the default AnnealingSchedule with geometric step decay and linear p ramp
- `pairwiseMinDeltaE(particles)` local helper: computes minimum Euclidean distance between all particle pairs in raw OKLab (not warped). This is the perceptual metric reported to the user.

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/optimization.ts packages/core/src/optimization.test.ts && git commit -m "feat(core): add optimization loop generator with annealing"
```

---

### Task 18: Output Module

**Files:**
- Create: `packages/core/src/output.ts`
- Create: `packages/core/src/output.test.ts`

Final gamut clip + OKLab→sRGB conversion. Reference: algorithm spec Section 9.

- [ ] **Step 1: Write failing tests**

Test cases:
- All output colors are valid 7-character hex strings matching `#[0-9a-f]{6}`
- In-gamut positions produce unchanged hex values
- Out-of-gamut positions are clipped (hue and lightness preserved)
- Returns clippedIndices correctly

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `output.ts`**

```ts
export function finalizeColors(
  particles: Particle[],
  gamut: GamutChecker,
): { colors: string[]; clippedIndices: number[] } {
  const colors: string[] = [];
  const clippedIndices: number[] = [];
  for (let i = 0; i < particles.length; i++) {
    const pos = particles[i].position;
    if (!gamut.isInGamut(pos)) {
      const clipped = gamut.clipPreserveChroma(pos);
      colors.push(oklabToHex(clipped));
      clippedIndices.push(i);
    } else {
      colors.push(oklabToHex(pos));
    }
  }
  return { colors, clippedIndices };
}
```

- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/output.ts packages/core/src/output.test.ts && git commit -m "feat(core): add final gamut clipping and sRGB output"
```

---

### Task 19: Public API (facette.ts + index.ts)

**Files:**
- Create: `packages/core/src/facette.ts`
- Create: `packages/core/src/facette.test.ts`
- Create: `packages/core/src/index.ts`

Composition root: wires all concrete implementations to interfaces. Exports `generatePalette` and `createPaletteStepper`. Reference: design spec Section 3.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { generatePalette, createPaletteStepper } from './facette';

describe('generatePalette', () => {
  it('returns correct number of colors', () => {
    const result = generatePalette(['#e63946', '#457b9d', '#1d3557'], 8);
    expect(result.colors).toHaveLength(8);
  });

  it('includes seed colors in output', () => {
    const seeds = ['#e63946', '#457b9d'];
    const result = generatePalette(seeds, 5);
    for (const seed of seeds) {
      expect(result.colors).toContain(seed);
    }
  });

  it('all colors are valid hex', () => {
    const result = generatePalette(['#ff0000', '#0000ff'], 6);
    for (const color of result.colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('metadata includes positive minDeltaE', () => {
    const result = generatePalette(['#ff0000', '#00ff00', '#0000ff'], 6);
    expect(result.metadata.minDeltaE).toBeGreaterThan(0);
  });
});

describe('input validation', () => {
  it('rejects fewer than 2 seeds', () => {
    expect(() => generatePalette(['#ff0000'], 3)).toThrow('At least 2 seed colors required');
  });

  it('rejects identical seeds', () => {
    expect(() => generatePalette(['#ff0000', '#ff0000'], 3)).toThrow('Seeds must be distinct');
  });

  it('rejects N < seed count', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00', '#0000ff'], 2)).toThrow('Palette size must be');
  });

  it('rejects invalid hex', () => {
    expect(() => generatePalette(['#ff0000', 'not-a-color'], 3)).toThrow('Invalid hex color');
  });

  it('rejects vividness above max', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0.5 })).toThrow('Vividness');
  });

  it('rejects vividness below min', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0.003 })).toThrow('Vividness');
  });

  it('accepts vividness at boundaries', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0.005 })).not.toThrow();
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0.10 })).not.toThrow();
  });

  it('accepts vividness=0 as auto', () => {
    expect(() => generatePalette(['#ff0000', '#00ff00'], 4, { vividness: 0 })).not.toThrow();
  });
});

describe('createPaletteStepper', () => {
  it('returns stepper with geometry and seeds', () => {
    const stepper = createPaletteStepper(['#ff0000', '#00ff00', '#0000ff'], 6);
    expect(stepper.geometry).toBeDefined();
    expect(stepper.seeds.length).toBeGreaterThan(0);
  });

  it('frames() yields OptimizationFrames', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const first = stepper.frames().next();
    expect(first.done).toBe(false);
    expect(first.value.iteration).toBe(0);
    expect(first.value.particles).toBeDefined();
    expect(first.value.warpedPositions).toBeDefined();
  });

  it('run() returns complete trace', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const trace = stepper.run();
    expect(trace.frames.length).toBeGreaterThan(0);
    expect(trace.finalColors).toHaveLength(4);
    expect(trace.rs).toBeGreaterThan(0);
  });

  it('frames() returns the same cached generator on repeated calls', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const gen1 = stepper.frames();
    const gen2 = stepper.frames();
    expect(gen1).toBe(gen2); // same reference
  });

  it('2-seed case produces LineGeometry', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    expect(stepper.geometry.kind).toBe('line');
  });

  it('3+ non-collinear seeds produce HullGeometry', () => {
    const stepper = createPaletteStepper(['#ff0000', '#00ff00', '#0000ff'], 6);
    expect(stepper.geometry.kind).toBe('hull');
  });
});
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement `facette.ts`**

This is the composition root. It:
1. Parses hex seeds → OKLab
2. Validates inputs
3. Detects dimensionality
4. Builds hull (or line geometry) based on dimension
5. Classifies seeds
6. Builds atlas (for 2D/3D)
7. Creates WarpTransform (auto-compute r_s from median seed chroma, or use vividness option)
8. Creates GamutChecker
9. Creates ForceComputer (injecting warp + gamut)
10. Creates MotionConstraint (LineConstraint or SurfaceConstraint)
11. Creates AnnealingSchedule
12. Runs initialization
13. Returns PaletteStepper with cached generator

- [ ] **Step 4: Implement `index.ts`**

```ts
export { generatePalette, createPaletteStepper } from './facette';
export type {
  PaletteOptions, PaletteResult, PaletteStepper,
  HullGeometry, LineGeometry, Geometry,
  Particle, OKLab, OKLCh, Barycentric,
  OptimizationFrame, OptimizationTrace,
} from './types';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/facette.test.ts
```

- [ ] **Step 6: Verify build**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx tsup
```

Expected: `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts` created.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/facette.ts packages/core/src/facette.test.ts packages/core/src/index.ts && git commit -m "feat(core): add public API composition root and package exports"
```

---

### Task 20: Integration Benchmarks

**Files:**
- Create: `packages/core/src/__integration__/benchmarks.test.ts`

Section 12 validation benchmarks from the algorithm spec. These exercise the full pipeline end-to-end.

- [ ] **Step 1: Write integration tests**

```ts
import { describe, it, expect } from 'vitest';
import { generatePalette } from '../facette';
import { hexToOklab } from '../color-conversion';

function minPairwiseDeltaE(colors: string[]): number {
  let min = Infinity;
  const labs = colors.map(hexToOklab);
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const dE = Math.sqrt(
        (labs[i].L - labs[j].L) ** 2 +
        (labs[i].a - labs[j].a) ** 2 +
        (labs[i].b - labs[j].b) ** 2
      );
      min = Math.min(min, dE);
    }
  }
  return min;
}

describe('Section 12 Benchmarks', () => {
  it('line segment: 2 vivid complementary', () => {
    const result = generatePalette(['#e63946', '#2a9d8f'], 6);
    expect(result.colors).toHaveLength(6);
    expect(result.metadata.minDeltaE).toBeGreaterThan(0.01);
    // All colors should lie roughly on the segment (verify chroma doesn't dip near zero)
    const labs = result.colors.map(hexToOklab);
    for (const lab of labs) {
      const chroma = Math.sqrt(lab.a ** 2 + lab.b ** 2);
      // At least some chroma (no muddy midpoint)
      expect(chroma).toBeGreaterThan(0.01);
    }
  });

  it('gray-crossing triangle: 3 seeds spanning gray', () => {
    const result = generatePalette(['#ff6b6b', '#4ecdc4', '#2c3e50'], 8);
    expect(result.colors).toHaveLength(8);
    expect(result.metadata.minDeltaE).toBeGreaterThan(0.01);
  });

  it('one-sided hue cluster: narrow hue range', () => {
    const result = generatePalette(['#ff6b6b', '#ee5a24', '#f0932b', '#ffbe76'], 8);
    expect(result.colors).toHaveLength(8);
    // All colors should be in the warm hue range
    const labs = result.colors.map(hexToOklab);
    for (const lab of labs) {
      const hue = Math.atan2(lab.b, lab.a);
      // Warm hues: roughly 0 to π/2 (positive a and b)
      // Allow some tolerance
      expect(hue).toBeGreaterThan(-0.5);
      expect(hue).toBeLessThan(2.0);
    }
  });

  it('full hue wraparound: evenly spaced hues', () => {
    const result = generatePalette(['#e63946', '#2a9d8f', '#457b9d', '#f4a261'], 10);
    expect(result.colors).toHaveLength(10);
    expect(result.metadata.minDeltaE).toBeGreaterThan(0.01);
  });

  it('muted anchor: 1 warm gray + 4 vivid', () => {
    const result = generatePalette(['#a09080', '#e63946', '#2a9d8f', '#457b9d', '#f4a261'], 10);
    expect(result.colors).toHaveLength(10);
    // The warm gray seed should be preserved
    expect(result.colors).toContain('#a09080');
  });

  it('all muted: 4 low-chroma seeds', () => {
    const result = generatePalette(['#8e8e8e', '#9e9080', '#808e90', '#90809e'], 8);
    expect(result.colors).toHaveLength(8);
    // Palette should stay muted
    const labs = result.colors.map(hexToOklab);
    for (const lab of labs) {
      const chroma = Math.sqrt(lab.a ** 2 + lab.b ** 2);
      expect(chroma).toBeLessThan(0.15); // muted
    }
  });

  it('gamut stress: deep blues + saturated cyans', () => {
    const result = generatePalette(['#0000ff', '#00ffff', '#0044aa', '#00aaff'], 8);
    expect(result.colors).toHaveLength(8);
    // All should be valid hex (in gamut)
    for (const color of result.colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('near-coplanar: 4 seeds with tiny σ₃', () => {
    // Four colors chosen to be nearly coplanar in OKLab:
    // All at similar L, spread in a/b plane with minimal b variation
    // OKLab approx: L~0.7, a varies, b ≈ 0.1 (nearly flat in b)
    const result = generatePalette(['#ff9966', '#ffcc66', '#cc9966', '#ffaa77'], 8);
    expect(result.colors).toHaveLength(8);
    expect(result.metadata.minDeltaE).toBeGreaterThan(0.005);
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
cd C:/Users/yves-/code/Facette/packages/core && npx vitest run src/__integration__/benchmarks.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Run full test suite**

```bash
cd C:/Users/yves-/code/Facette && pnpm turbo test
```

Expected: all unit tests + integration benchmarks pass.

- [ ] **Step 4: Verify build**

```bash
cd C:/Users/yves-/code/Facette && pnpm turbo build
```

Expected: `packages/core/dist/` contains `index.mjs`, `index.cjs`, `index.d.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/__integration__/benchmarks.test.ts && git commit -m "feat(core): add Section 12 integration benchmarks"
```

---

## Completion

After all 20 tasks are done, the core package is:
- Fully implemented with 17 modules following the design spec
- Zero runtime dependencies
- Tested with colocated unit tests (17 test files) and integration benchmarks (8 test cases)
- Buildable as ESM + CJS via tsup
- Ready for `npm publish`

The **webapp plan** will be written as a separate document after the core package is complete.
