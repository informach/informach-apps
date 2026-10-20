import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { z } from "zod";

const offset = z.number().min(-10000).max(10000),
  deviation = z.tuple([z.number().min(0).max(200), z.number().min(0).max(200)]),
  unit = z.number().min(0).max(1),
  color = z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .transform((value) => value.toLowerCase()),
  /** Source graphics or the result of an earlier primitive (by index): the graph is acyclic by
   * construction and never reaches the page background or another element. */
  input = z.union([
    z.literal("SourceGraphic"),
    z.literal("SourceAlpha"),
    z.number().int().min(0).max(15),
  ]);
export const FILTER_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;
export const filterPrimitiveSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("blur"),
    in: input,
    stdDeviation: deviation,
    edgeMode: z.enum(["none", "duplicate", "wrap"]),
  }),
  z.strictObject({ kind: z.literal("offset"), in: input, dx: offset, dy: offset }),
  z.strictObject({
    kind: z.literal("dropShadow"),
    in: input,
    dx: offset,
    dy: offset,
    stdDeviation: deviation,
    color,
    opacity: unit,
  }),
  /** `values`: 20 for matrix, one for saturate (0–100) or hueRotate (degrees), none for
   * luminanceToAlpha — checked with the rest of the graph below. */
  z.strictObject({
    kind: z.literal("colorMatrix"),
    in: input,
    type: z.enum(["matrix", "saturate", "hueRotate", "luminanceToAlpha"]),
    values: z.array(z.number().min(-36000).max(36000)).max(20),
  }),
  z.strictObject({ kind: z.literal("flood"), color, opacity: unit }),
  z.strictObject({
    kind: z.literal("blend"),
    in: input,
    in2: input,
    mode: z.enum(FILTER_BLEND_MODES),
  }),
  z.strictObject({
    kind: z.literal("composite"),
    in: input,
    in2: input,
    operator: z.enum(["over", "in", "out", "atop", "xor", "lighter", "arithmetic"]),
    k: z.tuple([offset, offset, offset, offset]).optional(),
  }),
  z.strictObject({ kind: z.literal("merge"), inputs: z.array(input).min(1).max(16) }),
]);
export type FilterPrimitive = z.infer<typeof filterPrimitiveSchema>;
export type FilterInput = z.infer<typeof input>;
const region = z.number().min(-100000).max(100000);
export const filterSchema = z
  .strictObject({
    units: z.enum(["objectBoundingBox", "userSpaceOnUse"]),
    primitiveUnits: z.enum(["userSpaceOnUse", "objectBoundingBox"]),
    x: region,
    y: region,
    width: z.number().positive().max(100000),
    height: z.number().positive().max(100000),
    colorInterpolation: z.enum(["linearRGB", "sRGB"]),
    primitives: z.array(filterPrimitiveSchema).min(1).max(16),
  })
  .superRefine((filter, context) => {
    for (const [index, primitive] of filter.primitives.entries()) {
      const inputs =
        primitive.kind === "flood"
          ? []
          : primitive.kind === "merge"
            ? primitive.inputs
            : primitive.kind === "blend" || primitive.kind === "composite"
              ? [primitive.in, primitive.in2]
              : [primitive.in];
      if (inputs.some((value) => typeof value === "number" && value >= index))
        context.addIssue({
          code: "custom",
          message: "Entrada de filtro precisa referir uma primitiva anterior.",
        });
      if (primitive.kind === "colorMatrix") {
        const expected = { matrix: 20, saturate: 1, hueRotate: 1, luminanceToAlpha: 0 }[
          primitive.type
        ];
        if (
          primitive.values.length !== expected ||
          (primitive.type === "matrix" &&
            primitive.values.some((value) => Math.abs(value) > 1000)) ||
          (primitive.type === "saturate" &&
            !((primitive.values[0] ?? -1) >= 0 && (primitive.values[0] ?? 101) <= 100))
        )
          context.addIssue({ code: "custom", message: "Valores de feColorMatrix fora do perfil." });
      }
      if (primitive.kind === "composite" && (primitive.operator === "arithmetic") !== !!primitive.k)
        context.addIssue({
          code: "custom",
          message: "Coeficientes k1–k4 existem somente no composite aritmético.",
        });
    }
  });
export type Filter = z.infer<typeof filterSchema>;
export interface FilterElement {
  tag:
    | "filter"
    | "feGaussianBlur"
    | "feOffset"
    | "feDropShadow"
    | "feColorMatrix"
    | "feFlood"
    | "feBlend"
    | "feComposite"
    | "feMerge"
    | "feMergeNode";
  attrs: Record<string, string>;
  children: FilterElement[];
}
export function filterId(input: Filter) {
  const value = filterSchema.parse(input);
  return `edi-filter-${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))))}`;
}
const source = (value: FilterInput) => (typeof value === "number" ? `edi-r${value}` : value);
export function filterElement(raw: Filter): FilterElement {
  const value = filterSchema.parse(raw);
  return {
    tag: "filter",
    attrs: {
      id: filterId(value),
      filterUnits: value.units,
      primitiveUnits: value.primitiveUnits,
      x: String(value.x),
      y: String(value.y),
      width: String(value.width),
      height: String(value.height),
      "color-interpolation-filters": value.colorInterpolation,
    },
    children: value.primitives.map((primitive, index): FilterElement => {
      const result = { result: `edi-r${index}` };
      switch (primitive.kind) {
        case "blur":
          return {
            tag: "feGaussianBlur",
            attrs: {
              in: source(primitive.in),
              stdDeviation: primitive.stdDeviation.join(" "),
              edgeMode: primitive.edgeMode,
              ...result,
            },
            children: [],
          };
        case "offset":
          return {
            tag: "feOffset",
            attrs: {
              in: source(primitive.in),
              dx: String(primitive.dx),
              dy: String(primitive.dy),
              ...result,
            },
            children: [],
          };
        case "dropShadow":
          return {
            tag: "feDropShadow",
            attrs: {
              in: source(primitive.in),
              dx: String(primitive.dx),
              dy: String(primitive.dy),
              stdDeviation: primitive.stdDeviation.join(" "),
              "flood-color": primitive.color,
              "flood-opacity": String(primitive.opacity),
              ...result,
            },
            children: [],
          };
        case "colorMatrix":
          return {
            tag: "feColorMatrix",
            attrs: {
              in: source(primitive.in),
              type: primitive.type,
              ...(primitive.values.length ? { values: primitive.values.join(" ") } : {}),
              ...result,
            },
            children: [],
          };
        case "flood":
          return {
            tag: "feFlood",
            attrs: {
              "flood-color": primitive.color,
              "flood-opacity": String(primitive.opacity),
              ...result,
            },
            children: [],
          };
        case "blend":
          return {
            tag: "feBlend",
            attrs: {
              in: source(primitive.in),
              in2: source(primitive.in2),
              mode: primitive.mode,
              ...result,
            },
            children: [],
          };
        case "composite":
          return {
            tag: "feComposite",
            attrs: {
              in: source(primitive.in),
              in2: source(primitive.in2),
              operator: primitive.operator,
              ...(primitive.k
                ? {
                    k1: String(primitive.k[0]),
                    k2: String(primitive.k[1]),
                    k3: String(primitive.k[2]),
                    k4: String(primitive.k[3]),
                  }
                : {}),
              ...result,
            },
            children: [],
          };
        case "merge":
          return {
            tag: "feMerge",
            attrs: result,
            children: primitive.inputs.map((value) => ({
              tag: "feMergeNode",
              attrs: { in: source(value) },
              children: [],
            })),
          };
      }
      const unknown: never = primitive;
      throw new Error(`Primitiva de filtro desconhecida: ${JSON.stringify(unknown)}`);
    }),
  };
}
/** Pooled by content; distinct filters per scene/document are bounded because every one is a
 * separate offscreen surface in the renderer. */
export const FILTER_DEFINITIONS = 64;
export function filterDefinitions(filters: Iterable<Filter | undefined>) {
  const definitions = new Map<string, FilterElement>();
  let inspected = 0;
  for (const filter of filters) {
    if (++inspected > 12000) throw new Error("Orçamento de filtros inspecionados excedido.");
    if (!filter) continue;
    const element = filterElement(filter),
      id = element.attrs.id;
    if (!id) throw new Error("Identidade de filtro ausente.");
    definitions.set(id, element);
    if (definitions.size > FILTER_DEFINITIONS)
      throw new Error(`Limite de ${FILTER_DEFINITIONS} filtros distintos por cena/documento.`);
  }
  return [...definitions.values()];
}
export function filterAttributes(filter: Filter | undefined): Record<string, string> {
  return filter ? { filter: `url(#${filterId(filter)})` } : {};
}
