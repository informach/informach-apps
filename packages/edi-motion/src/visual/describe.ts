import { type Affine, parseTransformList, transformAttribute, transformMatrix } from "../affine";
import {
  type Asset,
  assertTextCoverage,
  assetDataUri,
  fontAssetCss,
  fontStackFamily,
  fontStackIds,
  type ImageSlice,
  imagePresentation,
  parseAssetCatalog,
  resolveFontStack,
} from "../assets";
import type { Geometry } from "../geometry";
import { effectSourcePaints } from "../graphics/effectPaint";
import { type Filter, filterAttributes, filterDefinitions } from "../graphics/filters";
import {
  type GradientPaints,
  gradientAttributes,
  gradientDefinitions,
} from "../graphics/gradients";
import { nativeEffectSources } from "../graphics/nativeEffectSources";
import {
  drawnPaintLayers,
  PAINT_LAYER_ATTRIBUTE,
  type PaintLayer,
  paintLayerAttributes,
  paintLayerGeometry,
  paintLayerServers,
  paintLayerTags,
} from "../graphics/paintLayers";
import {
  createVectorEffectContext,
  evaluateVectorEffects,
  type VectorEffects,
  vectorEffectAttributes,
  vectorEffectElement,
} from "../graphics/vectorEffects";
import type { Transform } from "../model";
import { type ImageMesh, imageMeshClipElements, imageMeshElement } from "./imageMeshElement";
import type { TextLayout, VisualTag } from "./model";
import { type SemanticMetadata, semanticAttributes } from "./semantics";
import { resolveTextDirection, type TextDirection } from "./textDirection";
import { type TextPath, textPathId } from "./textPath";

export interface VisualNode {
  id: string;
  tag: VisualTag;
  attrs: Readonly<Record<string, string>>;
  text: string;
  transform: Transform;
  visible: boolean;
  children: readonly VisualNode[];
  basis?: Affine;
  assetId?: string;
  fontAssetId?: string;
  fontFallbackIds?: readonly string[];
  imageSlice?: ImageSlice;
  gradients?: GradientPaints;
  filter?: Filter;
  paintLayers?: readonly PaintLayer[];
  effects?: VectorEffects;
  textLayout?: TextLayout;
  textDirection?: TextDirection;
  textPath?: TextPath;
  imageMesh?: ImageMesh;
  semantics?: SemanticMetadata;
  /** Needed only for live effect sources; portable playback already owns it. */
  geometry?: Geometry;
}
export interface VisualElement {
  tag:
    | "svg"
    | "g"
    | "path"
    | "rect"
    | "circle"
    | "ellipse"
    | "line"
    | "polyline"
    | "polygon"
    | "text"
    | "tspan"
    | "textPath"
    | "image"
    | "use"
    | "defs"
    | "style"
    | "metadata"
    | "clipPath"
    | "mask"
    | "linearGradient"
    | "radialGradient"
    | "pattern"
    | "stop"
    | "filter"
    | "feGaussianBlur"
    | "feOffset"
    | "feDropShadow"
    | "feColorMatrix"
    | "feFlood"
    | "feBlend"
    | "feComposite"
    | "feMerge"
    | "feMergeNode"
    | "desc";
  attrs: Record<string, string>;
  children: VisualElement[];
  text?: string;
  /** Generated host-preview CSS, never authored CSS. */
  style?: { transformBox: "view-box"; transformOrigin: "50% 50%" };
}
export interface VisualSceneInput {
  viewBox: readonly [number, number, number, number];
  preserveAspectRatio?: string;
  nodes: readonly VisualNode[];
}
export interface DescribeOptions {
  mode?: "static" | "editor" | "runtime";
  embeddedFonts?: boolean;
  globalTransform?: Transform;
  verifyFonts?: boolean;
  /** Authoring chrome must not advertise controls belonging to playback. */
  semantics?: boolean;
}

/** Pure description of validated compiler output. DOM/React/native adapters
 * consume this tree; no markup supplied by the project is interpreted here. */
export function describeVisualScene(
  scene: VisualSceneInput,
  inputAssets: readonly Asset[],
  options: DescribeOptions = {},
): VisualElement {
  const resources = new Map(parseAssetCatalog(inputAssets).map((asset) => [asset.id, asset])),
    entries: { node: VisualNode; parentId: string | null }[] = [],
    ids = new Set<string>();
  let cells = 0;
  function collect(nodes: readonly VisualNode[], parentId: string | null, depth: number) {
    if (depth > 32) throw new Error("Descrição visual excede a profundidade.");
    for (const node of nodes) {
      cells +=
        1 +
        (node.semantics && node.semantics.kind !== "decorative" && node.semantics.description
          ? 1
          : 0) +
        (node.imageSlice ? 18 : 0) +
        drawnPaintLayers(node.paintLayers).length +
        (node.effects?.clip ? 2 : 0) +
        (node.effects?.mask ? 2 : 0);
      if (cells > 2000 || ids.has(node.id))
        throw new Error("Descrição visual excede orçamento ou contém IDs repetidos.");
      ids.add(node.id);
      entries.push({ node, parentId });
      collect(node.children, node.id, depth + 1);
    }
  }
  collect(scene.nodes, null, 0);
  const images = new Set(entries.flatMap(({ node }) => (node.assetId ? [node.assetId] : []))),
    fonts = new Set(entries.flatMap(({ node }) => fontStackIds(node))),
    primitives = nativeEffectSources(
      entries.map(({ node }) => node),
      new Map(
        entries.flatMap(({ node }) => (node.effects ? [[node.id, node.effects] as const] : [])),
      ),
    ),
    paints = effectSourcePaints(
      entries.map(({ node, parentId }) => ({ ...node, parentId })),
      new Map(
        entries.flatMap(({ node }) => (node.effects ? [[node.id, node.effects] as const] : [])),
      ),
    ),
    effects = entries.some(({ node }) => node.effects)
      ? evaluateVectorEffects(
          createVectorEffectContext(
            new Map(
              entries.map(({ node, parentId }) => [
                node.id,
                {
                  tag: node.tag,
                  parentId,
                  transform: node.transform,
                  basis: node.basis,
                  attributeMatrix: parseTransformList(node.attrs.transform ?? ""),
                  geometry: node.geometry,
                  pathData: node.tag === "path" ? node.attrs.d : undefined,
                  effects: node.effects,
                  nativeShape: primitives.get(node.id),
                  paint: paints.get(node.id),
                },
              ]),
            ),
          ),
          new Map(),
        )
      : [],
    effectAttrs = vectorEffectAttributes(effects),
    definitions: VisualElement[] = [
      ...gradientDefinitions([
        ...entries.map(({ node }) => node.gradients),
        ...entries.flatMap(({ node }) =>
          paintLayerServers(node.paintLayers).map((fill) => ({ fill })),
        ),
      ]),
      ...filterDefinitions(entries.map(({ node }) => node.filter)),
      ...effects.map((frame) => vectorEffectElement(frame)),
    ];
  for (const id of images) {
    const image = resources.get(id);
    if (image?.kind !== "image") throw new Error("Recurso visual de imagem ausente.");
    definitions.push({
      tag: "image",
      attrs: {
        id: `edi-${id}`,
        width: String(image.width),
        height: String(image.height),
        href: assetDataUri(image),
      },
      children: [],
    });
  }
  for (const id of fonts) {
    const font = resources.get(id);
    if (font?.kind !== "font") throw new Error("Recurso visual de fonte ausente.");
    if (options.embeddedFonts !== false)
      definitions.push({ tag: "style", attrs: {}, children: [], text: fontAssetCss(font) });
    definitions.push({
      tag: "metadata",
      attrs: {},
      children: [],
      text: [font.family, font.notice, font.licenseNotice].filter(Boolean).join("\n\n"),
    });
  }
  const hook =
    options.mode === "editor"
      ? "data-object"
      : options.mode === "runtime"
        ? "data-edi-object"
        : undefined;
  const fontBudget = { remaining: 2_000_000 };
  function draw(node: VisualNode): VisualElement {
    const semantics =
      options.semantics === false || (options.mode === "editor" && options.semantics !== true)
        ? undefined
        : node.semantics;
    const attrs: Record<string, string> = {
        ...node.attrs,
        ...gradientAttributes(node.gradients),
        ...filterAttributes(node.filter),
        ...(node.tag === "text" && node.textDirection
          ? { direction: resolveTextDirection(node.text) }
          : {}),
      },
      image = node.assetId ? resources.get(node.assetId) : undefined;
    if (node.fontAssetId) {
      const stack = resolveFontStack(resources, node),
        family = fontStackFamily(stack);
      if (!family) throw new Error("Fonte visual ausente.");
      attrs["font-family"] = family;
      if (options.verifyFonts) assertTextCoverage(node.text, stack, fontBudget);
    }
    const children: VisualElement[] = node.children.map(draw);
    if (node.tag === "text" && node.textPath) {
      // The curve lives in a generated definition; textPath follows it in the
      // text's own user space, so the text's transform moves both together.
      definitions.push({
        tag: "path",
        attrs: { id: textPathId(node.id), d: node.textPath.d },
        children: [],
      });
      children.push({
        tag: "textPath",
        attrs: { href: `#${textPathId(node.id)}`, startOffset: `${node.textPath.startOffset}%` },
        text: node.text,
        children: [],
      });
    } else if (node.tag === "text" && node.textLayout) {
      const lineHeight = node.textLayout.lineHeight;
      children.push(
        ...node.text
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .map(
            (line, index): VisualElement => ({
              tag: "tspan",
              attrs: { x: attrs.x ?? "0", dy: `${index ? lineHeight : 0}em` },
              text: line || "\u00a0",
              children: [],
            }),
          ),
      );
    }
    let shape: VisualElement;
    if (node.tag === "image" && node.imageMesh) {
      if (image?.kind !== "image") throw new Error("Imagem visual sem recurso.");
      shape = imageMeshElement(node.id, image, node.attrs, node.imageMesh, node.geometry);
      for (const clip of imageMeshClipElements(node.id, image, node.imageMesh))
        definitions.push(clip);
      if (node.filter) shape.attrs = { ...shape.attrs, ...filterAttributes(node.filter) };
    } else if (node.tag === "image") {
      if (image?.kind !== "image") throw new Error("Imagem visual sem recurso.");
      shape = imagePresentation(image, node.attrs, node.imageSlice);
      if (node.filter) shape.attrs = { ...shape.attrs, ...filterAttributes(node.filter) };
    } else
      shape = {
        tag: node.tag,
        attrs,
        children,
        ...(node.tag === "text" && (node.textLayout || node.textPath) ? {} : { text: node.text }),
      };
    // Extra paints follow the shape as siblings, so the shape stays the
    // wrapper's first element for every consumer that writes its geometry.
    const layers: VisualElement[] =
      paintLayerTags.has(node.tag) && node.paintLayers
        ? drawnPaintLayers(node.paintLayers).map((layer) => ({
            tag: node.tag,
            attrs: {
              ...paintLayerGeometry(node.attrs),
              ...paintLayerAttributes(layer),
              [PAINT_LAYER_ATTRIBUTE]: layer.id,
            },
            children: [],
          }))
        : [];
    const wrapper: VisualElement = {
      tag: "g",
      attrs: {
        ...(hook ? { [hook]: node.id } : {}),
        ...semanticAttributes(semantics, options.mode === "runtime"),
        ...effectAttrs.get(node.id),
        transform: transformAttribute(node.transform),
        opacity: String(node.transform.opacity / 100),
        ...(!node.visible ? { display: "none" } : {}),
      },
      children: [
        shape,
        ...layers,
        ...(semantics && semantics.kind !== "decorative" && semantics.description
          ? [{ tag: "desc" as const, attrs: {}, text: semantics.description, children: [] }]
          : []),
      ],
    };
    return node.basis
      ? {
          tag: "g",
          attrs: {
            ...(hook ? { "data-edi-basis": node.id } : {}),
            transform: `matrix(${node.basis.join(" ")})`,
          },
          children: [wrapper],
        }
      : wrapper;
  }
  const body = scene.nodes.map(draw),
    children: VisualElement[] = definitions.length
      ? [{ tag: "defs", attrs: {}, children: definitions }]
      : [];
  if (options.mode === "editor" || options.mode === "runtime" || options.globalTransform) {
    const transform = options.globalTransform,
      attrs: Record<string, string> = options.mode === "static" ? {} : { "data-scene-motion": "" };
    if (transform) {
      const [x, y, width, height] = scene.viewBox;
      attrs.transform = `matrix(${transformMatrix({ ...transform, px: x + width / 2 + (transform.px ?? 0), py: y + height / 2 + (transform.py ?? 0) }).join(" ")})`;
      attrs.opacity = String(transform.opacity / 100);
    }
    children.push({
      tag: "g",
      attrs,
      children: body,
      ...(!transform
        ? ({ style: { transformBox: "view-box", transformOrigin: "50% 50%" } } as const)
        : {}),
    });
  } else children.push(...body);
  return {
    tag: "svg",
    attrs: {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: scene.viewBox.join(" "),
      ...(scene.preserveAspectRatio ? { preserveAspectRatio: scene.preserveAspectRatio } : {}),
    },
    children,
  };
}
