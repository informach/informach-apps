import {
  applyMotionCommands,
  assertCommandBudget,
  motionCommandSchema,
  objectTransformPatchSchema,
} from "@informach/edi-motion";
import { imageSliceSchema } from "@informach/edi-motion/assets";
import {
  filterSchema,
  gradientPaintsSchema,
  vectorEffectsSchema,
} from "@informach/edi-motion/graphics";
import { semanticSchema, textPathSchema } from "@informach/edi-motion/visual";
import { z } from "zod";
import { applyAnimationDependencies } from "./animationDependencies";
import { animationKeysCommandSchema, applyAnimationKeys } from "./animationKeys";
import { appearanceCommandSchema, applyAppearance } from "./appearance";
import { applyArtboardCommand, artboardCommandSchema } from "./artboards";
import { applyAsset, assetCommandSchema } from "./assets";
import { applyAudio, audioCommandSchema } from "./audio";
import { applyBehavior, behaviorCommandSchema } from "./behavior";
import { componentCommandSchema } from "./componentContracts";
import { applyComponent } from "./components";
import { applyComposition, compositionCommandSchema } from "./composition";
import { applyLayout, layoutCommandSchema } from "./layout";
import { applyPathEdit, pathEditSchema } from "./pathOperations";
import { artboardScene, parseProject } from "./project.js";
import { serializeProject } from "./projectPolicy";
import { applyRig, rigCommandSchema } from "./rig";
import { editScene, flattenScene } from "./scene.js";
import {
  applySceneBatch,
  applySceneTransforms,
  sceneBatchSchema,
  sceneTransformsSchema,
} from "./sceneBatch";
import { textLayoutSchema } from "./textLayout";
import { applyVectorBoolean, vectorBooleanSchema } from "./vectorBoolean";

const target = z.string().regex(/^node-[\w-]{1,100}$/);
const attrs = z.record(z.string().max(80), z.string().max(500000));
const sceneFields = { type: z.literal("scene"), targetId: target };
export const sceneCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("scene"),
    targetId: z.null(),
    operation: z.literal("add"),
    value: z.union([
      z.enum(["rect", "circle", "line", "text"]),
      z.strictObject({ tag: z.enum(["rect", "circle", "line", "text", "path"]), attrs }),
    ]),
  }),
  z.strictObject({ ...sceneFields, operation: z.literal("delete") }),
  z.strictObject({ ...sceneFields, operation: z.literal("duplicate") }),
  z.strictObject({ ...sceneFields, operation: z.literal("front") }),
  z.strictObject({ ...sceneFields, operation: z.literal("back") }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("rename"),
    value: z.string().trim().min(1).max(120),
  }),
  z.strictObject({ ...sceneFields, operation: z.literal("text"), value: z.string().max(10000) }),
  z.strictObject({ ...sceneFields, operation: z.literal("text-layout"), value: textLayoutSchema }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("text-direction"),
    value: z.enum(["auto", "ltr", "rtl"]),
  }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("text-path"),
    value: textPathSchema.nullable(),
  }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("semantics"),
    value: semanticSchema.nullable(),
  }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("image-slice"),
    value: imageSliceSchema.nullable(),
  }),
  z.strictObject({ ...sceneFields, operation: z.literal("attrs"), value: attrs }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("effects"),
    value: vectorEffectsSchema.nullable(),
  }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("gradients"),
    value: gradientPaintsSchema.nullable(),
  }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("filter"),
    value: filterSchema.nullable(),
  }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("path"),
    value: z.string().min(1).max(500000),
  }),
  z.strictObject({
    ...sceneFields,
    operation: z.literal("transform"),
    value: objectTransformPatchSchema,
  }),
  z.strictObject({ ...sceneFields, operation: z.literal("visibility"), value: z.boolean() }),
  z.strictObject({ ...sceneFields, operation: z.literal("lock"), value: z.boolean() }),
]);
const commandSchema = z.union([
  audioCommandSchema,
  assetCommandSchema,
  sceneCommandSchema,
  behaviorCommandSchema,
  layoutCommandSchema,
  rigCommandSchema,
  appearanceCommandSchema,
  compositionCommandSchema,
  artboardCommandSchema,
  componentCommandSchema,
  sceneBatchSchema,
  sceneTransformsSchema,
  pathEditSchema,
  vectorBooleanSchema,
  animationKeysCommandSchema,
  z.strictObject({ type: z.literal("motion"), command: motionCommandSchema }),
]);
export const documentTransactionSchema = z.strictObject({
  projectId: z.string().min(1).max(120),
  sessionId: z.uuid(),
  revision: z.number().int().min(0),
  artboardId: z
    .string()
    .regex(/^artboard-[\w-]{1,100}$/)
    .nullable()
    .optional(),
  commands: z.array(commandSchema).min(1).max(100),
});
type Context = { project: unknown; sessionId: string; revision: number };

/** Shared UI/MCP boundary. A failed/stale transaction publishes no mutation.
 * Deletion removes object references in the same undoable transaction. */
export function executeDocumentTransaction(context: Context, rawRequest: unknown) {
  // Bound nested key work before the transaction schema recursively clones it.
  if (
    typeof rawRequest === "object" &&
    rawRequest !== null &&
    "commands" in rawRequest &&
    Array.isArray(rawRequest.commands)
  ) {
    if (rawRequest.commands.length > 100) throw new Error("Orçamento de comandos excedido.");
    assertCommandBudget(
      rawRequest.commands.map((command) =>
        typeof command === "object" &&
        command !== null &&
        "type" in command &&
        (command.type === "motion" || command.type === "animation-keys") &&
        "command" in command
          ? command.command
          : command,
      ),
    );
  }
  const request = documentTransactionSchema.parse(rawRequest);
  const project = parseProject(context.project);
  if (
    request.projectId !== project.id ||
    request.sessionId !== context.sessionId ||
    request.revision !== context.revision
  )
    throw new Error("O projeto mudou. Inspecione novamente antes de editar.");
  const before = JSON.stringify(project);
  let selected: string | null | undefined;
  let selectedIds: string[] | undefined;
  let selectedArtboard: string | undefined;
  let scene = artboardScene(project, request.artboardId ?? project.defaultArtboardId);
  if (request.artboardId && !scene)
    throw new Error("Prancheta não encontrada. Inspecione novamente.");
  for (const command of request.commands) {
    if (command.type === "audio") {
      const board = project.artboards.find((board) => board.scene === scene);
      if (!board) throw new Error("Selecione uma prancheta para editar áudio.");
      applyAudio(board, command);
    } else if (command.type === "asset") {
      selected = applyAsset(project, scene, command);
      selectedIds = selected ? [selected] : undefined;
    } else if (command.type === "rig") {
      const board = project.artboards.find((board) => board.scene === scene);
      if (!board) throw new Error("Selecione uma prancheta para editar rig.");
      selected = applyRig(project, board, command);
      selectedIds = selected ? [selected] : undefined;
    } else if (command.type === "layout") {
      const board = project.artboards.find((board) => board.scene === scene);
      if (!board) throw new Error("Selecione uma prancheta para editar layout.");
      applyLayout(board, command);
    } else if (command.type === "behavior") {
      const board = project.artboards.find((board) => board.scene === scene);
      if (!board) throw new Error("Selecione uma prancheta para editar lógica.");
      applyBehavior(project, board, command);
    } else if (command.type === "appearance") {
      if (!scene) throw new Error("Selecione uma prancheta.");
      applyAppearance(scene, command);
    } else if (command.type === "vector-boolean") {
      if (!scene) throw new Error("Selecione uma prancheta.");
      selected = applyVectorBoolean(scene, project.motion, command);
      selectedIds = selected ? [selected] : [];
    } else if (command.type === "path-edit") {
      if (!scene) throw new Error("Selecione uma prancheta.");
      selectedIds = undefined;
      selected = applyPathEdit(scene, command);
    } else if (command.type === "scene-transforms") {
      if (!scene) throw new Error("Selecione uma prancheta.");
      applySceneTransforms(scene, command);
    } else if (command.type === "scene-batch") {
      if (!scene) throw new Error("Selecione uma prancheta.");
      selectedIds = applySceneBatch(
        scene,
        project.motion,
        command,
        project.artboards.find((board) => board.scene === scene),
      );
      selected = selectedIds.at(-1) ?? null;
    } else if (command.type === "component") {
      selectedIds = undefined;
      if (!scene) throw new Error("Selecione uma prancheta.");
      selected = applyComponent(scene, command);
    } else if (command.type === "artboard") {
      selectedIds = [];
      selectedArtboard = applyArtboardCommand(project, command);
      scene = artboardScene(project, selectedArtboard);
      selected = null;
    } else if (command.type === "composition") {
      selectedIds = undefined;
      if (!scene) throw new Error("O projeto não possui uma cena editável.");
      selected = applyComposition(scene, project.motion, command);
    } else if (command.type === "scene") {
      if (!scene) throw new Error("O projeto não possui uma cena editável.");
      if (
        command.operation === "delete" ||
        command.operation === "duplicate" ||
        command.operation === "front" ||
        command.operation === "back"
      ) {
        selectedIds = applySceneBatch(
          scene,
          project.motion,
          {
            type: "scene-batch",
            operation: command.operation,
            targetIds: [command.targetId],
          },
          project.artboards.find((board) => board.scene === scene),
        );
        selected = selectedIds.at(-1) ?? null;
      } else {
        selectedIds = undefined;
        selected = editScene(
          scene,
          command.targetId,
          command.operation,
          "value" in command ? command.value : undefined,
        );
      }
    } else if (command.type === "animation-keys") {
      applyAnimationKeys(project, command.command);
    } else {
      const operation = command.command;
      const objects = project.artboards.flatMap((board) => flattenScene(board.scene));
      const targets = new Set<string>(objects.map(({ node }) => node.id));
      let touched: string[] = [];
      if (operation.type === "set-key") touched = [operation.targetId];
      if (operation.type === "set-poses") touched = operation.poses.map((pose) => pose.targetId);
      if (
        operation.type === "delete-keys" ||
        operation.type === "move-keys" ||
        operation.type === "copy-keys"
      ) {
        const ids = new Set(operation.keyIds);
        touched =
          project.motion.animations
            .find((clip) => clip.id === operation.animationId)
            ?.tracks.filter((track) => track.keys.some((key) => ids.has(key.id)))
            .map((track) => track.targetId) ?? [];
      }
      if (operation.type === "create-animation")
        touched = operation.animation.tracks.map((track) => track.targetId);
      if (operation.type === "duplicate-animation" || operation.type === "delete-animation")
        touched =
          project.motion.animations
            .find((clip) => clip.id === operation.animationId)
            ?.tracks.map((track) => track.targetId) ?? [];
      if (operation.type === "set-draw-order")
        touched = [...operation.order, ...(operation.scopeId ? [operation.scopeId] : [])];
      if (operation.type === "delete-draw-order-key") {
        const drawOrder = project.motion.animations
          .find((clip) => clip.id === operation.animationId)
          ?.drawOrders?.find((item) => item.id === operation.drawOrderId);
        touched = [
          ...(drawOrder?.scopeId ? [drawOrder.scopeId] : []),
          ...(drawOrder?.keys.find((key) => key.frame === operation.frame)?.order ?? []),
        ];
      }
      if (operation.type === "delete-key" || operation.type === "update-key") {
        const track = project.motion.animations
          .find((clip) => clip.id === operation.animationId)
          ?.tracks.find((track) => track.id === operation.trackId);
        if (track) touched = [track.targetId];
      }
      const touchedIds = new Set(touched);
      if (objects.some(({ node, locked }) => locked && touchedIds.has(node.id)))
        throw new Error("Desbloqueie o objeto e seus grupos antes de animar.");
      project.motion = applyMotionCommands(project.motion, targets, [operation]);
      if (operation.type === "duplicate-animation" || operation.type === "delete-animation")
        applyAnimationDependencies(project, operation);
    }
  }
  const clean = parseProject(project);
  serializeProject(clean);
  const changed = JSON.stringify(clean) !== before;
  return {
    project: clean,
    selected,
    selectedIds,
    selectedArtboard,
    changed,
    revision: context.revision + (changed ? 1 : 0),
  };
}
