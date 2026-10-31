import { serializeAnimationArtifact } from "@informach/edi-motion/animation-artifact";
import type { ImageAsset } from "@informach/edi-motion/assets";
import { z } from "zod";
import { compileInteractiveArtboard } from "../../../shared/interactive";
import type { Project } from "../../../shared/project";

const optionsSchema = z.strictObject({
  format: z.literal("player-web"),
  alt: z.string().trim().min(1).max(200),
  reduced: z.boolean(),
  offscreen: z.boolean(),
  artboardId: z.string().max(120).nullable().optional(),
  animationId: z.string().max(120).nullable().optional(),
  machineId: z.string().max(120).nullable().optional(),
  fit: z.enum(["contain", "cover", "stretch"]).default("contain"),
  confirmAnimationOnly: z.boolean().optional(),
});

/** Same compiler as the editor and React export; only the transport is different. */
export function buildPlayerWebExport(project: Project, rawOptions: unknown, poster?: ImageAsset) {
  const options = optionsSchema.parse(rawOptions, { jitless: true });
  const boardId = options.artboardId ?? project.defaultArtboardId;
  const board = project.artboards.find((value) => value.id === boardId);
  if (!board) throw new Error("Escolha uma prancheta válida para exportar.");
  const machines = board.behavior?.machines ?? [];
  if (machines.length && options.animationId)
    throw new Error(
      "Esta prancheta tem lógica. Escolha uma máquina inicial para preservar a interação.",
    );
  if (
    options.animationId &&
    !project.motion.animations.some((clip) => clip.id === options.animationId)
  )
    throw new Error("Escolha uma animação inicial válida.");
  const machineId = options.machineId || board.behavior?.defaultMachineId || null;
  if (machines.length && !machineId)
    throw new Error("Escolha uma máquina inicial para esta prancheta.");
  if (machineId && !machines.some((machine) => machine.id === machineId))
    throw new Error("Escolha uma máquina inicial válida nesta prancheta.");
  const compiled = compileInteractiveArtboard(project, board.id, {
    ...(options.animationId ? { animationId: options.animationId } : {}),
  });
  if (machineId) compiled.document.behavior.defaultMachineId = machineId;
  const content = serializeAnimationArtifact({
    format: "edi-animation",
    version: 1,
    title: options.alt,
    fit: options.fit,
    autoplay: Boolean(machineId || options.animationId),
    respectReducedMotion: options.reduced,
    pauseOffscreen: options.offscreen,
    document: compiled.document,
    ...(poster ? { poster } : {}),
  });
  return { extension: "edi-animation.json", type: "application/json", content };
}
