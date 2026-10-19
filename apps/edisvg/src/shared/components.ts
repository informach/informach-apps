import {
  type AnimationDriver,
  identityTransform,
  type PlaybackDocument,
  parsePlaybackDocument,
  parseTransformList,
} from "@informach/edi-motion";
import { remapVectorEffects } from "@informach/edi-motion/graphics";
import { remapRig, rigOwners } from "@informach/edi-motion/rig";
import type { ComponentCommand, ComponentInstance } from "./componentContracts";
import { validateComponentGraph } from "./componentGraph";
import { componentViewport } from "./componentViewport";
import { applySceneAttributes } from "./paintAttributes";
import { parsePath } from "./pathGeometry.js";
import type { Project } from "./project";
import { flattenScene, renderScene, validateScene } from "./scene.js";
import type { Scene, SceneNode } from "./sceneTypes";

export function applyComponent(scene: Scene, command: ComponentCommand): string {
  if (command.operation === "create") {
    const id = `node-${crypto.randomUUID()}`;
    scene.nodes.push({
      id,
      name: command.name,
      tag: "g",
      attrs: {},
      text: "",
      transform: identityTransform(),
      visible: true,
      locked: false,
      children: [],
      instance: command.instance,
    });
    return id;
  }
  const entry = flattenScene(scene).find(({ node }) => node.id === command.targetId);
  if (!entry?.node.instance) throw new Error("Selecione uma instância de componente.");
  if (entry.locked) throw new Error("Desbloqueie a instância e seus grupos antes de editar.");
  entry.node.instance = command.instance;
  return entry.node.id;
}
export interface SourceIdentity {
  artboardId: string;
  objectId: string;
  instancePath: string[];
}
/** Compiled IDs are bundle-local symbols, never authoring IDs. Public identity
 * is the stable source object + instance path recorded in sourceMap. */
export function compileArtboard(
  project: Project,
  artboardId: string,
  options: { spatial?: boolean } = {},
) {
  validateComponentGraph(project);
  const boards = new Map(project.artboards.map((board) => [board.id, board]));
  const root = boards.get(artboardId);
  if (!root) throw new Error("Prancheta não encontrada.");
  const reserved = new Set(
    project.artboards.flatMap((board) => flattenScene(board.scene).map(({ node }) => node.id)),
  );
  const sourceMap = new Map<string, SourceIdentity>(),
    drivers: AnimationDriver[] = [];
  let symbol = 0;
  function allocate() {
    let id: string;
    do {
      id = `node-compiled-${++symbol}`;
    } while (reserved.has(id));
    reserved.add(id);
    return id;
  }
  function expand(
    boardId: string,
    path: string[],
    parentDriver: string | null,
    overrides: ComponentInstance["overrides"],
  ): SceneNode[] {
    const board = boards.get(boardId);
    if (!board) throw new Error("Componente não encontrado.");
    const mapping = new Map(
      flattenScene(board.scene).map(({ node }) => [node.id, path.length ? allocate() : node.id]),
    );
    const changes = new Map(overrides.map((override) => [override.targetId, override]));
    function copy(node: SceneNode): SceneNode {
      const id = mapping.get(node.id);
      if (!id) throw new Error("Identidade compilada ausente.");
      const result: SceneNode = {
          ...node,
          attrs: { ...node.attrs },
          transform: { ...node.transform },
          children: [],
        },
        override = changes.get(node.id);
      result.id = id;
      if (node.effects)
        result.effects = remapVectorEffects(node.effects, (sourceId) => {
          const value = mapping.get(sourceId);
          if (!value) throw new Error("Fonte do efeito fora da prancheta de autoria.");
          return value;
        });
      sourceMap.set(id, { artboardId: boardId, objectId: node.id, instancePath: [...path] });
      if (override?.attrs) applySceneAttributes(result, override.attrs);
      if (override?.text !== undefined) result.text = override.text;
      if (override?.transform) result.transform = { ...result.transform, ...override.transform };
      result.children = node.children.map(copy);
      if (node.instance) {
        const instance = node.instance,
          source = boards.get(instance.artboardId);
        if (!source) throw new Error("Componente não encontrado.");
        let clock = parentDriver;
        // Reserve the component's source mapping before expansion so its clip
        // can reference every original node, including nested instance roots.
        const before = new Set(sourceMap.keys());
        if (instance.animationId !== null) clock = id;
        const children = expand(instance.artboardId, [...path, node.id], clock, instance.overrides);
        if (instance.animationId !== null) {
          const clip = project.motion.animations.find((clip) => clip.id === instance.animationId);
          if (!clip) throw new Error("Animação do componente não encontrada.");
          const targets = new Map<string, string>();
          for (const [compiled, identity] of sourceMap)
            if (
              !before.has(compiled) &&
              identity.artboardId === instance.artboardId &&
              identity.instancePath.length === path.length + 1
            )
              targets.set(identity.objectId, compiled);
          const animation = {
            ...clip,
            tracks: clip.tracks
              .filter((track) => targets.has(track.targetId))
              .map((track) => {
                const targetId = targets.get(track.targetId);
                if (!targetId) throw new Error("Canal de componente órfão.");
                return { ...structuredClone(track), targetId };
              }),
          };
          drivers.push({
            id,
            parentId: parentDriver,
            animation,
            speed: instance.speed,
            offsetSeconds: instance.offsetSeconds,
          });
        }
        result.children = [
          {
            id: allocate(),
            name: `Viewport ${source.name}`.slice(0, 120),
            tag: "svg",
            attrs: componentViewport(instance, source.scene),
            text: "",
            transform: identityTransform(),
            visible: true,
            locked: false,
            children,
          },
        ];
        delete result.instance;
      }
      return result;
    }
    return board.scene.nodes.map(copy);
  }
  const scene = validateScene(
    { ...structuredClone(root.scene), nodes: expand(root.id, [], null, []) },
    { allowViewport: true, strict: true },
  );
  if (!scene) throw new Error("Cena compilada ausente.");
  const objects = flattenScene(scene).map(({ node }) => ({
    id: node.id,
    transform: node.transform,
  }));
  const rigScopes: NonNullable<PlaybackDocument["rigScopes"]> = [],
    scopePaths = new Set<string>();
  const authored = new Map(
    project.artboards.flatMap((board) =>
      flattenScene(board.scene).map(({ node }) => [node.id, node] as const),
    ),
  );
  for (const identity of sourceMap.values()) {
    const board = boards.get(identity.artboardId),
      key = JSON.stringify(identity.instancePath);
    if (!board?.rig || !rigOwners(board.rig).size || scopePaths.has(key)) continue;
    scopePaths.add(key);
    const mapping = new Map(
      [...sourceMap]
        .filter(([, value]) => JSON.stringify(value.instancePath) === key)
        .map(([id, value]) => [value.objectId, id]),
    );
    const map = (id: string) => {
      const value = mapping.get(id);
      if (!value) throw new Error("Referência de rig não mapeada.");
      return value;
    };
    const rig = remapRig(board.rig, map);
    const instance = [...sourceMap].find(
      ([, value]) => JSON.stringify([...value.instancePath, value.objectId]) === key,
    )?.[0];
    rigScopes.push({
      instancePath: [...identity.instancePath],
      clockId: instance && drivers.some((driver) => driver.id === instance) ? instance : null,
      rig,
    });
  }
  const fullMetadata =
    options.spatial || rigScopes.length > 0 || flattenScene(scene).some(({ node }) => node.effects);
  const runtimeObjects = fullMetadata
    ? flattenScene(scene).map(({ node, parentId }) => {
        const source = sourceMap.get(node.id);
        return {
          id: node.id,
          transform: node.transform,
          parentId,
          tag: node.tag,
          ...(node.basis ? { basis: node.basis } : {}),
          attributeMatrix: parseTransformList(node.attrs.transform ?? ""),
          isComponent: !!(source && authored.get(source.objectId)?.instance),
          ...(node.tag === "path" && node.attrs.d?.trim()
            ? { geometry: parsePath(node.attrs.d) }
            : {}),
        };
      })
    : objects;
  const originals = new Set(flattenScene(root.scene).map(({ node }) => node.id));
  const motion = {
    ...project.motion,
    animations: project.motion.animations.map((clip) => ({
      ...clip,
      tracks: clip.tracks.filter((track) => originals.has(track.targetId)),
    })),
  };
  const playback: PlaybackDocument = parsePlaybackDocument({
    version: fullMetadata ? 3 : 2,
    motion,
    objects: runtimeObjects,
    drivers,
    sources: [...sourceMap].map(([id, source]) => ({ id, ...source })),
    ...(fullMetadata ? { rigScopes } : {}),
  });
  return { scene, playback, sourceMap, assets: project.assets };
}
export function renderEditorComposition(compiled: ReturnType<typeof compileArtboard>) {
  return renderScene(compiled.scene, {
    runtime: true,
    semantics: false,
    compiled: true,
    assets: compiled.assets,
    embeddedFonts: false,
  }).replace(/data-edi-object="([\w-]+)"/g, (attribute, id: string) =>
    compiled.sourceMap.get(id)?.instancePath.length === 0 ? `data-object="${id}"` : attribute,
  );
}
