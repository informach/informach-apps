import { type Geometry, geometryCost } from "../geometry";
import { trimGeometry } from "../geometry/trimGeometry";
import type { RigEvaluationBudget, RigObject } from "./kinematics";
import { type RigDocument, rigParameterKey } from "./model";

/** Visual geometry stage: morph and skin have already run; spatial constraints
 * keep their reference-path contract. No previous frame is an input. */
export function applyTrims(
  rig: RigDocument,
  objects: ReadonlyMap<string, RigObject>,
  geometry: Map<string, Geometry>,
  parameters: ReadonlyMap<string, number> | undefined,
  budget: RigEvaluationBudget,
) {
  for (const trim of rig.trims ?? []) {
    const base = geometry.get(trim.targetId) ?? objects.get(trim.targetId)?.geometry;
    if (!base) throw new Error("Geometria do trim ausente.");
    const value = (property: "start" | "end" | "offset") =>
      parameters?.get(rigParameterKey([], trim.id, property)) ?? trim[property];
    const output = trimGeometry(
      base,
      { ...trim, start: value("start"), end: value("end"), offset: value("offset") },
      budget,
    );
    if (output.kind === "geometry") geometry.set(trim.targetId, output.geometry);
  }
  if (rig.trims?.length) {
    let vertices = 0;
    for (const [id, object] of objects) {
      if (--budget.remaining < 0) throw new Error("Trim excede orçamento agregado de avaliação.");
      vertices += geometryCost(geometry.get(id) ?? object.geometry ?? []);
      if (vertices > 100000) throw new Error("Trim excede orçamento agregado de geometria.");
    }
  }
}
