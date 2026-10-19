import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  type RecoveryDocument,
  type RecoveryEntry,
  type RecoveryList,
  recoverySchema,
} from "../shared/document-format.ts";
import { atomicWrite } from "./files.ts";

interface Codec {
  encode(value: string): Uint8Array;
  decode(value: Uint8Array): string;
}
const MAX_SNAPSHOT_BYTES = 160 * 1024 * 1024;
const validId = (id: string): string => {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error("Identidade de recuperação inválida.");
  return id;
};
export function createRecoveryStore(root: string, codec: Codec) {
  const path = (id: string) => join(root, `${validId(id)}.bin`);
  const load = async (id: string): Promise<RecoveryDocument> => {
    const file = path(id);
    if ((await stat(file)).size > MAX_SNAPSHOT_BYTES)
      throw new Error("Cópia de recuperação excede o limite local.");
    const data: unknown = JSON.parse(codec.decode(await readFile(file)));
    const parsed = recoverySchema.parse(data);
    if (parsed.id !== id) throw new Error("Identidade da cópia de recuperação não confere.");
    return parsed;
  };
  const list = async (): Promise<RecoveryList> => {
    await mkdir(root, { recursive: true });
    const entries: RecoveryEntry[] = [];
    let unreadable = 0;
    for (const file of await readdir(root)) {
      if (!/^[a-zA-Z0-9_-]{1,160}\.bin$/.test(file)) continue;
      try {
        const d = await load(file.slice(0, -4));
        entries.push({ id: d.id, name: d.name, updatedAt: d.updatedAt });
      } catch {
        unreadable++;
      } // Kept on disk; a corrupt snapshot never becomes an empty document.
    }
    return { entries: entries.sort((a, b) => b.updatedAt - a.updatedAt), unreadable };
  };
  return {
    list,
    load,
    async save(raw: unknown): Promise<void> {
      const d = recoverySchema.parse(raw);
      const encoded = codec.encode(JSON.stringify(d));
      if (encoded.byteLength > MAX_SNAPSHOT_BYTES)
        throw new Error("Cópia de recuperação excede o limite local.");
      await mkdir(root, { recursive: true });
      await atomicWrite(path(d.id), encoded);
    },
    async remove(id: string): Promise<void> {
      try {
        await unlink(path(id));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    },
  };
}
