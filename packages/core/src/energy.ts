import type { ForceComputer, GamutChecker, OKLab, Particle, SpaceTransform, Vec3 } from './types';
import { oklabToLinearRgb } from './color-conversion';
import { vec3Add, vec3Scale, vec3Sub, vec3Norm } from './math';

function oklabToVec3(pos: OKLab): Vec3 {
  return [pos.L, pos.a, pos.b];
}

/**
 * Compute the scalar gamut penalty energy for a single OKLab position.
 * P = sum_c { c^2 if c < 0,  (c-1)^2 if c > 1,  0 otherwise }
 */
function gamutPenaltyEnergy(pos: OKLab): number {
  const rgb = oklabToLinearRgb(pos);
  let e = 0;
  for (const c of [rgb.r, rgb.g, rgb.b]) {
    if (c < 0) e += c * c;
    else if (c > 1) e += (c - 1) * (c - 1);
  }
  return e;
}

const FD_EPS = 1e-7;

/**
 * Compute the gradient of a scalar energy function at a working-space position
 * via forward finite differences. Perturbs each coordinate (L, a, b) by eps.
 */
export function finiteDifferenceGradient(
  pos: OKLab,
  energyFn: (p: OKLab) => number,
  eps: number,
): Vec3 {
  const base = energyFn(pos);
  const gL = (energyFn({ L: pos.L + eps, a: pos.a, b: pos.b }) - base) / eps;
  const ga = (energyFn({ L: pos.L, a: pos.a + eps, b: pos.b }) - base) / eps;
  const gb = (energyFn({ L: pos.L, a: pos.a, b: pos.b + eps }) - base) / eps;
  return [gL, ga, gb];
}

/**
 * Compute Riesz repulsion energy and analytical gradients from pairwise
 * distances in lifted (working) space.
 */
function liftedRepulsion(
  vecs: Vec3[],
  p: number,
): { energy: number; gradients: Vec3[] } {
  const n = vecs.length;
  const gradients: Vec3[] = Array.from({ length: n }, () => [0, 0, 0] as Vec3);
  let energy = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff: Vec3 = vec3Sub(vecs[i], vecs[j]);
      const rawDist = vec3Norm(diff);
      const dij = Math.max(rawDist, 1e-10);
      energy += Math.pow(dij, -p);
      const coeff = p * Math.pow(dij, -(p + 2));
      gradients[i] = vec3Add(gradients[i], vec3Scale(diff, -coeff));
      gradients[j] = vec3Add(gradients[j], vec3Scale(diff, coeff));
    }
  }

  return { energy, gradients };
}

/**
 * Compute Riesz repulsion energy and FD gradients from pairwise distances
 * of gamut-clipped OKLab positions.
 */
function clippedRepulsion(
  particles: readonly Particle[],
  clippedVecs: Vec3[],
  toClipped: (pos: OKLab) => OKLab,
  p: number,
  eps: number,
): { energy: number; gradients: Vec3[] } {
  const n = particles.length;
  const gradients: Vec3[] = Array.from({ length: n }, () => [0, 0, 0] as Vec3);

  // Compute base clipped energy
  let energy = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = vec3Sub(clippedVecs[i], clippedVecs[j]);
      const dij = Math.max(vec3Norm(diff), 1e-10);
      energy += Math.pow(dij, -p);
    }
  }

  // FD gradient: perturb each particle's working-space position
  for (let i = 0; i < n; i++) {
    const pos = particles[i].position;
    gradients[i] = finiteDifferenceGradient(
      pos,
      (perturbed: OKLab) => {
        const perturbedClipped = oklabToVec3(toClipped(perturbed));
        let e = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const diff = vec3Sub(perturbedClipped, clippedVecs[j]);
          const dij = Math.max(vec3Norm(diff), 1e-10);
          e += Math.pow(dij, -p);
        }
        return e;
      },
      eps,
    );
  }

  return { energy, gradients };
}

/**
 * Creates a ForceComputer that blends lifted-space and clipped-OKLab Riesz
 * repulsion via the β parameter, with gamut penalty gradient via finite
 * differences through the inverse lift.
 *
 * - β = 0: pure lifted-space repulsion (V5.1 behavior)
 * - β = 1: pure clipped-OKLab repulsion (V5.2)
 * - 0 < β < 1: linear blend of both energies and gradients
 */
export function createForceComputer(
  lift: SpaceTransform,
  gamut: GamutChecker,
): ForceComputer {
  const toClipped = (pos: OKLab): OKLab => gamut.clipPreserveChroma(lift.fromLifted(pos));

  return {
    computeForcesAndEnergy(
      particles: readonly Particle[],
      p: number,
      kappa: number,
      beta: number,
    ): { forces: Vec3[]; energy: number } {
      const n = particles.length;
      const vecs: Vec3[] = particles.map(pt => oklabToVec3(pt.position));

      // Lifted repulsion (skip if β = 1)
      const lifted = beta < 1
        ? liftedRepulsion(vecs, p)
        : { energy: 0, gradients: Array.from({ length: n }, () => [0, 0, 0] as Vec3) };

      // Clipped repulsion (skip if β = 0)
      let clipped: { energy: number; gradients: Vec3[] };
      if (beta > 0) {
        const clippedVecs = particles.map(pt => oklabToVec3(toClipped(pt.position)));
        clipped = clippedRepulsion(particles, clippedVecs, toClipped, p, FD_EPS);
      } else {
        clipped = { energy: 0, gradients: Array.from({ length: n }, () => [0, 0, 0] as Vec3) };
      }

      // Blend repulsion energy and gradients
      const oneMinusBeta = 1 - beta;
      const eRep = oneMinusBeta * lifted.energy + beta * clipped.energy;

      const forces: Vec3[] = [];
      let eGamut = 0;

      for (let i = 0; i < n; i++) {
        // Blended repulsion gradient
        const repGrad: Vec3 = vec3Add(
          vec3Scale(lifted.gradients[i], oneMinusBeta),
          vec3Scale(clipped.gradients[i], beta),
        );

        // Gamut penalty
        const pos = particles[i].position;
        const oklabPos = lift.fromLifted(pos);
        const penalty = gamutPenaltyEnergy(oklabPos);
        eGamut += penalty;

        let gamutGrad: Vec3 = [0, 0, 0];
        if (penalty > 0) {
          gamutGrad = finiteDifferenceGradient(
            pos,
            pos => gamutPenaltyEnergy(lift.fromLifted(pos)),
            FD_EPS,
          );
        }

        const totalGrad = vec3Add(repGrad, vec3Scale(gamutGrad, kappa));
        forces.push(vec3Scale(totalGrad, -1));
      }

      const energy = eRep + kappa * eGamut;
      return { forces, energy };
    },
  };
}
