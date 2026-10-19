import { type Easing, ease, easingSchema } from "@informach/edi-motion";

/** Plot the actual evaluator (including overshoot), not a decorative preset. */
export function curvePreview(input: Easing, range?: { min: number; max: number }) {
  const easing = easingSchema.parse(input);
  const values = Array.from({ length: 101 }, (_, index) => ease(index / 100, easing));
  const controls =
    typeof easing !== "string" && easing.kind === "cubic-bezier" ? easing.points : undefined;
  const min = range?.min ?? Math.min(0, ...values, ...(controls ? [controls[1], controls[3]] : [])),
    max = range?.max ?? Math.max(1, ...values, ...(controls ? [controls[1], controls[3]] : []));
  const y = (value: number) => 118 - ((value - min) / (max - min)) * 106;
  const path =
    easing === "hold"
      ? `M12 ${y(0)}H248V${y(1)}`
      : values
          .map((value, index) => `${index ? "L" : "M"}${12 + index * 2.36} ${y(value)}`)
          .join(" ");
  return {
    path,
    min,
    max,
    zero: y(0),
    one: y(1),
    controls: controls
      ? [
          { x: 12 + 236 * controls[0], y: y(controls[1]) },
          { x: 12 + 236 * controls[2], y: y(controls[3]) },
        ]
      : [],
  };
}
