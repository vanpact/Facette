# Facette: Perceptual Color Palette Generation via Particle Repulsion on Convex Hulls in Lifted OKLab Space

## Version 5.0

---

## 1. Problem Statement

Given a small set of user-defined seed colors (typically 2–8), generate an expanded palette of N colors (typically 5–20) that:

- Are **perceptually distinct** from each other, with emphasis on worst-case distinguishability
- Remain **within the chromatic family** defined by the seeds
- Avoid muddy, desaturated colors **unless the seeds themselves are muted**
- Preserve chroma on intermediate colors between vivid seeds
- Require no manual intervention beyond choosing the seeds, the desired palette size, and a single creative parameter
- Adapt automatically to any seed configuration (vivid, muted, wrapping around the hue wheel, clustered, sparse)

### 1.1 Preconditions

The algorithm requires at least **2 distinct seed colors** and a requested palette size **N ≥ number of distinct seeds**. Every seed appears in the output as a pinned particle, so requesting fewer colors than seeds is a contradiction.

The following cases are explicitly not handled and must be rejected at input:

- **1 seed:** A single point defines no interpolation space. Palette generation from a single color is a fundamentally different problem (monochromatic variation) and is out of scope.
- **All seeds identical (or within a ΔE threshold):** The convex hull is degenerate (a point). Reject with an error indicating that seeds must be distinct.
- **All seeds collinear after accounting for the 2-seed case:** Handled as a 2-seed problem (see Section 3.3.1).
- **N < number of distinct seeds:** Reject. The palette cannot contain fewer colors than seeds.

---

## 2. Color Space: OKLab

All computation begins and ends in the OKLab perceptual color space, using Cartesian coordinates:

- **L** ∈ [0, 1]: perceptual lightness
- **a** ∈ [−0.5, +0.5]: green–red opponent axis
- **b** ∈ [−0.5, +0.5]: blue–yellow opponent axis

Derived polar quantities:

- **Chroma:** r = √(a² + b²), the radial distance from the neutral axis
- **Hue:** θ = atan2(b, a)

The neutral gray axis is the L axis (a = 0, b = 0). Euclidean distance in OKLab approximates perceived color difference for small to moderate distances.

**Why OKLab and not another space:** OKLab is computationally simple (two matrix multiplications and a cube root), has an analytical inverse, predicts hue uniformity well, and is now a CSS/web standard. It is not perfectly uniform — no color space is — but it offers the best trade-off between accuracy and simplicity for this application. A 2022 PNAS study (Bujack et al.) shows that large perceptual distances exhibit "diminishing returns," meaning perceptual color space is not truly Riemannian. Our radial lift, designed for a different purpose, may partially account for this effect, though we treat it as an engineering approximation rather than a perceptual model.

---

## 3. Architecture: The Unified Radial Lift

### 3.1 Core Idea

Previous versions of this algorithm suffered from a structural split: geometry (hull, faces, atlas) lived in OKLab, while physics (distances, energy) lived in warped space. This split caused two problems:

- **Gray avoidance required a separate energy mechanism** — the warped metric had to fight the OKLab geometry, pushing particles away from gray regions that flat OKLab faces forced them to occupy.
- **Chroma dip on intermediate colors** — flat faces between vivid seeds at different hues cut straight chords through OKLab, dipping to lower chroma at the midpoint (midpoint chroma = R·cos(θ/2) for hue separation θ).

V5 eliminates this split. **Everything — hull construction, atlas, optimization — operates in a single lifted space.** Seeds are transformed before hull construction; final positions are transformed back for output. The lifted space is Cartesian, so convex hulls, flat faces, Euclidean distances, and barycentric interpolation all remain valid. The lift serves three roles simultaneously:

1. **Gray avoidance:** the lift contracts the low-chroma region, reducing surface area near the gray axis. Particles spread proportionally to available area, naturally avoiding gray.
2. **Chroma preservation:** the convexity of the lift function guarantees (via Jensen's inequality) that inverse-mapped face interiors maintain higher chroma than flat OKLab interpolation.
3. **Family definition:** the convex hull in lifted space defines the palette's family boundary. When mapped back to OKLab, flat lifted-space faces become curved surfaces that arc outward from the L axis.

### 3.2 The Radial Lift Function

Define the base contraction function:

$$f(r) = \frac{r^2}{r + r_s}$$

where r = √(a² + b²) is chroma and r_s > 0 is the gray avoidance parameter.

Define the radial lift:

$$\rho(r) = R \cdot \left(\frac{f(r)}{f(R)}\right)^\gamma$$

where R > 0 is a reference chroma (set automatically to max seed chroma) and γ ≥ 1 controls convexity strength.

**The coordinate transform:**

$$T_\rho(L, a, b) = \left(L,\; \frac{\rho(r)}{r} \cdot a,\; \frac{\rho(r)}{r} \cdot b\right) \quad \text{for } r > 0$$

$$T_\rho(L, 0, 0) = (L, 0, 0)$$

Lightness L is unchanged. The chromatic plane (a, b) is radially rescaled by ρ(r)/r, preserving hue angles.

**Verified properties of ρ:**

|Property|Value|Significance|
|--------|-----|------------|
|ρ(0)|0|Gray maps to origin|
|ρ(R)|R|Reference chroma is a fixed point — seeds near max chroma barely distorted|
|ρ'(0)|0|All chromatic directions contract at gray (gray avoidance)|
|ρ'(r) > 0 for r > 0|Yes|Monotone, invertible|
|ρ convex|Yes|Guarantees chroma preservation via Jensen's inequality|

**Convexity proof:** f(r) is convex (f''(r) = 2r_s²/(r+r_s)³ > 0). The function x^γ is convex and increasing for γ ≥ 1. The composition of a convex increasing function with a convex function is convex. Scaling by the positive constant R/f(R)^γ preserves convexity. ✓

**Closed-form inverse:** Given a lifted chroma ρ, recover the original chroma r:

1. Compute u = f(R) · (ρ/R)^(1/γ)
2. Solve r²/(r + r_s) = u → r = (u + √(u² + 4u·r_s)) / 2

No numerical root-finding required. The full inverse transform T_ρ⁻¹ applies this to the radial component while preserving hue and lightness.

**At γ = 1:** ρ(r) = R·f(r)/f(R), which is f(r) scaled by a constant. The algorithm reduces exactly to V4.4 with the hull built in warped space. No regression.

**At γ > 1:** stronger convexity produces more outward bowing of OKLab faces, preserving more chroma on intermediate colors between vivid seeds.

### 3.3 Seed Geometry and Dimensionality

The algorithm operates entirely in lifted space from this point forward. All geometric operations — dimensionality detection, hull construction, atlas building, optimization — use lifted coordinates.

#### 3.3.1 Pipeline Entry: Transform Seeds

Convert seeds from sRGB to OKLab, then apply T_ρ. All subsequent geometry uses the lifted seed positions.

#### 3.3.2 Dimensionality Detection

Given the lifted seed points, compute the singular values (σ_1 ≥ σ_2 ≥ σ_3) of the mean-centered lifted seed matrix. The affine dimension is determined by the number of singular values above a tolerance threshold τ_dim:

- **0D (all identical):** All σ < τ_dim. Rejected (see Section 1.1).
- **1D (2 seeds, or 3+ collinear seeds):** σ_1 ≥ τ_dim, σ_2 < τ_dim. Line segment case (Section 3.4.1).
- **2D (3+ coplanar seeds):** σ_1, σ_2 ≥ τ_dim, σ_3 < τ_dim. Flat hull case (Section 3.4.2).
- **3D (4+ non-coplanar seeds):** All σ ≥ τ_dim. Full hull case (Section 3.5).

The threshold τ_dim should be set relative to σ_1 — for example, τ_dim = 1e-4 · σ_1. This catches near-degenerate configurations where the hull would be technically 3D but numerically fragile. Collapsing such cases to the lower-dimensional pipeline is safer than attempting to operate on a sliver hull.

**Note:** the lift is radial — it does not change hue angles or lightness. Seeds that are collinear on the L axis in OKLab remain collinear in lifted space. Seeds that are coplanar in OKLab may or may not remain coplanar in lifted space (the nonlinear radial rescaling can break coplanarity). Dimensionality detection in lifted space correctly reflects the geometry in which the algorithm operates.

#### 3.3.3 Seed Classification: Hull Vertices, Boundary Seeds, and Interior Seeds

After computing the convex hull in lifted space, classify each lifted seed into one of three categories:

**Hull-vertex seeds:** seeds that are vertices of the convex hull in lifted space. These are the natural anchors of the face atlas.

**Boundary seeds:** seeds that lie on the hull surface in lifted space but are not vertices — on the interior of a face or on an edge. Detection: for each non-vertex seed, test whether it lies on any hull face by computing barycentric coordinates. The seed is on the face if all barycentric coordinates are in [0, 1] within a tolerance and the distance to the face plane is below a threshold.

Policy: boundary seeds are **pinned on-surface particles** with fixed barycentric coordinates within their containing face.

**Interior seeds:** seeds that lie strictly inside the convex hull in lifted space.

Policy: interior seeds are **pinned off-surface particles** at their fixed lifted-space positions. They exert repulsive force on all other particles but do not move. They are not constrained to the hull surface.

**Important:** a seed's classification may differ between OKLab and lifted space. A seed that is extreme in OKLab chroma might become interior in lifted space if the nonlinear radial rescaling changes the extreme-point structure. This is correct — the lifted-space hull defines the algorithm's family, and classification should be consistent with it.

All pinned seeds create a "shadow" in the energy landscape — nearby movable particles are pushed away, leaving room around each seed in the palette.

**Consequence for family membership:** boundary and interior seeds are, by definition, convex combinations of the hull vertices in lifted space. When mapped back through T_ρ⁻¹, they are within the inverse-image family in OKLab. Their presence in the output strengthens the family anchoring.

### 3.4 Lower-Dimensional Cases

#### 3.4.1 Line Segment (1D): 2 Seeds or Collinear Seeds

The convex hull of collinear lifted seeds is a line segment between the two extreme points.

**Handling:** 1D particle repulsion along the segment in lifted space. Endpoint seeds are pinned. Remaining particles distribute with plain Euclidean repulsion along the segment. When mapped back through T_ρ⁻¹, the straight lifted-space segment becomes a curve in OKLab that bows outward from the L axis if it crosses the low-chroma region — providing automatic chroma preservation even in the 1D case.

Initialization: equal parametric intervals along the segment. The 1D case is much better behaved than the surface case and typically converges reliably.

For 3+ collinear seeds, intermediate seeds act as additional pinned particles along the segment.

#### 3.4.2 Flat Hull (2D): 3+ Coplanar Seeds

The hull is a flat convex polygon in lifted space. Fully supported by the main algorithm:

- **3 seeds:** One triangular face. No edge transitions. Boundary clamping on all edges.
- **4+ coplanar seeds:** Convex polygon triangulated into multiple faces. Standard atlas logic with edge transitions between internal edges and boundary clamping at polygon edges.

#### 3.4.3 Coplanar Seeds Along the Gray Axis

Seeds near the neutral axis in OKLab are compressed by T_ρ into a thin structure in lifted space. Particles distribute primarily by lightness, producing a near-monochromatic palette. This is correct behavior.

If all seeds lie exactly on the L axis (zero chroma), they map to the same axis in lifted space — collinear, handled as a line segment.

#### 3.4.4 Near-Degenerate Hulls

**Face area threshold:** faces with area below τ_face (e.g., 1e-8) in lifted space are flagged as degenerate. Their local bases are not computed, they are excluded from initialization, and particles cannot migrate onto them.

**Edge transition stability:** caught by the face area threshold. The dimensionality detection catches the most extreme cases by collapsing to lower-dimensional pipelines.

### 3.5 Full Hull (3D): The General Case

For 4+ non-coplanar lifted seeds, the convex hull is a closed polyhedron with triangular faces. This is the primary case.

### 3.6 Why the Surface, Not the Volume

Particles are constrained to the **surface** of the hull in lifted space. This is a **deliberate aesthetic prior** — a bias toward expressive boundary colors — not a mathematically necessary consequence of palette quality.

**Geometric argument:** interior points of the lifted hull are weighted averages of all vertices. When mapped back to OKLab, they tend toward lower chroma than surface points. The surface constraint produces more distinctive, chromatically vivid palettes.

**Adaptivity argument:** if muted colors are desired, the user provides muted seeds. The hull surface of muted seeds yields muted results. The surface constraint does not prevent muted palettes — it prevents palettes that are muddier than the seeds warrant.

Some valid palette colors may live in the hull interior. This method excludes them by construction — an intentional trade-off for consistently expressive results.

### 3.7 Self-Adapting Topology

The hull geometry in lifted space, combined with the radial contraction at low chroma, produces different palette structures depending on seed placement:

- **Seeds on one side of the hue wheel:** faces crossing through the contracted gray region have less surface area in lifted space. Fewer particles settle there. An open-shell distribution emerges.
- **Seeds wrapping around the hue wheel:** no face crosses gray. Full hull surface usable.
- **All muted seeds:** the lift is gentle (r_s is small relative to seed chromas). Particles distribute using whatever separation the hull offers. The palette stays muted.
- **Mixed vivid/muted seeds:** the hull spans a range of chromas. The lift contracts the low-chroma region, naturally deprioritizing gray-crossing faces.

This adaptation is automatic. No topology surgery, no face culling, no separate gray-avoidance energy.

---

## 4. Lift Parameters

### 4.1 Reference Chroma R

Set automatically:

$$R = \max_i(\text{chroma}(seed_i))$$

This anchors the lift so that the most vivid seed is barely distorted (ρ(R) = R). Seeds with lower chroma are compressed toward the origin proportionally to how much lower they are. R is not user-facing.

### 4.2 Gray Avoidance Radius r_s

Controls where the lift departs from near-linear behavior. Determines how strongly the low-chroma region is contracted.

**Rule:** Use the **median seed chroma** with floor and ceiling clamps:

$$r_s = \text{clamp}\left(\alpha \cdot \text{median}_i(\text{chroma}(seed_i)),\; r_{s,\text{min}},\; r_{s,\text{max}}\right)$$

with α ∈ (0.3, 0.5), r_{s,min} = 0.005, r_{s,max} = 0.10.

**Why median:** robust to one or two outlier muted seeds that should not weaken gray avoidance for the entire palette.

r_s can be exposed to the user as a "vividness" slider, overriding the automatic rule.

### 4.3 Convexity Strength γ

Controls how much faces bow outward in OKLab when mapped back through T_ρ⁻¹. Higher γ means more chroma preservation on intermediate colors between vivid seeds.

**Default:** γ = 1. At this value, the algorithm behaves identically to V4.4 with hull-in-warped-space. No regression.

**Optional:** γ = 1.5–2 for palettes with vivid seeds at wide hue separations where chroma preservation matters. γ can be exposed as an advanced user parameter.

### 4.4 Lightness Is Intentionally Untouched

Because L is unlifted, particles at different lightness values along the gray axis remain well-separated in lifted space. Low-chroma positions are **strongly disfavored** but not absolutely forbidden. A particle can occupy a low-chroma position if it has sufficient lightness separation from all other particles.

We deliberately do not lift L because:

- A light gray and a dark gray are genuinely different, perceptually distinct colors
- Lifting L by a chroma-dependent factor would distort lightness relationships throughout the space
- The hull surface in lifted space acts as the adaptive chroma constraint

### 4.5 Exact-Gray Limitation

The lift maps gray (r = 0) to the origin of the chromatic plane in lifted space. Because ρ'(0) = 0, a movable particle at exactly zero chroma in lifted space receives no chromatic gradient from Euclidean repulsion. It is a degenerate stationary point.

This means gray avoidance is a **soft preference**, not a hard rejection. In most configurations, particles never reach exact zero chroma because they are initialized away from it and the geometry provides insufficient surface area at gray for particles to settle there.

**Mitigation:** during initialization, apply a fixed perturbation to any particle whose initial position in lifted space has chroma below a threshold (e.g., r < 1e-6). The perturbation respects the constraint manifold:

- **1D (line segment):** perturb the scalar parameter t by +1e-5.
- **2D/3D (surface):** perturb in the particle's local face tangent plane. Use the projection of the lifted-space +a direction onto the tangent plane. If this projection is negligible (magnitude < 1e-8), use the face's local e_1 basis vector instead. Apply with magnitude ~1e-5. Alternate sign by particle index to avoid systematic hue bias.

The jitter is imperceptibly small. The algorithm is fully deterministic — no randomness anywhere.

---

## 5. Energy Function

### 5.1 Riesz Energy with Continuation

All energy computation uses **plain Euclidean distance in lifted space**. No warped distance function, no Jacobian pullback.

$$E_{\text{repulsion}} = \sum_{i < j} \frac{1}{\|p_i - p_j\|^p}$$

where p_i are positions in lifted space and p is the Riesz exponent.

**Continuation in p:** start at p = 2 for global exploration on a smooth energy landscape, ramp to p = 6 to sharpen focus on worst-case pair separation. This reduces local-minimum sensitivity in the early phase.

### 5.2 Gamut-Aware Penalty

Particles live in lifted space; gamut is defined in sRGB. The penalty bridges the two spaces.

**Evaluation chain:** for each particle position in lifted space, apply T_ρ⁻¹ to get OKLab coordinates, convert to linear RGB, then compute the per-channel penalty:

$$E_{\text{gamut}} = \kappa \sum_i \sum_{c \in \{R,G,B\}} \left[\max(0, -c_i)^2 + \max(0, c_i - 1)^2\right]$$

This penalizes channels below 0 or above 1 with a smooth quadratic ramp. Zero for in-gamut points.

**Gradient computation:** use finite differences in lifted space. For each out-of-gamut particle, perturb each lifted coordinate by ε, map through T_ρ⁻¹ and RGB conversion, recompute penalty, get the numerical gradient. This costs 3 extra T_ρ⁻¹ evaluations per out-of-gamut particle per iteration.

**Why finite differences:** the analytical gradient requires composing J_{T_ρ⁻¹} with J_{RGB←OKLab} (which includes the non-constant cubic diagonal). Finite differences are trivially correct, easy to implement, and the cost is negligible — most particles are in gamut (zero penalty, no gradient needed).

### 5.3 Total Energy

$$E = E_{\text{repulsion}} + E_{\text{gamut}}$$

E_repulsion is smooth (standard Euclidean Riesz on flat faces). E_gamut is C¹ continuous with finite-difference gradient.

The **constrained** problem — particles on a polyhedral hull surface with face transitions and boundary clamping — is **piecewise smooth**, not globally smooth. The energy is smooth within each face, but face transitions introduce non-smooth boundaries. Gradient-based optimization works well on piecewise smooth problems; the face transitions are handled explicitly by the atlas.

---

## 6. Movement Model: Face Atlas with Edge Transitions

### 6.1 Why Face Atlas

|Approach|Pros|Cons|Verdict|
|--------|----|----|-------|
|3D project-back|Simple|Oscillation at sharp edges|Rejected|
|Sphere remapping|Easy projection|Jacobian issues|Rejected|
|Log-sum-exp smoothing|Smooth everywhere|Extra parameter, approximation|Viable but complex|
|Face atlas|Exact, no parameters, debuggable|Edge-crossing bookkeeping|**Selected**|

### 6.2 Construction

All construction occurs in lifted space, where faces are genuinely flat.

For each triangular face F_k with lifted-space vertices (V_0, V_1, V_2), whose area exceeds τ_face:

**Local 2D basis:**

- e_1 = normalize(V_1 − V_0)
- n = normalize((V_1 − V_0) × (V_2 − V_0))
- e_2 = n × e_1
- Origin: V_0

**Edge transitions:** for each edge shared by two non-degenerate faces, the particle's new position is recomputed in the neighbor face by evaluating barycentric coordinates directly (clamped if overshooting). This is simpler than precomputing per-edge 2D affine transforms and numerically equivalent for the small face counts in palette problems.

**Boundary edges:** particles slide along them but cannot cross.

**Degenerate face edges:** treated as boundary edges.

### 6.3 Particle State

Each particle stores: face ID and barycentric coordinates (λ_0, λ_1, λ_2) with λ_i ≥ 0, Σλ_i = 1. The 3D lifted-space position is P = λ_0·V_0 + λ_1·V_1 + λ_2·V_2.

### 6.4 Edge Crossing Logic

After applying a 2D displacement in local coordinates:

1. Recompute barycentric coordinates.
2. If all λ_i ≥ 0: particle stays on the same face.
3. If any λ_i < 0: particle has exited through the edge opposite vertex i.
   - **Internal edge:** apply transition transform, continue remaining displacement in neighbor face.
   - **Boundary or degenerate edge:** project displacement onto edge direction. Particle slides along boundary.

### 6.5 Specialization for Lower Dimensions

- **Line segment:** scalar parameter t ∈ [0, 1]. Boundary clamping at endpoints.
- **Single triangle:** one face, boundary clamping on all edges.

---

## 7. Initialization: Deterministic Greedy Placement

### 7.1 Face Areas Are Exact

Because faces are flat in lifted space, face area is computed exactly as ½|e_1 × e_2|. No subdivision approximation is needed. This is a direct simplification from V4.4, where the nonlinear warp made face areas approximate.

### 7.2 Algorithm

**For line segments (1D):** pin endpoint seeds, place remaining particles at equal parametric intervals.

**For surfaces (2D and 3D):**

1. **Pin seeds.** Classify seeds into hull-vertex, boundary, and interior (Section 3.3.3). Hull-vertex and boundary seeds are pinned on-surface. Interior seeds are pinned off-surface at their fixed lifted-space positions. All pinned seeds exert repulsive force but do not move.

2. **Place remaining N − |seeds| particles one at a time:**
   - For each non-degenerate face, compute score = face_area / (1 + count of particles already on it)
   - Select the face with the highest score
   - Within that face, place the particle at the position maximizing minimum Euclidean distance (in lifted space) to all existing particles. Computed by evaluating a grid of candidate barycentric positions (e.g., 5×5) and selecting the best.

3. **Apply exact-gray jitter** for any particle with lifted-space chroma below 1e-6, as described in Section 4.5.

4. The result is an initial configuration distributed proportionally to surface area, with no particle in a trivially low-energy position.

---

## 8. Optimization Loop

### 8.1 Algorithm

```text
Input: Hull mesh in lifted space, pinned seeds, initial particle positions,
       parameters (p_start, p_end, κ, step schedule)

Precompute:
  - Face atlas (local bases, edge transitions, degenerate face flags)
  - Exact face areas

Loop until convergence:
  1. Compute pairwise Euclidean distances in lifted space
  2. Compute repulsion gradient: ∇E_repulsion for each movable particle
     (standard Euclidean Riesz gradient, using current p)
  3. For out-of-gamut particles only:
     map through T_ρ⁻¹ → OKLab → linear RGB
     compute gamut penalty gradient via finite differences in lifted space
  4. Compute force: F = −(∇E_repulsion + ∇E_gamut)
  5. Project force onto local face tangent plane → 2D displacement
  6. Normalize forces by maximum force magnitude, then scale by current step size (annealed).
     This decouples step size from absolute force magnitude, which varies by orders of magnitude as p changes during continuation.
  7. Apply displacement with edge-crossing logic (Section 6.4)
  8. Update p according to continuation schedule
  9. Check convergence (see Section 8.3)

Output: Final lifted-space positions for all particles
```

The optimization loop contains no warp Jacobians, no pullbacks, no nonlinear distance functions. All forces are standard Euclidean on flat faces. The gamut penalty is the only place where T_ρ⁻¹ is evaluated during optimization, and only for out-of-gamut particles.

### 8.2 Annealing Schedules

**Step size:** geometric decay, step_k = step_0 · δ^k, with δ ∈ (0.98, 0.999).

**Riesz exponent:** ramp from p_start = 2 to p_end = 6 over the first ~50% of iterations, then held constant.

### 8.3 Convergence

**During p continuation (p < p_end):** use maximum particle displacement as progress indicator. The energy function is changing, so |ΔE/E| is not meaningful.

**After p reaches p_end:** convergence tested by |ΔE/E| < threshold (e.g., 1e-6), or maximum displacement < perceptual threshold.

**Fallback:** hard iteration cap (e.g., 2000).

For palette-sized problems (N < 20), convergence typically requires 200–1000 iterations. Pairwise force computation is O(N²) per iteration, negligible for small N.

---

## 9. Output

### 9.1 Inverse Transform

Apply T_ρ⁻¹ to all final particle positions, mapping from lifted space back to OKLab. Flat faces in lifted space become curved surfaces in OKLab that arc outward from the L axis, naturally preserving chroma on intermediate colors.

### 9.2 Final Gamut Check

Despite the gamut penalty during optimization, some positions may be marginally out of gamut. Apply gamut clipping that preserves hue and lightness: binary search on chroma at fixed L and h to find the maximum in-gamut chroma (20 iterations, tolerance ~1e-6). This is typically a minimal perturbation.

The fraction of output colors requiring clipping depends on the seed configuration. The algorithm does not guarantee all optimized positions are exactly in gamut; it guarantees that the penalty strongly discourages out-of-gamut positions and that final clipping produces valid sRGB output.

### 9.3 What the Output Represents

- **Optimization domain:** hull surface in lifted space
- **Delivered output:** in-gamut sRGB colors
- **Family membership:** particles lie on the inverse image of the lifted-space hull under T_ρ. This is a curved surface in OKLab that bows outward from the L axis. Family membership is exact for points that were already in gamut, approximate after final clipping.

### 9.4 Conversion

Transform final OKLab positions to linear RGB, apply sRGB gamma. Output is a set of N sRGB colors.

---

## 10. Complete Parameter Summary

|Parameter|Symbol|Default|Meaning|
|---------|------|-------|-------|
|Palette size|N|User-specified|Total colors including seeds|
|Gray avoidance radius|r_s|α · median(seed chromas), clamped|Chroma below which lift is strongly nonlinear|
|Convexity strength|γ|1|Chroma preservation on intermediates. γ=1 is default; γ>1 for vivid palettes|
|Reference chroma|R|max(seed chromas)|Anchors the lift; set automatically|
|Riesz exponent start|p_start|2|Initial exponent for smooth exploration|
|Riesz exponent end|p_end|6|Final exponent emphasizing worst-case spacing|
|Gamut penalty weight|κ|0.1|Strength of gamut boundary avoidance|
|Initial step size|step_0|0.01|Starting displacement magnitude|
|Annealing rate|δ|0.995|Step size decay per iteration|
|Convergence threshold|—|1e-6|Relative energy change to stop|
|Warping scale|α|0.4|Fraction of median chroma for r_s|
|r_s floor|r_{s,min}|0.005|Minimum r_s|
|r_s ceiling|r_{s,max}|0.10|Maximum r_s|
|Dimensionality threshold|τ_dim|1e-4 · σ_1|Collapse to lower dimension|
|Face area threshold|τ_face|1e-8|Minimum face area|
|Max iterations|—|2000|Hard cap|

User-facing parameters: **N** (palette size), optionally **r_s** (vividness slider), optionally **γ** (chroma preservation for advanced users). All others have robust defaults.

---

## 11. Algorithm Properties

### 11.1 What the Algorithm Provides

- Every seed color appears in the output palette (pinned particles — hull-vertex and boundary seeds on-surface, interior seeds off-surface, all in lifted space)
- Generated colors are optimized on the convex hull surface in lifted space, constraining them to the inverse-image family in OKLab
- Output colors are valid sRGB (gamut penalty + final clipping)
- Steep Riesz energy with continuation strongly discourages near-duplicate colors
- Gray avoidance emerges automatically from the lift geometry — no separate energy term
- Chroma preservation on intermediate colors is guaranteed by the convexity of ρ
- Dimensionality and degeneracy are handled explicitly

### 11.2 What the Algorithm Does Not Guarantee

- **Global optimality:** local minima are possible, though deterministic initialization and exponent continuation mitigate this
- **Exact maximin spacing:** the steep Riesz potential approximates but does not equal maximin
- **Perfect perceptual uniformity:** OKLab is approximately uniform; large differences exhibit diminishing returns
- **Exact family membership after gamut clipping:** final gamut mapping may move points slightly off the inverse-image surface
- **All points in gamut before final clipping:** the gamut penalty strongly discourages but does not hard-constrain
- **Hard gray rejection:** gray avoidance is a soft geometric preference. A particle at exact zero chroma is a degenerate stationary point. Initialization jitter (Section 4.5) mitigates this.

### 11.3 Computational Complexity

- Lift transform: O(|seeds|), done once
- Hull construction: O(|seeds| log |seeds|)
- Atlas construction: O(|faces|), done once
- Per iteration: O(N²) for pairwise forces (plain Euclidean)
- Inverse transform: O(N), done once at output
- Total: O(N² · iterations), negligible for palette-sized problems

---

## 12. Recommended Validation Benchmarks

|Test Case|Seeds|What It Stresses|
|--------|------|----------------|
|Line segment|2 vivid complementary colors|1D repulsion, gray-crossing, chroma preservation via T_ρ⁻¹|
|Gray-crossing triangle|3 seeds spanning the gray axis|Area contraction, gray avoidance, muted region|
|One-sided hue cluster|4–5 vivid seeds in narrow hue range|Hull shape vs. palette diversity|
|Full hue wraparound|4–6 seeds evenly around hue wheel|Closed hull, pure spacing|
|Muted anchor|1 warm gray + 4 vivid seeds|r_s robustness, interior seed handling|
|All muted|4 low-chroma seeds|Lift gentleness, palette stays muted|
|Gamut stress|Deep blues + saturated cyans|Gamut penalty, clipping frequency|
|Near-coplanar|4 seeds with very small σ_3|Dimensionality detection, numerical stability|
|Wide hue vivid|2–3 vivid seeds at 120°+ separation|Chroma preservation, γ effect|

Measure: minimum pairwise ΔE in OKLab, distribution of pairwise distances, fraction requiring final gamut clipping, and subjective family coherence.

---

## 13. Comparison with V4.4

### 13.1 What Changed

|Aspect|V4.4|V5|
|------|----|--|
|Hull construction|OKLab|Lifted space|
|Atlas faces|Flat in OKLab (curved in warped space)|Flat in lifted space|
|Repulsion energy|Warped distance with J_T pullback|Plain Euclidean|
|Gray avoidance|Separate mechanism (warped energy)|Emergent from lift geometry|
|Chroma preservation|Not addressed|Guaranteed by convexity of ρ|
|Face areas for init|Approximate (subdivision needed)|Exact (flat faces)|
|Centroids for init|Approximate|Exact|
|Warp Jacobian|Required per particle per iteration|Eliminated|
|Gamut penalty gradient|Analytical (complex chain rule)|Finite differences (trivially correct)|
|γ parameter|Not present|Controls chroma preservation|
|R parameter|Not present|Anchors lift normalization|

### 13.2 What Stayed the Same

- OKLab as the ambient perceptual space
- Convex hull surface as the optimization domain (aesthetic prior)
- Face atlas with edge transitions for particle movement
- Three-way seed classification (hull-vertex / boundary / interior)
- Riesz energy with continuation from p=2 to p=6
- Quadratic gamut penalty in linear RGB
- Deterministic greedy initialization
- Exact-gray jitter (manifold-respecting)
- Dimensionality detection via SVD with thresholds
- Degenerate face handling
- Convergence criteria (dual regime for p-continuation)
- All preconditions and output guarantees

### 13.3 Why It Changed

The V4.4 architecture had a structural split: geometry in OKLab, physics in warped space. This caused:

1. **Complexity:** the warp Jacobian J_T had to be derived, computed per particle per iteration, and pulled back through the gradient. This was the most complex and error-prone part of the algorithm.
2. **Chroma dip:** flat OKLab faces between vivid seeds at different hues cut straight chords through color space, dipping to lower chroma. The warped metric couldn't fix this because it was designed to approach Euclidean at high chroma.
3. **Approximate initialization:** face areas and centroids in warped space required subdivision approximation because T is nonlinear.

V5 eliminates the split by moving everything to lifted space. The lift does three jobs simultaneously (gray avoidance, chroma preservation, family definition), the optimization becomes plain Euclidean, and initialization is exact.

---

## 14. Responses to Peer Review

### Rounds 1–7

All issues from Rounds 1–7 remain resolved. The V5 architecture does not regress on any previously fixed issue:

- **R1 §3.1 (metric inconsistency):** resolved — no metric/transform mixing; all computation is Euclidean in lifted space.
- **R1 §3.2 (lightness untouched):** retained intentionally. See Section 4.4.
- **R1 §3.3 (objective mismatch):** Riesz energy with continuation retained. See Section 5.1.
- **R1 §3.4 (gamut handling):** gamut penalty retained, now with finite differences. See Section 5.2.
- **R1 §3.5 (surface bias):** retained as aesthetic prior. See Section 3.6.
- **R2 §1 (gray overstated):** "strongly disfavored" language retained. See Section 3.7.
- **R2 §2 (surface is a prior):** retained. See Section 3.6.
- **R2 §3 (gamut formula):** quadratic outside penalty retained. See Section 5.2.
- **R2 §4 (guarantee conflict):** honest output description retained. See Section 9.3.
- **R2 §5 (warped area approximate):** resolved — areas are now exact (flat faces). See Section 7.1.
- **R2 §6 (r_s brittle):** median with clamps retained. See Section 4.2.
- **R2 §7 (degenerate hulls):** explicit handling retained. See Sections 3.3.2, 3.4.4.
- **R3 §1 (gamut differentiability):** resolved — finite differences bypass the issue.
- **R3 §2 (sliver tolerances):** retained. See Section 3.4.4.
- **R3 §3 (warped area weakest where it matters):** resolved — areas exact.
- **R4 §1 (optimization sign):** F = −∇E retained. See Section 8.1.
- **R4 §2 (OKLab→RGB Jacobian):** no longer needed in optimization loop — finite differences only.
- **R4 §3 (smoothness overstated):** piecewise smooth description retained. See Section 5.3.
- **R5 §1 (interior seeds):** three-way classification retained. See Section 3.3.3.
- **R5 §2 (warp Jacobian pullback):** eliminated — plain Euclidean repulsion in lifted space.
- **R5 §3 (convergence during continuation):** dual regime retained. See Section 8.3.
- **R5 §4 (N ≥ seeds):** retained. See Section 1.1.
- **R6 §1 (boundary seeds):** three-way classification retained. See Section 3.3.3.
- **R6 §2 (exact-gray):** limitation documented, jitter specified. See Section 4.5.
- **R7 §1 (jitter off manifold):** manifold-respecting jitter retained. See Section 4.5.
- **R7 §2 (J_T ε cancels jitter):** no longer applicable — no J_T in the optimization loop.
- **R7 §3 (1D claim):** softened wording retained.
- **R7 §4 (saddle claim):** "degenerate stationary point" retained.

### Round 8: V5 Architectural Change

#### 14.1 Unified radial lift architecture

**Status: New in V5.** The hull, atlas, and optimization now operate entirely in lifted space. The radial lift T_ρ with convex function ρ(r) = R·(f(r)/f(R))^γ replaces the V4.4 warp-then-compute-in-OKLab approach. This eliminates the geometry/physics split, the warp Jacobian, the approximate face areas, and the chroma dip problem. At γ = 1, the algorithm reduces exactly to V4.4 with hull-in-warped-space. The change is structural, not incremental.

#### 14.2 Gray avoidance absorbed into geometry

**Status: New in V5.** Gray avoidance is no longer a separate energy mechanism. It emerges from the lift geometry: the contracted low-chroma region has less surface area in lifted space, so particles naturally spread away from it. No warped distance function, no special energy term.

#### 14.3 Chroma preservation via convexity

**Status: New in V5.** Jensen's inequality applied to the convex lift function ρ guarantees that inverse-mapped face interiors maintain higher chroma than flat OKLab interpolation. The γ parameter controls the strength of this effect. This directly addresses the chroma dip problem identified in V4.4 testing.

#### 14.4 Simplified optimization

**Status: New in V5.** The optimization loop uses plain Euclidean Riesz repulsion on flat faces. No warp Jacobian computation, no pullback, no nonlinear distance function. The gamut penalty uses finite differences through T_ρ⁻¹, bypassing the need for analytical Jacobians. Net reduction in implementation complexity: ~115 lines eliminated.

---

## 15. Implementation Components

### Component Dependency Order

```text
[1] Color Conversion (sRGB → OKLab)
         ↓
[2] Radial Lift (T_ρ: OKLab → lifted space)
         ↓
[3] Dimensionality Detection (SVD of lifted seeds)
         ↓
    ┌───────────────────────────────────────┐
    │ 1D: Line segment in lifted space      │
    │ 2D: Flat polygon + atlas              │
    │ 3D: Full hull + atlas + degeneracy    │
    └───────────────────────────────────────┘
         ↓
[3b] Seed Classification (hull-vertex / boundary / interior in lifted space)
         ↓
[4] Energy Function (plain Euclidean Riesz + gamut penalty via T_ρ⁻¹)
         ↓
[5] Initialization (pin seeds, exact face areas, sampled greedy placement, gray jitter)
         ↓
[6] Optimization Loop (Euclidean forces → tangent projection → displacement → edge crossing → anneal)
         ↓
[7] Output (T_ρ⁻¹ → OKLab → gamut clip → sRGB)
```

### Estimated Implementation Complexity

|Component|Lines of Code (approx.)|Notes|
|---------|-----------------------|-----|
|Color conversion|30|Ottosson's reference|
|Radial lift T_ρ + inverse|30|Forward transform, closed-form inverse|
|Dimensionality detection|25|SVD + threshold logic|
|Convex hull|Library call|QHull / SciPy / CGAL|
|Seed classification|30|Barycentric tests in lifted space|
|Face atlas + degeneracy|100|Basis computation, transitions, thresholds|
|Energy function|40|Euclidean Riesz + gamut penalty with finite differences|
|Initialization|60|Exact areas, sampled greedy placement, jitter|
|Optimization loop|80|Plain Euclidean forces, edge crossing, annealing|
|1D specialization|30|Line segment repulsion|
|Output|25|T_ρ⁻¹, gamut clip, sRGB conversion|
|**Total**|**~450**|Excluding library dependencies|

---

## 16. Summary

Facette generates perceptually distinct color palettes by treating the problem as particle repulsion on the convex hull surface of user-defined seed colors in a radially lifted OKLab space. The convex radial lift serves three roles simultaneously: it contracts the low-chroma region (gray avoidance), guarantees chroma preservation on intermediate colors (Jensen's inequality), and defines the palette family (hull in lifted space). The optimization is plain Euclidean — no warped distances, no Jacobian pullbacks — operating on genuinely flat faces in lifted space. When mapped back to OKLab, the flat lifted-space faces become curved surfaces that arc outward from the neutral axis, naturally producing vivid intermediate colors.

**The lift defines the family. The convexity preserves the vividness. Plain physics distributes the colors.**
