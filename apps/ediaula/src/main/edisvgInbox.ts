import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { z } from "zod";
import {
  PLACED_FILE,
  RECEIVED_FOLDER,
  RECEIVED_MANIFEST,
  type ReceivedAnimations,
  receivedManifestSchema,
} from "../shared/edisvgAnimations.ts";

/**
 * The animations EdiSVG left for a lesson in this profile (`recebidos/<lesson id>/`): the newest
 * send of the ids given that was not put in the lesson yet, every video of it on the disk.
 * `colocado.json` beside it says which send the lesson took (or the person declined).
 */

const idsSchema = z
  .array(z.string().regex(/^[\w-]{1,100}$/))
  .min(1)
  .max(4);
const placedSchema = z.looseObject({ sentAt: z.number().int().nonnegative() });

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export async function readReceived(
  userData: string,
  rawIds: unknown,
): Promise<ReceivedAnimations | null> {
  const ids = idsSchema.parse(rawIds);
  let best: ReceivedAnimations | null = null;
  for (const id of ids) {
    const folder = join(userData, RECEIVED_FOLDER, id);
    const manifest = receivedManifestSchema.safeParse(
      await readJson(join(folder, RECEIVED_MANIFEST)),
    );
    if (!manifest.success || manifest.data.lessonId !== id) continue;
    const placed = placedSchema.safeParse(await readJson(join(folder, PLACED_FILE)));
    if (placed.success && placed.data.sentAt >= manifest.data.sentAt) continue;
    const items = manifest.data.items.map((item) => ({
      clipId: item.clipId,
      kind: item.kind,
      path: join(folder, item.file),
      name: item.name,
      start: item.start,
      duration: item.duration,
    }));
    let whole = true;
    for (const item of items)
      if (!(await stat(item.path).catch(() => null))?.isFile()) whole = false;
    if (!whole) continue;
    if (!best || manifest.data.sentAt > best.sentAt)
      best = { lessonId: id, sentAt: manifest.data.sentAt, items };
  }
  return best;
}

/** Records that the lesson took (or declined) a send: it is not offered again. */
export async function markPlaced(
  userData: string,
  lessonId: unknown,
  sentAt: unknown,
): Promise<void> {
  const [id] = idsSchema.parse([lessonId]);
  const value = placedSchema.parse({ sentAt });
  await atomicWrite(
    join(userData, RECEIVED_FOLDER, id as string, PLACED_FILE),
    JSON.stringify({ sentAt: value.sentAt }),
  );
}
