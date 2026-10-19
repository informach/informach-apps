import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  type RecoveryDocument,
  recoverySchema,
  type VersionEntry,
  type VersionList,
} from "../shared/document-format.ts";
import { type PdfPreferences, preferencesSchema } from "../shared/preferences.ts";
import { atomicWrite } from "./files.ts";
import type { LocalCodec } from "./validated-store.ts";

const envelopeSchema = z.strictObject({
  version: z.literal(1),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  document: recoverySchema,
});
const validId = (id: string) =>
  z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,200}$/)
    .parse(id);
const digest = (document: RecoveryDocument) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        content: document.content,
        draft: document.draft,
        sources: document.sources,
      }),
    )
    .digest("hex");
const MAX_BYTES = 160 * 1024 * 1024;

/** Immutable, protected revisions. Unreadable files count against quota and require explicit deletion. */
export function createVersionStore(root: string, codec: LocalCodec, now = Date.now) {
  const path = (id: string) => join(root, `${validId(id)}.bin`);
  const read = async (id: string) => {
    const info = await stat(path(id));
    if (info.size > MAX_BYTES) throw new Error("Versão excede o limite local.");
    return {
      value: envelopeSchema.parse(JSON.parse(codec.decode(await readFile(path(id))))),
      bytes: info.size,
    };
  };
  const scan = async () => {
    await mkdir(root, { recursive: true });
    const entries: (VersionEntry & { digest: string })[] = [];
    let unreadable = 0,
      totalBytes = 0;
    for (const file of await readdir(root)) {
      if (!/^[a-zA-Z0-9_-]{1,200}\.bin$/.test(file)) continue;
      const id = file.slice(0, -4),
        info = await stat(path(id));
      totalBytes += info.size;
      try {
        const { value, bytes } = await read(id),
          d = value.document;
        entries.push({
          id,
          documentId: d.id,
          name: d.name,
          updatedAt: d.updatedAt,
          bytes,
          digest: value.digest,
        });
      } catch {
        unreadable++;
      }
    }
    return { entries: entries.sort((a, b) => b.updatedAt - a.updatedAt), unreadable, totalBytes };
  };
  const prune = async (raw: PdfPreferences, currentTime = now()) => {
    const preferences = preferencesSchema.parse(raw),
      list = await scan(),
      counts = new Map<string, number>();
    const quota = preferences.recoveryStorageMB * 1024 * 1024;
    const remove = new Set<string>();
    for (const entry of list.entries) {
      const count = (counts.get(entry.documentId) ?? 0) + 1;
      counts.set(entry.documentId, count);
      if (
        count > preferences.versions ||
        currentTime - entry.updatedAt > preferences.versionDays * 86400000
      )
        remove.add(entry.id);
    }
    for (const entry of list.entries) if (remove.has(entry.id)) list.totalBytes -= entry.bytes;
    for (const entry of [...list.entries].reverse()) {
      if (list.totalBytes <= quota) break;
      if (!remove.has(entry.id)) {
        remove.add(entry.id);
        list.totalBytes -= entry.bytes;
      }
    }
    for (const id of remove) await unlink(path(id));
    return list.totalBytes;
  };
  return {
    async list(): Promise<VersionList> {
      const list = await scan();
      return { ...list, entries: list.entries.map(({ digest: _digest, ...entry }) => entry) };
    },
    async load(id: string): Promise<RecoveryDocument> {
      return (await read(id)).value.document;
    },
    prune,
    async save(raw: unknown, rawPreferences: PdfPreferences, force = false): Promise<void> {
      const d = recoverySchema.parse(raw),
        preferences = preferencesSchema.parse(rawPreferences);
      await prune(preferences);
      if (!preferences.versions) return;
      const list = await scan(),
        previous = list.entries.find((entry) => entry.documentId === d.id),
        hash = digest(d);
      if (previous?.digest === hash) return;
      const currentTime = now();
      if (
        !force &&
        previous &&
        currentTime - previous.updatedAt < preferences.versionIntervalMinutes * 60000
      )
        return;
      d.updatedAt = Math.max(currentTime, (list.entries[0]?.updatedAt ?? -1) + 1);
      const bytes = codec.encode(JSON.stringify({ version: 1, digest: hash, document: d }));
      if (
        bytes.byteLength > MAX_BYTES ||
        bytes.byteLength > preferences.recoveryStorageMB * 1024 * 1024
      )
        throw new Error(
          "A versão excede a cota local configurada. A recuperação atual foi preservada.",
        );
      if (
        list.totalBytes -
          list.entries.reduce((sum, entry) => sum + entry.bytes, 0) +
          bytes.byteLength >
        preferences.recoveryStorageMB * 1024 * 1024
      )
        throw new Error(
          "Arquivos de versões ilegíveis ocupam a cota. Revise a limpeza nas preferências.",
        );
      await atomicWrite(path(`${d.id}_${randomUUID()}`), bytes);
      await prune(preferences);
    },
    async remove(id: string): Promise<void> {
      await unlink(path(id));
    },
    async clear(): Promise<void> {
      await mkdir(root, { recursive: true });
      for (const file of await readdir(root))
        if (/^[a-zA-Z0-9_-]{1,200}\.bin$/.test(file)) await unlink(join(root, file));
    },
  };
}
