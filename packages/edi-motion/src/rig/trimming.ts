import { type Geometry, geometryCost } from "../geometry";
import { trimGeometry } from "../geometry/trimGeometry";
import { paintLayerGeometryKey } from "../graphics/paintLayers";
import type { RigEvaluationBudget, RigObject } from "./kinematics";
import { type RigDocument, rigParameterKey } from "./model";

/** Visual geometry stage: morph and skin have already run; spatial constraints
 * keep their reference-path contract. No previous frame is an input. A trim
 * with a layer writes that paint copy's own path; a trim on the shape keeps the
 * untrimmed path for the copies without their own trim. */
export function applyTrims(
  rig: RigDocument,
  objects: ReadonlyMap<string, RigObject>,
  geometry: Map<string, Geometry>,
  parameters: ReadonlyMap<string, number> | undefined,
  budget: RigEvaluationBudget,
) {
  // Every trim reads the deformed, untrimmed path, whatever the list order.
  const sources = new Map<string, Geometry>();
  for (const trim of rig.trims ?? []) {
    const base = geometry.get(trim.targetId) ?? objects.get(trim.targetId)?.geometry;
    if (!base) throw new Error("Geometria do trim ausente.");
    sources.set(trim.targetId, base);
  }
  for (const trim of rig.trims ?? []) {
    const base = sources.get(trim.targetId) ?? [];
    const value = (property: "start" | "end" | "offset") =>
      parameters?.get(rigParameterKey([], trim.id, property)) ?? trim[property];
    const output = trimGeometry(
      base,
      { ...trim, start: value("start"), end: value("end"), offset: value("offset") },
      budget,
    );
    // Identity rewrites nothing: the shape, or the copy, keeps following its source.
    if (output.kind !== "geometry") continue;
    if (trim.layerId)
      geometry.set(paintLayerGeometryKey(trim.targetId, trim.layerId), output.geometry);
    else {
      geometry.set(trim.targetId, output.geometry);
      geometry.set(paintLayerGeometryKey(trim.targetId), base);
    }
  }
  if (rig.trims?.length) {
    let vertices = 0;
    for (const [id, object] of objects) {
      if (--budget.remaining < 0) throw new Error("Trim excede orçamento agregado de avaliação.");
      vertices += geometryCost(geometry.get(id) ?? object.geometry ?? []);
      if (vertices > 100000) throw new Error("Trim excede orçamento agregado de geometria.");
    }
    for (const trim of rig.trims) {
      if (!trim.layerId) continue;
      vertices += geometryCost(
        geometry.get(paintLayerGeometryKey(trim.targetId, trim.layerId)) ?? [],
      );
      if (vertices > 100000) throw new Error("Trim excede orçamento agregado de geometria.");
    }
  }
}
