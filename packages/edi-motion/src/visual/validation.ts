import { resolveFontStack } from "../assets/fontStack";
import { geometryPath } from "../geometry";
import type { InteractiveDocument } from "../interactiveDocument";
import { parseSvgPath } from "../svgPath";
import { type SemanticNode, validateSemanticInteractions } from "./semantics";

/** Validate the assembled portable graph, not only each local logic scope.
 * Child roots attach to their declared SVG viewport; budgets/depth therefore
 * apply to the real expanded drawing rather than restart at every component. */
export function validateVisualDocument(document: InteractiveDocument) {
  if (document.version < 6) return;
  if (!document.visual || !document.assets)
    throw new Error("Documento portátil requer cena e catálogo raiz.");
  const assets = new Map(document.assets.map((asset) => [asset.id, asset])),
    hierarchy = new Map<string, { parentId: string | null; tag: string }>();
  const semanticNodes: SemanticNode[] = [],
    listenerTargets = new Set<string>(),
    activations = new Set<string>();
  let lines = 0;
  function collect(scope: InteractiveDocument, viewportId: string | null) {
    if (scope.version !== document.version)
      throw new Error("Cena portátil requer mesma versão em todos os escopos.");
    const local = new Map(scope.content.map((object) => [object.id, object]));
    const spatial = new Map(scope.playback.objects.map((object) => [object.id, object]));
    for (const object of scope.content) {
      if (
        !object.visual ||
        object.parentId === undefined ||
        (object.parentId !== null && !local.has(object.parentId))
      )
        throw new Error("Conteúdo portátil requer metadados visuais e hierarquia local completa.");
      if (object.visual.textLayout && object.tag !== "text")
        throw new Error("Layout textual requer texto.");
      const path = object.visual.attrs.d;
      if (path !== undefined && object.tag !== "path")
        throw new Error("Dados de caminho requerem path.");
      if (path?.trim()) {
        const geometry = spatial.get(object.id)?.geometry;
        if (!geometry || geometryPath(parseSvgPath(path)) !== geometryPath(geometry))
          throw new Error("Caminho nativo não corresponde à geometria espacial.");
      } else if (path !== undefined && spatial.get(object.id)?.geometry)
        throw new Error("Caminho vazio não corresponde à geometria espacial.");
      if (object.lineHeight !== object.visual.textLayout?.lineHeight)
        throw new Error("Altura de linha portátil não corresponde ao conteúdo.");
      if (object.visual.textLayout) {
        const count = Math.max(1, object.visual.text.replace(/\r\n?/g, "\n").split("\n").length);
        lines += count;
        if (count > 200 || lines > 2000)
          throw new Error("Texto portátil excede orçamento de linhas.");
      }
      if (object.assetId) {
        const asset = assets.get(object.assetId);
        if (asset?.kind !== "image")
          throw new Error("Imagem portátil sem recurso raiz correspondente.");
        if (
          object.imageSlice &&
          (object.imageSlice.source.width !== asset.width ||
            object.imageSlice.source.height !== asset.height)
        )
          throw new Error("Nine-slice portátil não corresponde à imagem real.");
      }
      resolveFontStack(assets, object);
      hierarchy.set(object.id, { parentId: object.parentId ?? viewportId, tag: object.tag });
      semanticNodes.push({
        id: object.id,
        parentId: object.parentId ?? viewportId,
        semantics: object.semantics,
      });
    }
    for (const listener of scope.behavior.listeners) {
      const target = listener.targetId ?? viewportId;
      if (target !== null) {
        listenerTargets.add(target);
        if (listener.event === "activate") activations.add(target);
      }
    }
    for (const child of scope.components ?? []) {
      if (scope.content.some((object) => object.parentId === child.rootId))
        throw new Error("Viewport independente não pode conter objetos do escopo pai.");
      collect(child.document, child.rootId);
    }
  }
  collect(document, null);
  const depths = new Map<string, number>(),
    visiting = new Set<string>();
  function depth(id: string, calls = 0): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (calls > 32 || visiting.has(id))
      throw new Error("Hierarquia visual portátil cíclica/profunda.");
    const object = hierarchy.get(id);
    if (!object) throw new Error("Pai visual portátil ausente.");
    visiting.add(id);
    const parent = object.parentId === null ? undefined : hierarchy.get(object.parentId);
    if (object.parentId !== null && (!parent || !["g", "svg"].includes(parent.tag)))
      throw new Error("Pai visual portátil precisa ser grupo/viewport.");
    const value = object.parentId === null ? 1 : depth(object.parentId, calls + 1) + 1;
    if (value > 33) throw new Error("Hierarquia visual portátil profunda demais.");
    visiting.delete(id);
    depths.set(id, value);
    return value;
  }
  for (const id of hierarchy.keys()) depth(id);
  if (
    document.version >= 8 &&
    document.behavior.listeners.some(
      (listener) => listener.targetId === null && listener.event === "activate",
    ) &&
    listenerTargets.size
  )
    throw new Error(
      "Botão do artboard esconderia interações descendentes; use um grupo e botões locais.",
    );
  if (document.version >= 8)
    validateSemanticInteractions(semanticNodes, listenerTargets, activations);
}
