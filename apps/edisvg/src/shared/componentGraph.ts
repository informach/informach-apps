import { parseTransformList } from "@informach/edi-motion";
import { parseRig, rigCost } from "@informach/edi-motion/rig";
import { validateInstanceLogic } from "./componentContracts";
import { componentViewport } from "./componentViewport";
import { parsePath } from "./pathGeometry.js";
import type { Project } from "./project";
import { rigObjects } from "./rigObjects";
import { flattenScene } from "./scene.js";
import type { SceneNode } from "./sceneTypes";

interface Cost {
  audioBindings: number;
  controls: number;
  deformers: number;
  nodes: number;
  depth: number;
  references: number;
  attributes: number;
  text: number;
  vertices: number;
  tracks: number;
  keys: number;
  bones: number;
  constraints: number;
}
const empty = (): Cost => ({
  audioBindings: 0,
  controls: 0,
  deformers: 0,
  nodes: 0,
  depth: 0,
  references: 0,
  attributes: 0,
  text: 0,
  vertices: 0,
  tracks: 0,
  keys: 0,
  bones: 0,
  constraints: 0,
});
function add(target: Cost, child: Cost) {
  target.audioBindings += child.audioBindings;
  target.controls += child.controls;
  target.deformers += child.deformers;
  target.nodes += child.nodes;
  target.attributes += child.attributes;
  target.text += child.text;
  target.vertices += child.vertices;
  target.tracks += child.tracks;
  target.keys += child.keys;
  target.bones += child.bones;
  target.constraints += child.constraints;
}
function check(cost: Cost) {
  if (cost.audioBindings > 256)
    throw new Error("Áudio expandido dos componentes excede o orçamento.");
  if (cost.nodes > 2000 || cost.depth > 32 || cost.references > 8)
    throw new Error("Expansão de componentes excede os limites de objetos/profundidade.");
  if (cost.attributes > 4_000_000 || cost.text > 1_000_000 || cost.vertices > 100000)
    throw new Error("Geometria/texto expandido dos componentes excede o orçamento.");
  if (cost.tracks > 12000 || cost.keys > 100000)
    throw new Error("Trilhas/chaves expandidas dos componentes excedem o orçamento.");
  if (cost.bones > 1000 || cost.constraints > 256)
    throw new Error("Rig expandido excede orçamento agregado.");
  if (cost.controls > 100000 || cost.deformers > 256)
    throw new Error("Deformação expandida excede orçamento agregado.");
}
/** Preflight resource accounting before any expansion/clone. Memoized source
 * costs plus exact override deltas prevent small DAGs expanding into GBs. */
export function validateComponentGraph(project: Project) {
  if (
    !project.artboards.some((board) => flattenScene(board.scene).some(({ node }) => node.instance))
  )
    return;
  const boards = new Map(project.artboards.map((board) => [board.id, board]));
  const objects = new Map(
    project.artboards.map((board) => [
      board.id,
      new Map(flattenScene(board.scene).map(({ node }) => [node.id, node])),
    ]),
  );
  const clips = new Map(project.motion.animations.map((clip) => [clip.id, clip]));
  const visiting = new Set<string>(),
    memo = new Map<string, Cost>(),
    geometry = new Map<string, number>();
  const attributeSize = (attrs: Record<string, string>) =>
    Object.values(attrs).reduce((sum, value) => sum + value.length, 0);
  function vertexCount(attrs: Record<string, string>) {
    let count = attrs.points ? attrs.points.trim().split(/[\s,]+/).length / 2 : 0;
    if (attrs.d) {
      let cached = geometry.get(attrs.d);
      if (cached === undefined) {
        cached = parsePath(attrs.d).reduce((sum, contour) => sum + contour.points.length, 0);
        geometry.set(attrs.d, cached);
      }
      count += cached;
    }
    return count;
  }
  function measure(id: string): Cost {
    const cached = memo.get(id);
    if (cached) return cached;
    if (visiting.has(id)) throw new Error("Referências de componentes não podem formar ciclos.");
    const board = boards.get(id);
    if (!board) throw new Error("Componente referencia uma prancheta inexistente.");
    visiting.add(id);
    function nodeMeasure(node: SceneNode): Cost {
      const cost = {
        ...empty(),
        nodes:
          1 +
          (node.imageSlice ? 18 : 0) +
          (node.textLayout ? node.text.replace(/\r\n?/g, "\n").split("\n").length : 0),
        depth: 1,
        attributes:
          attributeSize(node.attrs) +
          (node.gradients ? JSON.stringify(node.gradients).length : 0) +
          (node.filter ? JSON.stringify(node.filter).length : 0),
        text: node.text.length,
        vertices: vertexCount(node.attrs),
      };
      for (const child of node.children) {
        const next = nodeMeasure(child);
        add(cost, next);
        cost.depth = Math.max(cost.depth, 1 + next.depth);
        cost.references = Math.max(cost.references, next.references);
      }
      if (node.instance) {
        const instance = node.instance,
          source = boards.get(instance.artboardId),
          sourceObjects = objects.get(instance.artboardId);
        if (!source || !sourceObjects)
          throw new Error("Componente referencia uma prancheta inexistente.");
        validateInstanceLogic(instance, source.behavior, !!source.layout);
        const nested = measure(source.id);
        add(cost, nested);
        cost.nodes++;
        cost.attributes += attributeSize(componentViewport(instance, source.scene));
        cost.depth = Math.max(cost.depth, 2 + nested.depth);
        cost.references = 1 + nested.references;
        const overridden = new Set<string>();
        const overriddenRig =
          source.rig && instance.overrides.length ? rigObjects(source.scene) : undefined;
        for (const override of instance.overrides) {
          const target = sourceObjects.get(override.targetId);
          if (!target || overridden.has(override.targetId))
            throw new Error("Override duplicado ou com referência órfã.");
          overridden.add(override.targetId);
          const rigObject = overriddenRig?.get(override.targetId);
          if (rigObject) {
            if (override.transform)
              rigObject.transform = { ...rigObject.transform, ...override.transform };
            if (override.attrs?.transform !== undefined)
              rigObject.attributeMatrix = parseTransformList(override.attrs.transform);
            if (
              target.tag === "path" &&
              override.attrs?.d !== undefined &&
              source.rig?.trims?.some((trim) => trim.targetId === target.id) &&
              /[aA]/.test(override.attrs.d)
            )
              throw new Error(
                "Override de trim com arco nativo requer conversão Bézier explícita.",
              );
            if (target.tag === "path" && override.attrs?.d !== undefined)
              rigObject.geometry = parsePath(override.attrs.d);
          }
          if (override.text !== undefined && target.tag !== "text")
            throw new Error("Override de texto exige um objeto de texto.");
          if (override.attrs) {
            const updated = { ...target.attrs, ...override.attrs };
            cost.attributes += attributeSize(updated) - attributeSize(target.attrs);
            cost.vertices += vertexCount(updated) - vertexCount(target.attrs);
          }
          if (override.text !== undefined) cost.text += override.text.length - target.text.length;
        }
        if (instance.animationId !== null) {
          const animation = clips.get(instance.animationId);
          if (!animation)
            throw new Error(
              "Animação do componente não existe. Remova suas referências antes de excluir.",
            );
          for (const track of animation.tracks)
            if (sourceObjects.has(track.targetId)) {
              cost.tracks++;
              cost.keys += track.keys.length;
            }
        }
        if (source.rig && overriddenRig) parseRig(source.rig, overriddenRig);
      }
      check(cost);
      return cost;
    }
    const total = empty();
    total.audioBindings = board.audio?.bindings.length ?? 0;
    const deformation = rigCost(board.rig);
    total.vertices += deformation.vertices;
    total.controls += deformation.controls;
    total.deformers += deformation.deformers;
    total.bones = board.rig?.bones.length ?? 0;
    total.constraints = board.rig?.constraints.length ?? 0;
    for (const clip of board.rig?.parameterClips ?? []) {
      total.tracks += clip.tracks.length;
      total.keys += clip.tracks.reduce((sum, track) => sum + track.keys.length, 0);
    }
    for (const node of board.scene.nodes) {
      const next = nodeMeasure(node);
      add(total, next);
      total.depth = Math.max(total.depth, next.depth);
      total.references = Math.max(total.references, next.references);
      check(total);
    }
    const own = objects.get(id);
    if (!own) throw new Error("Índice de objetos ausente.");
    const withRoot = { ...total };
    for (const clip of project.motion.animations)
      for (const track of clip.tracks)
        if (own.has(track.targetId)) {
          withRoot.tracks++;
          withRoot.keys += track.keys.length;
        }
    check(withRoot);
    visiting.delete(id);
    memo.set(id, total);
    return total;
  }
  for (const board of project.artboards) measure(board.id);
}
