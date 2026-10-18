import { type SvgPrimitive, svgPrimitiveFromAttributes } from "../svgPrimitive";
import type { VectorEffects } from "./vectorEffects";

/** Only referenced sources are expanded; ordinary drawings keep their own
 * percentage/font/viewport policies. No DOM or playback schema extension. */
export function nativeEffectSources(
  content: Iterable<{ id: string; tag: string; attrs?: Readonly<Record<string, string>> }>,
  effects: ReadonlyMap<string, VectorEffects>,
) {
  if (!effects.size) return new Map<string, SvgPrimitive>();
  if (effects.size > 2000) throw new Error("Efeitos excedem orçamento de objetos.");
  const objects = new Map<
    string,
    { id: string; tag: string; attrs?: Readonly<Record<string, string>> }
  >();
  let count = 0;
  for (const object of content) {
    if (++count > 2000) throw new Error("Fontes de efeitos excedem orçamento de objetos.");
    objects.set(object.id, object);
  }
  const sources = new Set(
      [...effects.values()].flatMap((value) =>
        [value.clip?.sourceId, value.mask?.sourceId].filter((id) => id !== undefined),
      ),
    ),
    primitives = new Map<string, SvgPrimitive>();
  let vertices = 0;
  if (objects.size > 2000 || sources.size > 256)
    throw new Error("Fontes de efeitos excedem orçamento.");
  for (const id of sources) {
    const source = objects.get(id);
    if (!source) throw new Error("Fonte de efeito ausente.");
    if (source.tag === "path") continue;
    if (!source.attrs) throw new Error("Primitiva de efeito requer desenho portátil validado.");
    const shape = svgPrimitiveFromAttributes(source.tag, source.attrs);
    vertices += shape.kind === "polygon" || shape.kind === "polyline" ? shape.points.length : 8;
    if (vertices > 100000)
      throw new Error("Primitivas de efeitos excedem orçamento agregado de vértices.");
    primitives.set(id, shape);
  }
  return primitives;
}
