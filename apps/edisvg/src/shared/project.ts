import {
  emptyMotion,
  identityTransform,
  type Motion,
  parseMotion,
  type Transform,
} from "@informach/edi-motion";
import { type Asset, imagePresentation, parseAssetCatalog } from "@informach/edi-motion/assets";
import { type AudioDocument, parseAudioDocument } from "@informach/edi-motion/audio";
import { type Behavior, parseBehavior } from "@informach/edi-motion/behavior";
import { gradientDefinitions, hasPattern } from "@informach/edi-motion/graphics";
import { type LayoutDocument, parseLayout } from "@informach/edi-motion/layout";
import {
  parseRig,
  type RigDocument,
  rigCost,
  rigParameterContext,
  validateRigAnimations,
} from "@informach/edi-motion/rig";
import { z } from "zod";
import { validateComponentGraph } from "./componentGraph";
import { artboardIdSchema } from "./identities";
import { rigObjects } from "./rigObjects";
import { flattenScene, validateScene } from "./scene.js";
import type { Scene, SceneNode } from "./sceneTypes";

export const PROJECT_VERSION = 23;
const presetSchema = z.enum(["Parado", "Acenar", "Pular"]);
type Preset = z.infer<typeof presetSchema>;
const modeSchema = z.enum(["loop", "ping-pong", "once"]);
type Mode = z.infer<typeof modeSchema>;
const totalFrames: Record<Preset, number> = { Parado: 120, Acenar: 72, Pular: 48 };
const keysSchema = z.array(z.number().int().min(0).max(120)).max(1000);
const transformPatch = z.strictObject({
  x: z.number().min(-10000).max(10000).optional(),
  y: z.number().min(-10000).max(10000).optional(),
  rotation: z.number().min(-3600).max(3600).optional(),
  opacity: z.number().min(0).max(100).optional(),
  sx: z.number().min(0.01).max(20).optional(),
  sy: z.number().min(0.01).max(20).optional(),
});
const fields = {
  name: z
    .string()
    .min(1)
    .max(120)
    .refine((value) => value.trim().length > 0),
  animation: presetSchema,
  transforms: transformPatch,
  keys: keysSchema,
  keysByAnimation: z.partialRecord(presetSchema, keysSchema).optional(),
  modes: z.partialRecord(presetSchema, modeSchema).optional(),
  inputs: z
    .object({ humor: z.number().min(0).max(1).default(0.6), acenando: z.boolean().default(false) })
    .optional(),
  scene: z.unknown().optional(),
  motion: z.unknown().optional(),
};
const legacySchema = z.object({ version: z.union([z.literal(1), z.literal(2)]), ...fields });
const previousSchema = z.strictObject({
  version: z.union([z.literal(3), z.literal(4)]),
  id: z.string().regex(/^project-[\w-]{1,100}$/),
  ...fields,
  inputs: z
    .strictObject({
      humor: z.number().min(0).max(1).default(0.6),
      acenando: z.boolean().default(false),
    })
    .optional(),
  // These are explicitly redundant export metadata, not editable content.
  svg: z.string().max(10_000_000).optional(),
  limitations: z.array(z.string().max(1000)).max(100).optional(),
});
const artboardSchema = z.strictObject({
  id: artboardIdSchema,
  name: z.string().trim().min(1).max(120),
  scene: z.unknown(),
  behavior: z.unknown().optional(),
  layout: z.unknown().optional(),
  rig: z.unknown().optional(),
  audio: z.unknown().optional(),
});
const currentSchema = previousSchema.omit({ version: true, scene: true }).extend({
  version: z.union([
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
    z.literal(11),
    z.literal(12),
    z.literal(13),
    z.literal(14),
    z.literal(15),
    z.literal(16),
    z.literal(17),
    z.literal(18),
    z.literal(19),
    z.literal(20),
    z.literal(21),
    z.literal(22),
    z.literal(PROJECT_VERSION),
  ]),
  artboards: z.array(artboardSchema).max(100),
  defaultArtboardId: artboardIdSchema.nullable(),
  assets: z.unknown().optional(),
});
export interface Artboard {
  id: string;
  name: string;
  scene: Scene;
  behavior?: Behavior;
  layout?: LayoutDocument;
  rig?: RigDocument;
  audio?: AudioDocument;
}
export interface Project {
  version: typeof PROJECT_VERSION;
  id: string;
  name: string;
  animation: Preset;
  transforms: Transform;
  keys: number[];
  keysByAnimation: Record<Preset, number[]>;
  modes: Record<Preset, Mode>;
  inputs: { humor: number; acenando: boolean };
  artboards: Artboard[];
  defaultArtboardId: string | null;
  motion: Motion;
  assets: Asset[];
}

export function validateTransform(input: unknown): Partial<Transform> {
  return transformPatch.parse(input);
}

export function parseProject(input: unknown): Project {
  const header = z.object({ version: z.number().int() }).safeParse(input);
  if (
    !header.success ||
    ![
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      PROJECT_VERSION,
    ].includes(header.data.version)
  )
    throw new Error("Arquivo de projeto incompatível.");
  if (header.data.version < 15 && typeof input === "object" && input !== null && "assets" in input)
    throw new Error("Catálogo de recursos requer projeto v15.");
  const result = (
    header.data.version >= 5
      ? currentSchema
      : header.data.version >= 3
        ? previousSchema
        : legacySchema
  ).safeParse(input);
  if (!result.success)
    throw new Error("Arquivo de projeto inválido ou incompatível.", { cause: result.error });
  const value = result.data;
  const assets = parseAssetCatalog("assets" in value ? (value.assets ?? []) : []);
  const resourceMap = new Map(assets.map((asset) => [asset.id, asset]));
  const artboards: Artboard[] = [];
  const budget = { count: 0, attributes: 0, vertices: 0, textSize: 0, sources: 0 };
  if ("artboards" in value) {
    for (const board of value.artboards) {
      const scene = validateScene(board.scene, { strict: true, budget });
      if (!scene) throw new Error("Prancheta sem cena.");
      artboards.push({ id: board.id, name: board.name, scene });
    }
  } else {
    const scene = validateScene(value.scene, { strict: header.data.version >= 3, budget });
    if (scene) artboards.push({ id: `artboard-${crypto.randomUUID()}`, name: value.name, scene });
  }
  const defaultArtboardId =
    "defaultArtboardId" in value ? value.defaultArtboardId : (artboards[0]?.id ?? null);
  if (
    new Set(artboards.map((board) => board.id)).size !== artboards.length ||
    (artboards.length === 0
      ? defaultArtboardId !== null
      : !artboards.some((board) => board.id === defaultArtboardId))
  )
    throw new Error("Identidade ou prancheta inicial inválida.");
  const ids = new Set<string>();
  if (
    header.data.version < 16 &&
    artboards.some((board) => board.scene.styles?.some((style) => style.gradients))
  )
    throw new Error("Estilos com gradientes requerem projeto v16.");
  if (
    header.data.version < 23 &&
    artboards.some((board) => board.scene.styles?.some((style) => hasPattern(style.gradients)))
  )
    throw new Error("Estilos com padrões requerem projeto v23.");
  const walk = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      if (ids.has(node.id)) throw new Error("IDs de objetos precisam ser únicos entre pranchetas.");
      if (
        node.assetId &&
        (header.data.version < 15 || resourceMap.get(node.assetId)?.kind !== "image")
      )
        throw new Error(
          "Imagem referencia um recurso ausente/incompatível ou projeto anterior a v15.",
        );
      if (
        node.fontAssetId &&
        (header.data.version < 15 || resourceMap.get(node.fontAssetId)?.kind !== "font")
      )
        throw new Error(
          "Texto referencia uma fonte ausente/incompatível ou projeto anterior a v15.",
        );
      ids.add(node.id);
      if (node.semantics !== undefined && header.data.version < 19)
        throw new Error("Semântica configurável requer projeto v19.");
      if (
        node.fontFallbackIds !== undefined &&
        (header.data.version < 18 ||
          node.fontFallbackIds.some((id) => resourceMap.get(id)?.kind !== "font"))
      )
        throw new Error("Fallback de fontes requer recursos tipados e projeto v18.");
      if (node.effects && header.data.version < 17)
        throw new Error("Recortes/máscaras tipados requerem projeto v17.");
      if (node.gradients && header.data.version < 16)
        throw new Error("Gradientes tipados requerem projeto v16.");
      if (hasPattern(node.gradients) && header.data.version < 23)
        throw new Error("Padrões tipados requerem projeto v23.");
      if (node.imageSlice) {
        const asset = resourceMap.get(node.assetId ?? "");
        if (header.data.version < 16 || asset?.kind !== "image")
          throw new Error("Nine-slice requer recurso de imagem e projeto v16.");
        imagePresentation(asset, node.attrs, node.imageSlice);
      }
      walk(node.children);
    }
  };
  for (const board of artboards) walk(board.scene.nodes);
  if (header.data.version < 20)
    for (const board of artboards) {
      const nodes = new Map(flattenScene(board.scene).map(({ node }) => [node.id, node]));
      for (const node of nodes.values())
        for (const reference of [node.effects?.clip, node.effects?.mask])
          if (reference && nodes.get(reference.sourceId)?.tag !== "path")
            throw new Error("Primitivas nativas como fontes de efeitos requerem projeto v20.");
    }
  gradientDefinitions(
    artboards.flatMap((board) => [
      ...flattenScene(board.scene).map(({ node }) => node.gradients),
      ...(board.scene.styles ?? []).map((style) => style.gradients),
    ]),
  );
  if (ids.size > 2000) throw new Error("Orçamento agregado de objetos excedido.");
  const motion = parseMotion(value.motion ?? emptyMotion(), ids);
  if ("artboards" in value)
    for (const [index, raw] of value.artboards.entries()) {
      const board = artboards[index];
      if (!board) throw new Error("Prancheta ausente.");
      if (raw.rig !== undefined) {
        board.rig = parseRig(raw.rig, rigObjects(board.scene));
        validateRigAnimations(board.rig, motion.animations);
        if (header.data.version < 14 && board.rig.version >= 2)
          throw new Error("Rig v2 requer projeto v14.");
        if (header.data.version < 22 && board.rig.version >= 4)
          throw new Error("Rig v4 requer projeto v22.");
        if (header.data.version < 21 && board.rig.version >= 3)
          throw new Error("Rig v3 requer projeto v21.");
        const nodes = new Map(flattenScene(board.scene).map(({ node }) => [node.id, node]));
        for (const trim of board.rig.trims ?? [])
          if (/[aA]/.test(nodes.get(trim.targetId)?.attrs.d ?? ""))
            throw new Error(
              "Trim de arco nativo requer conversão Bézier explícita e confirmação de aparência.",
            );
      }
      if (raw.layout !== undefined)
        board.layout = parseLayout(
          raw.layout,
          new Map(
            flattenScene(board.scene).map(({ node, parentId }) => [
              node.id,
              { tag: node.tag, parentId, isComponent: !!node.instance },
            ]),
          ),
        );
      if (raw.behavior !== undefined)
        board.behavior = parseBehavior(
          raw.behavior,
          new Map(flattenScene(board.scene).map(({ node }) => [node.id, node])),
          motion.animations,
          rigParameterContext(board.rig),
        );
      if (raw.audio !== undefined) {
        if (header.data.version < 15) throw new Error("Áudio requer projeto v15.");
        board.audio = parseAudioDocument(
          raw.audio,
          resourceMap,
          new Set(board.behavior?.events.map((event) => event.id)),
        );
      }
    }
  const byAnimation: Record<Preset, number[]> = { Parado: [], Acenar: [], Pular: [] };
  for (const name of presetSchema.options) {
    const total = totalFrames[name];
    const keys =
      name === value.animation
        ? value.keys
        : (value.keysByAnimation?.[name] ?? [0, total / 4, total / 2, total]);
    if (keys.some((key) => key > total)) throw new Error("Quadros inválidos para a animação.");
    byAnimation[name] = [...new Set(keys)].sort((a, b) => a - b);
  }
  const project: Project = {
    version: PROJECT_VERSION,
    id: "id" in value ? value.id : `project-${crypto.randomUUID()}`,
    name: value.name,
    animation: value.animation,
    transforms: { ...identityTransform(), ...value.transforms },
    keys: byAnimation[value.animation],
    keysByAnimation: byAnimation,
    modes: { Parado: "loop", Acenar: "ping-pong", Pular: "once", ...value.modes },
    inputs: { humor: value.inputs?.humor ?? 0.6, acenando: value.inputs?.acenando ?? false },
    artboards,
    defaultArtboardId,
    motion,
    assets,
  };
  let totalTracks = motion.animations.reduce((sum, clip) => sum + clip.tracks.length, 0),
    totalKeys = motion.animations.reduce(
      (sum, clip) => sum + clip.tracks.reduce((sum, track) => sum + track.keys.length, 0),
      0,
    );
  if (artboards.reduce((sum, board) => sum + (board.audio?.bindings.length ?? 0), 0) > 256)
    throw new Error("Projeto excede orçamento agregado de vínculos de áudio.");
  for (const board of artboards)
    for (const clip of board.rig?.parameterClips ?? []) {
      totalTracks += clip.tracks.length;
      totalKeys += clip.tracks.reduce((sum, track) => sum + track.keys.length, 0);
    }
  let totalVertices = budget.vertices,
    totalControls = 0,
    totalDeformers = 0;
  for (const board of artboards) {
    const cost = rigCost(board.rig);
    totalVertices += cost.vertices;
    totalControls += cost.controls;
    totalDeformers += cost.deformers;
  }
  if (totalVertices > 100000 || totalControls > 100000 || totalDeformers > 256)
    throw new Error("Projeto excede orçamento agregado de deformação/geometria.");
  if (totalTracks > 12000 || totalKeys > 100000)
    throw new Error("Orçamento agregado de canais/chaves excedido.");
  validateComponentGraph(project);
  return project;
}

export function newProject(): Project {
  return parseProject({
    version: PROJECT_VERSION,
    id: `project-${crypto.randomUUID()}`,
    name: "Sem título",
    animation: "Parado",
    transforms: {},
    keys: [],
    keysByAnimation: { Parado: [], Acenar: [], Pular: [] },
    artboards: [
      {
        id: "artboard-main",
        name: "Prancheta 1",
        scene: { viewBox: [0, 0, 1080, 1080], nodes: [] },
      },
    ],
    defaultArtboardId: "artboard-main",
    motion: emptyMotion(),
  });
}
interface SnapshotState {
  id?: string;
  name: string;
  animation: Preset;
  transforms: Partial<Transform>;
  keys: number[];
  keysByAnimation?: Partial<Record<Preset, number[]>>;
  modes?: Partial<Record<Preset, Mode>>;
  humor?: number;
  waving?: boolean;
  inputs?: { humor: number; acenando: boolean };
  scene?: unknown;
  motion?: unknown;
  artboards?: Artboard[];
  defaultArtboardId?: string | null;
  assets?: Asset[];
}
export function snapshot(state: SnapshotState): Project {
  return parseProject({
    version: state.artboards !== undefined ? PROJECT_VERSION : state.id ? 4 : 1,
    ...(state.id ? { id: state.id } : {}),
    name: state.name,
    animation: state.animation,
    transforms: state.transforms,
    keys: state.keys,
    keysByAnimation: state.keysByAnimation,
    modes: state.modes,
    inputs: {
      humor: state.humor ?? state.inputs?.humor ?? 0.6,
      acenando: state.waving ?? state.inputs?.acenando ?? false,
    },
    ...(state.artboards !== undefined
      ? {
          artboards: state.artboards,
          defaultArtboardId: state.defaultArtboardId ?? null,
          assets: state.assets ?? [],
        }
      : { scene: state.scene }),
    motion: state.motion,
  });
}
export function contentSnapshot(project: Project): Project {
  return { ...project, animation: "Parado", keys: project.keysByAnimation.Parado };
}
export function artboardScene(
  project: Pick<Project, "artboards" | "defaultArtboardId">,
  id = project.defaultArtboardId,
): Scene | null {
  return project.artboards.find((board) => board.id === id)?.scene ?? null;
}
