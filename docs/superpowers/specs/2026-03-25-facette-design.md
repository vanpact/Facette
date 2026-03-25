# Facette — Design Specification

## Overview

Facette is a perceptual color palette generation algorithm that treats palette creation as particle repulsion on the convex hull surface of user-defined seed colors in OKLab space. This document specifies the architecture of the monorepo containing the publishable algorithm package and a React-based debug webapp.

The algorithm specification lives in `Specs/Facette_algorithm_v4.4.md`.

---

## 1. Monorepo & Tooling

### Repository Structure

```
Facette/
├── packages/
│   └── core/                        # npm package: "facette"
├── apps/
│   └── web/                         # React/Vite debug webapp
├── Specs/                           # Algorithm specification
├── package.json                     # Workspace root (private, not published)
├── pnpm-workspace.yaml              # Declares packages/* and apps/*
├── turbo.json                       # Build orchestration
├── tsconfig.base.json               # Shared TS config (strict, ESNext)
├── .gitignore
└── .npmrc
```

### Toolchain

| Tool | Purpose |
|------|---------|
| pnpm | Package manager with strict workspace isolation |
| Turborepo | Build orchestration (`turbo build`, `turbo test`, `turbo dev`) |
| TypeScript 5.x | Strict mode, shared base config extended by each package |
| tsup | Core package build → ESM + CJS + `.d.ts` |
| Vite | Webapp dev server + build |
| vitest | Testing for both packages |
| Tailwind CSS 4 | Webapp styling |

### Workspace Dependency

`apps/web` depends on `facette: "workspace:*"` (pnpm workspace protocol). During dev, Vite resolves directly to the source via tsconfig paths. For production, it uses the tsup-built output.

### Turbo Pipeline

- `build`: core builds first (dependency), then web
- `test`: core and web in parallel
- `dev`: core in watch mode + web dev server, concurrent

### Core Package Exports (`packages/core/package.json`)

```json
{
  "name": "facette",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "sideEffects": false
}
```

Zero runtime dependencies. `devDependencies` only: TypeScript, tsup, vitest.

---

## 2. Core Package Architecture

### Module Layout

```
packages/core/src/
├── types.ts                     # All shared types + interface definitions
├── math.ts                      # Vec3/Mat3: dot, cross, normalize, scale, add, sub, matMul
├── color-conversion.ts          # [1] sRGB ↔ linear RGB ↔ OKLab + Jacobians
├── gamut-clipping.ts            # [1b] Bottosson's gamut_clip_preserve_chroma
├── svd.ts                       # [2] Jacobi SVD for small matrices
├── dimensionality.ts            # [2] SVD-based dimensionality detection
├── convex-hull.ts               # [2] 3D incremental QuickHull
├── barycentric.ts               # Barycentric: compute, validate, interpolate, clamp+renorm
├── seed-classification.ts       # [2b] hull-vertex / boundary / interior
├── atlas.ts                     # [2c] Face atlas: local bases, adjacency, degeneracy flags
├── surface-navigation.ts        # [6a] Tangent projection, edge crossing, face transitions
├── warp.ts                      # [3] f(r), transform T, Jacobian J_T, warped distance
├── energy.ts                    # [4] Riesz repulsion + gamut penalty + all gradients
├── initialization.ts            # [5] Pin seeds, subdivided warped area, greedy placement, jitter
├── optimization.ts              # [6] Main loop orchestration (physics + annealing only)
├── output.ts                    # [7] Final gamut clip → sRGB
├── facette.ts                   # Composition root + public API
└── index.ts                     # Re-exports public surface only
```

### Interface Definitions (ISP + DIP)

Each module depends on narrow interfaces, not on concrete sibling modules. All interfaces live in `types.ts`.

#### Data Types

```ts
type Vec3 = [number, number, number];

interface OKLab { L: number; a: number; b: number }
interface OKLCh { L: number; C: number; h: number }
interface LinRGB { r: number; g: number; b: number }

interface Barycentric { l0: number; l1: number; l2: number }

interface Face {
  vertexIndices: [number, number, number];
  basisU: Vec3;
  basisV: Vec3;
  normal: Vec3;
  area: number;
  degenerate: boolean;
}

interface HullGeometry {
  vertices: OKLab[];
  faces: Face[];
  adjacency: Map<string, number>;  // edge key → adjacent face index
}

type Particle =
  | { kind: 'pinned-vertex';   position: OKLab; vertexIndex: number }
  | { kind: 'pinned-boundary'; position: OKLab; faceIndex: number; bary: Barycentric }
  | { kind: 'pinned-interior'; position: OKLab }
  | { kind: 'free';            position: OKLab; faceIndex: number; bary: Barycentric };
```

#### Narrow Interfaces

```ts
interface WarpTransform {
  toWarped(pos: OKLab): OKLab;
  fromWarped(pos: OKLab): OKLab;
  pullBackGradient(pos: OKLab, gradWarped: Vec3): Vec3;
}

interface ForceComputer {
  computeForces(
    particles: readonly Particle[],
    warp: WarpTransform,
    p: number,
    kappa: number
  ): Vec3[];
}

interface AtlasQuery {
  getFaceBasis(faceIndex: number): { u: Vec3; v: Vec3; normal: Vec3 };
  getFaceVertices(faceIndex: number): [OKLab, OKLab, OKLab];
  getAdjacentFace(faceIndex: number, edgeKey: string): number | null;
  getFaceArea(faceIndex: number): number;
  isDegenerate(faceIndex: number): boolean;
  faceCount(): number;
}

interface SurfaceConstraint {
  projectToTangent(force: Vec3, faceIndex: number): Vec3;
  applyDisplacement(
    particle: Particle & { kind: 'free' },
    displacement: Vec3
  ): Particle & { kind: 'free' };
}

interface GamutChecker {
  isInGamut(pos: OKLab): boolean;
  clipPreserveChroma(pos: OKLab): OKLab;
  penaltyGradient(pos: OKLab): Vec3;
}

interface AnnealingSchedule {
  getStepSize(iteration: number): number;
  getRieszExponent(iteration: number): number;
  isConverged(
    iteration: number,
    energy: number,
    prevEnergy: number,
    maxDisplacement: number
  ): boolean;
}
```

#### Optimization Trace Types

```ts
interface OptimizationFrame {
  iteration: number;
  particles: Particle[];
  energy: number;
  minDeltaE: number;
  p: number;
  stepSize: number;
}

interface OptimizationTrace {
  hull: HullGeometry;
  seeds: Particle[];
  frames: OptimizationFrame[];
  finalColors: string[];
}
```

### Dependency Flow

All inter-module dependencies point at interfaces in `types.ts`. Only `facette.ts` (composition root) imports concrete implementations.

```
types.ts                                      ← all interfaces defined here
    ↑
math.ts                                       ← pure functions, zero imports
    ↑
barycentric.ts                                ← depends on: math, types
    ↑
color-conversion.ts                           ← depends on: math, types
    ↑
gamut-clipping.ts                             ← depends on: color-conversion, types
    │                                            implements: GamutChecker
    ↑
svd.ts → dimensionality.ts                   ← pure math, depends on: math, types
    ↑
convex-hull.ts                                ← depends on: math, types
    ↑
seed-classification.ts                        ← depends on: barycentric, types
    ↑                                            consumes: HullGeometry
atlas.ts                                      ← depends on: math, barycentric, types
    │                                            implements: AtlasQuery
    ↑
surface-navigation.ts                         ← depends on: AtlasQuery, barycentric, math
    │                                            implements: SurfaceConstraint
    ↑
warp.ts                                       ← depends on: math, types
    │                                            implements: WarpTransform
    ↑
energy.ts                                     ← depends on: WarpTransform, GamutChecker, math
    │                                            implements: ForceComputer
    ↑
initialization.ts                             ← depends on: WarpTransform, AtlasQuery, types
    ↑
optimization.ts                               ← depends on: ForceComputer, SurfaceConstraint,
    │                                            AnnealingSchedule (interfaces only)
    │                                            yields: OptimizationFrame (generator)
    ↑
output.ts                                     ← depends on: GamutChecker, color-conversion
    ↑
facette.ts                                    ← COMPOSITION ROOT
    │                                            imports ALL concrete modules
    │                                            wires concrete → interface
    │                                            exports: generatePalette, createPaletteStepper
    ↑
index.ts                                      ← re-exports public API + types only
```

### SOLID Compliance

| Principle | How it's applied |
|-----------|-----------------|
| SRP | Each module has exactly one reason to change. `warp.ts` changes only if warping math changes. `surface-navigation.ts` changes only if constraint geometry changes. `optimization.ts` does only physics loop orchestration. |
| OCP | Interface-based design: swap `WarpTransform` implementation (e.g., identity warp for testing) without touching `energy.ts` or `optimization.ts`. Add new energy terms by composing `ForceComputer` implementations. |
| LSP | Discriminated union `Particle` with exhaustive `switch`. All variants substitutable wherever `Particle` is expected. The `kind` field drives behavior, not subclass overrides. |
| ISP | Each module consumes the narrowest interface it needs. `energy.ts` sees `WarpTransform` (2 methods), not the full warp module. `optimization.ts` sees `ForceComputer` + `SurfaceConstraint`, never atlas or hull internals. |
| DIP | All inter-module dependencies point at interfaces in `types.ts`. Only `facette.ts` (composition root) imports concrete implementations. Every other module is testable with mock implementations. |

### Law of Demeter Compliance

- No deep property chains. Modules call methods on their direct interface dependencies, never reaching through returned objects.
- `atlas.ts` exposes query functions (`getFaceBasis`, `getAdjacentFace`), not raw `Face[]` arrays.
- `surface-navigation.ts` wraps atlas queries into `projectToTangent` and `applyDisplacement` — `optimization.ts` never touches atlas directly.
- `optimization.ts` talks only to `ForceComputer`, `SurfaceConstraint`, and `AnnealingSchedule`. It has no knowledge of hull geometry, warp internals, or gamut clipping.

### Generator Pattern (Core Engine)

```ts
// optimization.ts — the real engine
function* createOptimizationStepper(
  particles: Particle[],
  forces: ForceComputer,
  surface: SurfaceConstraint,
  warp: WarpTransform,
  schedule: AnnealingSchedule
): Generator<OptimizationFrame> {
  // yields one frame per iteration
}

// facette.ts — composition root
function generatePalette(seeds: string[], size: number, options?): PaletteResult {
  // wires concrete implementations, drains generator, returns final result
}

function createPaletteStepper(seeds: string[], size: number, options?): PaletteStepper {
  // wires concrete implementations, returns stepper with generator + hull info
}
```

---

## 3. Core Public API

### Exported Surface (`index.ts`)

Only these symbols are public. Everything else is internal.

#### Functions

```ts
function generatePalette(
  seeds: string[],
  size: number,
  options?: PaletteOptions
): PaletteResult;

function createPaletteStepper(
  seeds: string[],
  size: number,
  options?: PaletteOptions
): PaletteStepper;
```

#### Types

```ts
interface PaletteOptions {
  vividness?: number;       // maps to r_s. 0 = auto (default), manual range [0.005, 0.10]
}

interface PaletteResult {
  colors: string[];         // hex sRGB, length === size
  seeds: string[];          // input seeds echoed back
  metadata: {
    minDeltaE: number;      // minimum pairwise ΔE in OKLab
    iterations: number;
    clippedCount: number;   // how many needed final gamut clipping
  };
}

interface PaletteStepper {
  hull: HullGeometry;
  seeds: Particle[];
  step(): Generator<OptimizationFrame>;
  run(): OptimizationTrace;
}
```

Geometry types (`HullGeometry`, `Particle`, `OKLab`, `OKLCh`, `OptimizationFrame`, `OptimizationTrace`) are also re-exported for webapp consumption.

### Input Validation

| Check | Error |
|-------|-------|
| `seeds.length < 2` | "At least 2 seed colors required" |
| Any seed not parseable as hex | "Invalid hex color: {value}" |
| All seeds identical (ΔE < 1e-6 after OKLab conversion) | "Seeds must be distinct" |
| `size < seeds.length` | "Palette size must be ≥ number of seeds" |
| `vividness` outside [0.005, 0.10] when provided | "Vividness must be between 0.005 and 0.10" |

Validation throws standard `Error` with descriptive messages.

### Usage Examples

```ts
// Simple consumer
import { generatePalette } from 'facette';

const result = generatePalette(['#e63946', '#457b9d', '#1d3557'], 8);
console.log(result.colors);

// Debug consumer
import { createPaletteStepper } from 'facette';

const stepper = createPaletteStepper(['#e63946', '#457b9d', '#1d3557'], 8);

// Frame-by-frame
for (const frame of stepper.step()) {
  render3D(frame.particles);
  plotEnergy(frame.iteration, frame.energy);
}

// Or get everything at once
const trace = stepper.run();
```

---

## 4. Webapp Architecture

### Component Tree

```
apps/web/src/
├── main.tsx                          # Vite entry, mounts <App />
├── App.tsx                           # Layout shell
│
├── components/
│   ├── layout/
│   │   └── DashboardLayout.tsx       # CSS grid: controls bar, left viewer, right viewer, info panel
│   │
│   ├── controls/
│   │   ├── SeedEditor.tsx            # Add/remove seeds via color pickers
│   │   ├── PaletteControls.tsx       # N slider, vividness slider, regenerate button
│   │   ├── PlaybackControls.tsx      # Play/pause/step, iteration scrubber, speed control
│   │   └── LayerToggles.tsx          # Checkboxes: seeds, generated, hull, gamut, axes
│   │
│   ├── viewers/
│   │   ├── OKLabViewer.tsx           # Left panel: 3D OKLab ↔ warped morph view
│   │   ├── OKLChViewer.tsx           # Right panel: 3D OKLCh cylindrical view
│   │   ├── shared/
│   │   │   ├── SceneSetup.tsx        # R3F Canvas, camera, orbit controls, lights
│   │   │   ├── HullMesh.tsx          # Wireframe hull geometry
│   │   │   ├── ParticlePoints.tsx    # Seed spheres + free particle spheres (clickable)
│   │   │   ├── GamutBoundary.tsx     # Precomputed sRGB gamut mesh (toggleable)
│   │   │   ├── AxisHelper.tsx        # L/a/b or L/C/h labeled axes
│   │   │   └── MorphAnimator.tsx     # Interpolates positions between warped ↔ unwarped
│   │   └── transforms/
│   │       ├── oklabToScene.ts       # OKLab coords → Three.js scene coords
│   │       └── oklchToScene.ts       # OKLCh → cylindrical Three.js coords
│   │
│   ├── info/
│   │   ├── PointInfoPanel.tsx        # Selected point details: swatch, OKLCh, OKLab, warped, sRGB
│   │   └── EnergyGraph.tsx           # Energy over iterations (lightweight canvas chart)
│   │
│   └── palette/
│       └── PaletteStrip.tsx          # Horizontal color swatches of current palette
│
├── store/
│   ├── index.ts                      # Zustand store, combines slices
│   ├── paletteSlice.ts              # Seeds, N, vividness, trace, finalColors
│   ├── viewerSlice.ts               # Layer toggles, morph position (0..1), camera state
│   ├── playbackSlice.ts             # Current frame index, playing/paused, speed
│   └── selectionSlice.ts            # Selected point index, hover state
│
├── hooks/
│   ├── usePaletteEngine.ts          # Runs createPaletteStepper, stores trace in paletteSlice
│   ├── usePlayback.ts               # requestAnimationFrame loop tied to playbackSlice
│   ├── useSyncedCamera.ts           # Syncs orbit controls between left and right viewers
│   └── useMorphInterpolation.ts     # Lerps particle positions between warped ↔ unwarped
│
├── assets/
│   └── srgb-gamut.json              # Precomputed sRGB gamut boundary mesh
│
└── utils/
    └── color-format.ts              # Display formatting: hex, rgb(), oklch() strings
```

### Data Flow

```
User edits seeds/N/vividness
        │
        ▼
  paletteSlice (state update)
        │
        ▼
  usePaletteEngine hook
    ├── calls createPaletteStepper(seeds, N, { vividness })
    ├── calls stepper.run() → full OptimizationTrace
    └── stores trace in paletteSlice
        │
        ▼
  playbackSlice.currentFrame = 0
        │
        ▼
  usePlayback hook (when playing)
    ├── requestAnimationFrame loop
    ├── increments currentFrame at configured speed
    └── updates playbackSlice
        │
        ▼
  Components read current frame:
    ├── OKLabViewer / OKLChViewer
    │     └── reads trace.frames[currentFrame].particles
    │     └── useMorphInterpolation lerps warped ↔ unwarped
    │     └── renders via shared scene components
    ├── EnergyGraph
    │     └── reads all frames, highlights currentFrame
    ├── PointInfoPanel
    │     └── reads selected particle from current frame
    └── PaletteStrip
          └── reads trace.finalColors
```

### Shared 3D Components (DRY)

Both viewers render the same scene objects with different coordinate transforms. Shared components accept a `positionMapper: (particle: Particle) => [x, y, z]` prop:

```ts
// OKLabViewer passes:
positionMapper = (p) => oklabToScene(p.position)

// OKLChViewer passes:
positionMapper = (p) => oklchToScene(oklabToOklch(p.position))
```

`HullMesh`, `ParticlePoints`, `GamutBoundary`, and `AxisHelper` all use the same prop. No duplication of rendering logic.

### Camera Sync

`useSyncedCamera` keeps both viewers' orbit controls in lockstep via shared camera state in `viewerSlice`.

### Morph Animation

`MorphAnimator` holds a `morphT` value (0 = unwarped OKLab, 1 = warped OKLab) and lerps each particle's position:

```ts
displayPos = lerp(oklabPos, warpedPos, morphT)
```

Toggle triggers a smooth tween. The right panel (OKLCh) applies the same morph in cylindrical space.

### sRGB Gamut Boundary

Precomputed mesh shipped as a static JSON asset (~50KB). Rendered as a semi-transparent wireframe in both viewers, toggleable via `LayerToggles`.

### Separation of Concerns

| Layer | Responsibility | Never touches |
|-------|---------------|---------------|
| `store/` slices | State + actions | React components, Three.js |
| `hooks/` | Side effects (engine, animation, camera sync) | DOM, Three.js directly |
| `components/controls/` | User input → store actions | 3D rendering, algorithm |
| `components/viewers/shared/` | Three.js rendering from props | Store directly |
| `components/viewers/transforms/` | Coordinate math only | React, Three.js, store |
| `components/info/` | Read-only display from store | Algorithm, 3D |

---

## 5. Testing Strategy

### Core — Unit Tests (colocated `.test.ts` files)

Each module gets a test file validating its interface contract. Modules are testable in isolation via mock interface implementations (DIP).

| Test file | What it validates |
|-----------|------------------|
| `math.test.ts` | Vec3/Mat3 ops. Edge cases: zero vectors, parallel vectors |
| `color-conversion.test.ts` | Round-trip sRGB ↔ OKLab. Known values from Ottosson's reference. Jacobian via finite-difference |
| `gamut-clipping.test.ts` | In-gamut unchanged. Out-of-gamut clipped. Hue/lightness preserved. Edge cases: white, black, extreme blues |
| `svd.test.ts` | U·Σ·Vᵀ ≈ A. Known analytical SVDs. Rank-deficient matrices. 1×3, 2×3, 3×3 |
| `dimensionality.test.ts` | Collinear → 1. Coplanar → 2. Full 3D → 3. Near-degenerate. Identical → 0 |
| `convex-hull.test.ts` | Known hulls (tetrahedron, cube). Coplanar input. Collinear input. Convexity verification |
| `barycentric.test.ts` | Vertices → (1,0,0). Centroid → (⅓,⅓,⅓). Out-of-face detection. Clamp+renormalize |
| `seed-classification.test.ts` | Vertices → `pinned-vertex`. On-face → `pinned-boundary`. Inside → `pinned-interior` |
| `atlas.test.ts` | Basis orthonormality. Adjacency correctness. Degenerate flagging. Query correctness |
| `surface-navigation.test.ts` | Tangent projection. In-face displacement. Edge crossing. Boundary clamping |
| `warp.test.ts` | f(0)=0, f'(0)=0. Contraction at low r. Identity at high r. Hue preservation. Jacobian via finite-difference |
| `energy.test.ts` | Repulsive force direction. Energy decreases with distance. Gamut penalty=0 in gamut. Gradient via finite-difference |
| `initialization.test.ts` | Seeds pinned correctly. Correct free particle count. No degenerate face placement. Gray jitter |
| `optimization.test.ts` | Energy decreases after p stabilizes. Correct frame count. Convergence. Pinned immobility. Surface constraint |
| `output.test.ts` | Valid sRGB hex. Non-clipped unchanged. Clipped preserves hue+lightness |
| `facette.test.ts` | Input validation. Correct output count. Seeds in output. Stepper yields frames |

### Core — Integration Benchmarks (`__integration__/benchmarks.test.ts`)

Section 12 validation benchmarks run as full-pipeline tests:

| Test case | Seeds | Assertions |
|-----------|-------|------------|
| Line segment | 2 vivid complementary | Dim=1. Colors on segment. No muddy midpoint |
| Gray-crossing triangle | 3 spanning gray | Low-chroma avoidance. Min ΔE above baseline |
| One-sided hue cluster | 4-5 narrow hue | Compact hull. Lightness spread. Hue range respected |
| Full hue wraparound | 4-6 even hue | Closed hull. Even spacing. No grays |
| Muted anchor | 1 gray + 4 vivid | Muted preserved. Others vivid. r_s adapts |
| All muted | 4 low-chroma | Stays muted. Gentle warping |
| Gamut stress | Deep blues + cyans | All in gamut. Clip count tracked. Hue preserved |
| Near-coplanar | 4 tiny σ₃ | Dim=2. Stable hull. No artifacts |

Each benchmark also logs min/mean/max pairwise ΔE for monitoring.

### Webapp — Tests

```
apps/web/src/__tests__/
├── store.test.ts                # Slice state transitions, actions
├── usePaletteEngine.test.ts     # Hook integration with stepper
└── transforms.test.ts          # Coordinate transform math
```

### Commands

```bash
turbo test                # all tests in parallel
turbo test --filter=core  # core only
turbo test --filter=web   # web only
```

---

## 6. Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package name | `facette` | Simple, memorable, top-level npm |
| Runtime dependencies | Zero | Implement QuickHull + Jacobi SVD from scratch (tiny point sets) |
| Gamut clipping | Bottosson's reference implementation | Preserves hue + lightness, matches spec |
| Core API pattern | Generator + wrapper | `createPaletteStepper` is the engine; `generatePalette` is sugar. No duplication |
| State management | Zustand with domain slices | Tiny, R3F-ecosystem compatible, slice-based for SoC |
| 3D visualization | React Three Fiber | Standard for Three.js in React |
| Gamut boundary mesh | Precomputed static asset | Instant rendering, ~50KB |
| Optimization trace | Every iteration stored | Full fidelity scrubbing for debug |
| Morph animation | Smooth lerp with tween | Visually shows how warp contracts low-chroma |
| Styling | Tailwind CSS 4 | Fast iteration, no component library overhead |
