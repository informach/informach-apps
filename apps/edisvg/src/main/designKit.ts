import { basename } from "node:path";
import {
  readZipEntry,
  type ZipDirectoryEntry,
  zipDirectory,
} from "@informach/edi-desktop/zip-read";
import { ASSET_BYTES } from "@informach/edi-motion/assets";
import type { DesignKit } from "../shared/designKit";
import { SVG_BYTES } from "./boundedText";

/**
 * A design kit is a ZIP of the pieces a lesson's art is made of: SVGs (balloons, labels, buttons,
 * icons, a palette sheet) and PNGs (characters, illustrations, a logo), in folders. Only those two
 * kinds are read, each within the limit of its own import (an SVG as Importar SVG takes it, a PNG
 * as the Recursos tab does); everything else is named as left out. Nothing is written to the
 * disk: the files go to the window, which makes them artboards (designKitImport.ts).
 */

/** Entries of the archive's directory read at most (folders and left-out files included). */
const MAX_ENTRIES = 5000;
/** Files taken at most, and their bytes together. */
export const KIT_FILES = 600;
export const KIT_BYTES = 200_000_000;

/** Files every zipper of a system adds and nobody means to import. */
const noise = (path: string): boolean =>
  path.startsWith("__MACOSX/") ||
  path.split("/").some((part) => part.startsWith(".")) ||
  /(^|\/)(thumbs\.db|desktop\.ini)$/i.test(path);

const megabytes = (bytes: number): string =>
  (bytes / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** A name as the person reads it: no control characters, never longer than a line. */
const shown = (name: string): string =>
  [...name]
    .filter((c) => c.charCodeAt(0) >= 32)
    .join("")
    .slice(0, 200);

export async function readDesignKit(zipPath: string, signal?: AbortSignal): Promise<DesignKit> {
  let entries: ZipDirectoryEntry[];
  try {
    entries = await zipDirectory(zipPath, MAX_ENTRIES);
  } catch (error) {
    if (error instanceof Error && /arquivos/.test(error.message)) throw error;
    throw new Error("O arquivo escolhido não é um ZIP que dê para ler.");
  }
  const files = entries
    .map((entry) => ({ entry, path: shown(entry.name.replaceAll("\\", "/")) }))
    .filter(({ path }) => path && !path.endsWith("/") && !noise(path));
  // A kit zipped as its folder: the folder is the kit's name, and not part of every path.
  const first = files[0]?.path.split("/")[0];
  const root =
    first && files.length && files.every(({ path }) => path.startsWith(`${first}/`)) ? first : null;
  const name = root ?? basename(zipPath).replace(/\.zip$/i, "");
  const kit: DesignKit = { name, files: [], left: [] };
  let bytes = 0;
  for (const { entry, path: full } of files) {
    const path = root ? full.slice(root.length + 1) : full;
    const svg = /\.svg$/i.test(path);
    if (!svg && !/\.png$/i.test(path)) {
      kit.left.push(path);
      continue;
    }
    const limit = svg ? SVG_BYTES : ASSET_BYTES;
    if (entry.size > limit) {
      kit.left.push(`${path} (maior que ${megabytes(limit)} MB)`);
      continue;
    }
    if (kit.files.length >= KIT_FILES || bytes + entry.size > KIT_BYTES) {
      kit.left.push(`${path} (o kit passa de ${KIT_FILES} arquivos ou 200 MB)`);
      continue;
    }
    signal?.throwIfAborted();
    const data = await readZipEntry(zipPath, entry, signal);
    bytes += entry.size;
    if (svg) {
      try {
        kit.files.push({
          path,
          svg: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data),
        });
      } catch {
        kit.left.push(`${path} (o texto não está em UTF-8)`);
      }
    } else
      kit.files.push({ path, png: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) });
  }
  if (!kit.files.length)
    throw new Error(
      "O ZIP não tem SVG nem PNG para importar: um kit de design traz esses arquivos.",
    );
  return kit;
}
