import type { Geometry, Point } from "../geometry";
import type { RigEvaluationBudget, RigObject } from "./kinematics";
import { type RigDocument, rigParameterKey } from "./model";

/** Morphs add weighted deltas from the authored base, not from the prior frame. */
export function evaluateMorphs(
  rig: RigDocument,
  objects: ReadonlyMap<string, RigObject>,
  parameters: ReadonlyMap<string, number> | undefined,
  budget: RigEvaluationBudget,
) {
  const geometry = new Map<string, Geometry>();
  for (const morph of rig.morphs ?? []) {
    const base = objects.get(morph.targetId)?.geometry;
    if (!base) throw new Error("Base do morph ausente.");
    const weight = parameters?.get(rigParameterKey([], morph.id, "weight")) ?? morph.weight;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1)
      throw new Error("Peso do morph fora de 0–1.");
    const current = geometry.get(morph.targetId) ?? structuredClone(base);
    geometry.set(morph.targetId, current);
    const add = (current: Point, base: Point, target: Point) => {
      if (--budget.remaining < 0) throw new Error("Morph excede orçamento de avaliação.");
      current.x += (target.x - base.x) * weight;
      current.y += (target.y - base.y) * weight;
      if (
        !Number.isFinite(current.x) ||
        !Number.isFinite(current.y) ||
        Math.abs(current.x) > 1e7 ||
        Math.abs(current.y) > 1e7
      )
        throw new Error("Morph produz geometria fora dos limites.");
    };
    for (const [index, contour] of current.entries())
      for (const [i, point] of contour.points.entries()) {
        const from = base[index]?.points[i],
          to = morph.geometry[index]?.points[i];
        if (!from || !to) throw new Error("Topologia do morph incompatível.");
        add(point, from, to);
        if (point.in && from.in && to.in) add(point.in, from.in, to.in);
        if (point.out && from.out && to.out) add(point.out, from.out, to.out);
      }
  }
  return geometry;
}
