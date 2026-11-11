import { type Asset, assetIdSchema, type FontAsset } from "@informach/edi-motion/assets";
import { z } from "zod";
import { libraryFontIdSchema } from "./fontLibrary";
import type { Project } from "./project";
import { flattenScene } from "./scene.js";
import type { SceneNode } from "./sceneTypes";

/**
 * The project's default fonts (project v27): the title one, which a new text is born with (titles
 * and numbers), and the body one (the text around them). Each is a font asset of the catalog or
 * none. "Aplicar fontes padrão" puts them on texts that exist: by role, or each by its weight.
 */

export const fontDefaultsSchema = z.strictObject({
  fonts: z.strictObject({
    heading: assetIdSchema.nullable(),
    body: assetIdSchema.nullable(),
  }),
});
export type ProjectDefaults = z.infer<typeof fontDefaultsSchema>;
export type FontRole = "heading" | "body";

export const fontsCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("fonts"),
    operation: z.literal("set-defaults"),
    heading: assetIdSchema.nullable().optional(),
    body: assetIdSchema.nullable().optional(),
    // Library fonts (fontLibrary.ts): the editor turns them into the asset ids before this runs.
    headingLibraryFontId: libraryFontIdSchema.optional(),
    bodyLibraryFontId: libraryFontIdSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("fonts"),
    operation: z.literal("apply-defaults"),
    /** auto: a text of weight 600 or more takes the title font, the others the body one. */
    role: z.enum(["auto", "heading", "body"]).default("auto"),
    /** Texts of the open artboard; without it, every text of every artboard. */
    targetIds: z
      .array(z.string().regex(/^node-[\w-]{1,100}$/))
      .min(1)
      .max(2000)
      .optional(),
  }),
]);
export type FontsCommand = z.infer<typeof fontsCommandSchema>;

/** Checks the defaults name font assets of the catalog. */
export function validateFontDefaults(defaults: ProjectDefaults, assets: readonly Asset[]) {
  for (const id of [defaults.fonts.heading, defaults.fonts.body])
    if (id !== null && assets.find((asset) => asset.id === id)?.kind !== "font")
      throw new Error("A fonte padrão do projeto não está no catálogo.");
}

/** The default font assets a project names, the ones that exist. */
export function defaultFonts(project: Pick<Project, "defaults" | "assets">) {
  const font = (id: string | null | undefined) =>
    id
      ? (project.assets.find(
          (asset): asset is FontAsset => asset.id === id && asset.kind === "font",
        ) ?? null)
      : null;
  return {
    heading: font(project.defaults?.fonts.heading),
    body: font(project.defaults?.fonts.body),
  };
}

/** Is the text bold enough to be a title (auto role)? */
export function textRole(node: SceneNode): FontRole {
  const weight = (node.attrs["font-weight"] ?? "normal").trim().toLowerCase();
  const value = weight === "bold" || weight === "bolder" ? 700 : Number(weight);
  return Number.isFinite(value) && value >= 600 ? "heading" : "body";
}

/**
 * A text in `font`, as set-font does: the asset, its weight and style, and its family as the name
 * the text falls back to. A fallback chain stays only when the font does not change.
 */
export function setTextFont(node: SceneNode, font: FontAsset) {
  if (node.fontAssetId !== font.id) delete node.fontFallbackIds;
  node.fontAssetId = font.id;
  node.attrs["font-weight"] = String(font.weight);
  node.attrs["font-style"] = font.italic ? "italic" : "normal";
  node.attrs["font-family"] = font.family;
}

/** Applies a fonts command; returns how many texts changed font (apply-defaults). */
export function applyFonts(
  project: Project,
  scene: { nodes: SceneNode[] } | null,
  command: FontsCommand,
): number {
  if (command.operation === "set-defaults") {
    if (command.headingLibraryFontId || command.bodyLibraryFontId)
      throw new Error("Fonte da biblioteca não resolvida: use edit_document pelo editor.");
    const current = project.defaults?.fonts ?? { heading: null, body: null };
    const next: ProjectDefaults = {
      fonts: {
        heading: command.heading === undefined ? current.heading : command.heading,
        body: command.body === undefined ? current.body : command.body,
      },
    };
    validateFontDefaults(next, project.assets);
    if (next.fonts.heading === null && next.fonts.body === null) delete project.defaults;
    else project.defaults = next;
    return 0;
  }
  const fonts = defaultFonts(project);
  const fontFor = (node: SceneNode) =>
    fonts[command.role === "auto" ? textRole(node) : command.role];
  if (command.role === "auto" ? !fonts.heading && !fonts.body : !fonts[command.role])
    throw new Error(
      command.role === "body"
        ? "O projeto não tem fonte padrão de corpo. Escolha uma em Fontes do projeto."
        : command.role === "heading"
          ? "O projeto não tem fonte padrão de título. Escolha uma em Fontes do projeto."
          : "O projeto não tem fontes padrão. Escolha-as em Fontes do projeto.",
    );
  let changed = 0;
  if (command.targetIds) {
    if (!scene) throw new Error("Selecione uma prancheta.");
    const entries = new Map(flattenScene(scene).map((entry) => [entry.node.id, entry]));
    for (const id of command.targetIds) {
      const entry = entries.get(id);
      if (entry?.node.tag !== "text") throw new Error("Selecione somente textos.");
      if (entry.locked)
        throw new Error("Desbloqueie o texto e seus grupos antes de alterar a fonte.");
      const font = fontFor(entry.node);
      if (!font) continue;
      if (entry.node.fontAssetId !== font.id) changed++;
      setTextFont(entry.node, font);
    }
    return changed;
  }
  // Every text of the project, the locked ones left as they are.
  for (const board of project.artboards)
    for (const entry of flattenScene(board.scene)) {
      if (entry.node.tag !== "text" || entry.locked) continue;
      const font = fontFor(entry.node);
      if (!font) continue;
      if (entry.node.fontAssetId !== font.id) changed++;
      setTextFont(entry.node, font);
    }
  return changed;
}
