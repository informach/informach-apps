import {
  FILTER_BLEND_MODES,
  type Filter,
  type FilterInput,
  type FilterPrimitive,
  filterSchema,
  parseSolidSvgColor,
  parseSvgOpacity,
} from "@informach/edi-motion/graphics";
import { assertSvgDefinitionAttributes as attributes } from "./svg-definition";
import { parseSvgInlineStyle } from "./svg-inline-style";

const metadata = new Set(["title", "desc", "metadata"]),
  number = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?$/,
  OPERATORS = ["over", "in", "out", "atop", "xor", "lighter", "arithmetic"] as const,
  LOCAL = /^url\(\s*(['"]?)#([A-Za-z_][\w.-]{0,119})\1\s*\)$/,
  common = ["id", "in", "result", "style", "color-interpolation-filters"],
  allowed: Record<string, string[]> = {
    feGaussianBlur: [...common, "stdDeviation", "edgeMode"],
    feOffset: [...common, "dx", "dy"],
    feDropShadow: [...common, "dx", "dy", "stdDeviation", "flood-color", "flood-opacity"],
    feColorMatrix: [...common, "type", "values"],
    feFlood: [...common, "flood-color", "flood-opacity"],
    feBlend: [...common, "in2", "mode"],
    feComposite: [...common, "in2", "operator", "k1", "k2", "k3", "k4"],
    feMerge: ["id", "result", "style", "color-interpolation-filters"],
  };

function scalar(raw: string | null, fallback: number, label: string, fraction = false) {
  if (raw === null) return fallback;
  const text = raw.trim(),
    percent = text.endsWith("%"),
    value = (percent ? text.slice(0, -1) : text).replace(/px$/i, "");
  if (text.length > 80 || !number.test(value) || (percent && !fraction))
    throw new Error(
      `${label} do filtro precisa ser número absoluto${fraction ? " ou porcentagem" : ""}.`,
    );
  const result = Number(value) / (percent ? 100 : 1);
  if (!Number.isFinite(result) || Math.abs(result) > 100000)
    throw new Error(`${label} do filtro fora do limite numérico.`);
  return result;
}
function list(raw: string | null, label: string) {
  if (raw === null) return null;
  const values = raw
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (values.length > 20) throw new Error(`${label} do filtro tem valores demais.`);
  return values.map((value) => scalar(value, 0, label));
}
function style(element: Element) {
  const values: Record<string, string> = {};
  for (const { name, value, apply } of parseSvgInlineStyle(
    element.getAttribute("style") ?? "",
    new Set(["flood-color", "flood-opacity", "color-interpolation-filters"]),
  ))
    if (apply) values[name] = value.trim();
  return values;
}

/** Local `<filter>` definitions as typed primitive chains. Nothing is fetched and no
 * background/paint inputs exist: every input is the element itself or an earlier primitive. */
export function createSvgFilterCatalog(root: Element) {
  const sources = new Map<string, Element>(),
    parsed = new Map<string, Filter>();
  let elements = 0;
  (function collect(element: Element, depth: number) {
    if (++elements > 2000 || depth > 32)
      throw new Error("SVG excede orçamento de definições de filtros.");
    if (element.localName === "filter") {
      const id = element.getAttribute("id");
      if (!id || !/^[A-Za-z_][\w.-]{0,119}$/.test(id))
        throw new Error("Filtro precisa de ID local ASCII de até 120 caracteres.");
      sources.set(id, element);
      if (sources.size > 64) throw new Error("SVG excede limite de 64 filtros.");
      return;
    }
    if (metadata.has(element.localName)) return;
    for (const child of element.children) collect(child, depth + 1);
  })(root, 0);
  function inheritedInterpolation(element: Element) {
    for (let current: Element | null = element; current; current = current.parentElement) {
      const value =
        style(current)["color-interpolation-filters"] ??
        current.getAttribute("color-interpolation-filters");
      if (value && value !== "inherit" && value !== "auto") return value.trim();
      if (current === root) break;
    }
    return "linearRGB";
  }
  function resolve(id: string): Filter {
    const ready = parsed.get(id);
    if (ready) return ready;
    const source = sources.get(id);
    if (!source) throw new Error("Referência local de filtro ausente.");
    attributes(
      source,
      new Set([
        "id",
        "x",
        "y",
        "width",
        "height",
        "filterUnits",
        "primitiveUnits",
        "color-interpolation-filters",
        "style",
      ]),
    );
    const units = source.getAttribute("filterUnits")?.trim() ?? "objectBoundingBox",
      fraction = units === "objectBoundingBox";
    if (
      !fraction &&
      ["x", "y", "width", "height"].some((name) => source.getAttribute(name) === null)
    )
      throw new Error("Filtro userSpaceOnUse requer x, y, width e height explícitos.");
    const interpolation = inheritedInterpolation(source),
      results = new Map<string, number>(),
      primitives: FilterPrimitive[] = [];
    const inputOf = (element: Element, name: "in" | "in2", index: number): FilterInput => {
      const raw = element.getAttribute(name)?.trim();
      if (raw === undefined || raw === "") {
        if (name === "in2") throw new Error("Primitiva de filtro requer in2 explícito.");
        return index === 0 ? "SourceGraphic" : index - 1;
      }
      if (raw === "SourceGraphic" || raw === "SourceAlpha") return raw;
      const reference = results.get(raw);
      if (reference !== undefined) return reference;
      throw new Error(
        ["BackgroundImage", "BackgroundAlpha", "FillPaint", "StrokePaint"].includes(raw)
          ? "Filtro com fundo ou pintura como entrada fica fora do perfil."
          : `Entrada de filtro "${raw.slice(0, 40)}" não corresponde a um resultado anterior.`,
      );
    };
    const children = [...source.children].filter((child) => !metadata.has(child.localName));
    if (!children.length) throw new Error("Filtro sem primitivas não é convertido.");
    for (const [index, element] of children.entries()) {
      const names = allowed[element.localName];
      if (!names)
        throw new Error(`Primitiva ${element.localName.slice(0, 40)} fora do perfil de filtros.`);
      attributes(element, new Set(names));
      const own = style(element),
        space =
          own["color-interpolation-filters"] ??
          element.getAttribute("color-interpolation-filters")?.trim();
      if (space && space !== "inherit" && space !== interpolation)
        throw new Error("Primitivas com espaços de cor diferentes do filtro ficam fora do perfil.");
      const flood = () => {
        const color = parseSolidSvgColor(
          own["flood-color"] ?? element.getAttribute("flood-color") ?? "black",
        );
        return {
          color: color.color,
          opacity:
            color.alpha *
            parseSvgOpacity(
              own["flood-opacity"] ?? element.getAttribute("flood-opacity") ?? undefined,
            ),
        };
      };
      const deviation = (fallback: number): [number, number] => {
        const values = list(element.getAttribute("stdDeviation"), "stdDeviation") ?? [fallback];
        if (values.length > 2 || values.some((value) => value < 0))
          throw new Error("stdDeviation do filtro precisa de um ou dois valores não negativos.");
        return [values[0] ?? fallback, values[1] ?? values[0] ?? fallback];
      };
      let primitive: FilterPrimitive;
      switch (element.localName) {
        case "feGaussianBlur": {
          const edge = element.getAttribute("edgeMode")?.trim() ?? "none";
          if (edge !== "none" && edge !== "duplicate" && edge !== "wrap")
            throw new Error("edgeMode do desfoque inválido.");
          primitive = {
            kind: "blur",
            in: inputOf(element, "in", index),
            stdDeviation: deviation(0),
            edgeMode: edge,
          };
          break;
        }
        case "feOffset":
          primitive = {
            kind: "offset",
            in: inputOf(element, "in", index),
            dx: scalar(element.getAttribute("dx"), 0, "dx"),
            dy: scalar(element.getAttribute("dy"), 0, "dy"),
          };
          break;
        case "feDropShadow":
          primitive = {
            kind: "dropShadow",
            in: inputOf(element, "in", index),
            dx: scalar(element.getAttribute("dx"), 2, "dx"),
            dy: scalar(element.getAttribute("dy"), 2, "dy"),
            stdDeviation: deviation(2),
            ...flood(),
          };
          break;
        case "feColorMatrix": {
          const type = element.getAttribute("type")?.trim() ?? "matrix";
          if (
            type !== "matrix" &&
            type !== "saturate" &&
            type !== "hueRotate" &&
            type !== "luminanceToAlpha"
          )
            throw new Error("Tipo de feColorMatrix fora do perfil.");
          const raw = list(element.getAttribute("values"), "values"),
            values =
              type === "luminanceToAlpha"
                ? []
                : (raw ??
                  (type === "matrix"
                    ? [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]
                    : [type === "saturate" ? 1 : 0]));
          primitive = { kind: "colorMatrix", in: inputOf(element, "in", index), type, values };
          break;
        }
        case "feFlood":
          primitive = { kind: "flood", ...flood() };
          break;
        case "feBlend": {
          const mode = element.getAttribute("mode")?.trim() ?? "normal",
            valid = FILTER_BLEND_MODES.find((value) => value === mode);
          if (!valid) throw new Error("Modo de feBlend fora do perfil.");
          primitive = {
            kind: "blend",
            in: inputOf(element, "in", index),
            in2: inputOf(element, "in2", index),
            mode: valid,
          };
          break;
        }
        case "feComposite": {
          const raw = element.getAttribute("operator")?.trim() ?? "over",
            operator = OPERATORS.find((value) => value === raw);
          if (!operator) throw new Error("Operador de feComposite fora do perfil.");
          primitive = {
            kind: "composite",
            in: inputOf(element, "in", index),
            in2: inputOf(element, "in2", index),
            operator,
            ...(operator === "arithmetic"
              ? {
                  k: [
                    scalar(element.getAttribute("k1"), 0, "k1"),
                    scalar(element.getAttribute("k2"), 0, "k2"),
                    scalar(element.getAttribute("k3"), 0, "k3"),
                    scalar(element.getAttribute("k4"), 0, "k4"),
                  ] as [number, number, number, number],
                }
              : {}),
          };
          break;
        }
        default: {
          const nodes = [...element.children].filter((child) => !metadata.has(child.localName));
          if (!nodes.length || nodes.some((child) => child.localName !== "feMergeNode"))
            throw new Error("feMerge aceita somente feMergeNode.");
          primitive = {
            kind: "merge",
            inputs: nodes.map((node) => {
              attributes(node, new Set(["id", "in"]));
              return inputOf(node, "in", index);
            }),
          };
        }
      }
      primitives.push(primitive);
      const result = element.getAttribute("result")?.trim();
      if (result) results.set(result, index);
    }
    const value = filterSchema.parse({
      units,
      primitiveUnits: source.getAttribute("primitiveUnits")?.trim() ?? "userSpaceOnUse",
      x: scalar(source.getAttribute("x"), -0.1, "x", fraction),
      y: scalar(source.getAttribute("y"), -0.1, "y", fraction),
      width: scalar(source.getAttribute("width"), 1.2, "width", fraction),
      height: scalar(source.getAttribute("height"), 1.2, "height", fraction),
      colorInterpolation: interpolation,
      primitives,
    });
    parsed.set(id, value);
    return value;
  }
  return {
    isDefinition: (element: Element) => element.localName === "filter",
    reference(raw: string) {
      const text = raw.trim();
      if (text === "none") return null;
      const id = LOCAL.exec(text)?.[2];
      if (!id)
        throw new Error(
          "Filtro aceita somente referência local url(#id); funções CSS como blur() ainda não são convertidas.",
        );
      return resolve(id);
    },
    validateAll() {
      for (const id of sources.keys()) resolve(id);
    },
  };
}
