import { type Filter, filterSchema } from "@informach/edi-motion/graphics";
import { z } from "zod";

export const FILTER_PRESETS = [
  "drop-shadow",
  "blur",
  "glow",
  "saturate",
  "grayscale",
  "hue",
] as const;
export type FilterPreset = (typeof FILTER_PRESETS)[number];
export const FILTER_PRESET_LABELS: Record<FilterPreset, string> = {
  "drop-shadow": "Sombra projetada",
  blur: "Desfoque",
  glow: "Brilho externo",
  saturate: "Saturação",
  grayscale: "Escala de cinza",
  hue: "Rotação de matiz",
};
export const filterPresetSchema = z.strictObject({
  preset: z.enum(FILTER_PRESETS),
  /** Blur deviation (shadow/blur/glow), saturation factor or hue degrees. */
  amount: z.number().min(-36000).max(36000),
  dx: z.number().min(-10000).max(10000),
  dy: z.number().min(-10000).max(10000),
  color: z.string().regex(/^#[\da-f]{6}$/i),
  opacity: z.number().min(0).max(1),
});
export type FilterPresetInput = z.infer<typeof filterPresetSchema>;
/** Blur-based presets spread beyond the shape: half the box on each side, like most editors. */
const spread = { units: "objectBoundingBox", x: -0.5, y: -0.5, width: 2, height: 2 } as const,
  tight = { units: "objectBoundingBox", x: -0.1, y: -0.1, width: 1.2, height: 1.2 } as const;

/** Ordinary typed filters: nothing about the preset is stored, so they edit, copy, import and
 * export like any other. sRGB matches what CSS shadows and blurs look like. */
export function filterFromPreset(input: FilterPresetInput): Filter {
  const { preset, amount, dx, dy, color, opacity } = filterPresetSchema.parse(input),
    deviation = Math.min(200, Math.max(0, amount)),
    base = { primitiveUnits: "userSpaceOnUse", colorInterpolation: "sRGB" } as const;
  if (preset === "drop-shadow")
    return filterSchema.parse({
      ...base,
      ...spread,
      primitives: [
        {
          kind: "dropShadow",
          in: "SourceGraphic",
          dx,
          dy,
          stdDeviation: [deviation, deviation],
          color,
          opacity,
        },
      ],
    });
  if (preset === "blur")
    return filterSchema.parse({
      ...base,
      ...spread,
      primitives: [
        {
          kind: "blur",
          in: "SourceGraphic",
          stdDeviation: [deviation, deviation],
          edgeMode: "none",
        },
      ],
    });
  if (preset === "glow")
    return filterSchema.parse({
      ...base,
      ...spread,
      primitives: [
        { kind: "blur", in: "SourceAlpha", stdDeviation: [deviation, deviation], edgeMode: "none" },
        { kind: "flood", color, opacity },
        { kind: "composite", in: 1, in2: 0, operator: "in" },
        { kind: "merge", inputs: [2, "SourceGraphic"] },
      ],
    });
  return filterSchema.parse({
    ...base,
    ...tight,
    primitives: [
      preset === "hue"
        ? { kind: "colorMatrix", in: "SourceGraphic", type: "hueRotate", values: [amount] }
        : {
            kind: "colorMatrix",
            in: "SourceGraphic",
            type: "saturate",
            values: [preset === "grayscale" ? 0 : Math.min(100, Math.max(0, amount))],
          },
    ],
  });
}
const KIND_LABELS = {
  blur: "desfoque",
  offset: "deslocamento",
  dropShadow: "sombra",
  colorMatrix: "matriz de cor",
  flood: "cor",
  blend: "mistura",
  composite: "composição",
  merge: "junção",
} as const;
export function describeFilter(filter: Filter) {
  return filter.primitives.map((primitive) => KIND_LABELS[primitive.kind]).join(" → ");
}
