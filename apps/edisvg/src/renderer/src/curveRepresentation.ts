import { type Easing, easingSchema } from "@informach/edi-motion";
export function curveRepresentation(input: Easing): string {
  const easing = easingSchema.parse(input);
  if (easing === "linear") return "linear";
  if (easing === "hold") return "steps(1, end)";
  if (easing.kind === "cubic-bezier") return `cubic-bezier(${easing.points.join(", ")})`;
  // Elastic is not a CSS cubic approximation. Its parameters describe the
  // actual EdiSVG evaluator and can be reused by the public runtime.
  return JSON.stringify(easing);
}
