// === Primitives ===
export type Vec3 = [number, number, number];
export interface OKLab { L: number; a: number; b: number }
export interface OKLCh { L: number; C: number; h: number }
export interface LinRGB { r: number; g: number; b: number }
export interface Barycentric { w0: number; w1: number; w2: number }

// Edge keys use canonical vertex ordering: `${min(i,j)}-${max(i,j)}`
export type EdgeKey = string;

// === Geometry ===

/** HullGeometry exposes only topology. Computed properties (bases, areas,
 *  degeneracy flags) are accessed exclusively through AtlasQuery (LoD). */
export interface HullGeometry {
  kind: 'hull';
  vertices: OKLab[];
  faces: Array<{ vertexIndices: [number, number, number] }>;
  adjacency: Map<EdgeKey, [number, number]>;  // edge → [faceA, faceB]
}

/** LineGeometry for the 1D case (2 seeds or collinear seeds).
 *  Particles are parameterized by scalar t ∈ [0, 1] along the segment. */
export interface LineGeometry {
  kind: 'line';
  start: OKLab;
  end: OKLab;
}

export type Geometry = HullGeometry | LineGeometry;

// === Particles (discriminated union) ===
export type Particle =
  | { kind: 'pinned-vertex';   position: OKLab; vertexIndex: number }
  | { kind: 'pinned-boundary'; position: OKLab; faceIndex: number; bary: Barycentric }
  | { kind: 'pinned-interior'; position: OKLab }
  | { kind: 'free';            position: OKLab; faceIndex: number; bary: Barycentric }
  | { kind: 'pinned-endpoint'; position: OKLab; t: number }
  | { kind: 'pinned-1d';       position: OKLab; t: number }
  | { kind: 'free-1d';         position: OKLab; t: number };

/** Type guard: is this particle free to move? Centralises the check (Open/Closed). */
export function isFree(p: Particle): p is Extract<Particle, { kind: 'free' | 'free-1d' }> {
  return p.kind === 'free' || p.kind === 'free-1d';
}

// === Narrow Interfaces (ISP + DIP) ===

/** Narrow interface for consumers that only need the coordinate transform (ISP). */
export interface SpaceTransform {
  toLifted(pos: OKLab): OKLab;
  fromLifted(pos: OKLab): OKLab;
}

/** Construction parameters — grouped for diagnostics/tracing (OCP). */
export interface SpaceLiftConfig {
  readonly rs: number;
  readonly R: number;
  readonly gamma: number;
}

/** Full interface: transform + diagnostic metadata. Only the orchestrator needs this. */
export interface SpaceLift extends SpaceTransform {
  readonly config: SpaceLiftConfig;
}

/**
 * ForceComputer is constructed with SpaceTransform and GamutChecker
 * injected (DIP). Only per-iteration parameters (p, kappa) are
 * passed at call time since they change via annealing.
 * Returns forces AND scalar energy in one pass (shared pairwise distances).
 */
export interface ForceComputer {
  computeForcesAndEnergy(
    particles: readonly Particle[],
    p: number,
    kappa: number,
  ): { forces: Vec3[]; energy: number };
}

export interface AtlasQuery {
  getFaceBasis(faceIndex: number): { u: Vec3; v: Vec3; normal: Vec3 };
  getFaceVertices(faceIndex: number): [OKLab, OKLab, OKLab];
  getAdjacentFace(faceIndex: number, edgeKey: EdgeKey): number | null;
  getFaceArea(faceIndex: number): number;
  isDegenerate(faceIndex: number): boolean;
  faceCount(): number;
}

/**
 * MotionConstraint is the unified interface for constraining particle
 * motion. Implemented by SurfaceConstraint (2D/3D hull) and
 * LineConstraint (1D segment). optimization.ts depends only on this.
 */
export interface MotionConstraint {
  projectToTangent(force: Vec3, particle: Particle): Vec3;
  applyDisplacement(particle: Particle, displacement: Vec3): Particle;
}

export interface GamutChecker {
  isInGamut(pos: OKLab): boolean;
  clipPreserveChroma(pos: OKLab): OKLab;
}

export interface AnnealingSchedule {
  getStepSize(iteration: number): number;
  getRieszExponent(iteration: number): number;
  getGamutPenaltyWeight(iteration: number): number;
  isConverged(
    iteration: number,
    energy: number,
    prevEnergy: number,
    maxDisplacement: number,
  ): boolean;
}

// === Optimization Trace Types ===

export interface OptimizationFrame {
  iteration: number;
  particles: Particle[];
  oklabPositions: OKLab[];
  energy: number;
  minDeltaE: number;
  p: number;
  stepSize: number;
}

export interface OptimizationTrace {
  geometry: Geometry;
  seeds: Particle[];
  frames: OptimizationFrame[];
  finalColors: string[];
  clippedIndices: number[];
  liftConfig: SpaceLiftConfig;
  vividness: number;
  spread: number;
  Lc: number;
}

// === Public API Types ===

export interface PaletteOptions {
  vividness?: number;   // adaptive gamma coefficient v. Default 2. Range [0, 4].
  spread?: number;      // lightness stretch factor. Default 1.5. Range [1, 5].
}

export interface PaletteResult {
  colors: string[];
  seeds: string[];
  metadata: {
    minDeltaE: number;
    iterations: number;
    clippedCount: number;
  };
}

export interface PaletteStepper {
  geometry: Geometry;
  seeds: Particle[];
  /** Returns a generator that yields one OptimizationFrame per iteration.
   *  The generator is created once and cached — calling frames() again
   *  returns the same generator (you cannot restart the optimization). */
  frames(): Generator<OptimizationFrame>;
  /** Drains all frames and returns the complete trace with final colors. */
  run(): OptimizationTrace;
}
