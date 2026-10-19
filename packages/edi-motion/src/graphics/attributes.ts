import { z } from "zod";
import { parseSvgPath } from "../svgPath";
import { isXmlText } from "../xmlText";
import { validateSvgNumbers } from "./svgValidation";

export const svgAttributes: ReadonlySet<string> = new Set([
  "d",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "fill-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "transform",
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "letter-spacing",
  "word-spacing",
  "direction",
  "unicode-bidi",
  "text-anchor",
  "display",
  "visibility",
  "viewBox",
  "preserveAspectRatio",
  "overflow",
]);
function attributeError(key: string, value: unknown): string | null {
  if (
    !svgAttributes.has(key) ||
    typeof value !== "string" ||
    value.length > 500000 ||
    !isXmlText(value) ||
    /url\s*\(|(?:var|env|paint|image|image-set|cross-fade|element|attr)\s*\(|[<>\\]|(?:javascript|data|https?):/i.test(
      value,
    )
  )
    return `Atributo SVG não suportado: ${key}`;
  try {
    validateSvgNumbers(key, value);
    if (key === "d" && value.trim()) parseSvgPath(value);
  } catch (error) {
    // Convert the controlled numeric validator's domain failure into a Zod
    // issue at the schema boundary; unexpected thrown values still propagate.
    if (!(error instanceof Error)) throw error;
    return error.message;
  }
  return null;
}
function boundedRecord(input: unknown): input is Record<string, unknown> {
  return (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    Object.keys(input).length <= svgAttributes.size
  );
}
/** The same whitelist/validation serves authoring and portable visual data.
 * Paint/resource URLs belong to typed generated definitions, not these attrs. */
export function validAttributes(input: unknown = {}): Record<string, string> {
  if (!boundedRecord(input)) throw new Error("Atributos SVG inválidos/excessivos.");
  const result: Record<string, string> = {};
  let bytes = 0;
  for (const [key, value] of Object.entries(input)) {
    const error = attributeError(key, value);
    if (error !== null) throw new Error(error);
    if (typeof value !== "string") throw new Error("Atributo SVG requer texto.");
    bytes += value.length;
    if (bytes > 4_000_000) throw new Error("Atributos SVG excedem o orçamento textual.");
    result[key] = value;
  }
  return result;
}
export const svgAttributesSchema = z
  .unknown()
  .refine(boundedRecord, { error: "Atributos SVG inválidos/excessivos.", abort: true })
  .pipe(z.record(z.string().max(80), z.string().max(500000)))
  .superRefine((values, context) => {
    let bytes = 0;
    for (const [key, value] of Object.entries(values)) {
      bytes += value.length;
      const error = attributeError(key, value);
      if (error !== null) context.addIssue({ code: "custom", path: [key], message: error });
    }
    if (bytes > 4_000_000)
      context.addIssue({ code: "custom", message: "Atributos SVG excedem o orçamento textual." });
  });
