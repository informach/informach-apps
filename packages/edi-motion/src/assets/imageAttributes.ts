import { validateSvgNumbers } from "../graphics/svgValidation";

/** Raster appearance is owned by the resource, not vector fill/stroke. */
const imageAttributes = new Set([
  "x",
  "y",
  "width",
  "height",
  "transform",
  "opacity",
  "display",
  "visibility",
  "preserveAspectRatio",
  "overflow",
]);
export function validateImageAttributes(attrs: Record<string, string>) {
  for (const [name, value] of Object.entries(attrs)) {
    if (!imageAttributes.has(name))
      throw new Error(`Imagem não aceita pintura/geometria vetorial: ${name}.`);
    if (
      typeof value !== "string" ||
      value.length > 500 ||
      /url\s*\(|[<>\\]|(?:javascript|data|https?):/i.test(value)
    )
      throw new Error(`Atributo de imagem inseguro: ${name}.`);
    if (name === "display" && !["inline", "none", "inherit", "initial", "unset"].includes(value))
      throw new Error("Display de imagem inválido.");
    if (
      name === "visibility" &&
      !["visible", "hidden", "collapse", "inherit", "initial", "unset"].includes(value)
    )
      throw new Error("Visibilidade de imagem inválida.");
    validateSvgNumbers(name, value);
  }
}
