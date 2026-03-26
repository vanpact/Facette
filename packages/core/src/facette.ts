import type {
  OKLab,
  Geometry,
  HullGeometry,
  LineGeometry,
  Particle,
  PaletteOptions,
  PaletteResult,
  PaletteStepper,
  OptimizationFrame,
  OptimizationTrace,
} from './types';

import { hexToOklab, oklabToOklch } from './color-conversion';
import { detectDimensionality } from './dimensionality';
import { buildConvexHull } from './convex-hull';
import { classifySeeds } from './seed-classification';
import { buildAtlas } from './atlas';
import { createLineConstraint } from './line-segment';
import { createSurfaceConstraint } from './surface-navigation';
import { createRadialLift } from './radial-lift';
import { createGamutChecker } from './gamut-clipping';
import { createForceComputer } from './energy';
import { initializeParticles1D, initializeParticlesHull } from './initialization';
import { createOptimizationStepper, createAnnealingSchedule } from './optimization';
import { finalizeColors } from './output';

// -- Validation helpers --

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validateInputs(
  seeds: string[],
  size: number,
  options?: PaletteOptions,
): void {
  if (seeds.length < 2) {
    throw new Error('At least 2 seed colors required');
  }

  for (const hex of seeds) {
    if (!HEX_RE.test(hex)) {
      throw new Error(`Invalid hex color: ${hex}`);
    }
  }

  const oklabSeeds = seeds.map(hexToOklab);

  let allIdentical = true;
  for (let i = 0; i < oklabSeeds.length && allIdentical; i++) {
    for (let j = i + 1; j < oklabSeeds.length; j++) {
      const dL = oklabSeeds[i].L - oklabSeeds[j].L;
      const da = oklabSeeds[i].a - oklabSeeds[j].a;
      const db = oklabSeeds[i].b - oklabSeeds[j].b;
      const dist = Math.sqrt(dL * dL + da * da + db * db);
      if (dist >= 1e-6) {
        allIdentical = false;
        break;
      }
    }
  }
  if (allIdentical) {
    throw new Error('Seeds must be distinct');
  }

  if (size < seeds.length) {
    throw new Error('Palette size must be >= number of seeds');
  }

  if (options?.vividness !== undefined && options.vividness !== 0) {
    if (options.vividness < 0.005 || options.vividness > 0.10) {
      throw new Error('Vividness must be between 0.005 and 0.10');
    }
  }

  if (options?.gamma !== undefined) {
    if (options.gamma < 1) {
      throw new Error('Gamma must be >= 1');
    }
  }
}

// -- r_s computation --

function computeRs(chromas: number[], vividness?: number): number {
  if (vividness !== undefined && vividness > 0) {
    return vividness;
  }

  const sorted = [...chromas].sort((a, b) => a - b);
  const n = sorted.length;
  const median =
    n % 2 === 1
      ? sorted[Math.floor(n / 2)]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  return Math.max(0.005, Math.min(0.10, 0.4 * median));
}

// -- Composition root --

export function createPaletteStepper(
  seeds: string[],
  size: number,
  options?: PaletteOptions,
): PaletteStepper {
  // 1. Validate
  validateInputs(seeds, size, options);

  // 2. Parse seeds to OKLab
  const oklabSeeds = seeds.map(hexToOklab);

  // 3. Compute lift parameters
  const chromas = oklabSeeds.map(s => oklabToOklch(s).C);
  const rs = computeRs(chromas, options?.vividness);
  const R = Math.max(...chromas);
  const gamma = options?.gamma ?? 1;

  // 4. Create radial lift
  const lift = createRadialLift(rs, R, gamma);

  // 5. Lift seeds to lifted space
  const liftedSeeds = oklabSeeds.map(s => lift.toLifted(s));

  // 6. Detect dimensionality in lifted space
  const dimResult = detectDimensionality(liftedSeeds);

  if (dimResult.dimension === 0) {
    throw new Error('Seeds must be distinct');
  }

  // 7. Wire up shared services
  const gamut = createGamutChecker();
  const forces = createForceComputer(lift, gamut);
  const schedule = createAnnealingSchedule();

  let displayGeometry: Geometry;
  let classifiedSeeds: Particle[];
  let particles: Particle[];
  let constraint;

  if (dimResult.dimension === 1) {
    // -- 1D pipeline --
    const axis = dimResult.principalAxes[0];
    let minProj = Infinity, maxProj = -Infinity;
    let minIdx = 0, maxIdx = 0;

    let meanL = 0, meanA = 0, meanB = 0;
    for (const s of liftedSeeds) {
      meanL += s.L; meanA += s.a; meanB += s.b;
    }
    meanL /= liftedSeeds.length;
    meanA /= liftedSeeds.length;
    meanB /= liftedSeeds.length;

    for (let i = 0; i < liftedSeeds.length; i++) {
      const s = liftedSeeds[i];
      const proj = (s.L - meanL) * axis[0] + (s.a - meanA) * axis[1] + (s.b - meanB) * axis[2];
      if (proj < minProj) { minProj = proj; minIdx = i; }
      if (proj > maxProj) { maxProj = proj; maxIdx = i; }
    }

    const liftedLine: LineGeometry = {
      kind: 'line',
      start: liftedSeeds[minIdx],
      end: liftedSeeds[maxIdx],
    };

    classifiedSeeds = classifySeeds(liftedSeeds, liftedLine);
    constraint = createLineConstraint(liftedLine.start, liftedLine.end);
    particles = initializeParticles1D(classifiedSeeds, liftedLine, size);

    // Display geometry: inverse-map to OKLab
    displayGeometry = {
      kind: 'line',
      start: lift.fromLifted(liftedLine.start),
      end: lift.fromLifted(liftedLine.end),
    };
  } else {
    // -- 2D/3D pipeline --
    const liftedHull = buildConvexHull(liftedSeeds);
    const atlas = buildAtlas(liftedHull);

    classifiedSeeds = classifySeeds(liftedSeeds, liftedHull);
    constraint = createSurfaceConstraint(atlas, liftedHull);
    particles = initializeParticlesHull(classifiedSeeds, liftedHull, atlas, size);

    // Display geometry: inverse-map hull vertices to OKLab
    displayGeometry = {
      kind: 'hull',
      vertices: liftedHull.vertices.map(v => lift.fromLifted(v)),
      faces: liftedHull.faces,
      adjacency: liftedHull.adjacency,
    };
  }

  // Restore OKLab positions on seed particles for display
  const displaySeeds = classifiedSeeds.map((s, i) => ({
    ...s,
    position: oklabSeeds[i],
  })) as Particle[];

  // 8. Create stepper
  const stepper = createOptimizationStepper(
    particles, forces, constraint, lift.fromLifted, schedule,
  );

  let cachedGenerator: Generator<OptimizationFrame> | null = null;

  return {
    geometry: displayGeometry,
    seeds: displaySeeds,
    frames() {
      if (cachedGenerator === null) {
        cachedGenerator = stepper;
      }
      return cachedGenerator;
    },
    run() {
      const allFrames = [...this.frames()];
      const lastFrame = allFrames[allFrames.length - 1];
      const oklabPositions = lastFrame.particles.map(p => lift.fromLifted(p.position));
      const { colors, clippedIndices } = finalizeColors(oklabPositions, gamut);
      return {
        geometry: displayGeometry,
        seeds: displaySeeds,
        frames: allFrames,
        finalColors: colors,
        clippedIndices,
        rs,
        gamma,
        R,
      };
    },
  };
}

// -- Sugar API --

export function generatePalette(
  seeds: string[],
  size: number,
  options?: PaletteOptions,
): PaletteResult {
  const stepper = createPaletteStepper(seeds, size, options);
  const trace = stepper.run();
  return {
    colors: trace.finalColors,
    seeds,
    metadata: {
      minDeltaE: trace.frames[trace.frames.length - 1].minDeltaE,
      iterations: trace.frames.length,
      clippedCount: trace.clippedIndices.length,
    },
  };
}
