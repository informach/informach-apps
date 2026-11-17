import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, utimes } from "node:fs/promises";
import { join, win32 } from "node:path";
import { sniffImageType } from "@informach/edi-desktop/ai-clients";
import { atomicWrite } from "@informach/edi-desktop/files";
import { type GuideImage, type GuideStyle, guideStyleSchema } from "../shared/pipelines";

/**
 * The style guide pictures of the recipes, kept in EdiSVG's profile
 * (`pipeline-guides/<id>.img`, the id from the hash of the bytes): a recipe names its guide by
 * id, so the same picture in several recipes is one file. A guide no recipe names any more goes
 * away a day after it was last chosen (a guide picked for one run only is not lost mid-run).
 * Beside each picture, `<id>.json` keeps the colours and fonts read from it by the first run, so
 * the next runs do not ask the assistant again.
 */

const ID = /^guide-[0-9a-f]{32}$/;
/** The biggest guide picture taken (the run sends it shrunk, in parts). */
export const GUIDE_BYTES = 40 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type GuideType = (typeof TYPES)[number];
const DAY_MS = 24 * 60 * 60_000;

const folder = (userData: string): string => join(userData, "pipeline-guides");
const fileOf = (userData: string, id: unknown, extension = "img"): string => {
  if (typeof id !== "string" || !ID.test(id)) throw new Error("Guia de estilo inválido.");
  return join(folder(userData), `${id}.${extension}`);
};

const guideType = (bytes: Uint8Array): GuideType => {
  const type = sniffImageType(bytes);
  if (!type || !(TYPES as readonly string[]).includes(type))
    throw new Error("O guia de estilo precisa ser uma imagem PNG, JPEG ou WebP.");
  return type as GuideType;
};

/** Keeps a picked guide picture; returns how recipes name it. */
export async function saveGuide(
  userData: string,
  value: unknown,
  name: unknown,
): Promise<GuideImage> {
  if (!(value instanceof Uint8Array) || !value.length) throw new Error("Imagem vazia.");
  if (value.length > GUIDE_BYTES) throw new Error("O guia de estilo passa de 40 MB.");
  guideType(value);
  const id = `guide-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
  const file = fileOf(userData, id);
  await mkdir(folder(userData), { recursive: true });
  const kept = await stat(file).catch(() => null);
  if (kept?.size === value.length) {
    // Already here: chosen again now, so it stays another day even if no recipe keeps it.
    const now = new Date();
    await utimes(file, now, now);
  } else await atomicWrite(file, value);
  // Names may come from a recipe made on another OS. win32 handles both separators.
  const text = typeof name === "string" ? win32.basename(name).trim().slice(0, 260) : "";
  return { id, name: text || "Guia de estilo" };
}

/** A kept guide picture, for the run and the thumbnail. */
export async function readGuide(
  userData: string,
  id: unknown,
): Promise<{ mediaType: GuideType; bytes: Uint8Array }> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(fileOf(userData, id)));
  } catch (error) {
    if (error instanceof Error && error.message === "Guia de estilo inválido.") throw error;
    throw new Error("O guia de estilo da receita não está mais neste computador: escolha de novo.");
  }
  return { mediaType: guideType(bytes), bytes };
}

/** The colours and fonts read from a guide before; null when it was never read. */
export async function readGuideStyle(userData: string, id: unknown): Promise<GuideStyle | null> {
  const file = fileOf(userData, id, "json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return null;
  }
  try {
    return guideStyleSchema.parse(JSON.parse(text));
  } catch {
    // Written by another version or by hand: read again from the picture.
    return null;
  }
}

/** Keeps what a run read from a guide, beside its picture. */
export async function saveGuideStyle(userData: string, id: unknown, value: unknown): Promise<void> {
  const style = guideStyleSchema.parse(value);
  await readGuide(userData, id);
  await atomicWrite(fileOf(userData, id, "json"), JSON.stringify(style, null, 1));
}

/** Removes the guides none of `keep` names that were last chosen more than a day ago. */
export async function pruneGuides(
  userData: string,
  keep: ReadonlySet<string>,
  now = Date.now(),
): Promise<void> {
  const names = await readdir(folder(userData)).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.endsWith(".img")) continue;
    const id = name.slice(0, -".img".length);
    if (!ID.test(id) || keep.has(id)) continue;
    const file = join(folder(userData), name);
    const info = await stat(file).catch(() => null);
    if (!info || now - info.mtimeMs <= DAY_MS) continue;
    await rm(file, { force: true });
    await rm(fileOf(userData, id, "json"), { force: true });
  }
}
