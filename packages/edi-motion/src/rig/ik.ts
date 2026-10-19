import { identityMatrix, inverse, transformPoint } from "../affine";
import type { Kinematics } from "./kinematics";

export interface RigBone {
  targetId: string;
  length: number;
  minRotation: number;
  maxRotation: number;
}
export interface IkOptions {
  strength: number;
  bend: "positive" | "negative";
  tolerance: number;
  iterations: number;
}
export interface IkResult {
  residual: number;
  solvedResidual: number | null;
  converged: boolean;
  iterations: number;
  strength: number;
}
const degrees = (angle: number) => (angle * 180) / Math.PI;
export const angleDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;
const limited = (bone: RigBone, rotation: number) =>
  Math.max(bone.minRotation, Math.min(bone.maxRotation, rotation));

/** Positive uniform bone scale, zero pivots/skew and contiguous joints form
 * the explicit IK profile. Parent space may be any invertible affine matrix. */
export function validateIkChain(frame: Kinematics, chain: readonly RigBone[]) {
  if (
    chain.length < 1 ||
    chain.length > 8 ||
    new Set(chain.map((bone) => bone.targetId)).size !== chain.length
  )
    throw new Error("IK requer cadeia única de 1 a 8 ossos.");
  for (const [index, bone] of chain.entries()) {
    const object = frame.object(bone.targetId),
      pose = frame.pose(bone.targetId),
      parent = chain[index - 1];
    if (
      !Number.isFinite(bone.length) ||
      bone.length <= 0 ||
      bone.length > 100000 ||
      bone.minRotation > bone.maxRotation ||
      ![bone.minRotation, bone.maxRotation].every(
        (value) => Number.isFinite(value) && Math.abs(value) <= 10000,
      )
    )
      throw new Error("Dimensões/limites do osso inválidos.");
    if (
      object.tag !== "g" ||
      object.isComponent ||
      pose.sx <= 0 ||
      pose.sx !== pose.sy ||
      pose.px ||
      pose.py ||
      pose.skewX ||
      (index > 0 && object.basis?.some((value, index) => value !== identityMatrix()[index])) ||
      object.attributeMatrix?.some((value, index) => value !== identityMatrix()[index]) ||
      (parent && (object.parentId !== parent.targetId || pose.x !== parent.length || pose.y !== 0))
    )
      throw new Error(
        "IK requer ossos contíguos, escala uniforme positiva e pivô/skew/basis neutros; FK mantém os demais perfis.",
      );
  }
}
function solvePair(
  frame: Kinematics,
  first: RigBone,
  second: RigBone,
  target: { x: number; y: number },
  bend: IkOptions["bend"],
) {
  const root = frame.pose(first.targetId),
    child = frame.pose(second.targetId),
    local = transformPoint(inverse(frame.pre(first.targetId)), target.x, target.y),
    x = local.x - root.x,
    y = local.y - root.y,
    a = first.length * root.sx,
    b = second.length * root.sx * child.sx,
    cosine = Math.max(-1, Math.min(1, (x * x + y * y - a * a - b * b) / (2 * a * b))),
    elbow = Math.acos(cosine) * (bend === "positive" ? 1 : -1),
    shoulder =
      x === 0 && y === 0
        ? root.rotation
        : degrees(Math.atan2(y, x) - Math.atan2(b * Math.sin(elbow), a + b * Math.cos(elbow)));
  frame.set(first.targetId, {
    rotation: limited(first, root.rotation + angleDelta(root.rotation, shoulder)),
  });
  frame.set(second.targetId, {
    rotation: limited(second, child.rotation + angleDelta(child.rotation, degrees(elbow))),
  });
}
/** Analytic two-bone solve; longer chains use a deterministic analytic distal
 * seed and bounded cyclic coordinate descent. Residual is always reported. */
export function solveIkChain(
  frame: Kinematics,
  chain: readonly RigBone[],
  target: { x: number; y: number },
  options: IkOptions,
): IkResult {
  if (
    ![target.x, target.y, options.strength, options.tolerance, options.iterations].every(
      Number.isFinite,
    ) ||
    options.strength < 0 ||
    options.strength > 1 ||
    options.tolerance <= 0 ||
    options.tolerance > 100 ||
    !Number.isInteger(options.iterations) ||
    options.iterations < 1 ||
    options.iterations > 128
  )
    throw new Error("Parâmetros de IK inválidos.");
  validateIkChain(frame, chain);
  const end = chain.at(-1);
  if (!end) throw new Error("Cadeia IK vazia.");
  const original = chain.map((bone) => frame.pose(bone.targetId).rotation);
  const residual = () => {
    const tip = frame.point(end.targetId, end.length, 0);
    return Math.hypot(tip.x - target.x, tip.y - target.y);
  };
  if (options.strength === 0)
    return {
      residual: residual(),
      solvedResidual: null,
      converged: false,
      iterations: 0,
      strength: 0,
    };
  let steps = 0;
  const previous = chain.at(-2);
  if (previous) solvePair(frame, previous, end, target, options.bend);
  if (chain.length !== 2 || residual() > options.tolerance) {
    for (; steps < options.iterations && residual() > options.tolerance; steps++) {
      for (const bone of [...chain].reverse()) {
        const pose = frame.pose(bone.targetId),
          inv = inverse(frame.pre(bone.targetId)),
          tip = frame.point(end.targetId, end.length, 0),
          localTip = transformPoint(inv, tip.x, tip.y),
          localTarget = transformPoint(inv, target.x, target.y),
          x = localTip.x - pose.x,
          y = localTip.y - pose.y,
          tx = localTarget.x - pose.x,
          ty = localTarget.y - pose.y;
        if ((x === 0 && y === 0) || (tx === 0 && ty === 0)) continue;
        const delta = degrees(Math.atan2(x * ty - y * tx, x * tx + y * ty));
        frame.set(bone.targetId, { rotation: limited(bone, pose.rotation + delta) });
      }
    }
  }
  const solvedResidual = residual();
  for (const [index, bone] of chain.entries()) {
    const before = original[index];
    if (before === undefined) throw new Error("Pose inicial de IK ausente.");
    frame.set(bone.targetId, {
      rotation: before + angleDelta(before, frame.pose(bone.targetId).rotation) * options.strength,
    });
  }
  const distance = residual();
  return {
    residual: distance,
    solvedResidual,
    converged: solvedResidual <= options.tolerance,
    iterations: steps,
    strength: options.strength,
  };
}
