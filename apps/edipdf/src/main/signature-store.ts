import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { signaturesSchema } from "../shared/preferences.ts";
import { createValidatedStore, type LocalCodec } from "./validated-store.ts";

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
};
/** Migrate verified legacy graphics to OS-protected storage before removing their plain file. */
export function createSignatureStore(root: string, codec: LocalCodec) {
  const legacy = createValidatedStore(root, "signatures.json", signaturesSchema, []);
  const protectedStore = createValidatedStore(root, "signatures.bin", signaturesSchema, [], codec);
  const legacyPath = join(root, "signatures.json"),
    protectedPath = join(root, "signatures.bin");
  let migration: Promise<void> | undefined;
  const migrate = async () => {
    if (await exists(protectedPath)) return;
    if (!(await exists(legacyPath))) return;
    const value = await legacy.read();
    await protectedStore.write(value);
    if (JSON.stringify(await protectedStore.read()) !== JSON.stringify(value))
      throw new Error(
        "Não foi possível verificar a migração das assinaturas. A origem foi preservada.",
      );
    await unlink(legacyPath);
  };
  const ready = () => {
    migration ??= migrate().catch((error) => {
      migration = undefined;
      throw error;
    });
    return migration;
  };
  return {
    read: async () => {
      await ready();
      return protectedStore.read();
    },
    write: async (value: unknown) => {
      await ready();
      return protectedStore.write(value);
    },
    reset: async () => {
      if (migration) await migration;
      let backup: string | null = null;
      if (await exists(legacyPath)) backup = (await legacy.reset()).backup;
      const reset = await protectedStore.reset();
      if (await exists(legacyPath)) await unlink(legacyPath);
      migration = undefined;
      return { value: reset.value, backup: reset.backup ?? backup };
    },
  };
}
