import { parseTransformList } from "../affine";

const numberToken = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?";
const scalar = new RegExp(`^(${numberToken})(px|%|em|ex|cm|mm|in|pt|pc)?$`);
const numberList = new RegExp(`^\\s*${numberToken}(?:(?:\\s+,?\\s*|,\\s*)${numberToken})*\\s*$`);
const coordinates = new Set([
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "letter-spacing",
  "word-spacing",
]);
const sizes = new Set(["width", "height", "rx", "ry", "r", "stroke-width", "font-size"]);
const opacities = new Set(["opacity", "fill-opacity", "stroke-opacity"]);

/** Unitless/percentage alpha shared by import and format conversion. */
export function parseSvgOpacity(value: string | undefined): number {
  if (value === undefined) return 1;
  if (typeof value !== "string" || value.length > 80) throw new Error("Opacidade SVG inválida.");
  validateSvgNumbers("opacity", value);
  const text = value.trim();
  return text.endsWith("%") ? Number(text.slice(0, -1)) / 100 : Number(text);
}

function finite(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > 1e7)
    throw new Error("Número SVG fora do limite permitido.");
  return value;
}

export function validateSvgNumbers(name: string, value: string): void {
  const enums: Record<string, string[]> = {
    "font-style": ["normal", "italic", "oblique", "inherit"],
    direction: ["ltr", "rtl", "inherit"],
    "unicode-bidi": [
      "normal",
      "embed",
      "bidi-override",
      "isolate",
      "isolate-override",
      "plaintext",
    ],
    "text-anchor": ["start", "middle", "end", "inherit"],
  };
  if (enums[name]) {
    if (!enums[name].includes(value)) throw new Error(`Valor SVG inválido: ${name}`);
    return;
  }
  if (name === "font-weight") {
    if (
      !["normal", "bold", "bolder", "lighter", "inherit"].includes(value) &&
      !/^(?:[1-9]\d{0,2}|1000)$/.test(value)
    )
      throw new Error("Peso de fonte inválido.");
    return;
  }
  if (name === "viewBox") {
    if (!numberList.test(value)) throw new Error("ViewBox SVG inválido.");
    const values = value
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      values.length !== 4 ||
      values.some((number) => !Number.isFinite(number) || Math.abs(number) > 100000) ||
      (values[2] ?? 0) <= 0 ||
      (values[3] ?? 0) <= 0
    )
      throw new Error("ViewBox SVG inválido.");
  } else if (name === "preserveAspectRatio") {
    if (!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(value))
      throw new Error("Proporção SVG inválida.");
  } else if (name === "overflow") {
    if (value !== "hidden" && value !== "visible")
      throw new Error("Clipping de viewport inválido.");
  } else if (name === "transform") {
    parseTransformList(value);
  } else if (coordinates.has(name) || sizes.has(name) || opacities.has(name)) {
    const match = scalar.exec(value.trim());
    if (!match?.[1]) throw new Error(`Número SVG inválido: ${name}`);
    const n = finite(Number(match[1]));
    if (sizes.has(name) && n < 0) throw new Error(`Dimensão SVG negativa: ${name}`);
    if (
      opacities.has(name) &&
      (n < 0 || n > (match[2] === "%" ? 100 : 1) || (match[2] && match[2] !== "%"))
    )
      throw new Error(`Opacidade SVG inválida: ${name}`);
  } else if (name === "points" || (name === "stroke-dasharray" && value !== "none")) {
    if (!numberList.test(value)) throw new Error(`Lista numérica SVG inválida: ${name}`);
    const values = value
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (values.length > 8000 || (name === "points" && values.length % 2 !== 0))
      throw new Error("Lista de coordenadas SVG inválida ou muito grande.");
    values.forEach(finite);
    if (name === "stroke-dasharray" && values.some((n) => n < 0))
      throw new Error("Traçado SVG negativo.");
  }
}
