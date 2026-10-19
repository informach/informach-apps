import { type Affine, inverse, multiply, transformPoint } from "../affine";
import { arcTable, sampleArc } from "../geometry";
import type { Transform } from "../model";
import { evaluateMorphs } from "./deformation";
import { angleDelta, type IkResult, solveIkChain } from "./ik";
import { applyJoystickControllers } from "./joystick";
import {
  createKinematics,
  type Kinematics,
  type RigEvaluationBudget,
  type RigObject,
} from "./kinematics";
import { parseRig, type RigConstraint, rigParameterKey } from "./model";
import { skinGeometry } from "./skinning";
import { applyTrims } from "./trimming";

/** Canonical QR decomposition (positive X scale, reflection on Y). Pivots are
 * reintroduced exactly, not approximated by dropping shear/reflection. */
export function affinePose(matrix: Affine, current: Transform): Transform {
  inverse(matrix);
  const [a, b, c, d, e, f] = matrix,
    sx = Math.hypot(a, b),
    sy = (a * d - b * c) / sx,
    px = current.px ?? 0,
    py = current.py ?? 0;
  return {
    ...current,
    x: e - px + a * px + c * py,
    y: f - py + b * px + d * py,
    rotation: (Math.atan2(b, a) * 180) / Math.PI,
    sx,
    sy,
    skewX: (Math.atan((a * c + b * d) / (sx * sy)) * 180) / Math.PI,
  };
}
function setWorldOrigin(
  frame: Kinematics,
  id: string,
  desired: { x: number; y: number },
  strength: number,
) {
  const origin = frame.point(id),
    target = transformPoint(
      inverse(frame.pre(id)),
      origin.x + (desired.x - origin.x) * strength,
      origin.y + (desired.y - origin.y) * strength,
    ),
    localOrigin = transformPoint(inverse(frame.pre(id)), origin.x, origin.y),
    pose = frame.pose(id);
  frame.set(id, { x: pose.x + target.x - localOrigin.x, y: pose.y + target.y - localOrigin.y });
}
export function createRigContext(input: unknown, objects: ReadonlyMap<string, RigObject>) {
  const rig = parseRig(input, objects),
    bones = new Map(rig.bones.map((bone) => [bone.targetId, bone]));
  return { rig, objects, bones };
}
export type RigContext = ReturnType<typeof createRigContext>;
export function evaluateRig(
  context: RigContext,
  poses: ReadonlyMap<string, Transform>,
  budget: RigEvaluationBudget = { remaining: 2_000_000 },
  prefixes?: ReadonlyMap<string, Affine>,
  parameters?: ReadonlyMap<string, number>,
) {
  const objects = prefixes?.size
    ? new Map(
        [...context.objects].map(([id, object]) => {
          const prefix = prefixes.get(id);
          return [
            id,
            prefix
              ? { ...object, basis: multiply(prefix, object.basis ?? [1, 0, 0, 1, 0, 0]) }
              : object,
          ] as const;
        }),
      )
    : context.objects;
  const frame = createKinematics(objects, poses, budget),
    diagnostics: ({ id: string } & IkResult)[] = [],
    visibility = new Map<string, boolean>();
  applyJoystickControllers(frame, context.rig.joysticks ?? [], budget, parameters);
  const geometry = evaluateMorphs(context.rig, objects, parameters, budget);
  for (const authored of context.rig.constraints) {
    const strength =
      parameters?.get(rigParameterKey([], authored.id, "strength")) ?? authored.strength;
    if (!Number.isFinite(strength) || strength < 0 || strength > 1)
      throw new Error("Força de restrição fora dos limites.");
    const constraint = { ...authored, strength };
    if (constraint.strength === 0 && constraint.kind !== "ik") continue;
    if (constraint.kind === "ik") {
      const chain = constraint.chain.map((id) => {
        const bone = context.bones.get(id);
        if (!bone) throw new Error("Osso IK ausente.");
        return bone;
      });
      if (constraint.strength === 0) {
        const end = chain.at(-1);
        if (!end) throw new Error("Cadeia IK vazia.");
        const tip = frame.point(end.targetId, end.length, 0),
          target = frame.point(constraint.targetId);
        diagnostics.push({
          id: constraint.id,
          residual: Math.hypot(tip.x - target.x, tip.y - target.y),
          solvedResidual: null,
          converged: false,
          iterations: 0,
          strength: 0,
        });
      } else
        diagnostics.push({
          id: constraint.id,
          ...solveIkChain(frame, chain, frame.point(constraint.targetId), constraint),
        });
    } else if (constraint.kind === "distance") {
      const origin = frame.point(constraint.ownerId),
        target = frame.point(constraint.targetId),
        x = origin.x - target.x,
        y = origin.y - target.y,
        distance = Math.hypot(x, y),
        desired = Math.max(constraint.min, Math.min(constraint.max, distance));
      if (desired !== distance) {
        // Coincident origins have no radial direction. Choose the owner's
        // current +X axis, keeping the decision explicit and deterministic.
        const axis = frame.point(constraint.ownerId, 1, 0),
          norm = distance || Math.hypot(axis.x - origin.x, axis.y - origin.y);
        if (norm === 0) throw new Error("Distância em espaço singular sem direção definida.");
        const dx = distance ? x : axis.x - origin.x,
          dy = distance ? y : axis.y - origin.y;
        setWorldOrigin(
          frame,
          constraint.ownerId,
          { x: target.x + (dx * desired) / norm, y: target.y + (dy * desired) / norm },
          constraint.strength,
        );
      }
    } else if (constraint.kind === "path") {
      const contour = (geometry.get(constraint.targetId) ??
        objects.get(constraint.targetId)?.geometry)?.[constraint.contour];
      if (!contour) throw new Error("Geometria de caminho ausente.");
      const progress =
          parameters?.get(rigParameterKey([], constraint.id, "progress")) ?? constraint.progress,
        target = sampleArc(
          arcTable(contour, frame.world(constraint.targetId), constraint.tolerance, budget),
          progress,
        ),
        angle = (target.angle * Math.PI) / 180,
        desired = {
          x: target.x - Math.sin(angle) * constraint.offset,
          y: target.y + Math.cos(angle) * constraint.offset,
        };
      if (constraint.orient) {
        const inversePre = inverse(frame.pre(constraint.ownerId)),
          direction = transformPoint(inversePre, Math.cos(angle), Math.sin(angle)),
          zero = transformPoint(inversePre, 0, 0),
          pose = frame.pose(constraint.ownerId),
          object = frame.object(constraint.ownerId),
          local = multiply(
            poseMatrix({ ...pose, rotation: 0 }),
            object.attributeMatrix ?? [1, 0, 0, 1, 0, 0],
          ),
          rotation =
            ((Math.atan2(direction.y - zero.y, direction.x - zero.x) -
              Math.atan2(local[1], local[0])) *
              180) /
              Math.PI +
            constraint.rotationOffset;
        if (Math.hypot(local[0], local[1]) === 0)
          throw new Error("Orientação de caminho requer eixo não singular.");
        frame.set(constraint.ownerId, {
          rotation: pose.rotation + angleDelta(pose.rotation, rotation) * constraint.strength,
        });
      }
      setWorldOrigin(frame, constraint.ownerId, desired, constraint.strength);
    } else applyTransform(frame, constraint);
  }
  for (const skin of context.rig.skins ?? []) {
    const base = geometry.get(skin.targetId) ?? objects.get(skin.targetId)?.geometry;
    if (!base) throw new Error("Geometria da malha ausente.");
    geometry.set(skin.targetId, skinGeometry(skin, base, frame, budget));
  }
  for (const solo of context.rig.solos ?? []) {
    const active = parameters?.get(rigParameterKey([], solo.id, "activeIndex")) ?? solo.activeIndex;
    if (!Number.isInteger(active) || active < -1 || active >= solo.children.length)
      throw new Error("Índice solo inválido.");
    for (const [index, id] of solo.children.entries())
      if (index !== active) visibility.set(id, false);
  }
  applyTrims(context.rig, objects, geometry, parameters, budget);
  return {
    poses: frame.poses,
    geometry,
    visibility,
    diagnostics,
    world: new Map([...context.objects.keys()].map((id) => [id, frame.world(id)])),
  };
}
function applyTransform(
  frame: Kinematics,
  constraint: Extract<RigConstraint, { kind: "transform" }>,
) {
  const source =
      constraint.space === "local"
        ? frame.pose(constraint.targetId)
        : affinePose(frame.world(constraint.targetId), {
            ...frame.pose(constraint.targetId),
            px: 0,
            py: 0,
          }),
    current =
      constraint.space === "local"
        ? frame.pose(constraint.ownerId)
        : affinePose(frame.world(constraint.ownerId), {
            ...frame.pose(constraint.ownerId),
            px: 0,
            py: 0,
          }),
    next = { ...current };
  for (const channel of constraint.channels) {
    const original = current[channel] ?? 0,
      raw = source[channel] ?? 0,
      desired =
        channel === "sx" || channel === "sy"
          ? raw * constraint.offset[channel]
          : raw + (channel === "skewX" ? 0 : constraint.offset[channel]);
    next[channel] =
      original +
      (channel === "rotation" ? angleDelta(original, desired) : desired - original) *
        constraint.strength;
  }
  if (constraint.space === "local") frame.set(constraint.ownerId, next);
  else {
    // Full local affine is pre^-1 * requested world * attrs^-1. Attribute
    // transforms and retained hierarchy basis remain outside animated TRS.
    const object = frame.object(constraint.ownerId),
      matrix = multiply(
        multiply(inverse(frame.pre(constraint.ownerId)), poseMatrix(next)),
        inverse(object.attributeMatrix ?? [1, 0, 0, 1, 0, 0]),
      );
    frame.set(constraint.ownerId, affinePose(matrix, frame.pose(constraint.ownerId)));
  }
}

import { transformMatrix as poseMatrix } from "../affine";
