import { type Pattern, type PatternShape, patternSchema } from "@informach/edi-motion/graphics";
import { z } from "zod";

export const PATTERN_PRESETS = ["stripes", "dots", "checker", "grid"] as const;
export type PatternPreset = (typeof PATTERN_PRESETS)[number];
const color = z.string().regex(/^#[\da-f]{6}$/i);
export const patternPresetSchema = z.strictObject({
  preset: z.enum(PATTERN_PRESETS),
  /** Tile side in local pixels. */
  size: z.number().min(1).max(10000),
  /** Stripe/dot/line share of the tile, 0.05–0.95. */
  weight: z.number().min(0.05).max(0.95),
  angle: z.number().min(-360).max(360),
  color,
  background: z.union([z.literal("none"), color]),
});
export type PatternPresetInput = z.infer<typeof patternPresetSchema>;

const n = (value: number) => Number(value.toFixed(6));
function shape(d: string, fill: string): PatternShape {
  return {
    d,
    fill,
    fillOpacity: 1,
    fillRule: "nonzero",
    stroke: "none",
    strokeOpacity: 1,
    strokeWidth: 0,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    opacity: 1,
  };
}
const square = (x: number, y: number, side: number) =>
  `M${n(x)} ${n(y)}H${n(x + side)}V${n(y + side)}H${n(x)}Z`;

/** Builds an ordinary typed pattern: nothing about the preset is stored, so a preset tile is
 * edited, copied, exported and imported exactly like any other pattern. */
export function patternFromPreset(input: PatternPresetInput): Pattern {
  const { preset, size, weight, angle, color, background } = patternPresetSchema.parse(input),
    shapes: PatternShape[] = [];
  if (background !== "none") shapes.push(shape(square(0, 0, size), background.toLowerCase()));
  const ink = color.toLowerCase();
  if (preset === "stripes") shapes.push(shape(`M0 0H${n(size * weight)}V${n(size)}H0Z`, ink));
  else if (preset === "dots") {
    const r = (size * weight) / 2,
      c = size / 2;
    shapes.push(
      shape(
        `M${n(c - r)} ${n(c)}A${n(r)} ${n(r)} 0 1 0 ${n(c + r)} ${n(c)}A${n(r)} ${n(r)} 0 1 0 ${n(c - r)} ${n(c)}Z`,
        ink,
      ),
    );
  } else if (preset === "checker") {
    const half = size / 2;
    shapes.push(shape(`${square(0, 0, half)}${square(half, half, half)}`, ink));
  } else {
    const line = size * weight * 0.5;
    shapes.push(shape(`M0 0H${n(size)}V${n(line)}H0ZM0 0H${n(line)}V${n(size)}H0Z`, ink));
  }
  const radians = (angle * Math.PI) / 180,
    cos = n(Math.cos(radians)),
    sin = n(Math.sin(radians));
  return patternSchema.parse({
    kind: "pattern",
    units: "userSpaceOnUse",
    contentUnits: "userSpaceOnUse",
    x: 0,
    y: 0,
    width: size,
    height: size,
    ...(angle % 360 === 0 ? {} : { transform: [cos, sin, -sin, cos, 0, 0] }),
    shapes,
  });
}
