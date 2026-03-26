import type { ForceComputer, GamutChecker, OKLab, Particle, RadialLift, Vec3 } from './types';
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
 * Creates a ForceComputer that computes plain Euclidean Riesz repulsion
 * in lifted space, with gamut penalty gradient via finite differences
 * through the inverse lift.
 */
export function createForceComputer(
  lift: RadialLift,
  gamut: GamutChecker,
): ForceComputer {
  return {
    computeForcesAndEnergy(
      particles: readonly Particle[],
      p: number,
      kappa: number,
    ): { forces: Vec3[]; energy: number } {
      const n = particles.length;
      const vecs: Vec3[] = particles.map(pt => oklabToVec3(pt.position));

      const gradRep: Vec3[] = Array.from({ length: n }, () => [0, 0, 0] as Vec3);
      let eRep = 0;

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const diff: Vec3 = vec3Sub(vecs[i], vecs[j]);
          const rawDist = vec3Norm(diff);
          const dij = Math.max(rawDist, 1e-10);
          eRep += Math.pow(dij, -p);
          const coeff = p * Math.pow(dij, -(p + 2));
          gradRep[i] = vec3Add(gradRep[i], vec3Scale(diff, -coeff));
          gradRep[j] = vec3Add(gradRep[j], vec3Scale(diff, coeff));
        }
      }

      const forces: Vec3[] = [];
      let eGamut = 0;

      for (let i = 0; i < n; i++) {
        const pos = particles[i].position;
        const oklabPos = lift.fromLifted(pos);
        const penalty = gamutPenaltyEnergy(oklabPos);
        eGamut += penalty;

        let gamutGrad: Vec3 = [0, 0, 0];

        if (penalty > 0) {
          const gL = (gamutPenaltyEnergy(lift.fromLifted({ L: pos.L + FD_EPS, a: pos.a, b: pos.b })) - penalty) / FD_EPS;
          const ga = (gamutPenaltyEnergy(lift.fromLifted({ L: pos.L, a: pos.a + FD_EPS, b: pos.b })) - penalty) / FD_EPS;
          const gb = (gamutPenaltyEnergy(lift.fromLifted({ L: pos.L, a: pos.a, b: pos.b + FD_EPS })) - penalty) / FD_EPS;
          gamutGrad = [gL, ga, gb];
        }

        const totalGrad = vec3Add(gradRep[i], vec3Scale(gamutGrad, kappa));
        forces.push(vec3Scale(totalGrad, -1));
      }

      const energy = eRep + kappa * eGamut;
      return { forces, energy };
    },
  };
}
