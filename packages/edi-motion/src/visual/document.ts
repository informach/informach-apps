import { geometryPath } from "../geometry";
import { type InteractiveDocument, parseInteractiveDocument } from "../interactiveDocument";
import { type DescribeOptions, describeVisualScene, type VisualNode } from "./describe";

/** Assemble the actual graph from local scopes. Logic scope roots are attached
 * to their parent's component viewport, while their clocks remain independent. */
export function visualSceneFromDocument(input: unknown) {
  const document = parseInteractiveDocument(input);
  if (document.version < 6 || !document.visual || !document.assets)
    throw new Error("Render gráfico portátil requer blueprint v6.");
  function scopeNodes(scope: InteractiveDocument): VisualNode[] {
    const metadata = new Map(scope.playback.objects.map((object) => [object.id, object])),
      nodes = new Map<string, VisualNode>();
    for (const object of scope.content) {
      const data = object.visual,
        spatial = metadata.get(object.id);
      if (!data || !spatial?.tag || spatial.parentId === undefined)
        throw new Error("Metadados visuais/espaciais ausentes.");
      nodes.set(object.id, {
        id: object.id,
        tag: object.tag,
        attrs: {
          ...data.attrs,
          ...(object.tag === "path"
            ? { d: data.attrs.d ?? (spatial.geometry ? geometryPath(spatial.geometry) : "") }
            : {}),
          ...(spatial.attributeMatrix
            ? { transform: `matrix(${spatial.attributeMatrix.join(" ")})` }
            : {}),
        },
        text: data.text,
        visible: data.visible,
        transform: spatial.transform,
        children: [],
        basis: spatial.basis,
        geometry: spatial.geometry,
        assetId: object.assetId,
        fontAssetId: object.fontAssetId,
        fontFallbackIds: object.fontFallbackIds,
        gradients: object.gradients,
        filter: object.filter,
        paintLayers: object.paintLayers,
        imageSlice: object.imageSlice?.insets,
        imageMesh: object.imageMesh,
        effects: object.effects,
        textLayout: data.textLayout,
        textDirection: data.textDirection,
        textPath: data.textPath,
        semantics: object.semantics,
      });
    }
    const children = new Map<string | null, VisualNode[]>();
    for (const object of scope.content) {
      const node = nodes.get(object.id);
      if (!node || object.parentId === undefined) throw new Error("Objeto visual ausente.");
      const siblings = children.get(object.parentId) ?? [];
      siblings.push(node);
      children.set(object.parentId, siblings);
    }
    for (const [id, node] of nodes) node.children = children.get(id) ?? [];
    for (const component of scope.components ?? []) {
      const viewport = nodes.get(component.rootId);
      if (viewport?.tag !== "svg" || viewport.children.length)
        throw new Error("Viewport visual de componente inválido.");
      viewport.children = scopeNodes(component.document);
    }
    return children.get(null) ?? [];
  }
  return {
    document,
    scene: {
      viewBox: document.visual.viewBox,
      preserveAspectRatio: document.visual.preserveAspectRatio,
      nodes: scopeNodes(document),
    },
    assets: document.assets,
  };
}
export function describeVisualDocument(input: unknown, options: DescribeOptions = {}) {
  const prepared = visualSceneFromDocument(input);
  return describeVisualScene(prepared.scene, prepared.assets, {
    mode: "runtime",
    embeddedFonts: false,
    verifyFonts: prepared.document.version >= 7,
    ...options,
    globalTransform: options.globalTransform ?? prepared.document.visual?.globalTransform,
  });
}
