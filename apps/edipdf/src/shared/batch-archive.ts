import { type BatchDetail, batchDetailSchema } from "./batch-format.ts";
import { readOfficePackage, writeOfficePackage } from "./office-package.ts";

export async function batchDigest(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}
/** Uses the hardened ZIP subset. No archive path is ever passed directly to the filesystem. */
export async function readBatchArchive(
  bytes: Uint8Array,
  raw: BatchDetail,
): Promise<Map<string, Uint8Array>> {
  const detail = batchDetailSchema.parse(raw),
    parts = readOfficePackage(bytes),
    manifest = parts.get("manifest.json");
  if (!manifest || manifest.length > 1024 * 1024 || parts.size !== detail.files.length + 1)
    throw new Error("Conteúdo do pacote não corresponde ao lote preparado.");
  const recorded = batchDetailSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifest)),
  );
  if (JSON.stringify(recorded) !== JSON.stringify(detail))
    throw new Error("Manifesto e revisão do lote não correspondem.");
  for (const file of detail.files) {
    const data = parts.get(file.name);
    if (!data || data.length !== file.bytes || (await batchDigest(data)) !== file.sha256)
      throw new Error("Um arquivo do lote está ausente ou foi alterado.");
  }
  return parts;
}
export async function writeBatchArchive(
  raw: BatchDetail,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<Uint8Array> {
  const detail = batchDetailSchema.parse(raw),
    parts: Record<string, Uint8Array> = {
      "manifest.json": new TextEncoder().encode(JSON.stringify(detail)),
    };
  for (const file of detail.files) {
    const data = files.get(file.name);
    if (!data || data.length !== file.bytes || (await batchDigest(data)) !== file.sha256)
      throw new Error("O conteúdo gerado não corresponde à revisão do lote.");
    parts[file.name] = data;
  }
  return writeOfficePackage(parts);
}
