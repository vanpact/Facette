import {
  isFree,
  type AnnealingSchedule,
  type ForceComputer,
  type MotionConstraint,
  type OKLab,
  type OptimizationFrame,
  type Particle,
  type Vec3,
} from './types';
import { vec3Scale, vec3Norm } from './math';

/**
 * Compute the minimum pairwise Euclidean distance in raw OKLab space
 * across all particle pairs.
 */
export function pairwiseMinDeltaE(positions: readonly OKLab[]): number {
  const n = positions.length;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const pi = positions[i];
    for (let j = i + 1; j < n; j++) {
      const pj = positions[j];
      const dL = pi.L - pj.L;
      const da = pi.a - pj.a;
      const db = pi.b - pj.b;
      const dist = Math.sqrt(dL * dL + da * da + db * db);
      if (dist < min) min = dist;
    }
  }
  return min;
}

/** Deep-copy a particle array (each particle is a shallow object with no nested refs). */
function cloneParticles(particles: Particle[]): Particle[] {
  return particles.map(p => ({
    ...p,
    position: { ...p.position },
  })) as Particle[];
}


export interface AnnealingScheduleOptions {
  step0?: number;
  gamma?: number;
  pStart?: number;
  pEnd?: number;
  kappa?: number;
  maxIterations?: number;
  /** Number of iterations over which p ramps from pStart to pEnd. Defaults to 1000. */
  rampIterations?: number;
  /** Number of iterations over which β ramps from 0 to 1. Defaults to rampIterations. */
  metricBlendEnd?: number;
}

/**
 * Creates a default annealing schedule per algorithm spec Section 10.
 *
 * - stepSize(k) = step0 * gamma^k  (exponential decay)
 * - p ramps linearly from pStart to pEnd over rampIterations (default 1000)
 * - kappa is constant
 * - Convergence:
 *     During p ramp: maxDisplacement < 1e-6
 *     After p ramp:  |deltaE / E| < 1e-6
 */
export function createAnnealingSchedule(options?: AnnealingScheduleOptions): AnnealingSchedule {
  const step0 = options?.step0 ?? 0.01;
  const gamma = options?.gamma ?? 0.995;
  const pStart = options?.pStart ?? 2;
  const pEnd = options?.pEnd ?? 6;
  const kappa = options?.kappa ?? 0.1;
  const maxIterations = options?.maxIterations ?? 2000;
  const rampEnd = options?.rampIterations ?? 1000;
  const blendEnd = options?.metricBlendEnd ?? rampEnd;

  return {
    getStepSize(iteration: number): number {
      return step0 * Math.pow(gamma, iteration);
    },

    getRieszExponent(iteration: number): number {
      if (iteration >= rampEnd) return pEnd;
      return pStart + (pEnd - pStart) * (iteration / rampEnd);
    },

    getGamutPenaltyWeight(_iteration: number): number {
      return kappa;
    },

    getMetricBlend(iteration: number): number {
      if (iteration >= blendEnd) return 1;
      return iteration / blendEnd;
    },

    isConverged(
      iteration: number,
      energy: number,
      prevEnergy: number,
      maxDisplacement: number,
    ): boolean {
      if (iteration >= maxIterations) return true;
      if (iteration < rampEnd) {
        return maxDisplacement < 1e-6;
      }
      // After p ramp, check relative energy change OR max displacement
      if (Math.abs(prevEnergy) < 1e-30) return maxDisplacement < 1e-6;
      return Math.abs((energy - prevEnergy) / prevEnergy) < 1e-6 || maxDisplacement < 1e-6;
    },
  };
}

/**
 * Main optimization loop generator. Yields one OptimizationFrame per iteration.
 *
 * Each step:
 *   1. Query schedule for p, kappa, stepSize
 *   2. Compute forces+energy via forces.computeForcesAndEnergy
 *   3. Compute projected forces and max displacement (for convergence)
 *   4. Yield frame with current particles and matching energy
 *   5. Check convergence
 *   6. Apply displacement to get next state
 */
export function* createOptimizationStepper(
  initialParticles: Particle[],
  forces: ForceComputer,
  constraint: MotionConstraint,
  inverseLift: (pos: OKLab) => OKLab,
  toMetricPosition: (particle: Particle, index: number) => OKLab,
  schedule: AnnealingSchedule,
): Generator<OptimizationFrame> {
  let particles = cloneParticles(initialParticles);
  let prevEnergy = Infinity;

  for (let iteration = 0; ; iteration++) {
    const p = schedule.getRieszExponent(iteration);
    const kappa = schedule.getGamutPenaltyWeight(iteration);
    const stepSize = schedule.getStepSize(iteration);

    // Compute forces and energy on current state
    const beta = schedule.getMetricBlend(iteration);
    const { forces: forceVecs, energy } = forces.computeForcesAndEnergy(particles, p, kappa, beta);

    // Project forces and find max force magnitude for normalization
    const projected: (Vec3 | null)[] = [];
    let maxForceNorm = 0;
    for (let i = 0; i < particles.length; i++) {
      if (isFree(particles[i])) {
        const proj = constraint.projectToTangent(forceVecs[i], particles[i]);
        const norm = vec3Norm(proj);
        if (norm > maxForceNorm) maxForceNorm = norm;
        projected.push(proj);
      } else {
        projected.push(null);
      }
    }

    // Compute max displacement that WOULD be applied (for convergence check)
    const normalizer = maxForceNorm > 1e-30 ? 1 / maxForceNorm : 0;
    let maxDisplacement = 0;
    for (let i = 0; i < particles.length; i++) {
      const proj = projected[i];
      if (proj !== null) {
        const dispNorm = vec3Norm(vec3Scale(proj, stepSize * normalizer));
        if (dispNorm > maxDisplacement) maxDisplacement = dispNorm;
      }
    }

    // Compute display-space and metric-space positions on current state.
    const oklabPositions = particles.map(pt => inverseLift(pt.position));
    const metricPositions = particles.map((pt, index) => toMetricPosition(pt, index));
    const minDeltaE = pairwiseMinDeltaE(metricPositions);

    // Yield frame — particles and energy are from the same state
    yield {
      iteration,
      particles: cloneParticles(particles),
      oklabPositions,
      energy,
      minDeltaE,
      p,
      stepSize,
    };

    // Check convergence
    if (schedule.isConverged(iteration, energy, prevEnergy, maxDisplacement)) {
      return;
    }

    prevEnergy = energy;

    // Apply displacements to produce next state
    const newParticles: Particle[] = [];
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const proj = projected[i];
      if (proj !== null) {
        const displacement = vec3Scale(proj, stepSize * normalizer);
        newParticles.push(constraint.applyDisplacement(particle, displacement));
      } else {
        newParticles.push(particle);
      }
    }

    particles = newParticles;
  }
}
