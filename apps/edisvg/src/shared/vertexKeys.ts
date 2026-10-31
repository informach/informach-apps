import {
  animationSchema,
  ease,
  easingSchema,
  keyframeSchema,
  objectIdSchema,
} from "@informach/edi-motion";
import {
  assertSameTopology,
  type Geometry,
  geometryCost,
  geometrySchema,
} from "@informach/edi-motion/geometry";
import { type RigDocument, upgradeRigVersion } from "@informach/edi-motion/rig";
import { z } from "zod";
import { parsePath } from "./pathGeometry.js";
import { flattenScene } from "./scene.js";
import type { Scene } from "./sceneTypes";

/** Vertex keys, as in Rive: the whole path of one object at a frame of one
 * animation. Between two keys the path moves linearly with the first key's
 * easing (clamped to 0–1); before the first and after the last it holds. The
 * document keeps the keys as authored; compilation turns each one into a rig
 * morph whose weight peaks at its frame, so players, exporters and state
 * machine blends evaluate them as ordinary morph channels. */
export const vertexKeySchema = z.strictObject({
  id: keyframeSchema.shape.id,
  frame: z.number().int().min(0).max(360000),
  geometry: geometrySchema,
  easing: easingSchema,
});
export const vertexClipSchema = z.strictObject({
  id: z.string().regex(/^track-[\w-]{1,100}$/),
  animationId: animationSchema.shape.id,
  targetId: objectIdSchema,
  keys: z.array(vertexKeySchema).min(1).max(1000),
});
export const vertexClipsSchema = z.array(vertexClipSchema).max(256);
export type VertexKey = z.infer<typeof vertexKeySchema>;
export type VertexClip = z.infer<typeof vertexClipSchema>;

interface Board {
  scene: Scene;
  rig?: RigDocument;
  vertexClips?: VertexClip[];
}
const morphId = (key: VertexKey) => `morph-${key.id}`;

/** Checks the clips against the board's paths and animations. */
export function parseVertexClips(
  input: unknown,
  paths: ReadonlyMap<string, { d?: string; isComponent: boolean }>,
  animations: readonly { id: string; frames: number }[],
): VertexClip[] {
  const clips = vertexClipsSchema.parse(input),
    owners = new Set<string>(),
    ids = new Set<string>();
  let vertices = 0;
  for (const clip of clips) {
    const owner = `${clip.animationId}#${clip.targetId}`,
      animation = animations.find((value) => value.id === clip.animationId),
      path = paths.get(clip.targetId);
    if (owners.has(owner) || ids.has(clip.id))
      throw new Error("Animação de vértices repetida para o mesmo objeto e animação.");
    owners.add(owner);
    ids.add(clip.id);
    if (!animation) throw new Error("Animação de vértices sem a animação.");
    if (!path?.d || path.isComponent)
      throw new Error("Animação de vértices requer um caminho local da prancheta.");
    const base = parsePath(path.d);
    for (const [index, key] of clip.keys.entries()) {
      if (ids.has(key.id)) throw new Error("Chave de vértices com identificador repetido.");
      ids.add(key.id);
      if (key.frame > animation.frames)
        throw new Error("Chave de vértices fora da duração da animação.");
      if (index && (clip.keys[index - 1]?.frame ?? -1) >= key.frame)
        throw new Error("Chaves de vértices precisam de quadros crescentes e distintos.");
      try {
        assertSameTopology(base, key.geometry);
      } catch {
        throw new Error(
          "As chaves de vértices precisam dos mesmos pontos e alças do caminho. Remova a animação de vértices antes de acrescentar ou excluir pontos.",
        );
      }
      vertices += geometryCost(key.geometry);
    }
  }
  if (vertices > 100000) throw new Error("Animação de vértices excede o orçamento de geometria.");
  return clips;
}

/** The board's rig plus one morph per vertex key and its weight channel. */
export function compiledVertexRig(board: Board): RigDocument | undefined {
  const clips = board.vertexClips ?? [];
  if (!clips.length) return board.rig;
  const rig: RigDocument = structuredClone(
    board.rig ?? { version: 2, bones: [], constraints: [], targets: [] },
  );
  rig.version = upgradeRigVersion(rig.version, 2);
  rig.morphs ??= [];
  rig.parameterClips ??= [];
  for (const clip of clips) {
    let parameters = rig.parameterClips.find((value) => value.animationId === clip.animationId);
    if (!parameters) {
      parameters = { animationId: clip.animationId, tracks: [] };
      rig.parameterClips.push(parameters);
    }
    for (const [index, key] of clip.keys.entries()) {
      const previous = clip.keys[index - 1],
        next = clip.keys[index + 1];
      rig.morphs.push({
        id: morphId(key),
        name: `Vértices · quadro ${key.frame}`,
        targetId: clip.targetId,
        geometry: structuredClone(key.geometry),
        weight: 0,
      });
      // Full weight at its own frame, none at the neighbours; the segment
      // between two keys uses the earlier key's easing on both channels, so
      // the two weights always add up to one.
      parameters.tracks.push({
        id: `track-${key.id}`,
        targetId: morphId(key),
        property: "weight",
        keys: [
          ...(previous
            ? [{ id: `${key.id}-in`, frame: previous.frame, value: 0, easing: previous.easing }]
            : []),
          { id: `${key.id}-at`, frame: key.frame, value: 1, easing: key.easing },
          ...(next
            ? [{ id: `${key.id}-out`, frame: next.frame, value: 0, easing: key.easing }]
            : []),
        ],
      });
    }
  }
  return rig;
}

/** The path a clip draws at a frame, for the editor. */
export function vertexGeometryAt(clip: VertexClip, frame: number): Geometry {
  const keys = clip.keys,
    after = keys.findIndex((key) => key.frame > frame);
  const first = keys[0];
  if (!first) throw new Error("Animação de vértices sem chaves.");
  if (after === 0) return structuredClone(first.geometry);
  const from = keys[(after === -1 ? keys.length : after) - 1] ?? first,
    to = after === -1 ? undefined : keys[after];
  if (!to) return structuredClone(from.geometry);
  const t = Math.min(
    1,
    Math.max(0, ease((frame - from.frame) / (to.frame - from.frame), from.easing)),
  );
  const mix = (a: number, b: number) => a + (b - a) * t;
  return from.geometry.map((contour, index) => ({
    closed: contour.closed,
    points: contour.points.map((point, i) => {
      const target = to.geometry[index]?.points[i] ?? point;
      const handle = (side: "in" | "out") => {
        const a = point[side],
          b = target[side];
        return a && b ? { x: mix(a.x, b.x), y: mix(a.y, b.y) } : a;
      };
      return {
        x: mix(point.x, target.x),
        y: mix(point.y, target.y),
        in: handle("in"),
        out: handle("out"),
      };
    }),
  }));
}

/** Records the path at a frame: replaces the key on that frame or inserts one. */
export function setVertexKey(
  board: Board,
  animationId: string,
  targetId: string,
  frame: number,
  geometry: Geometry,
) {
  board.vertexClips ??= [];
  const clips = board.vertexClips;
  let clip = clips.find(
    (value) => value.animationId === animationId && value.targetId === targetId,
  );
  if (!clip) {
    clip = { id: `track-${crypto.randomUUID()}`, animationId, targetId, keys: [] };
    clips.push(clip);
  }
  const existing = clip.keys.find((key) => key.frame === frame);
  if (existing) existing.geometry = structuredClone(geometry);
  else {
    clip.keys.push({
      id: `key-${crypto.randomUUID()}`,
      frame,
      geometry: structuredClone(geometry),
      easing: "linear",
    });
    clip.keys.sort((a, b) => a.frame - b.frame);
  }
}

export const vertexKeysCommandSchema = z.strictObject({
  type: z.literal("vertex-keys"),
  command: z.discriminatedUnion("operation", [
    /** Records the path at a frame: replaces that frame's key or inserts one. */
    z.strictObject({
      operation: z.literal("set"),
      animationId: animationSchema.shape.id,
      targetId: objectIdSchema,
      frame: vertexKeySchema.shape.frame,
      geometry: geometrySchema,
    }),
    /** Removes a path's whole vertex animation in one animation. */
    z.strictObject({
      operation: z.literal("clear"),
      animationId: animationSchema.shape.id,
      targetId: objectIdSchema,
    }),
  ]),
});
export type VertexKeysCommand = z.infer<typeof vertexKeysCommandSchema>;

/** Transaction draft only; the project parse that follows validates the result. */
export function applyVertexKeys(
  board: Board & { scene: Scene },
  animations: readonly { id: string; frames: number }[],
  command: VertexKeysCommand["command"],
) {
  const entry = flattenScene(board.scene).find(({ node }) => node.id === command.targetId);
  if (entry?.node.tag !== "path")
    throw new Error("Animação de vértices requer um caminho desta prancheta.");
  if (entry.locked) throw new Error("Desbloqueie o objeto e seus grupos antes de animar.");
  const animation = animations.find((value) => value.id === command.animationId);
  if (!animation) throw new Error("Animação não encontrada para os vértices.");
  if (command.operation === "clear") {
    board.vertexClips = board.vertexClips?.filter(
      (clip) => clip.animationId !== command.animationId || clip.targetId !== command.targetId,
    );
    if (!board.vertexClips?.length) delete board.vertexClips;
    return;
  }
  if (command.frame > animation.frames)
    throw new Error("Chave de vértices fora da duração da animação.");
  setVertexKey(board, command.animationId, command.targetId, command.frame, command.geometry);
}
