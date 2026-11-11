import type { Motion } from "@informach/edi-motion";
import { remapVectorEffects } from "@informach/edi-motion/graphics";
import { remapRig } from "@informach/edi-motion/rig";
import { z } from "zod";
import { cloneDrawOrders, pruneDrawOrders } from "./drawOrders";
import { artboardIdSchema } from "./identities";
import type { Artboard } from "./project";
import { flattenScene, validateScene } from "./scene.js";

const id = artboardIdSchema;
const name = z.string().trim().min(1).max(120);
const dimensions = {
  width: z.number().positive().max(100000),
  height: z.number().positive().max(100000),
};
export const artboardCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("artboard"),
    operation: z.literal("import"),
    id,
    name,
    scene: z.unknown(),
  }),
  z.strictObject({
    type: z.literal("artboard"),
    operation: z.literal("place"),
    id,
    groupId: z.string().regex(/^node-[\w-]{1,100}$/),
    name,
    scene: z.unknown(),
  }),
  z.strictObject({
    type: z.literal("artboard"),
    operation: z.literal("create"),
    id,
    name,
    ...dimensions,
  }),
  z.strictObject({
    type: z.literal("artboard"),
    operation: z.literal("update"),
    id,
    name,
    ...dimensions,
  }),
  z.strictObject({
    type: z.literal("artboard"),
    operation: z.literal("duplicate"),
    id,
    newId: id,
    name,
  }),
  z.strictObject({ type: z.literal("artboard"), operation: z.literal("delete"), id }),
  z.strictObject({ type: z.literal("artboard"), operation: z.literal("set-default"), id }),
]);
export type ArtboardCommand = z.infer<typeof artboardCommandSchema>;
interface Document {
  artboards: Artboard[];
  defaultArtboardId: string | null;
  motion: Motion;
}
export function applyArtboardCommand(document: Document, command: ArtboardCommand): string {
  if (command.operation === "create" || command.operation === "import") {
    if (document.artboards.some((board) => board.id === command.id))
      throw new Error("ID de prancheta já existe.");
    document.artboards.push({
      id: command.id,
      name: command.name,
      scene:
        command.operation === "import"
          ? importScene(command.scene)
          : { viewBox: [0, 0, command.width, command.height], nodes: [] },
    });
    document.defaultArtboardId ??= command.id;
    return command.id;
  }
  const board = document.artboards.find((board) => board.id === command.id);
  if (!board) throw new Error("Prancheta não encontrada.");
  if (command.operation === "set-default") {
    document.defaultArtboardId = board.id;
    return board.id;
  }
  if (command.operation === "place") {
    board.scene.nodes.push(placedGroup(board, command.groupId, command.name, command.scene));
    return board.id;
  }
  if (command.operation === "update") {
    board.name = command.name;
    board.scene.viewBox[2] = command.width;
    board.scene.viewBox[3] = command.height;
    return board.id;
  }
  if (command.operation === "duplicate") {
    if (document.artboards.some((board) => board.id === command.newId))
      throw new Error("ID de prancheta já existe.");
    const copy = structuredClone(board),
      remapped = new Map<string, string>();
    copy.id = command.newId;
    copy.name = command.name;
    // The lesson stretches name the original's animations: the copy is not those stretches.
    delete copy.lessonClips;
    for (const { node } of flattenScene(copy.scene)) {
      const next = `node-${crypto.randomUUID()}`;
      remapped.set(node.id, next);
      node.id = next;
    }
    for (const { node } of flattenScene(copy.scene))
      if (node.effects)
        node.effects = remapVectorEffects(node.effects, (id) => {
          const value = remapped.get(id);
          if (!value) throw new Error("Referência de efeito não mapeada na cópia.");
          return value;
        });
    for (const animation of document.motion.animations) {
      const copies = animation.tracks
        .filter((track) => remapped.has(track.targetId))
        .map((track) => {
          const copy = structuredClone(track),
            targetId = remapped.get(track.targetId);
          if (!targetId) throw new Error("Mapeamento de cópia ausente.");
          copy.id = `track-${crypto.randomUUID()}`;
          copy.targetId = targetId;
          for (const key of copy.keys) key.id = `key-${crypto.randomUUID()}`;
          return copy;
        });
      animation.tracks.push(...copies);
    }
    cloneDrawOrders(document.motion, remapped, true);
    if (copy.behavior) {
      const map = (id: string) => {
        const target = remapped.get(id);
        if (!target) throw new Error("Referência de lógica não mapeada na cópia.");
        return target;
      };
      for (const machine of copy.behavior.machines)
        for (const layer of machine.layers) layer.targetIds = layer.targetIds.map(map);
      for (const binding of copy.behavior.bindings)
        if (binding.kind !== "parameter") binding.targetId = map(binding.targetId);
      for (const listener of copy.behavior.listeners)
        if (listener.targetId !== null) listener.targetId = map(listener.targetId);
    }
    if (copy.layout) {
      const map = (id: string) => {
        const target = remapped.get(id);
        if (!target) throw new Error("Referência de layout não mapeada.");
        return target;
      };
      for (const container of copy.layout.containers) container.targetId = map(container.targetId);
      for (const item of copy.layout.items) item.targetId = map(item.targetId);
    }
    if (copy.rig) {
      const map = (id: string) => {
        const value = remapped.get(id);
        if (!value) throw new Error("Referência de rig não mapeada.");
        return value;
      };
      copy.rig = remapRig(copy.rig, map);
    }
    if (copy.vertexClips)
      copy.vertexClips = copy.vertexClips.map((clip) => {
        const targetId = remapped.get(clip.targetId);
        if (!targetId) throw new Error("Referência de vértices não mapeada.");
        return {
          ...clip,
          id: `track-${crypto.randomUUID()}`,
          targetId,
          keys: clip.keys.map((key) => ({ ...key, id: `key-${crypto.randomUUID()}` })),
        };
      });
    document.artboards.push(copy);
    return copy.id;
  }
  if (
    document.artboards.some((owner) =>
      flattenScene(owner.scene).some(({ node }) => node.instance?.artboardId === board.id),
    )
  )
    throw new Error("A prancheta é usada por componentes. Remova as instâncias antes de excluir.");
  if (document.artboards.length === 1)
    throw new Error("Mantenha pelo menos uma prancheta no projeto.");
  const removed = new Set(flattenScene(board.scene).map(({ node }) => node.id));
  document.artboards = document.artboards.filter((item) => item !== board);
  for (const animation of document.motion.animations)
    animation.tracks = animation.tracks.filter((track) => !removed.has(track.targetId));
  pruneDrawOrders(document.motion, removed);
  const fallback = document.artboards[0];
  if (!fallback) throw new Error("Prancheta de fallback ausente.");
  if (document.defaultArtboardId === board.id) document.defaultArtboardId = fallback.id;
  return fallback.id;
}
/** How much of the artboard an imported SVG may take, at most (it is never enlarged). */
const PLACE_FIT = 0.9;
/**
 * An imported SVG as one group on top of an existing artboard: its own viewBox centered on the
 * artboard and scaled down to fit, by the group's transform, so its objects keep their
 * coordinates and stay editable.
 */
function placedGroup(board: Artboard, groupId: string, name: string, input: unknown) {
  const placed = importScene(input),
    taken = new Set(flattenScene(board.scene).map(({ node }) => node.id));
  if (taken.has(groupId) || flattenScene(placed).some(({ node }) => taken.has(node.id)))
    throw new Error("Este SVG já foi colocado nesta prancheta. Importe o arquivo de novo.");
  const [vx, vy, vw, vh] = placed.viewBox,
    [x, y, w, h] = board.scene.viewBox,
    scale = Math.min(1, (w * PLACE_FIT) / vw, (h * PLACE_FIT) / vh);
  return {
    id: groupId,
    name,
    tag: "g" as const,
    attrs: {},
    text: "",
    children: placed.nodes,
    transform: {
      x: x + (w - vw * scale) / 2 - vx * scale,
      y: y + (h - vh * scale) / 2 - vy * scale,
      rotation: 0,
      sx: scale,
      sy: scale,
      opacity: 100,
    },
    visible: true,
    locked: false,
  };
}
function importScene(input: unknown) {
  const scene = validateScene(input, { strict: true });
  if (!scene) throw new Error("Cena importada ausente.");
  return scene;
}
