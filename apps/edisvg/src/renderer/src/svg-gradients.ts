import { parseTransformList } from "@informach/edi-motion";
import {
  parseSolidSvgColor as color,
  type Gradient,
  gradientSchema,
} from "@informach/edi-motion/graphics";
import { assertSvgDefinitionAttributes as attributes } from "./svg-definition";
import { parseSvgInlineStyle } from "./svg-inline-style";

const kinds = new Set(["linearGradient", "radialGradient"]),
  metadata = new Set(["title", "desc", "metadata"]),
  namespace = "http://www.w3.org/2000/svg",
  number = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?$/;
function numeric(raw: string, percent: boolean) {
  const text = raw.trim(),
    suffix = text.endsWith("%");
  const value = suffix ? text.slice(0, -1) : text;
  if (text.length > 80 || !number.test(value) || (suffix && !percent))
    throw new Error(
      "Número/unidade de gradiente não suportado; use valores absolutos para userSpaceOnUse.",
    );
  const result = Number(value) / (suffix ? 100 : 1);
  if (!Number.isFinite(result)) throw new Error("Número de gradiente não finito.");
  return result;
}
function styles(element: Element, allowed: ReadonlySet<string>) {
  const result: Record<string, string> = {};
  for (const { name, value, apply } of parseSvgInlineStyle(
    element.getAttribute("style") ?? "",
    allowed,
  )) {
    if (name === "stop-color") color(value);
    else if (name === "stop-opacity") {
      const alpha = numeric(value, true);
      if (alpha < 0 || alpha > 1) throw new Error("Opacidade de parada deve estar entre 0 e 1.");
    } else if (name === "color-interpolation" && value !== "sRGB")
      throw new Error("Este perfil de gradiente requer color-interpolation sRGB.");
    if (apply) result[name] = value;
  }
  return result;
}
/** Resolve only local typed gradients. No network, markup execution or hidden
 * interpretation of unsupported defs. Template recursion and traversal bounded. */
export function createSvgGradientCatalog(root: Element) {
  const sources = new Map<string, Element>(),
    ids = new Set<string>(),
    parsed = new Map<string, Gradient>(),
    rawCoordinates = new Map<string, Record<string, string>>(),
    templateDepth = new Map<string, number>();
  let work = 0;
  function collect(element: Element, depth: number) {
    if (++work > 2000 || depth > 32)
      throw new Error("SVG excede orçamento de definições/elementos.");
    const id = element.getAttribute("id");
    if (id) {
      if (ids.has(id)) throw new Error("IDs SVG duplicados tornam referências ambíguas.");
      ids.add(id);
    }
    if (kinds.has(element.localName)) {
      if (!id || !/^[A-Za-z_][\w.-]{0,119}$/.test(id))
        throw new Error("Gradiente precisa de ID local ASCII válido, até 120 caracteres.");
      sources.set(id, element);
      if (sources.size > 256) throw new Error("SVG excede limite de 256 gradientes.");
    }
    if (metadata.has(element.localName)) return;
    for (const child of element.children) collect(child, depth + 1);
  }
  collect(root, 0);
  function viewport() {
    const values = root
        .getAttribute("viewBox")
        ?.trim()
        .split(/[\s,]+/)
        .map(Number),
      width = values?.[2] ?? Number((root.getAttribute("width") ?? "").replace(/px$/, "")),
      height = values?.[3] ?? Number((root.getAttribute("height") ?? "").replace(/px$/, ""));
    if (![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= 100000))
      throw new Error("Gradiente userSpaceOnUse requer viewport finito.");
    return { width, height };
  }
  function resolve(id: string, ancestors = new Set<string>()): Gradient {
    const ready = parsed.get(id);
    if (ready) return ready;
    if (ancestors.size >= 8 || ancestors.has(id))
      throw new Error("Templates de gradiente têm ciclo ou excedem 8 níveis.");
    const source = sources.get(id);
    if (!source) throw new Error("Referência local de gradiente ausente.");
    if (source.namespaceURI && source.namespaceURI !== namespace)
      throw new Error("Namespace de gradiente não suportado.");
    const kind = source.localName === "linearGradient" ? "linear" : "radial";
    attributes(
      source,
      new Set([
        "id",
        "href",
        "style",
        "color-interpolation",
        "gradientUnits",
        "gradientTransform",
        "spreadMethod",
        ...(kind === "linear" ? ["x1", "y1", "x2", "y2"] : ["cx", "cy", "r", "fx", "fy"]),
      ]),
    );
    const style = styles(source, new Set(["color-interpolation"]));
    if (
      (style["color-interpolation"] ?? source.getAttribute("color-interpolation") ?? "sRGB") !==
      "sRGB"
    )
      throw new Error("Gradiente importado requer interpolação sRGB neste perfil.");
    const primaryHref = source.getAttribute("href"),
      legacyHref = source.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
      href = (primaryHref ?? legacyHref)?.trim() ?? null,
      next = new Set(ancestors);
    if (primaryHref !== null && legacyHref !== null && primaryHref.trim() !== legacyHref.trim())
      throw new Error("href e xlink:href divergentes no gradiente.");
    next.add(id);
    if (href !== null && !/^#[A-Za-z_][\w.-]{0,119}$/.test(href))
      throw new Error("Template de gradiente aceita somente referência local, nunca URL externa.");
    const base = href ? resolve(href.slice(1), next) : undefined;
    const depth = 1 + (href ? (templateDepth.get(href.slice(1)) ?? 0) : 0);
    if (depth > 8) throw new Error("Template de gradiente excede 8 níveis.");
    if (base && base.kind !== kind)
      throw new Error("Template cruzado linear/radial não suportado neste perfil.");
    const coordinates: Record<string, string> = {
      ...(href ? rawCoordinates.get(href.slice(1)) : {}),
    };
    for (const name of kind === "linear"
      ? ["x1", "y1", "x2", "y2"]
      : ["cx", "cy", "r", "fx", "fy"]) {
      const value = source.getAttribute(name);
      if (value !== null) coordinates[name] = value;
    }
    const units =
        source.getAttribute("gradientUnits")?.trim() ?? base?.units ?? "objectBoundingBox",
      size = units === "userSpaceOnUse" ? viewport() : { width: 1, height: 1 },
      coordinate = (name: string, fallback: number) => {
        const raw = coordinates[name];
        return raw === undefined
          ? fallback
          : numeric(
              units === "userSpaceOnUse" ? raw.replace(/px$/, "") : raw,
              units === "objectBoundingBox",
            );
      },
      rawStops = [...source.children].filter((child) => child.localName === "stop");
    if (
      rawStops.length > 32 ||
      [...source.children].some(
        (child) => !metadata.has(child.localName) && child.localName !== "stop",
      )
    )
      throw new Error(
        "Gradiente aceita até 32 paradas estáticas; animações/elementos adicionais não suportados.",
      );
    let stops = rawStops.map((stop) => {
      if (stop.namespaceURI && stop.namespaceURI !== namespace)
        throw new Error("Namespace de parada não suportado.");
      if (stop.children.length)
        throw new Error("Parada de gradiente precisa ser estática e sem filhos.");
      attributes(stop, new Set(["id", "offset", "stop-color", "stop-opacity", "style"]));
      const style = styles(stop, new Set(["stop-color", "stop-opacity"])),
        normalized = color(style["stop-color"] ?? stop.getAttribute("stop-color") ?? "black"),
        opacity = numeric(style["stop-opacity"] ?? stop.getAttribute("stop-opacity") ?? "1", true);
      if (opacity < 0 || opacity > 1)
        throw new Error("Opacidade de parada deve estar entre 0 e 1.");
      return {
        offset: numeric(stop.getAttribute("offset") ?? "0", true),
        color: normalized.color,
        opacity: normalized.alpha * opacity,
      };
    });
    if (!stops.length && base) stops = base.stops;
    if (stops.length === 1 && stops[0])
      stops = [
        { ...stops[0], offset: 0 },
        { ...stops[0], offset: 1 },
      ];
    const transform = source.getAttribute("gradientTransform"),
      common = {
        units,
        spread: source.getAttribute("spreadMethod")?.trim() ?? base?.spread ?? "pad",
        stops,
        ...(transform !== null
          ? { transform: parseTransformList(transform) }
          : base?.transform
            ? { transform: base.transform }
            : {}),
      };
    const value =
      kind === "linear"
        ? {
            ...common,
            kind,
            x1: coordinate("x1", 0),
            y1: coordinate("y1", 0),
            x2: coordinate("x2", size.width),
            y2: coordinate("y2", 0),
          }
        : (() => {
            const cx = coordinate("cx", size.width / 2),
              cy = coordinate("cy", size.height / 2);
            return {
              ...common,
              kind,
              cx,
              cy,
              r: coordinate("r", Math.hypot(size.width, size.height) / Math.SQRT2 / 2),
              fx: coordinate("fx", cx),
              fy: coordinate("fy", cy),
            };
          })();
    const gradient = gradientSchema.parse(value);
    parsed.set(id, gradient);
    rawCoordinates.set(id, coordinates);
    templateDepth.set(id, depth);
    return gradient;
  }
  for (const id of sources.keys()) resolve(id);
  return {
    resolve,
    validateDefs(element: Element) {
      attributes(element, new Set(["id"]));
      if (element.namespaceURI && element.namespaceURI !== namespace)
        throw new Error("Namespace de defs não suportado.");
    },
    isDefinition(element: Element) {
      return element.localName === "defs" || kinds.has(element.localName);
    },
    paint(value: string) {
      const match = /^url\(\s*(['"]?)#([A-Za-z_][\w.-]{0,119})\1\s*\)$/.exec(value.trim());
      if (!match?.[2])
        throw new Error("Pintura SVG aceita somente referência local a gradiente suportado.");
      return resolve(match[2]);
    },
  };
}
