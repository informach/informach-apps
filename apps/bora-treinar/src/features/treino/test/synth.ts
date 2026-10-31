import { cadenceState, cycleDuration } from "../body/cadence";
import { skeletonToLandmarks } from "../body/landmarks";
import { POSES } from "../body/poses";
import type { Exercise } from "../catalog/catalog";

/** Gerador pseudoaleatório determinístico para testes reproduzíveis. */
export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Quadros sintéticos (30 fps) de `reps` repetições, com profundidade máxima `maxDepth` e ruído em metros. */
export function synthFrames(ex: Exercise, reps: number, maxDepth = 1, noise = 0.012, seed = 7) {
  const rand = rng(seed);
  const pose = POSES[ex.pose];
  const total = cycleDuration(ex.cadence) * reps + 1;
  const frames = [];
  for (let t = 0; t < total; t += 1 / 30) {
    const st = t < 0.5 ? { depth: 0, phase: 0, cycle: 0 } : cadenceState(ex.cadence, t - 0.5);
    const done = st.cycle >= reps;
    frames.push({
      t: t * 1000,
      lm: skeletonToLandmarks(
        pose({
          depth: done ? 0 : st.depth * maxDepth,
          phase: done ? 0 : st.phase,
          time: t,
          cycle: st.cycle,
        }),
        noise,
        rand,
      ),
    });
  }
  return frames;
}
