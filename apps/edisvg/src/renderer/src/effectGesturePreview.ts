import type { Affine } from "@informach/edi-motion";
import {
  identityMatrix,
  identityTransform,
  multiply,
  parseTransformList,
  type Transform,
} from "@informach/edi-motion";
import { type Geometry, svgPrimitiveFromAttributes } from "@informach/edi-motion/geometry";
import {
  createVectorEffectContext,
  evaluateVectorEffects,
  type VectorEffectContext,
  type VectorEffectFrame,
} from "@informach/edi-motion/graphics";
import { parsePath } from "../../shared/pathGeometry.js";

/** Gestures own transient DOM, not document poses. Capture their exact local
 * matrices into a disposable evaluation graph: no TRS decomposition, no CTM
 * reads and no document/history mutation. Playback keeps its pure frame path. */
export function createGestureEffectPreview(
  context: VectorEffectContext,
  elements: ReadonlyMap<string, SVGGraphicsElement>,
  paint: (frames: readonly VectorEffectFrame[]) => void,
  readFrame: () =>
    | { poses: ReadonlyMap<string, Transform>; geometry: ReadonlyMap<string, Geometry> }
    | undefined,
  readPrefixes: () => ReadonlyMap<string, Affine> | undefined,
) {
  const relevant = new Set<string>(),
    sources = new Set(context.references.map((reference) => reference.sourceId));
  function include(id: string) {
    if (relevant.has(id)) return;
    relevant.add(id);
    const object = context.objects.get(id);
    if (!object) throw new Error("Objeto da prévia de efeito ausente.");
    if (object.parentId !== null) include(object.parentId);
  }
  for (const reference of context.references) {
    include(reference.sourceId);
    include(reference.targetId);
  }
  return () => {
    const frame = readFrame(),
      objects = new Map(context.objects),
      geometry = new Map(frame?.geometry);
    for (const id of relevant) {
      const object = context.objects.get(id),
        element = elements.get(id);
      if (!object || !element) throw new Error("Wrapper da prévia de efeito ausente.");
      const matrix = parseTransformList(element.getAttribute("transform") ?? ""),
        opacity = frame?.poses.get(id)?.opacity ?? object.transform.opacity;
      objects.set(id, {
        ...object,
        basis: multiply(object.basis ?? identityMatrix(), matrix),
        transform: { ...identityTransform(), opacity },
      });
      if (sources.has(id)) {
        const shape = element.firstElementChild;
        if (!shape || shape.localName !== object.tag)
          throw new Error("Fonte vetorial da prévia ausente.");
        const transient = objects.get(id);
        if (!transient) throw new Error("Fonte transitória ausente.");
        if (object.nativeShape) {
          const attrs = Object.fromEntries(
            [...shape.attributes].map((attr) => [attr.name, attr.value]),
          );
          objects.set(id, {
            ...transient,
            nativeShape: svgPrimitiveFromAttributes(object.tag, attrs),
            geometry: undefined,
            pathData: undefined,
          });
        } else {
          const pathData = shape.getAttribute("d") ?? "";
          objects.set(id, { ...transient, geometry: parsePath(pathData), pathData });
        }
        geometry.delete(id);
      }
    }
    const prepared = evaluateVectorEffects(
      createVectorEffectContext(objects),
      new Map(),
      geometry,
      readPrefixes(),
    );
    paint(prepared);
  };
}
