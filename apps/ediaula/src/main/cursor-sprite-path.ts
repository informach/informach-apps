import { join } from "node:path";
import { z } from "zod";

const spriteId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+$/);
/** The renderer supplies a cache key, never a filename or directory. */
export function cursorSpritePath(directory: string, id: unknown): string {
  return join(directory, `cursor-${spriteId.parse(id)}.webm`);
}
