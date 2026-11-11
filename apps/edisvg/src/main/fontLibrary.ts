import { readFile } from "node:fs/promises";
import { atomicWrite } from "@informach/edi-desktop/files";
import {
  DEFAULT_LIBRARY_FONTS,
  findLibraryFont,
  fontLibrary,
  type LibraryFont,
  type LibraryFontPreference,
  libraryFontAsset,
  libraryFontPreferenceSchema,
} from "../shared/fontLibrary";
import type { BundledFont } from "../shared/pipelines";
import { type Project, parseProject } from "../shared/project";
import { type FontSource, pipelineFont, pipelineFonts } from "./pipelineFonts";

/**
 * EdiSVG's font library in the main process: the faces of the bundle (pipelineFonts.ts reads it),
 * one face's file by its library id, the person's default fonts for new projects (a small JSON in
 * the profile, Baloo 2 ExtraBold and Nunito Regular until they choose others) and a new project
 * made with them.
 */

export async function libraryFonts(source: FontSource): Promise<LibraryFont[]> {
  return fontLibrary(await pipelineFonts(source));
}

/** One face of the library, by id, with its license notice. Never a path the window names. */
export async function libraryFont(source: FontSource, id: unknown): Promise<BundledFont> {
  if (typeof id !== "string") throw new Error("Fonte da biblioteca inválida.");
  const font = findLibraryFont(await pipelineFonts(source), id);
  return pipelineFont(source, font.family, font.weight);
}

export function createFontPreference(file: string, write = atomicWrite) {
  return {
    async read(): Promise<LibraryFontPreference> {
      try {
        return libraryFontPreferenceSchema.parse(JSON.parse(await readFile(file, "utf8")));
      } catch {
        // None yet (or unreadable): the suite's defaults.
        return { ...DEFAULT_LIBRARY_FONTS };
      }
    },
    async write(value: unknown): Promise<LibraryFontPreference> {
      const preference = libraryFontPreferenceSchema.parse(value);
      await write(file, `${JSON.stringify(preference, null, 2)}\n`);
      return preference;
    },
  };
}

/**
 * `project` with the default fonts of `preference` in its catalog and as its defaults. A font
 * the bundle lacks (a broken install, a preference of another version) leaves that role empty:
 * the project still opens.
 */
export async function withDefaultFonts(
  project: Project,
  source: FontSource,
  preference: LibraryFontPreference,
): Promise<Project> {
  const load = async (id: string) => {
    try {
      return libraryFontAsset(await libraryFont(source, id));
    } catch {
      return null;
    }
  };
  const [heading, body] = await Promise.all([load(preference.heading), load(preference.body)]);
  if (!heading && !body) return project;
  const assets = [...project.assets];
  for (const font of [heading, body])
    if (font && !assets.some((asset) => asset.id === font.id)) assets.push(font);
  return parseProject({
    ...project,
    assets,
    defaults: { fonts: { heading: heading?.id ?? null, body: body?.id ?? null } },
  });
}
