import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { EMPTY_LIBRARY, type Library, librarySchema } from "../shared/library.ts";

/**
 * userData/library.json (shared/library.ts): read when the library is listed, with every media
 * still on this computer allowed again for reading; written whole, keeping only media the app
 * could already read (a lesson used them), so the list never opens a file nobody picked.
 */

export interface LibraryAccess {
  canRead: (path: string) => Promise<boolean>;
  grantRead: (path: string) => Promise<void>;
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export async function readLibrary(file: string): Promise<Library> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return EMPTY_LIBRARY;
    throw error;
  }
  const parsed = librarySchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("A biblioteca de mídias e estilos não pôde ser lida.");
  return parsed.data;
}

/** The library with its media allowed for reading (and the ones gone marked). */
export async function listLibrary(file: string, access: LibraryAccess): Promise<Library> {
  const library = await readLibrary(file);
  const media = [];
  for (const m of library.media) {
    const { missing: _old, ...rest } = m;
    if (!existsSync(m.path)) {
      media.push({ ...rest, missing: true });
      continue;
    }
    await access.grantRead(m.path);
    media.push(rest);
  }
  return { ...library, media };
}

/** Writes the library the renderer sends; a media the app cannot read is refused. */
export async function saveLibrary(
  file: string,
  raw: unknown,
  access: LibraryAccess,
): Promise<void> {
  const library = librarySchema.parse(raw);
  const known = new Set((await readLibrary(file)).media.map((m) => m.path.toLowerCase()));
  for (const m of library.media)
    if (!known.has(m.path.toLowerCase()) && !(await access.canRead(m.path)))
      throw new Error(`Abra ${m.name} numa aula antes de guardar na biblioteca.`);
  const clean: Library = {
    ...library,
    media: library.media.map(({ missing: _gone, ...m }) => m),
  };
  await atomicWrite(file, JSON.stringify(clean, null, 1));
}

export const libraryFile = (userData: string): string => join(userData, "library.json");
