import { type Affine, inverse, multiply, transformPoint } from "../affine";
import type { Geometry, Point } from "../geometry";
import {
  createKinematics,
  type Kinematics,
  type RigEvaluationBudget,
  type RigObject,
} from "./kinematics";
import { deformable, type RigDocument, type RigSkin } from "./model";

/** Capture reference matrices and deterministic inverse-square weights of
 * the four nearest bone segments. This is geometry, not an AI inference. */
export function captureSkin(
  rig: RigDocument,
  objects: ReadonlyMap<string, RigObject>,
  targetId: string,
  boneIds: readonly string[],
  id: string,
): RigSkin {
  const source = objects.get(targetId),
    frame = createKinematics(objects, new Map());
  if (
    !deformable(source) ||
    !source?.geometry ||
    !boneIds.length ||
    new Set(boneIds).size !== boneIds.length
  )
    throw new Error("Selecione caminho e ossos únicos para vincular.");
  const bones = boneIds.map((id) => {
      const bone = rig.bones.find((bone) => bone.targetId === id);
      if (!bone) throw new Error("Osso para malha ausente.");
      return {
        targetId: id,
        inverseBindMatrix: inverse(frame.world(id)),
        start: frame.point(id),
        end: frame.point(id, bone.length, 0),
      };
    }),
    bindMatrix = frame.world(targetId);
  inverse(bindMatrix);
  const weights = source.geometry.flatMap((contour) =>
    contour.points.map((point) => {
      const world = transformPoint(bindMatrix, point.x, point.y),
        distances = bones
          .map((bone) => {
            const dx = bone.end.x - bone.start.x,
              dy = bone.end.y - bone.start.y,
              length = dx * dx + dy * dy;
            if (length === 0) throw new Error("Osso singular na referência da malha.");
            const phase = Math.max(
              0,
              Math.min(1, ((world.x - bone.start.x) * dx + (world.y - bone.start.y) * dy) / length),
            );
            return {
              boneId: bone.targetId,
              distance: Math.hypot(
                world.x - bone.start.x - dx * phase,
                world.y - bone.start.y - dy * phase,
              ),
            };
          })
          .sort(
            (a, b) =>
              a.distance - b.distance || (a.boneId < b.boneId ? -1 : a.boneId > b.boneId ? 1 : 0),
          )
          .slice(0, 4),
        zero = distances.filter((value) => value.distance < 1e-8);
      if (zero.length)
        return zero.map((value) => ({ boneId: value.boneId, weight: 1 / zero.length }));
      const total = distances.reduce(
        (sum, value) => sum + 1 / (value.distance * value.distance),
        0,
      );
      return distances.map((value) => ({
        boneId: value.boneId,
        weight: 1 / (value.distance * value.distance) / total,
      }));
    }),
  );
  return {
    id,
    targetId,
    bindMatrix,
    bones: bones.map(({ targetId, inverseBindMatrix }) => ({ targetId, inverseBindMatrix })),
    weights,
  };
}
/** mesh^-1 · Σ(w · bone · inverseBind · meshBind · p).
 * Anchor weights carry attached handles; morph precedes skinning.
 * Curves stay curves. This is not a raster triangle renderer. */
export function skinGeometry(
  skin: RigSkin,
  base: Geometry,
  frame: Kinematics,
  budget: RigEvaluationBudget,
): Geometry {
  const toLocal = inverse(frame.world(skin.targetId)),
    matrices = new Map<string, Affine>();
  for (const bone of skin.bones)
    matrices.set(
      bone.targetId,
      multiply(
        toLocal,
        multiply(frame.world(bone.targetId), multiply(bone.inverseBindMatrix, skin.bindMatrix)),
      ),
    );
  let index = 0;
  return base.map((contour) => ({
    ...contour,
    points: contour.points.map((vertex) => {
      const weights = skin.weights[index++];
      if (!weights) throw new Error("Peso de vértice ausente.");
      const blend = (point: Point): Point => {
        let x = 0,
          y = 0;
        for (const influence of weights) {
          if (--budget.remaining < 0) throw new Error("Malha excede orçamento de avaliação.");
          const matrix = matrices.get(influence.boneId);
          if (!matrix) throw new Error("Osso da malha ausente.");
          const value = transformPoint(matrix, point.x, point.y);
          x += value.x * influence.weight;
          y += value.y * influence.weight;
        }
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e7 || Math.abs(y) > 1e7)
          throw new Error("Malha produz geometria fora dos limites.");
        return { x, y };
      };
      return {
        ...blend(vertex),
        in: vertex.in ? blend(vertex.in) : null,
        out: vertex.out ? blend(vertex.out) : null,
      };
    }),
  }));
}
