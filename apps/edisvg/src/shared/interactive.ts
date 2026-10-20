import { fontStackIds } from "@informach/edi-motion/assets";
import {
  createBehaviorContext,
  createBehaviorSession,
  emptyBehavior,
  setBehaviorInput,
} from "@informach/edi-motion/behavior";
import { rigOwners, rigParameterContext } from "@informach/edi-motion/rig";
import {
  INTERACTIVE_VERSION,
  type InteractiveDocument,
  parseInteractiveDocument,
} from "@informach/edi-motion/runtime";
import { describeVisualDocument, serializeVisualElement } from "@informach/edi-motion/visual";
import type { ComponentInstance } from "./componentContracts";
import { compileArtboard } from "./components";
import { remapDrawOrders } from "./drawOrders";
import type { Project } from "./project";
import { flattenScene } from "./scene.js";

export function compileInteractiveArtboard(
  project: Project,
  artboardId: string,
  options: { animationId?: string } = {},
) {
  const board = project.artboards.find((board) => board.id === artboardId);
  if (!board) throw new Error("Prancheta interativa ausente.");
  const compiled = compileArtboard(project, board.id, { spatial: true });
  const authoredObjects = new Map(
    project.artboards.map((value) => [
      value.id,
      new Map(flattenScene(value.scene).map(({ node }) => [node.id, node])),
    ]),
  );
  const boards = new Map(project.artboards.map((value) => [value.id, value]));
  const entries = flattenScene(compiled.scene);
  const compiledObjects = new Map(compiled.playback.objects.map((object) => [object.id, object]));
  const scopes = new Map<
    string,
    {
      instanceId: string;
      boardId: string;
      path: string[];
      speed: number;
      animationId: string | null;
      instance: ComponentInstance;
    }
  >();
  let logicBytes = 0;
  for (const { node } of entries) {
    const identity = compiled.sourceMap.get(node.id),
      instance = identity
        ? authoredObjects.get(identity.artboardId)?.get(identity.objectId)?.instance
        : undefined;
    if (!identity || !instance) continue;
    const master = boards.get(instance.artboardId),
      behavior = master?.behavior;
    if (!master) throw new Error("Prancheta de componente ausente.");
    if (
      !master.layout &&
      !(
        behavior &&
        (behavior.inputs.length ||
          behavior.machines.length ||
          behavior.bindings.length ||
          behavior.listeners.length ||
          behavior.events.length ||
          behavior.data)
      )
    )
      continue;
    if (instance.offsetSeconds !== 0)
      throw new Error(
        "Componente com lógica/layout independente requer offset zero; configure o estado/clip inicial explicitamente.",
      );
    if (behavior?.machines.length && instance.animationId !== null)
      throw new Error(
        "Componente com máquina usa seu estado inicial; remova o clip sincronizado da instância.",
      );
    logicBytes += JSON.stringify([behavior, master.layout, master.audio]).length;
    if (scopes.size >= 127 || logicBytes > 4_000_000)
      throw new Error("Lógica expandida dos componentes excede o orçamento.");
    const viewport = node.children[0];
    if (viewport?.tag !== "svg") throw new Error("Viewport de componente ausente.");
    scopes.set(viewport.id, {
      instanceId: node.id,
      boardId: master.id,
      path: [...identity.instancePath, identity.objectId],
      speed: instance.speed,
      animationId: instance.animationId,
      instance,
    });
  }
  function buildScope(
    boardId: string,
    path: string[],
    roots: typeof compiled.scene.nodes,
    animationId?: string,
    instance?: ComponentInstance,
  ): InteractiveDocument {
    const master = boards.get(boardId);
    if (!master) throw new Error("Prancheta de escopo ausente.");
    const owned: typeof entries = [],
      children: NonNullable<InteractiveDocument["components"]> = [];
    function collect(list: typeof roots, parentId: string | null) {
      for (const node of list) {
        owned.push({ node, parentId, depth: 0, locked: false, visible: true });
        const child = scopes.get(node.id);
        if (child)
          children.push({
            rootId: node.id,
            instanceId: child.instanceId,
            instancePath: child.path.slice(path.length),
            speed: child.speed,
            document: buildScope(
              child.boardId,
              child.path,
              node.children,
              child.animationId ?? undefined,
              child.instance,
            ),
          });
        else collect(node.children, node.id);
      }
    }
    collect(roots, null);
    const ownIds = new Set(owned.map(({ node }) => node.id)),
      mapping = new Map<string, string>();
    for (const { node } of owned) {
      const identity = compiled.sourceMap.get(node.id);
      if (identity && JSON.stringify(identity.instancePath) === JSON.stringify(path))
        mapping.set(identity.objectId, node.id);
    }
    const map = (id: string) => {
      const mapped = mapping.get(id);
      if (!mapped) throw new Error("Referência de componente fora do seu escopo.");
      return mapped;
    };
    const behavior = structuredClone(master.behavior ?? emptyBehavior());
    if (instance?.machineId) behavior.defaultMachineId = instance.machineId;
    if (instance?.inputOverrides?.length) {
      const context = createBehaviorContext(
        behavior,
        project.motion.animations,
        new Map(flattenScene(master.scene).map(({ node }) => [node.id, node])),
        { parameters: rigParameterContext(master.rig) },
      );
      let initial = createBehaviorSession(context);
      for (const override of instance.inputOverrides)
        initial = setBehaviorInput(context, initial, override.inputId, override.value);
      for (const input of behavior.inputs)
        if (input.kind !== "trigger") {
          const value = initial.inputs.get(input.id);
          if (value === undefined) throw new Error("Valor inicial do componente ausente.");
          if (input.kind === "number" && typeof value === "number") input.initial = value;
          else if (input.kind === "boolean" && typeof value === "boolean") input.initial = value;
          else if (
            (input.kind === "string" || input.kind === "color" || input.kind === "enum") &&
            typeof value === "string"
          )
            input.initial = value;
          else throw new Error("Tipo do override de input incompatível.");
        }
      for (const data of behavior.data?.instances ?? []) {
        const value = initial.data?.get(data.id);
        if (!value) throw new Error("Dados iniciais do componente ausentes.");
        data.value = structuredClone(value);
      }
    }
    for (const machine of behavior.machines)
      for (const layer of machine.layers) layer.targetIds = layer.targetIds.map(map);
    for (const binding of behavior.bindings)
      if (binding.kind !== "parameter") binding.targetId = map(binding.targetId);
    for (const listener of behavior.listeners)
      if (listener.targetId !== null) listener.targetId = map(listener.targetId);
    const layout = master.layout ? structuredClone(master.layout) : undefined;
    if (layout) {
      for (const container of layout.containers) container.targetId = map(container.targetId);
      for (const item of layout.items) item.targetId = map(item.targetId);
    }
    const drivers = compiled.playback.drivers
      .filter(
        (driver) =>
          ownIds.has(driver.id) &&
          (driver.animation.tracks.some((track) => ownIds.has(track.targetId)) ||
            !!driver.animation.drawOrders?.some(
              (drawOrder) => drawOrder.scopeId !== null && ownIds.has(drawOrder.scopeId),
            )),
      )
      .map((driver) => ({
        ...driver,
        animation: {
          ...remapDrawOrders(driver.animation, (id) => (ownIds.has(id) ? id : undefined), null),
          tracks: driver.animation.tracks.filter((track) => ownIds.has(track.targetId)),
        },
      }));
    const driverIds = new Set(drivers.map((driver) => driver.id));
    for (const driver of drivers)
      if (driver.parentId && !driverIds.has(driver.parentId)) driver.parentId = null;
    const rigScopes = (compiled.playback.rigScopes ?? [])
      .filter((scope) => [...rigOwners(scope.rig)].some((id) => ownIds.has(id)))
      .map((scope) => ({
        ...scope,
        instancePath: scope.instancePath.slice(path.length),
        clockId: scope.clockId && ownIds.has(scope.clockId) ? scope.clockId : null,
      }));
    const fullMetadata = compiled.playback.version === 3;
    const runtimeObjects = fullMetadata
      ? owned.map(({ node, parentId }) => {
          const metadata = compiledObjects.get(node.id);
          if (!metadata?.tag) throw new Error("Metadados compilados de rig ausentes.");
          return { ...metadata, parentId };
        })
      : owned.map(({ node }) => ({ id: node.id, transform: node.transform }));
    return {
      version: INTERACTIVE_VERSION,
      behavior,
      playback: {
        version: fullMetadata ? 3 : 2,
        motion: {
          ...project.motion,
          animations: project.motion.animations.map((clip) => ({
            ...remapDrawOrders(clip, (id) => mapping.get(id), null),
            tracks: clip.tracks
              .filter((track) => mapping.has(track.targetId))
              .map((track) => ({ ...structuredClone(track), targetId: map(track.targetId) })),
          })),
        },
        objects: runtimeObjects,
        drivers,
        ...(fullMetadata ? { rigScopes } : {}),
        sources: compiled.playback.sources
          .filter((source) => ownIds.has(source.id))
          .map((source) => ({ ...source, instancePath: source.instancePath.slice(path.length) })),
      },
      ...(animationId && !behavior.machines.length ? { animationId } : {}),
      ...(layout ? { layout } : {}),
      ...(master.audio ? { audio: structuredClone(master.audio) } : {}),
      ...(children.length ? { components: children } : {}),
      content: owned.map(({ node, parentId }) => {
        const identity = compiled.sourceMap.get(node.id),
          instance = identity
            ? authoredObjects.get(identity.artboardId)?.get(identity.objectId)?.instance
            : undefined;
        return {
          id: node.id,
          parentId,
          name: node.name.trim() || node.tag,
          tag: node.tag,
          visual: {
            attrs: Object.fromEntries(
              Object.entries(node.attrs).filter(
                ([key]) => key !== "transform" && (key !== "d" || node.tag === "path"),
              ),
            ),
            text: node.text,
            visible: node.visible,
            ...(node.textLayout ? { textLayout: node.textLayout } : {}),
            ...(node.textDirection ? { textDirection: node.textDirection } : {}),
          },
          ...(node.assetId ? { assetId: node.assetId } : {}),
          ...(node.imageSlice
            ? {
                imageSlice: {
                  source: (() => {
                    const asset = compiled.assets.find((asset) => asset.id === node.assetId);
                    if (asset?.kind !== "image") throw new Error("Imagem de nine-slice ausente.");
                    return { width: asset.width, height: asset.height };
                  })(),
                  insets: node.imageSlice,
                },
              }
            : {}),
          ...(node.fontAssetId ? { fontAssetId: node.fontAssetId } : {}),
          ...(node.fontFallbackIds ? { fontFallbackIds: [...node.fontFallbackIds] } : {}),
          ...(node.semantics ? { semantics: structuredClone(node.semantics) } : {}),
          ...(node.gradients ? { gradients: node.gradients } : {}),
          ...(node.filter ? { filter: node.filter } : {}),
          ...(node.effects ? { effects: node.effects } : {}),
          ...(instance
            ? {
                isComponent: true,
                intrinsic: { x: 0, y: 0, width: instance.width, height: instance.height },
              }
            : {}),
          ...(node.textLayout ? { lineHeight: node.textLayout.lineHeight } : {}),
          ...(node.textDirection ? { textDirection: node.textDirection } : {}),
        };
      }),
    };
  }
  const document = buildScope(board.id, [], compiled.scene.nodes, options.animationId),
    resourceIds = new Set<string>();
  function collectResources(document: InteractiveDocument) {
    for (const object of document.content) {
      if (object.assetId) resourceIds.add(object.assetId);
      for (const id of fontStackIds(object)) resourceIds.add(id);
    }
    for (const binding of document.audio?.bindings ?? []) resourceIds.add(binding.assetId);
    for (const component of document.components ?? []) collectResources(component.document);
  }
  collectResources(document);
  document.assets = project.assets.filter((asset) => resourceIds.has(asset.id));
  document.visual = {
    viewBox: [...board.scene.viewBox],
    preserveAspectRatio: board.scene.preserveAspectRatio ?? "xMidYMid meet",
    globalTransform: { ...project.transforms },
  };
  const parsed = parseInteractiveDocument(document);
  return {
    name: board.name,
    assets: document.assets,
    scene: compiled.scene,
    globalTransform: { ...project.transforms },
    document: parsed,
    svg: serializeVisualElement(describeVisualDocument(parsed)),
  };
}
