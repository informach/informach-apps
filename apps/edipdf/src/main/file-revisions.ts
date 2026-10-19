import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { atomicWrite } from "./files.ts";

const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const key = (path: string) =>
  process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
export function createFileRevisions() {
  const revisions = new Map<string, string>();
  const writes = new Map<string, Promise<void>>();
  return {
    matches(path: string, sha256: string): boolean {
      return revisions.get(key(path)) === sha256;
    },
    remember(path: string, bytes: Uint8Array): void {
      revisions.set(key(path), digest(bytes));
    },
    async write(path: string, bytes: Uint8Array): Promise<void> {
      const id = key(path),
        expected = revisions.get(id);
      const previous = writes.get(id) ?? Promise.resolve();
      const next = previous.then(async () => {
        await atomicWrite(path, bytes, async () => {
          if (expected === undefined) return;
          let current: Uint8Array;
          try {
            current = await readFile(path);
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT")
              throw new Error(
                "O arquivo original foi removido. Use Salvar como para escolher outro destino.",
              );
            throw error;
          }
          if (digest(current) !== expected)
            throw new Error(
              "O arquivo foi alterado depois de aberto. Use Salvar como para preservar as duas versões.",
            );
        });
        revisions.set(id, digest(bytes));
      });
      const tail = next.then(
        () => undefined,
        () => undefined,
      );
      writes.set(id, tail);
      try {
        await next;
      } finally {
        if (writes.get(id) === tail) writes.delete(id);
      }
    },
  };
}
