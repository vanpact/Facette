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

import { hexToOklab } from './color-conversion';
import { detectDimensionality } from './dimensionality';
import { buildConvexHull } from './convex-hull';
import { classifySeeds } from './seed-classification';
import { buildAtlas } from './atlas';
import { createLineConstraint } from './line-segment';
import { createSurfaceConstraint } from './surface-navigation';
import { computeAdaptiveGamma } from './adaptive-gamma';
import { createSpaceLift } from './space-lift';
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

  if (options?.vividness !== undefined) {
    if (options.vividness < 0 || options.vividness > 4) {
      throw new Error('Vividness must be between 0 and 4');
    }
  }

  if (options?.spread !== undefined) {
    if (options.spread < 1 || options.spread > 2) {
      throw new Error('Spread must be between 1 and 2');
    }
  }
}

// -- r_s computation --

function computeRs(chromas: number[]): number {
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

  // 3. Compute adaptive gamma (delegated to adaptive-gamma module)
  const v = options?.vividness ?? 2;
  const gamma = computeAdaptiveGamma(oklabSeeds, v);

  // 4. Compute lift parameters
  const chromas = oklabSeeds.map(s => Math.sqrt(s.a * s.a + s.b * s.b));
  const rs = computeRs(chromas);
  const R = Math.max(...chromas);
  const spread = options?.spread ?? 1.5;
  const Lc = oklabSeeds.reduce((sum, s) => sum + s.L, 0) / oklabSeeds.length;

  // 5. Create space lift
  const lift = createSpaceLift({ rs, R, gamma, spread, Lc });

  // 6. Transform seeds to working space
  const workingSeeds = oklabSeeds.map(s => lift.toLifted(s));

  // 7. Detect dimensionality in working space
  const dimResult = detectDimensionality(workingSeeds);

  if (dimResult.dimension === 0) {
    throw new Error('Seeds must be distinct');
  }

  // 8. Wire up shared services
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
    for (const s of workingSeeds) {
      meanL += s.L; meanA += s.a; meanB += s.b;
    }
    meanL /= workingSeeds.length;
    meanA /= workingSeeds.length;
    meanB /= workingSeeds.length;

    for (let i = 0; i < workingSeeds.length; i++) {
      const s = workingSeeds[i];
      const proj = (s.L - meanL) * axis[0] + (s.a - meanA) * axis[1] + (s.b - meanB) * axis[2];
      if (proj < minProj) { minProj = proj; minIdx = i; }
      if (proj > maxProj) { maxProj = proj; maxIdx = i; }
    }

    const workingLine: LineGeometry = {
      kind: 'line',
      start: workingSeeds[minIdx],
      end: workingSeeds[maxIdx],
    };

    classifiedSeeds = classifySeeds(workingSeeds, workingLine);
    constraint = createLineConstraint(workingLine.start, workingLine.end);
    particles = initializeParticles1D(classifiedSeeds, workingLine, size);

    displayGeometry = {
      kind: 'line',
      start: lift.fromLifted(workingLine.start),
      end: lift.fromLifted(workingLine.end),
    };
  } else {
    // -- 2D/3D pipeline --
    const workingHull = buildConvexHull(workingSeeds);
    const atlas = buildAtlas(workingHull);

    classifiedSeeds = classifySeeds(workingSeeds, workingHull);
    constraint = createSurfaceConstraint(atlas, workingHull);
    particles = initializeParticlesHull(classifiedSeeds, workingHull, atlas, size);

    displayGeometry = {
      kind: 'hull',
      vertices: workingHull.vertices.map(v => lift.fromLifted(v)),
      faces: workingHull.faces,
      adjacency: workingHull.adjacency,
    };
  }

  // Restore OKLab positions on seed particles for display
  const displaySeeds = classifiedSeeds.map((s, i) => ({
    ...s,
    position: oklabSeeds[i],
  })) as Particle[];

  // 9. Create stepper
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
      // Seeds get their original OKLab positions (the L-stretch is one-directional,
      // so fromLifted would give stretched L values for seeds — restore originals).
      // Free particles get fromLifted which preserves stretched L (intended).
      const oklabPositions = lastFrame.particles.map((p, i) =>
        i < oklabSeeds.length ? oklabSeeds[i] : lift.fromLifted(p.position),
      );
      const { colors, clippedIndices } = finalizeColors(oklabPositions, gamut);
      return {
        geometry: displayGeometry,
        seeds: displaySeeds,
        frames: allFrames,
        finalColors: colors,
        clippedIndices,
        liftConfig: lift.config,
        vividness: v,
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
