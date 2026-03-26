# Facette V5: Unified Radial Lift Implementation Design

## Overview

Implement the V5 algorithm spec (`Specs/Facette_algorithm_v5.md`) across `packages/core` and `apps/web`. The core change: move hull construction, atlas, and optimization into a unified lifted space via the parameterized convex function `rho(r) = R * (f(r)/f(R))^gamma`, eliminating the geometry/physics split, the warp Jacobian, approximate face areas, and the chroma dip problem.

At `gamma = 1`, the algorithm reduces exactly to V4.4 with hull-in-warped-space. No regression.

---

## Scope

### In scope
- Replace warp transform with radial lift (new `radial-lift.ts`, delete `warp.ts`)
- Reorder pipeline: lift seeds before hull construction
- Simplify energy to plain Euclidean Riesz + finite-difference gamut gradient
- Simplify initialization to use exact face areas
- Update all types and public API
- Update web app: add gamma parameter, rename warp references to lift
- Update all tests
- Remove all dead code

### Out of scope
- Algorithm behavior changes beyond what the V5 spec prescribes
- Web app visual redesign
- New features not in the spec

---

## Module Changes

### 1. New file: `radial-lift.ts` (replaces `warp.ts`)

**Factory:** `createRadialLift(rs: number, R: number, gamma: number): RadialLift`

**Interface:**
```typescript
interface RadialLift {
  toLifted(pos: OKLab): OKLab;
  fromLifted(pos: OKLab): OKLab;
  readonly rs: number;
  readonly R: number;
  readonly gamma: number;
}
```

**Forward lift `toLifted`:**
```
f(r) = r^2 / (r + r_s)
rho(r) = R * (f(r) / f(R))^gamma
T_rho(L, a, b) = (L, rho(r)/r * a, rho(r)/r * b)  for r > 0
T_rho(L, 0, 0) = (L, 0, 0)
```

**Inverse lift `fromLifted` (closed-form, no root-finding):**
```
Given lifted chroma rho_val:
1. u = f(R) * (rho_val / R)^(1/gamma)
2. r = (u + sqrt(u^2 + 4*u*r_s)) / 2
3. Rescale a, b by r/rho_val
```

No `pullBackGradient` method. V5 eliminates the Jacobian pullback entirely.

**Delete:** `warp.ts`, `warp.test.ts`

### 2. `types.ts` changes

**Replace `WarpTransform` with `RadialLift`:**
```typescript
// Remove
interface WarpTransform { ... }

// Add
interface RadialLift {
  toLifted(pos: OKLab): OKLab;
  fromLifted(pos: OKLab): OKLab;
  readonly rs: number;
  readonly R: number;
  readonly gamma: number;
}
```

**Shrink `GamutChecker` (drop `penaltyGradient`):**
```typescript
interface GamutChecker {
  isInGamut(pos: OKLab): boolean;
  clipPreserveChroma(pos: OKLab): OKLab;
  // penaltyGradient removed — replaced by finite differences in energy.ts
}
```

**Rename frame field:**
```typescript
interface OptimizationFrame {
  iteration: number;
  particles: Particle[];          // positions in lifted space
  oklabPositions: OKLab[];        // was: warpedPositions
  energy: number;
  minDeltaE: number;
  p: number;
  stepSize: number;
}
```

**Extend trace metadata:**
```typescript
interface OptimizationTrace {
  geometry: Geometry;             // OKLab vertices (display geometry)
  seeds: Particle[];
  frames: OptimizationFrame[];
  finalColors: string[];
  clippedIndices: number[];
  rs: number;
  gamma: number;                  // new
  R: number;                      // new
}
```

**Add gamma to options:**
```typescript
interface PaletteOptions {
  vividness?: number;
  gamma?: number;                 // new, default 1
}
```

### 3. `energy.ts` — rewrite

**Current:** Warped-space Riesz repulsion with Jacobian pullback + analytical gamut gradient.

**V5:** Plain Euclidean Riesz repulsion in lifted space + finite-difference gamut gradient.

**New factory signature:**
```typescript
createForceComputer(lift: RadialLift, gamut: GamutChecker): ForceComputer
```

**Algorithm change:**
1. Read lifted-space positions directly from `particle.position` (no `toWarped` call)
2. Pairwise Euclidean Riesz repulsion gradient — same formula, but on lifted coordinates directly. No pullback.
3. For each particle: check if in gamut via `lift.fromLifted(pos)` + `gamut.isInGamut(oklab)`. If in gamut, gamut gradient is zero.
4. For out-of-gamut particles: finite-difference gradient. Perturb each lifted coordinate by epsilon, map through `lift.fromLifted`, compute `gamutPenaltyEnergy`, take differences. 3 extra `fromLifted` calls per out-of-gamut particle.
5. Total force = -(repulsion_grad + kappa * gamut_grad). No pullback step.

The private `gamutPenaltyEnergy` function (energy.ts:14) stays unchanged — it takes OKLab, converts to linear RGB, returns scalar penalty.

**Finite difference epsilon:** `1e-7` (small enough for accuracy, large enough to avoid floating-point noise).

### 4. `initialization.ts` — simplify

**Remove:** `subdividedWarpedArea`, `triangleArea` (dead code), `WarpTransform` import.

**Change face scoring to use exact atlas areas:**
```typescript
// Before:
const warpedArea = subdividedWarpedArea(v0, v1, v2, warp);
const score = warpedArea / (1 + count);

// After:
const area = atlas.getFaceArea(fi);
const score = area / (1 + count);
```

Face areas are exact in lifted space (flat faces). No subdivision approximation.

**Change best-position search to use lifted-space distances:**
```typescript
// Before:
const warpedPos = warp.toWarped(pos);
// ... distance in warped space ...

// After:
// pos is already in lifted space (face vertices are in lifted space)
// ... distance in lifted space directly ...
```

**New signature:**
```typescript
initializeParticlesHull(
  seeds: Particle[],
  hull: HullGeometry,
  atlas: AtlasQuery,
  n: number,
): Particle[]
```

The `warp: WarpTransform` parameter is removed entirely.

**Gray jitter:** Unchanged. The jitter perturbs along face tangent in lifted space. The spec (Section 4.5) prescribes the same manifold-respecting perturbation.

### 5. `optimization.ts` — modify

**Replace `warp: WarpTransform` parameter with `inverseLift: (pos: OKLab) => OKLab`:**
```typescript
createOptimizationStepper(
  initialParticles: Particle[],
  forces: ForceComputer,
  constraint: MotionConstraint,
  inverseLift: (pos: OKLab) => OKLab,  // was: warp: WarpTransform
  schedule: AnnealingSchedule,
): Generator<OptimizationFrame>
```

Passing a single function instead of the full `RadialLift` interface. The stepper only needs the inverse direction (for computing OKLab positions and minDeltaE per frame). This narrows the dependency per ISP.

**Compute `oklabPositions` per frame:**
```typescript
// Before:
const warpedPositions = particles.map(pt => warp.toWarped(pt.position));

// After:
const oklabPositions = particles.map(pt => inverseLift(pt.position));
```

**Compute `minDeltaE` from OKLab positions:**
```typescript
// Before:
const minDeltaE = pairwiseMinDeltaE(particles);  // used particle.position (was OKLab)

// After:
const minDeltaE = pairwiseMinDeltaE(oklabPositions);  // explicit OKLab positions
```

Change `pairwiseMinDeltaE` signature to accept `OKLab[]` instead of `Particle[]`.

### 6. `gamut-clipping.ts` — simplify

**Remove `penaltyGradient` method.** Remove imports of `oklabToLinearRgbJacobian`, `mat3MulVec3`, `mat3Transpose`.

The function stays as a factory returning `GamutChecker` with 2 methods: `isInGamut`, `clipPreserveChroma`. No other changes.

### 7. `color-conversion.ts` — remove dead code

**Remove `oklabToLinearRgbJacobian` function.** Its only consumer (`penaltyGradient` in gamut-clipping.ts) is removed. No other code references it.

### 8. `output.ts` — change signature

**Current:** reads `particles[i].position` (assumed OKLab).
**V5:** particle positions are in lifted space. Output needs OKLab.

**New signature:**
```typescript
finalizeColors(
  positions: OKLab[],    // was: particles: Particle[]
  gamut: GamutChecker,
): { colors: string[]; clippedIndices: number[] }
```

The orchestrator inverse-maps all final particle positions to OKLab before calling `finalizeColors`. This keeps `output.ts` free of lift knowledge.

### 9. `facette.ts` — reorder pipeline + build display geometry

**New pipeline order:**

```
1. Validate inputs (unchanged, but add gamma validation)
2. Parse seeds: hex -> OKLab
3. Compute lift parameters:
   - chromas = seeds.map(chroma)
   - rs = computeRs(chromas, options?.vividness)
   - R = max(chromas)
   - gamma = options?.gamma ?? 1
4. Create radial lift: createRadialLift(rs, R, gamma)
5. Lift seeds: liftedSeeds = oklabSeeds.map(lift.toLifted)
6. Detect dimensionality on liftedSeeds
7. Branch on dimension:

   1D path:
     - Find extremes on principal axis (in lifted space)
     - Create LineGeometry (in lifted space)
     - classifySeeds(liftedSeeds, liftedLine)
     - initializeParticles1D(classifiedSeeds, liftedLine, size)
     - Create display LineGeometry: inverse-map start/end to OKLab

   2D/3D path:
     - buildConvexHull(liftedSeeds)       <- lifted space
     - buildAtlas(liftedHull)
     - classifySeeds(liftedSeeds, liftedHull)
     - initializeParticlesHull(seeds, hull, atlas, size)  <- no warp param
     - Create display HullGeometry: inverse-map hull vertices to OKLab
       (same faces/adjacency, OKLab vertex positions)
     - createSurfaceConstraint(atlas, liftedHull)

8. Wire up services:
   - gamut = createGamutChecker()
   - forces = createForceComputer(lift, gamut)
   - schedule = createAnnealingSchedule()
9. Create stepper: createOptimizationStepper(
     particles, forces, constraint, lift.fromLifted, schedule)
10. Build PaletteStepper:
    - geometry: displayGeometry (OKLab)
    - seeds: classifiedSeeds with OKLab positions restored. The classification
      (pinned-vertex/boundary/interior, face indices, bary coords) comes from lifted-space
      analysis, but the position field is set back to the original OKLab seed value.
      This is safe because seed positions are fixed (pinned) — only their classification matters.
    - run(): drain frames, inverse-map final positions, finalizeColors
```

**Display geometry construction (hull case):**
```typescript
const displayVertices = liftedHull.vertices.map(v => lift.fromLifted(v));
const displayGeometry: HullGeometry = {
  kind: 'hull',
  vertices: displayVertices,
  faces: liftedHull.faces,        // same topology
  adjacency: liftedHull.adjacency, // same topology
};
```

**Output finalization:**
```typescript
// In run():
const lastFrame = allFrames[allFrames.length - 1];
const oklabPositions = lastFrame.particles.map(p => lift.fromLifted(p.position));
const { colors, clippedIndices } = finalizeColors(oklabPositions, gamut);
```

**Gamma validation:** add to `validateInputs`:
```typescript
if (options?.gamma !== undefined) {
  if (options.gamma < 1) {
    throw new Error('Gamma must be >= 1');
  }
}
```

### 10. `index.ts` — no changes

`WarpTransform`, `GamutChecker`, `RadialLift` are all internal interfaces, not exported from the public API. The only public API changes are in the exported types (`PaletteOptions`, `OptimizationFrame`, `OptimizationTrace`).

---

## Web App Changes

### 11. `paletteSlice.ts` — add gamma state

```typescript
interface PaletteSlice {
  // ... existing ...
  gamma: number;
  setGamma: (g: number) => void;
}

// Default: gamma: 1
```

### 12. `usePaletteEngine.ts` — pass gamma

```typescript
const gamma = useStore((s) => s.gamma);
// ...
const options: PaletteOptions = {};
if (vividness > 0) options.vividness = vividness;
if (gamma > 1) options.gamma = gamma;
const stepper = createPaletteStepper(seeds, paletteSize, options);
```

### 13. `PaletteControls.tsx` — add gamma slider

Add a slider for gamma (range 1.0 to 3.0, step 0.1, default 1.0). Label shows current value. Trigger `regenerate` on mouse up, matching the vividness slider pattern.

### 14. `useMorphInterpolation.ts` — swap morph direction

```typescript
// Before:
lerpOKLab(p.position, frame.warpedPositions[i], morphT)

// After — swap order so morphT=0 shows OKLab (default view):
lerpOKLab(frame.oklabPositions[i], p.position, morphT)
```

This ensures the default un-morphed view (morphT=0) shows OKLab positions, and the morph toggle reveals the lifted-space positions.

### 15. `OKLabViewer.tsx` — update labels

```typescript
// Before:
{isWarped ? 'Warped OKLab' : 'OKLab'}
{isWarped ? 'Unwarp' : 'Warp'}

// After:
{isWarped ? 'Lifted' : 'OKLab'}
{isWarped ? 'Unlift' : 'Lift'}
```

### 16. `PointInfoPanel.tsx` — update field access and labels

```typescript
// Before:
const warped = frame.warpedPositions[selectedIndex];
const lch = oklabToOklch(pos);       // pos was OKLab
const warpedLch = oklabToOklch(warped);
// <div>Warped: {formatOKLab(warped)}</div>

// After:
const oklab = frame.oklabPositions[selectedIndex];
const lch = oklabToOklch(oklab);     // compute OKLCh from OKLab, not lifted
// <div>OKLab: {formatOKLab(oklab)}</div>
// <div>Lifted: {formatOKLab(pos)}</div>   // pos is now lifted-space
```

### 17. `usePaletteEngine.test.ts` — rename field

```typescript
// Before:
expect(trace.frames[0].warpedPositions.length).toBe(paletteSize);

// After:
expect(trace.frames[0].oklabPositions.length).toBe(paletteSize);
```

---

## Dead Code Removal (complete list)

| Code | File | Reason removed |
|---|---|---|
| `createWarpTransform` (entire file) | `warp.ts` | Replaced by `radial-lift.ts` |
| `WarpTransform` interface | `types.ts` | Replaced by `RadialLift` |
| `oklabToLinearRgbJacobian` | `color-conversion.ts` | Only consumer (`penaltyGradient`) removed |
| `penaltyGradient` method | `gamut-clipping.ts` | Replaced by FD in `energy.ts` |
| `subdividedWarpedArea` | `initialization.ts` | Use `atlas.getFaceArea()` (exact) |
| `triangleArea` | `initialization.ts` | Only used by `subdividedWarpedArea` |
| `warp.test.ts` | tests | Replaced by `radial-lift.test.ts` |

Retained: `mat3Transpose`, `mat3MulVec3` in `math.ts` (used by `color-conversion.ts` and `mat3Mul`).

---

## Modules With No Changes

These modules are coordinate-agnostic and work identically with lifted-space inputs:

- `convex-hull.ts` — pure 3D geometry on `{L, a, b}` structure
- `atlas.ts` — face basis/area computation from hull vertices
- `surface-navigation.ts` — tangent projection + edge crossing via barycentric coords
- `seed-classification.ts` — vertex/boundary/interior tests via distance + barycentric
- `dimensionality.ts` — SVD on mean-centered points
- `line-segment.ts` — 1D constraint along segment direction
- `barycentric.ts` — triangle coordinate utilities
- `math.ts` — vec3/mat3 operations
- `svd.ts` — Jacobi eigendecomposition

---

## Principle Compliance

### DRY
- Face areas computed once by atlas, consumed by initialization (no recomputation)
- Scalar gamut penalty function lives in one place (`energy.ts`)
- Display geometry built once from lifted geometry (one `fromLifted` per vertex)

### Separation of Concerns
- `radial-lift.ts`: coordinate transform only
- `energy.ts`: force computation only (owns FD gamut gradient)
- `gamut-clipping.ts`: gamut checking and clipping only
- `initialization.ts`: particle placement only (no transform knowledge)
- `optimization.ts`: optimization loop only (receives `inverseLift` as a function)
- `output.ts`: gamut clip + hex conversion only (receives OKLab positions)
- `facette.ts`: orchestration and pipeline sequencing

### No Dead Code
All removed code enumerated above. No commented-out code, no unused imports.

### SOLID
- **SRP:** Each module has one reason to change
- **OCP:** Factory pattern allows swapping implementations
- **ISP:** `GamutChecker` shrinks 3 -> 2 methods; `optimization.ts` depends on single function `inverseLift` instead of full interface
- **DIP:** All modules depend on interfaces, not implementations

### Law of Demeter
- `initialization.ts` drops its `WarpTransform` dependency entirely (improvement)
- `optimization.ts` narrows from `WarpTransform` (3 methods) to a single function
- `output.ts` receives pre-transformed positions, not a transform object

---

## Regression Safety

At `gamma = 1`:
- `rho(r) = R * f(r) / f(R)` which is `f(r)` scaled by a constant
- The lift behaves identically to V4.4's warp (same `f(r) = r^2 / (r + r_s)` base)
- Hull in lifted space = hull in warped space
- Plain Euclidean repulsion in lifted space = warped-space repulsion (same metric)
- The only behavioral difference: face areas are now exact (were approximate via subdivision). This is strictly better.

All existing test cases should produce equivalent (or improved) results at `gamma = 1`.
