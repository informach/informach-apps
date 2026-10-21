import {
  type Affine,
  identityTransform,
  multiply,
  parseTransformList,
  transformPoint,
} from "@informach/edi-motion";
import {
  parseGeometry,
  type SvgPrimitive,
  svgPrimitiveFromAttributes,
  svgPrimitivePathData,
} from "@informach/edi-motion/geometry";
import {
  type GradientPaints,
  paintedStrokeWidth,
  parseSolidSvgColor,
  parseSvgOpacity,
  validAttributes,
} from "@informach/edi-motion/graphics";
import { z } from "zod";
import { parsePath, pathDataFromNode } from "../../shared/pathGeometry.js";
import type { SceneNode } from "../../shared/sceneTypes";
import { assertSvgDefinitionAttributes } from "./svg-definition";
import { parseSvgInlineStyle } from "./svg-inline-style";

const shapeTag = z.enum(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]),
  metadata = new Set(["title", "desc", "metadata"]),
  presentation = new Set([
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "opacity",
    "visibility",
    "display",
    "clip-rule",
  ]),
  geometryAttributes = new Set([
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
    "transform",
  ]);
export type SvgEffectKind = "clip" | "mask";
export interface SvgEffectPresentation {
  attrs: Readonly<Record<string, string>>;
  gradients?: GradientPaints;
}
export type SvgEffectPresentationReader = (element: Element) => SvgEffectPresentation | undefined;
export interface SvgEffectDefinition {
  id: string;
  kind: SvgEffectKind;
  d: string;
  matrix: Affine;
  rule: "nonzero" | "evenodd";
  opacity: number;
  sourceOpacity: number;
  nativeShape?: SvgPrimitive;
  metadata: readonly Element[];
  /** Painted masks (luminance, or alpha with gradients/patterns/strokes): the source carries
   * its effective paint explicitly, so it never inherits from the group it ends up in. */
  painted?: {
    mode: "alpha" | "luminance";
    attrs: Record<string, string>;
    gradients?: GradientPaints;
  };
}
/** Solid colours become #rrggbb; alpha moves into the matching opacity by the caller's profile. */
function normalizePaint(value: string) {
  if (value === "none") return value;
  const color = parseSolidSvgColor(value);
  if (color.alpha !== 1)
    throw new Error(
      "Cor semitransparente na fonte da máscara pintada: use fill-opacity/stroke-opacity.",
    );
  return color.color;
}
function rule(value: string | undefined): "nonzero" | "evenodd" {
  if (value === undefined || value === "nonzero") return "nonzero";
  if (value === "evenodd") return "evenodd";
  throw new Error("Regra de definição SVG fora do perfil suportado.");
}
function absolute(raw: string | null) {
  if (
    !raw ||
    raw.length > 80 ||
    !/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?(?:px)?$/i.test(raw.trim())
  )
    throw new Error("Região da máscara requer x/y/width/height absolutos explícitos.");
  const value = Number(raw.trim().replace(/px$/i, ""));
  if (!Number.isFinite(value) || Math.abs(value) > 1e7)
    throw new Error("Região da máscara fora do limite numérico.");
  return value;
}
/** Only SVG-local definitions are inspected; no resource URL, CSS rule,
 * authored program or document-provided identifier is executed. Resolution
 * happens after the main importer has validated ancestor presentations. */
export function createSvgEffectCatalog(root: Element) {
  const sources = new Map<string, Element>(),
    ids = new Set<string>(),
    local = new Map<Element, Record<string, string>>(),
    resolved = new Map<string, SvgEffectDefinition>(),
    failures = new Map<string, Error>();
  let elements = 0,
    vertices = 0;
  function collect(element: Element, depth: number) {
    if (++elements > 2000 || depth > 32)
      throw new Error("SVG excede orçamento de definições de efeitos.");
    const id = element.getAttribute("id");
    if (id) {
      if (ids.has(id)) throw new Error("IDs SVG duplicados tornam os efeitos ambíguos.");
      ids.add(id);
    }
    if (element.localName === "clipPath" || element.localName === "mask") {
      if (!id || !/^[A-Za-z_][\w.-]{0,119}$/.test(id))
        throw new Error("Efeito requer ID local ASCII de até 120 caracteres.");
      sources.set(id, element);
      if (sources.size > 256) throw new Error("SVG excede 256 definições de efeitos.");
    }
    if (metadata.has(element.localName)) return;
    for (const child of element.children) collect(child, depth + 1);
  }
  collect(root, 0);
  function readLocal(
    element: Element,
    allowed: ReadonlySet<string>,
    styleAllowed: ReadonlySet<string>,
  ) {
    assertSvgDefinitionAttributes(element, allowed);
    const attrs: Record<string, string> = {};
    const assign = (name: string, value: string, apply: boolean) => {
      if (name === "clip-rule") {
        if (value !== "inherit") rule(value);
      } else if (name === "mask-type") {
        if (value !== "alpha" && value !== "luminance")
          throw new Error("mask-type precisa ser alpha ou luminance.");
      } else if ((name === "fill" || name === "stroke") && /^url\(/i.test(value.trim())) {
        if (!/^url\(\s*(['"]?)#[A-Za-z_][\w.-]{0,119}\1\s*\)$/.test(value.trim()))
          throw new Error(
            "Pintura da máscara aceita somente referência local a gradiente ou padrão.",
          );
      } else validAttributes({ [name]: value });
      if (apply) attrs[name] = value;
    };
    for (const attr of element.attributes)
      if (
        (presentation.has(attr.name) ||
          geometryAttributes.has(attr.name) ||
          attr.name === "mask-type") &&
        attr.name !== "style"
      )
        assign(attr.name, attr.value, true);
    for (const declaration of parseSvgInlineStyle(
      element.getAttribute("style") ?? "",
      styleAllowed,
    ))
      assign(declaration.name, declaration.value, declaration.apply);
    local.set(element, attrs);
    return attrs;
  }
  function inherited(element: Element, read: SvgEffectPresentationReader) {
    const chain: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      chain.unshift(current);
      if (current === root) break;
      if (chain.length > 33) throw new Error("Herança de definição SVG profunda demais.");
    }
    if (chain[0] !== root) throw new Error("Definição SVG fora do documento de origem.");
    const attrs: Record<string, string> = { fill: "black", stroke: "none", visibility: "visible" },
      servers: GradientPaints = {};
    for (const ancestor of chain) {
      const external = read(ancestor),
        values = local.get(ancestor) ?? external?.attrs ?? {};
      for (const name of [
        "fill",
        "stroke",
        "fill-opacity",
        "fill-rule",
        "clip-rule",
        "visibility",
        "stroke-width",
        "stroke-opacity",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-dasharray",
      ] as const) {
        const value = values[name];
        if (value === undefined || value === "inherit") continue;
        attrs[name] = value;
        if (name === "fill" || name === "stroke") delete servers[name];
      }
      if (external?.gradients?.fill) servers.fill = external.gradients.fill;
      if (external?.gradients?.stroke) servers.stroke = external.gradients.stroke;
    }
    return {
      attrs,
      servers,
      fillGradient: !!servers.fill,
      strokeGradient: !!servers.stroke,
    };
  }
  function resolveDefinition(
    id: string,
    kind: SvgEffectKind,
    read: SvgEffectPresentationReader,
  ): SvgEffectDefinition {
    const cached = resolved.get(id);
    if (cached) {
      if (cached.kind !== kind) throw new Error("Referência SVG aponta para outro tipo de efeito.");
      return cached;
    }
    const element = sources.get(id);
    if (!element || element.localName !== (kind === "clip" ? "clipPath" : "mask"))
      throw new Error("Referência SVG de efeito ausente ou de tipo incompatível.");
    const definitionPresentation = new Set([
        "fill",
        "fill-opacity",
        "fill-rule",
        "stroke",
        "stroke-opacity",
        "stroke-width",
        "clip-rule",
      ]),
      definitionAllowed = new Set([
        "id",
        "style",
        ...definitionPresentation,
        ...(kind === "clip"
          ? ["clipPathUnits", "transform"]
          : ["maskUnits", "maskContentUnits", "mask-type", "x", "y", "width", "height"]),
      ]),
      own = readLocal(
        element,
        definitionAllowed,
        new Set([...definitionPresentation, ...(kind === "mask" ? ["mask-type"] : [])]),
      ),
      maskType = own["mask-type"] ?? "luminance";
    if (
      kind === "clip" &&
      (element.getAttribute("clipPathUnits") ?? "userSpaceOnUse") !== "userSpaceOnUse"
    )
      throw new Error("Este perfil de clipPath requer userSpaceOnUse, não objectBoundingBox.");
    if (
      kind === "mask" &&
      ((element.getAttribute("maskUnits") ?? "objectBoundingBox") !== "userSpaceOnUse" ||
        (element.getAttribute("maskContentUnits") ?? "userSpaceOnUse") !== "userSpaceOnUse")
    )
      throw new Error("Este perfil de máscara requer região e conteúdo userSpaceOnUse.");
    const children = [...element.children],
      drawings = children.filter((child) => !metadata.has(child.localName));
    if (drawings.length !== 1)
      throw new Error(
        "Este perfil de efeito requer exatamente uma geometria, sem composições ou recortes recursivos.",
      );
    const child = drawings[0];
    if (!child) throw new Error("Geometria de efeito ausente.");
    const parsedTag = child.localName.length <= 16 ? shapeTag.safeParse(child.localName) : null;
    if (!parsedTag?.success)
      throw new Error(
        "Fonte de efeito requer forma/path estático suportado, não use/texto/scripts ou elementos compostos.",
      );
    const tag = parsedTag.data,
      descriptive = [...children.filter((item) => metadata.has(item.localName)), ...child.children];
    for (const item of descriptive) {
      if (!metadata.has(item.localName) || item.children.length)
        throw new Error("Definição de efeito não aceita elementos/markup adicionais.");
      assertSvgDefinitionAttributes(item, new Set(["id"]));
    }
    const childAttrs = readLocal(
        child,
        new Set(["id", "style", ...presentation, ...geometryAttributes]),
        presentation,
      ),
      appearance = inherited(child, read);
    if (
      (childAttrs.display !== undefined && childAttrs.display !== "inline") ||
      appearance.attrs.visibility !== "visible"
    )
      throw new Error(
        "Geometria oculta de efeito fica fora deste perfil; não é convertida em outra silhueta.",
      );
    const geometryAttrs = Object.fromEntries(
        Object.entries(childAttrs).filter(([name]) => geometryAttributes.has(name)),
      ),
      node: SceneNode = {
        id: "node-definition",
        name: "Definição",
        tag,
        attrs: geometryAttrs,
        text: "",
        transform: identityTransform(),
        children: [],
        visible: true,
        locked: false,
      },
      nativeShape = tag === "path" ? undefined : svgPrimitiveFromAttributes(tag, geometryAttrs),
      d = nativeShape ? svgPrimitivePathData(nativeShape) : pathDataFromNode(node),
      geometry = parseGeometry(parsePath(d)),
      matrix = multiply(
        parseTransformList(own.transform ?? ""),
        parseTransformList(childAttrs.transform ?? ""),
      );
    vertices += geometry.reduce((count, contour) => count + contour.points.length, 0);
    if (vertices > 100000 || !geometry.length)
      throw new Error("Definições excedem orçamento de geometria ou contêm caminho vazio.");
    let opacity = 1,
      sourceOpacity = 100,
      painted: SvgEffectDefinition["painted"],
      strokeReach = 0;
    if (kind === "mask") {
      sourceOpacity = parseSvgOpacity(childAttrs.opacity) * 100;
      const stroked = appearance.attrs.stroke !== "none";
      if (
        maskType === "alpha" &&
        !appearance.fillGradient &&
        !appearance.strokeGradient &&
        !stroked
      ) {
        // The 5.12 silhouette profile, unchanged: a solid alpha is the mask strength.
        const paint =
          appearance.attrs.fill === "none"
            ? { alpha: 0 }
            : parseSolidSvgColor(appearance.attrs.fill ?? "black");
        opacity = paint.alpha * parseSvgOpacity(appearance.attrs["fill-opacity"]);
      } else {
        const attrs: Record<string, string> = {};
        for (const name of [
          "fill",
          "fill-opacity",
          "stroke",
          "stroke-width",
          "stroke-opacity",
          "stroke-linecap",
          "stroke-linejoin",
          "stroke-dasharray",
        ] as const) {
          const value = appearance.attrs[name];
          if (
            value !== undefined &&
            !(name === "fill" && appearance.servers.fill) &&
            !(name === "stroke" && appearance.servers.stroke)
          )
            attrs[name] = name === "fill" || name === "stroke" ? normalizePaint(value) : value;
        }
        if (stroked) {
          const width = paintedStrokeWidth(appearance.attrs["stroke-width"]);
          strokeReach =
            width *
            2 *
            Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
        }
        painted = {
          mode: maskType === "alpha" ? "alpha" : "luminance",
          attrs,
          ...(appearance.servers.fill || appearance.servers.stroke
            ? { gradients: { ...appearance.servers } }
            : {}),
        };
      }
      const x = absolute(element.getAttribute("x")),
        y = absolute(element.getAttribute("y")),
        width = absolute(element.getAttribute("width")),
        height = absolute(element.getAttribute("height"));
      if (width <= 0 || height <= 0)
        throw new Error("Região de máscara precisa ter dimensões positivas.");
      for (const contour of geometry)
        for (const vertex of contour.points)
          for (const point of [vertex, vertex.in, vertex.out]) {
            if (!point) continue;
            const transformed = transformPoint(matrix, point.x, point.y);
            if (
              transformed.x < x + 1 + strokeReach ||
              transformed.x > x + width - 1 - strokeReach ||
              transformed.y < y + 1 + strokeReach ||
              transformed.y > y + height - 1 - strokeReach
            )
              throw new Error(
                "Região de máscara precisa conter toda a silhueta e sua margem; recorte regional não é descartado.",
              );
          }
    }
    const value: SvgEffectDefinition = {
      id,
      kind,
      d,
      matrix,
      rule: rule(appearance.attrs[kind === "clip" ? "clip-rule" : "fill-rule"]),
      opacity,
      sourceOpacity,
      ...(nativeShape ? { nativeShape } : {}),
      metadata: descriptive,
      ...(painted ? { painted } : {}),
    };
    resolved.set(id, value);
    return value;
  }
  function resolve(id: string, kind: SvgEffectKind, read: SvgEffectPresentationReader) {
    const key = `${kind}:${id}`,
      failed = failures.get(key);
    if (failed) throw failed;
    try {
      return resolveDefinition(id, kind, read);
    } catch (error) {
      if (error instanceof Error) failures.set(key, error);
      throw error;
    }
  }
  return {
    isDefinition: (element: Element) =>
      element.localName === "clipPath" || element.localName === "mask",
    reference(raw: string): string | null {
      if (raw.trim() === "none") return null;
      const match = /^url\(\s*(['"]?)#([A-Za-z_][\w.-]{0,119})\1\s*\)$/.exec(raw.trim());
      if (!match?.[2])
        throw new Error("Efeito SVG aceita somente referência local a definição suportada.");
      return match[2];
    },
    resolve,
    validateAll(read: SvgEffectPresentationReader) {
      return [...sources].map(([id, element]) =>
        resolve(id, element.localName === "mask" ? "mask" : "clip", read),
      );
    },
  };
}
