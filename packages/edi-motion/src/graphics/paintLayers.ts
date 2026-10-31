import { z } from "zod";
import { type Geometry, geometryPath } from "../geometry";
import { type PaintServer, paintServerId, paintServerSchema } from "./gradients";

/** Extra fills and strokes drawn over an object's own paint, in list order.
 * Each one is a copy of the shape's geometry with its own presentation; the
 * object's `fill`/`stroke` stay the base layers, so documents without this
 * field draw exactly as before. Layers are static: color animation and data
 * links keep targeting the base paint. */
export const paintLayerSchema = z
  .strictObject({
    id: z.string().regex(/^paint-[\w-]{1,100}$/),
    kind: z.enum(["fill", "stroke"]),
    color: z
      .string()
      .regex(/^#[\da-f]{6}$/i)
      .transform((color) => color.toLowerCase()),
    /** A gradient or pattern; when present it is drawn instead of `color`. */
    paint: paintServerSchema.optional(),
    opacity: z.number().min(0).max(1),
    visible: z.boolean(),
    /** Shown in the layer options, as in Rive; drawing ignores it. */
    name: z.string().trim().min(1).max(120).optional(),
    width: z.number().min(0).max(10000).optional(),
    linecap: z.enum(["butt", "round", "square"]).optional(),
    linejoin: z.enum(["miter", "round", "bevel"]).optional(),
  })
  .superRefine((layer, ctx) => {
    if (
      layer.kind === "fill" &&
      (layer.width !== undefined || layer.linecap !== undefined || layer.linejoin !== undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Espessura, ponta e junção valem só para camadas de contorno.",
      });
  });
export type PaintLayer = z.infer<typeof paintLayerSchema>;
export const PAINT_LAYER_LIMIT = 16;
export const paintLayersSchema = z
  .array(paintLayerSchema)
  .min(1)
  .max(PAINT_LAYER_LIMIT)
  .superRefine((layers, ctx) => {
    if (new Set(layers.map((layer) => layer.id)).size !== layers.length)
      ctx.addIssue({ code: "custom", message: "Camadas de pintura com identificador repetido." });
  });

/** Shapes whose geometry can be repeated for extra paint layers. */
export const paintLayerTags: ReadonlySet<string> = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);
/** Presentation that belongs to the layer, never copied from the base shape. */
const PAINT_PRESENTATION = new Set([
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "paint-order",
  "opacity",
  "filter",
]);
export const PAINT_LAYER_ATTRIBUTE = "data-edi-paint-layer";

export function paintLayerAttributes(layer: PaintLayer): Record<string, string> {
  const paint = layer.paint ? `url(#${paintServerId(layer.paint)})` : layer.color;
  return layer.kind === "fill"
    ? { fill: paint, "fill-opacity": String(layer.opacity), stroke: "none" }
    : {
        fill: "none",
        stroke: paint,
        "stroke-opacity": String(layer.opacity),
        "stroke-width": String(layer.width ?? 1),
        ...(layer.linecap ? { "stroke-linecap": layer.linecap } : {}),
        ...(layer.linejoin ? { "stroke-linejoin": layer.linejoin } : {}),
      };
}
/** The shape's own attributes minus paint: geometry, its local transform and fill-rule. */
export function paintLayerGeometry(attrs: Readonly<Record<string, string>>) {
  return Object.fromEntries(
    Object.entries(attrs).filter(([name]) => !PAINT_PRESENTATION.has(name)),
  );
}
/** Visible layers only: a hidden layer keeps its settings but draws nothing. */
export function drawnPaintLayers(layers: readonly PaintLayer[] | undefined) {
  return (layers ?? []).filter((layer) => layer.visible);
}
export function paintLayerServers(layers: readonly PaintLayer[] | undefined): PaintServer[] {
  return drawnPaintLayers(layers).flatMap((layer) => (layer.paint ? [layer.paint] : []));
}
/** The copies drawn after a shape. Whoever rewrites the shape's path must
 * rewrite them too, or the extra paints stay on the old geometry. */
export function paintLayerCopies(shape: Element): Element[] {
  const copies: Element[] = [];
  for (let next = shape.nextElementSibling; next; next = next.nextElementSibling)
    if (next.hasAttribute(PAINT_LAYER_ATTRIBUTE)) copies.push(next);
  return copies;
}
/** Where an evaluated geometry map keeps a copy's own path. A layer's trim
 * writes `objectId#layerId`; a trim on the shape itself writes `objectId#` with
 * the untrimmed path, which the copies without their own trim keep showing:
 * path effects belong to one paint row, like in Rive. */
export const paintLayerGeometryKey = (objectId: string, layerId = "") => `${objectId}#${layerId}`;
/** A copy's own path in an evaluated geometry map, or undefined to follow the shape. */
export function paintLayerPaths(geometry: ReadonlyMap<string, Geometry>, objectId: string) {
  const fallback = geometry.get(paintLayerGeometryKey(objectId));
  return (layerId: string) => {
    const own = geometry.get(paintLayerGeometryKey(objectId, layerId)) ?? fallback;
    return own && geometryPath(own);
  };
}
/** Writes the shape's path and its copies'. Without `layerPath`, or where it
 * returns undefined, a copy takes the shape's path; `null` removes `d`. */
export function writeShapePath(
  shape: Element,
  d: string | null,
  layerPath?: (layerId: string) => string | undefined,
) {
  const writes: [Element, string | null][] = [[shape, d]];
  for (const copy of paintLayerCopies(shape))
    writes.push([copy, layerPath?.(copy.getAttribute(PAINT_LAYER_ATTRIBUTE) ?? "") ?? d]);
  for (const [element, value] of writes)
    if (value === null) element.removeAttribute("d");
    else if (element.getAttribute("d") !== value) element.setAttribute("d", value);
}
