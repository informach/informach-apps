import {
  assetId,
  encodeAssetData,
  type FontAsset,
  inspectFont,
  parseAsset,
} from "@informach/edi-motion/assets";
import { z } from "zod";
import type { BundledFamily, BundledFont } from "./pipelines";

/**
 * EdiSVG's font library: the static TTF files it ships (EdiAula's bundle, all SIL Open Font
 * License 1.1), each face with a stable id ("baloo-2-800"). A library font enters a project as an
 * ordinary font asset (content-addressed: the same file is the same asset, never twice), with its
 * license notice. The license allows embedding and redistributing, so it asks no confirmation of
 * the person, unlike a file they import.
 */

export const LIBRARY_LICENSE = "SIL Open Font License 1.1";

export const libraryFontIdSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-[1-9]00$/, "Fonte da biblioteca inválida.");

/** The default fonts of a new project: titles and numbers, then the text around them. */
export const DEFAULT_LIBRARY_FONTS = { heading: "baloo-2-800", body: "nunito-400" } as const;

export const libraryFontPreferenceSchema = z.strictObject({
  heading: libraryFontIdSchema,
  body: libraryFontIdSchema,
});
export type LibraryFontPreference = z.infer<typeof libraryFontPreferenceSchema>;

/** One face of the library, as the window and the assistant see it (no bytes). */
export interface LibraryFont {
  id: string;
  family: string;
  weight: number;
  style: "normal";
  format: "truetype";
  group: string;
  license: typeof LIBRARY_LICENSE;
}

const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};
export const weightName = (weight: number) => WEIGHT_NAMES[weight] ?? String(weight);

const slug = (family: string) =>
  family
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const libraryFontId = (family: string, weight: number) => `${slug(family)}-${weight}`;

/** Every face of the bundle, family by family in the bundle's order. */
export function fontLibrary(families: readonly BundledFamily[]): LibraryFont[] {
  return families.flatMap((family) =>
    family.weights.map((weight) => ({
      id: libraryFontId(family.family, weight),
      family: family.family,
      weight,
      style: "normal" as const,
      format: "truetype" as const,
      group: family.group,
      license: LIBRARY_LICENSE,
    })),
  );
}

/** The face an id names, or an error that says so. */
export function findLibraryFont(families: readonly BundledFamily[], id: string): LibraryFont {
  const font = fontLibrary(families).find((item) => item.id === id);
  if (!font) throw new Error(`A fonte "${id}" não vem com o EdiSVG. Consulte get_font_library.`);
  return font;
}

/**
 * A library file as the project's font asset: the face's own tables, untouched, and the notice
 * of its license. Named "Baloo 2 800" as the pipelines name it, so the same file is one asset.
 */
export function libraryFontAsset(font: BundledFont): FontAsset {
  const info = inspectFont(font.bytes);
  const asset = parseAsset({
    kind: "font",
    mime: info.format === "truetype" ? "font/ttf" : "font/otf",
    name: `${font.family} ${font.weight}`,
    id: assetId(font.bytes),
    byteLength: font.bytes.length,
    data: encodeAssetData(font.bytes),
    ...info,
    rightsConfirmed: true,
    licenseNotice: font.notice,
  });
  if (asset.kind !== "font") throw new Error(`${font.name} não é uma fonte.`);
  return asset;
}

/** get_font_library: the faces, a page at a time, without bytes. */
export const fontLibraryReadSchema = z.strictObject({
  offset: z.number().int().min(0).max(1000).default(0),
  limit: z.number().int().min(1).max(100).default(100),
});
export function inspectFontLibrary(
  library: readonly LibraryFont[],
  raw: unknown,
  preference: LibraryFontPreference = DEFAULT_LIBRARY_FONTS,
) {
  const { offset, limit } = fontLibraryReadSchema.parse(raw);
  const fonts = library.slice(offset, offset + limit);
  return {
    total: library.length,
    offset,
    fonts,
    nextOffset: offset + fonts.length < library.length ? offset + fonts.length : null,
    newProjectDefaults: preference,
    note: `Fontes estáticas TTF que vêm com o EdiSVG, todas ${LIBRARY_LICENSE} (o aviso entra no recurso e é lido com get_asset_notice). Para usar uma num texto: edit_document com {type:'asset',operation:'add-library-font',fontId} e set-font com o assetId que get_assets mostra, ou direto set-font com libraryFontId no lugar de assetId, na mesma transação.`,
  };
}

/** Commands that name a library font; the editor turns them into ordinary ones before the transaction. */
interface LibraryCommand {
  type: string;
  operation?: string;
  fontId?: unknown;
  libraryFontId?: unknown;
  headingLibraryFontId?: unknown;
  bodyLibraryFontId?: unknown;
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is LibraryCommand =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The library font ids a transaction's commands name, each once. */
export function libraryFontsNamed(commands: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const command of commands) {
    if (!isRecord(command)) continue;
    if (command.type === "asset" && command.operation === "add-library-font")
      ids.add(libraryFontIdSchema.parse(command.fontId));
    if (command.type === "asset" && command.operation === "set-font" && command.libraryFontId)
      ids.add(libraryFontIdSchema.parse(command.libraryFontId));
    if (command.type === "fonts" && command.operation === "set-defaults") {
      if (command.headingLibraryFontId)
        ids.add(libraryFontIdSchema.parse(command.headingLibraryFontId));
      if (command.bodyLibraryFontId) ids.add(libraryFontIdSchema.parse(command.bodyLibraryFontId));
    }
  }
  return [...ids];
}

/**
 * The transaction's commands with each library font as the asset it is: one asset put per font
 * (before its first use), add-library-font becoming that put, and set-font / set-defaults naming
 * the asset id. The put keeps an asset already in the catalog, so adding twice adds once.
 * `fonts` holds the asset of every id `libraryFontsNamed` gave.
 */
export function resolveLibraryFonts(
  commands: readonly unknown[],
  fonts: ReadonlyMap<string, FontAsset>,
): { commands: unknown[]; added: { fontId: string; assetId: string }[] } {
  const put = new Set<string>();
  const added: { fontId: string; assetId: string }[] = [];
  const asset = (id: unknown) => {
    const fontId = libraryFontIdSchema.parse(id);
    const font = fonts.get(fontId);
    if (!font) throw new Error(`A fonte "${fontId}" não vem com o EdiSVG.`);
    return { fontId, font };
  };
  const out: unknown[] = [];
  const ensure = (fontId: string, font: FontAsset) => {
    if (put.has(fontId)) return;
    put.add(fontId);
    added.push({ fontId, assetId: font.id });
    out.push({ type: "asset", operation: "put", value: font });
  };
  for (const command of commands) {
    if (!isRecord(command)) {
      out.push(command);
      continue;
    }
    if (command.type === "asset" && command.operation === "add-library-font") {
      const { fontId, font } = asset(command.fontId);
      ensure(fontId, font);
      continue;
    }
    if (command.type === "asset" && command.operation === "set-font" && command.libraryFontId) {
      if (command.assetId !== undefined)
        throw new Error("set-font recebe assetId ou libraryFontId, não os dois.");
      const { fontId, font } = asset(command.libraryFontId);
      ensure(fontId, font);
      const { libraryFontId: _, ...rest } = command;
      out.push({ ...rest, assetId: font.id });
      continue;
    }
    if (
      command.type === "fonts" &&
      command.operation === "set-defaults" &&
      (command.headingLibraryFontId || command.bodyLibraryFontId)
    ) {
      const { headingLibraryFontId, bodyLibraryFontId, ...rest } = command;
      const next: Record<string, unknown> = { ...rest };
      for (const [role, id] of [
        ["heading", headingLibraryFontId],
        ["body", bodyLibraryFontId],
      ] as const) {
        if (!id) continue;
        if (rest[role] !== undefined)
          throw new Error(`set-defaults recebe ${role} ou ${role}LibraryFontId, não os dois.`);
        const { fontId, font } = asset(id);
        ensure(fontId, font);
        next[role] = font.id;
      }
      out.push(next);
      continue;
    }
    out.push(command);
  }
  return { commands: out, added };
}
