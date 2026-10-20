import { type Affine, multiply, parseTransformList } from "@informach/edi-motion";
import { svgPrimitiveFromAttributes, svgPrimitivePathData } from "@informach/edi-motion/geometry";
import {
  type Pattern,
  type PatternShape,
  parseSolidSvgColor,
  parseSvgOpacity,
  patternSchema,
} from "@informach/edi-motion/graphics";
import { assertSvgDefinitionAttributes as attributes } from "./svg-definition";
import { parseSvgInlineStyle } from "./svg-inline-style";

const namespace = "http://www.w3.org/2000/svg",
  metadata = new Set(["title", "desc", "metadata"]),
  shapes = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]),
  number = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?$/,
  inheritable = [
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
  ] as const,
  geometry = [
    "d",
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry",
    "cx",
    "cy",
    "r",
    "x1",
    "y1",
    "x2",
    "y2",
    "points",
  ],
  patternAttributes = [
    "id",
    "href",
    "style",
    "patternUnits",
    "patternContentUnits",
    "x",
    "y",
    "width",
    "height",
    "viewBox",
    "preserveAspectRatio",
    "patternTransform",
    ...inheritable,
  ];
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
const isIdentity = (matrix: Affine) => matrix.every((value, index) => value === IDENTITY[index]);
type Presentation = Partial<Record<(typeof inheritable)[number] | "opacity", string>>;

function scalar(raw: string, fraction: boolean, label: string) {
  const text = raw.trim(),
    percent = text.endsWith("%"),
    value = (percent ? text.slice(0, -1) : text).replace(/px$/i, "");
  if (text.length > 80 || !number.test(value) || (percent && !fraction))
    throw new Error(
      `${label} do padrão precisa ser número absoluto${fraction ? " ou porcentagem" : ""}.`,
    );
  const result = Number(value) / (percent ? 100 : 1);
  if (!Number.isFinite(result) || Math.abs(result) > 100000)
    throw new Error(`${label} do padrão fora do limite numérico.`);
  return result;
}
function presentation(element: Element, allowed: ReadonlySet<string>): Presentation {
  const values: Presentation = {};
  for (const name of [...inheritable, "opacity"] as const) {
    const value = element.getAttribute(name);
    if (value !== null) values[name] = value.trim();
  }
  for (const { name, value, apply } of parseSvgInlineStyle(
    element.getAttribute("style") ?? "",
    allowed,
  ))
    if (apply && name !== "style") Reflect.set(values, name, value.trim());
  return values;
}
function solid(value: string, label: string) {
  if (value === "none") return { color: "none" as const, alpha: 1 };
  if (/^url\(/i.test(value) || value === "currentColor" || value === "inherit")
    throw new Error(
      `${label} dentro do padrão precisa ser cor sólida, sem gradiente, padrão ou currentColor.`,
    );
  return parseSolidSvgColor(value);
}

/** Local `<pattern>` paint servers as typed tiles. Templates (`href`) follow SVG inheritance
 * with bounded depth; groups are flattened into their shapes' matrices; anything that would
 * change pixels when flattened (group opacity, nested paint servers, text, images) refuses. */
export function createSvgPatternCatalog(root: Element) {
  const sources = new Map<string, Element>(),
    parsed = new Map<string, Pattern>();
  let elements = 0;
  (function collect(element: Element, depth: number) {
    if (++elements > 2000 || depth > 32)
      throw new Error("SVG excede orçamento de definições de padrões.");
    if (element.localName === "pattern") {
      const id = element.getAttribute("id");
      if (!id || !/^[A-Za-z_][\w.-]{0,119}$/.test(id))
        throw new Error("Padrão precisa de ID local ASCII de até 120 caracteres.");
      sources.set(id, element);
      if (sources.size > 256) throw new Error("SVG excede limite de 256 padrões.");
      return;
    }
    if (metadata.has(element.localName)) return;
    for (const child of element.children) collect(child, depth + 1);
  })(root, 0);
  const allowedStyle = new Set([...inheritable, "opacity"]);
  function ancestry(element: Element) {
    const chain: Element[] = [];
    for (let current = element.parentElement; current; current = current.parentElement) {
      chain.unshift(current);
      if (current === root) break;
    }
    const values: Presentation = {};
    for (const ancestor of chain)
      for (const [name, value] of Object.entries(presentation(ancestor, allowedStyle)))
        if (name !== "opacity" && value !== "inherit") Reflect.set(values, name, value);
    return values;
  }
  function content(
    children: readonly Element[],
    inherited: Presentation,
    matrix: Affine,
    depth: number,
  ) {
    if (depth > 8) throw new Error("Grupos dentro do padrão excedem 8 níveis.");
    const result: PatternShape[] = [];
    for (const child of children) {
      if (metadata.has(child.localName)) continue;
      if (child.namespaceURI && child.namespaceURI !== namespace)
        throw new Error("Namespace dentro do padrão não suportado.");
      const local = presentation(child, allowedStyle),
        values: Presentation = { ...inherited };
      for (const name of inheritable)
        if (local[name] !== undefined && local[name] !== "inherit") values[name] = local[name];
      const own = multiply(matrix, parseTransformList(child.getAttribute("transform") ?? ""));
      if (child.localName === "g") {
        attributes(child, new Set(["id", "style", "transform", ...inheritable, "opacity"]));
        if (parseSvgOpacity(local.opacity) !== 1)
          throw new Error(
            "Opacidade de grupo dentro do padrão não é convertida; aplique-a às formas.",
          );
        result.push(...content([...child.children], values, own, depth + 1));
        continue;
      }
      if (!shapes.has(child.localName))
        throw new Error(
          `Elemento ${child.localName.slice(0, 40)} dentro do padrão fora do perfil (aceita formas e grupos).`,
        );
      attributes(
        child,
        new Set(["id", "style", "transform", "opacity", ...inheritable, ...geometry]),
      );
      if (
        child.children.length &&
        [...child.children].some((item) => !metadata.has(item.localName))
      )
        throw new Error("Forma do padrão não aceita elementos filhos.");
      const attrs = Object.fromEntries(
          geometry.flatMap((name) => {
            const value = child.getAttribute(name);
            return value === null ? [] : [[name, value]];
          }),
        ),
        d =
          child.localName === "path"
            ? (attrs.d ?? "")
            : svgPrimitivePathData(svgPrimitiveFromAttributes(child.localName, attrs));
      const fill = solid(values.fill ?? "black", "Preenchimento"),
        stroke = solid(values.stroke ?? "none", "Contorno"),
        rule = values["fill-rule"] ?? "nonzero",
        cap = values["stroke-linecap"] ?? "butt",
        join = values["stroke-linejoin"] ?? "miter";
      if (rule !== "nonzero" && rule !== "evenodd")
        throw new Error("Regra de preenchimento do padrão inválida.");
      if (cap !== "butt" && cap !== "round" && cap !== "square")
        throw new Error("stroke-linecap do padrão inválido.");
      if (join !== "miter" && join !== "round" && join !== "bevel")
        throw new Error("stroke-linejoin do padrão inválido.");
      if (!d.trim()) continue;
      result.push({
        d,
        fill: fill.color,
        fillOpacity: fill.alpha * parseSvgOpacity(values["fill-opacity"]),
        fillRule: rule,
        stroke: stroke.color,
        strokeOpacity: stroke.alpha * parseSvgOpacity(values["stroke-opacity"]),
        strokeWidth: scalar(values["stroke-width"] ?? "1", false, "stroke-width"),
        strokeLinecap: cap,
        strokeLinejoin: join,
        opacity: parseSvgOpacity(local.opacity),
        ...(isIdentity(own) ? {} : { transform: own }),
      });
      if (result.length > 64) throw new Error("Padrão excede 64 formas por tile.");
    }
    return result;
  }
  function resolve(id: string, chain: readonly string[] = []): Pattern {
    const ready = parsed.get(id);
    if (ready) return ready;
    if (chain.includes(id) || chain.length >= 8)
      throw new Error("Templates de padrão têm ciclo ou excedem 8 níveis.");
    const source = sources.get(id);
    if (!source) throw new Error("Referência local de padrão ausente.");
    attributes(source, new Set(patternAttributes));
    const primaryHref = source.getAttribute("href"),
      legacyHref = source.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (primaryHref !== null && legacyHref !== null && primaryHref.trim() !== legacyHref.trim())
      throw new Error("href e xlink:href divergentes no padrão.");
    const href = (primaryHref ?? legacyHref)?.trim() ?? null;
    if (href !== null && !/^#[A-Za-z_][\w.-]{0,119}$/.test(href))
      throw new Error("Template de padrão aceita somente referência local, nunca URL externa.");
    const base = href ? resolve(href.slice(1), [...chain, id]) : undefined,
      read = (name: string) => source.getAttribute(name),
      units = read("patternUnits")?.trim() ?? base?.units ?? "objectBoundingBox",
      contentUnits = read("patternContentUnits")?.trim() ?? base?.contentUnits ?? "userSpaceOnUse",
      fraction = units === "objectBoundingBox",
      tile = (name: "x" | "y" | "width" | "height", fallback: number) => {
        const raw = read(name);
        return raw === null ? (base?.[name] ?? fallback) : scalar(raw, fraction, name);
      },
      viewBoxRaw = read("viewBox"),
      viewBox = viewBoxRaw
        ? viewBoxRaw
            .trim()
            .split(/[\s,]+/)
            .map((value) => scalar(value, false, "viewBox"))
        : base?.viewBox,
      aspect =
        read("preserveAspectRatio")?.trim().replace(/\s+/g, " ") ?? base?.preserveAspectRatio,
      transformRaw = read("patternTransform"),
      transform = transformRaw !== null ? parseTransformList(transformRaw) : base?.transform,
      own = [...source.children].filter((child) => !metadata.has(child.localName)),
      tileShapes = own.length
        ? content(
            own,
            { ...ancestry(source), ...stripInherit(presentation(source, allowedStyle)) },
            IDENTITY,
            0,
          )
        : (base?.shapes ?? []);
    const width = tile("width", 0),
      height = tile("height", 0);
    if (!(width > 0 && height > 0))
      throw new Error("Padrão sem largura e altura positivas não desenha nada; ajuste o tile.");
    if (!tileShapes.length) throw new Error("Padrão sem formas visíveis.");
    const value = patternSchema.parse({
      kind: "pattern",
      units,
      contentUnits,
      x: tile("x", 0),
      y: tile("y", 0),
      width,
      height,
      ...(viewBox ? { viewBox } : {}),
      ...(aspect && viewBox ? { preserveAspectRatio: aspect } : {}),
      ...(transform && !isIdentity(transform) ? { transform } : {}),
      shapes: tileShapes,
    });
    parsed.set(id, value);
    return value;
  }
  function stripInherit(values: Presentation): Presentation {
    return Object.fromEntries(
      Object.entries(values).filter(([name, value]) => name !== "opacity" && value !== "inherit"),
    );
  }
  return {
    has: (id: string) => sources.has(id),
    resolve,
    isDefinition: (element: Element) => element.localName === "pattern",
    validateAll() {
      for (const id of sources.keys()) resolve(id);
    },
  };
}
