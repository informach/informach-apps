import { type Affine, identityMatrix, multiply, transformMatrix, transformPoint } from "../affine";
import type { Geometry } from "../geometry";
import { propertyBounds, type Transform } from "../model";

export interface RigObject {
  tag: string;
  parentId: string | null;
  transform: Transform;
  basis?: Affine;
  attributeMatrix?: Affine;
  isComponent?: boolean;
  geometry?: Geometry;
}
export interface RigEvaluationBudget {
  remaining: number;
}
/** A frame-local pose/cache, never the persisted objects or caller's pose map. */
export function createKinematics(
  objects: ReadonlyMap<string, RigObject>,
  input: ReadonlyMap<string, Transform>,
  budget: RigEvaluationBudget = { remaining: 2_000_000 },
) {
  if (objects.size > 2000) throw new Error("Rig excede o orçamento de objetos.");
  const poses = new Map<string, Transform>(),
    cache = new Map<string, Affine>();
  const visiting = new Set<string>();
  if (!Number.isInteger(budget.remaining) || budget.remaining < 0 || budget.remaining > 2_000_000)
    throw new Error("Orçamento de avaliação de rig inválido.");
  for (const [id, object] of objects) poses.set(id, { ...(input.get(id) ?? object.transform) });
  function object(id: string) {
    const value = objects.get(id);
    if (!value) throw new Error("Objeto do rig ausente.");
    return value;
  }
  function pose(id: string) {
    const value = poses.get(id);
    if (!value) throw new Error("Pose do rig ausente.");
    return value;
  }
  function pre(id: string, depth = 0): Affine {
    const value = object(id);
    return multiply(
      value.parentId === null ? identityMatrix() : world(value.parentId, depth + 1),
      value.basis ?? identityMatrix(),
    );
  }
  function world(id: string, depth = 0): Affine {
    if (--budget.remaining < 0 || depth > 32)
      throw new Error("Rig excede o orçamento de avaliação/profundidade.");
    const cached = cache.get(id);
    if (cached) return cached;
    if (visiting.has(id)) throw new Error("Hierarquia de rig cíclica.");
    visiting.add(id);
    const value = multiply(
      multiply(pre(id, depth), transformMatrix(pose(id))),
      object(id).attributeMatrix ?? identityMatrix(),
    );
    visiting.delete(id);
    cache.set(id, value);
    return value;
  }
  return {
    objects,
    poses,
    object,
    pose,
    world,
    pre,
    point(id: string, x = 0, y = 0) {
      return transformPoint(world(id), x, y);
    },
    set(id: string, patch: Partial<Transform>) {
      const next = { ...pose(id), ...patch };
      for (const [key, bounds] of Object.entries(propertyBounds)) {
        const value = Reflect.get(next, key);
        if (
          value !== undefined &&
          (typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < bounds[0] ||
            value > bounds[1])
        )
          throw new Error("Restrição produz pose fora dos limites.");
      }
      poses.set(id, next);
      cache.clear();
    },
  };
}
export type Kinematics = ReturnType<typeof createKinematics>;
