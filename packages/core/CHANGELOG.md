# Changelog

All notable changes to the `facette` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-10

V5.1 + V5.2: Adaptive gamma, lightness stretching, and clipped-OKLab repulsion energy.

### Added

- **Adaptive gamma** — γ is now computed automatically from seed hue spread: `γ = 1 + v × Δh_max / π`. Narrow-hue palettes get γ ≈ 1 (no distortion), wide-hue palettes get up to γ = 3 (strong chroma preservation). Controlled by the `vividness` parameter.
- **Lightness stretching** — new `spread` parameter (range [1, 5], default 1.5) expands seed lightness around the median before hull construction, giving free particles access to a wider lightness range than the seeds alone.
- `adaptive-gamma.ts` — standalone pure function for hue-spread-based gamma computation
- `space-lift.ts` — radial chroma lift with exact closed-form inverse (L-stretch is separate seed preprocessing in the orchestrator)
- `SpaceTransform` interface — narrow transform interface for consumers (ISP)
- `SpaceLiftConfig` interface — grouped construction parameters for diagnostics/tracing
- `SpaceLift` interface — full transform + config, extends `SpaceTransform`
- **Clipped-OKLab repulsion energy** (V5.2) — repulsion metric transitions from lifted-space Euclidean distances to gamut-clipped OKLab distances via a β ramp synchronized with the Riesz exponent ramp. Particles at (θ, L) positions with low gamut headroom are repelled toward higher-headroom positions, improving distinguishability for vivid wide-hue palettes.
- `finiteDifferenceGradient` — reusable FD gradient utility (DRY extraction)
- `getMetricBlend` on `AnnealingSchedule` — β ramp 0→1 over `metricBlendEnd` iterations

### Changed

- **`vividness` parameter** — repurposed from gray avoidance radius override (range [0.005, 0.10]) to adaptive gamma coefficient (range [0, 4], default 2). At `0`, γ = 1 always (V5.0 behavior).
- **`OptimizationTrace`** — `rs`, `gamma`, `R` replaced by `liftConfig: SpaceLiftConfig`, `vividness`, `spread`, `Lc`
- **`PaletteOptions`** — `gamma` removed (computed internally), `spread` added
- `energy.ts` depends on narrow `SpaceTransform` instead of full `RadialLift` (ISP)
- **`ForceComputer.computeForcesAndEnergy`** — gains `beta` parameter for metric blending
- **`energy.ts`** — decomposed into `liftedRepulsion`, `clippedRepulsion`, and thin compositor for SRP. Gamut penalty FD refactored to use shared `finiteDifferenceGradient`.

### Fixed

- **L-stretch had no effect on output** — the L-stretch was part of the SpaceLift transform, and `fromLifted` fully inverted it, so the affine expansion and contraction cancelled out on hull surface points. Fixed by moving the L-stretch out of SpaceLift into seed preprocessing in the orchestrator. The SpaceLift is now a pure radial transform with a true inverse (`fromLifted(toLifted(x)) === x`). Seeds are L-stretched before hull construction, and free particles naturally output extended L values.

### Removed

- `radial-lift.ts` — replaced by `space-lift.ts`
- `RadialLift` interface — replaced by `SpaceTransform` / `SpaceLift`
- `gamma` option — no longer user-facing; computed adaptively from `vividness` and seed hue spread
- `vividness` as r_s override — r_s is now always computed automatically

### Regression Safety

- At `vividness: 0, spread: 1`: γ = 1, L-stretch is identity — identical to V5.0 default behavior
- At `vividness: 2, spread: 1` with narrow-hue seeds: γ ≈ 1 — near-identical to V5.0
- At `beta: 0` throughout (or any in-gamut seed configuration): clipped energy = lifted energy — identical to V5.1

## [0.1.1] - 2026-03-27

### Fixed

- Coplanar hull now uses single-sided faces and only includes hull vertices, fixing incorrect geometry for 3+ coplanar seeds
- Optimization stepper no longer has a hardcoded iteration cap that could override the annealing schedule's convergence criteria

## [0.1.0] - 2026-03-27

Initial release with V5 unified radial lift architecture.

### Added

- `generatePalette(seeds, size, options?)` — generate a perceptually distinct color palette from seed colors
- `createPaletteStepper(seeds, size, options?)` — step through the optimization frame by frame
- `gamma` option for controlling chroma preservation on intermediate colors between vivid seeds
- `vividness` option for controlling gray avoidance strength (auto by default)
- Radial lift transform `rho(r) = R * (f(r)/f(R))^gamma` with closed-form inverse
- Convex hull construction with automatic dimensionality detection (1D/2D/3D)
- Riesz energy optimization with exponent continuation (p: 2 → 6)
- Gamut penalty via finite differences through inverse lift
- Deterministic greedy particle initialization with exact face areas
- Face atlas with edge-crossing logic for particle movement on hull surface
- Gamut clipping preserving hue and lightness (Bottosson's method)
- Full OKLab/OKLCh/sRGB color conversion pipeline

### Algorithm

- Hull, atlas, and optimization all operate in a single lifted space — no geometry/physics split
- Gray avoidance emerges from lift geometry (contracted low-chroma region) — no separate energy term
- Chroma preservation guaranteed by convexity of the lift function (Jensen's inequality)
- Plain Euclidean forces on flat faces — no warp Jacobian, no pullback
- Face areas are exact (flat faces in lifted space) — no subdivision approximation
