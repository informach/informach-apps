import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { atomicWrite } from "@informach/edi-desktop/files";
import { zipSync } from "fflate";
import { z } from "zod";
import { parseDocument } from "../domain/document.ts";

export const MAX_ARCHIVE = 800_000_000;
const MAX_FILES = 20_000;
const filename = z
  .string()
  .max(180)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/)
  .refine(
    (name) => !name.includes("..") && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name),
  );
const manifestSchema = z.strictObject({
  format: z.literal("edicaptura"),
  version: z.literal(1),
  kind: z.enum(["project", "library"]),
  files: z
    .array(
      z.strictObject({
        name: filename,
        size: z.number().int().nonnegative().max(MAX_ARCHIVE),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(MAX_FILES),
});
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export type Files = Map<string, Buffer>;
export async function validateLibraryRoot(root: string) {
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("A raiz deve ser uma pasta local sem links.");
  const names = (await fs.readdir(root)).sort();
  for (const name of names) {
    filename.parse(name);
    const entry = await fs.lstat(path.join(root, name));
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error(
        "Pasta de recuperação ou link encontrado. Preserve e confira esse conteúdo antes de transferir a biblioteca.",
      );
  }
  return names;
}
async function hashFile(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
/** Root relocation streams files rather than imposing the portable archive memory budget. */
export async function copyLibraryRoot(source: string, destination: string) {
  const names = await validateLibraryRoot(source);
  await fs.mkdir(destination, { recursive: true });
  if ((await validateLibraryRoot(destination)).length)
    throw new Error("Escolha uma pasta vazia. A origem foi preservada.");
  for (const name of names) {
    const from = path.join(source, name),
      to = path.join(destination, name);
    await fs.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    if ((await hashFile(from)) !== (await hashFile(to)))
      throw new Error("Falha de verificação da transferência. A origem foi preservada.");
  }
  if (JSON.stringify(await validateLibraryRoot(source)) !== JSON.stringify(names))
    throw new Error("A origem mudou durante a transferência. A preferência não foi alterada.");
}
export async function snapshot(root: string, id?: string): Promise<Files> {
  const result: Files = new Map();
  let size = 0;
  for (const name of (await fs.readdir(root)).sort()) {
    if (id && !name.startsWith(`${id}.`)) continue;
    filename.parse(name);
    if (name.toLowerCase() === "manifest.json")
      throw new Error(
        "Nome reservado manifest.json encontrado na biblioteca. Preserve e renomeie o arquivo para fazer backup.",
      );
    const target = path.join(root, name),
      stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("A biblioteca contém pasta ou link não suportado. A fonte foi preservada.");
    size += stat.size;
    if (size > MAX_ARCHIVE || result.size >= MAX_FILES)
      throw new Error("Backup excede 800 MB ou 20.000 arquivos. Divida a biblioteca.");
    result.set(name, await fs.readFile(target));
  }
  return result;
}
export function encodeArchive(files: Files, kind: "project" | "library"): Buffer {
  let total = 0;
  const manifest = manifestSchema.parse({
    format: "edicaptura",
    version: 1,
    kind,
    files: [...files].map(([name, bytes]) => ({ name, size: bytes.length, sha256: sha256(bytes) })),
  });
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const [name, bytes] of files) {
    total += bytes.length;
    entries[name] = bytes;
  }
  if (total > MAX_ARCHIVE) throw new Error("Backup excede 800 MB.");
  entries["manifest.json"] = Buffer.from(JSON.stringify(manifest));
  return Buffer.from(zipSync(entries, { level: 0 }));
}
/** Read central directory before decompression: no paths, links, encryption or unbounded ZIPs. */
export function decodeArchive(bytes: Buffer, expected?: "project" | "library") {
  if (bytes.length > MAX_ARCHIVE + 10_000_000 || bytes.length < 22)
    throw new Error("Arquivo portátil inválido ou grande demais.");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6))
    throw new Error("ZIP incompleto ou dividido não suportado.");
  const count = bytes.readUInt16LE(end + 10),
    centralSize = bytes.readUInt32LE(end + 12),
    centralStart = bytes.readUInt32LE(end + 16);
  if (
    !count ||
    count > MAX_FILES + 1 ||
    centralStart + centralSize !== end ||
    bytes.readUInt16LE(end + 8) !== count ||
    end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
  )
    throw new Error("Índice ZIP inválido.");
  const names = new Set<string>();
  const entries = new Map<string, { method: number; start: number; end: number; size: number }>();
  let offset = centralStart,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Índice ZIP truncado.");
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10),
      compressed = bytes.readUInt32LE(offset + 20),
      size = bytes.readUInt32LE(offset + 24),
      length = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32),
      attributes = bytes.readUInt32LE(offset + 38),
      local = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + length + extra + comment;
    if (next > end) throw new Error("Nome ZIP truncado.");
    const name = filename.parse(bytes.subarray(offset + 46, offset + 46 + length).toString("utf8"));
    if (
      names.has(name.toLowerCase()) ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      ((attributes >>> 16) & 0xf000) === 0xa000 ||
      attributes & 0x10 ||
      size === 0xffffffff ||
      compressed === 0xffffffff ||
      local + 30 > centralStart
    )
      throw new Error("Entrada ZIP insegura ou duplicada.");
    names.add(name.toLowerCase());
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error("Cabeçalho ZIP inválido.");
    const localLength = bytes.readUInt16LE(local + 26),
      localExtra = bytes.readUInt16LE(local + 28);
    if (
      local + 30 + localLength + localExtra + compressed > centralStart ||
      bytes.subarray(local + 30, local + 30 + localLength).toString("utf8") !== name ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.readUInt16LE(local + 6) !== flags
    )
      throw new Error("Cabeçalhos ZIP divergentes.");
    if (method === 0 && compressed !== size) throw new Error("Tamanho ZIP divergente.");
    entries.set(name, {
      method,
      start: local + 30 + localLength + localExtra,
      end: local + 30 + localLength + localExtra + compressed,
      size,
    });
    total += size;
    if (total > MAX_ARCHIVE + 10_000_000 || (name === "manifest.json" && size > 10_000_000))
      throw new Error("ZIP descompactado excede o limite.");
    offset = next;
  }
  if (offset !== end) throw new Error("Índice ZIP divergente.");
  const extract = (name: string) => {
    const entry = entries.get(name);
    if (!entry) throw new Error("Entrada do manifesto ausente.");
    const compressed = bytes.subarray(entry.start, entry.end);
    // zlib enforces the real expanded byte count, including dishonest ZIP headers.
    const output =
      entry.method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.size) });
    if (output.length !== entry.size) throw new Error("Tamanho descompactado divergente.");
    return output;
  };
  const raw = entries.has("manifest.json") ? extract("manifest.json") : null;
  if (!raw) throw new Error("Manifesto ausente.");
  const manifest = manifestSchema.parse(JSON.parse(Buffer.from(raw).toString("utf8")));
  if (expected && manifest.kind !== expected)
    throw new Error("Este arquivo não corresponde ao tipo de importação escolhido.");
  if (manifest.files.length !== count - 1) throw new Error("Contagem do manifesto divergente.");
  const declaredNames = new Set<string>();
  let declaredTotal = 0;
  for (const file of manifest.files) {
    if (
      file.name.toLowerCase() === "manifest.json" ||
      declaredNames.has(file.name.toLowerCase()) ||
      entries.get(file.name)?.size !== file.size
    )
      throw new Error("Nome ou tamanho do manifesto divergente.");
    declaredNames.add(file.name.toLowerCase());
    declaredTotal += file.size;
    if (declaredTotal > MAX_ARCHIVE) throw new Error("Manifesto excede 800 MB.");
  }
  const files: Files = new Map();
  let actualTotal = 0;
  for (const file of manifest.files) {
    if (entries.get(file.name)?.size !== file.size)
      throw new Error("Tamanho do manifesto divergente.");
    const payload = extract(file.name);
    if (
      file.name === "manifest.json" ||
      files.has(file.name) ||
      !payload ||
      payload.length !== file.size ||
      sha256(payload) !== file.sha256
    )
      throw new Error("Checksum, tamanho ou nome do manifesto divergente. Nada foi importado.");
    files.set(file.name, Buffer.from(payload));
    actualTotal += payload.length;
    if (actualTotal > MAX_ARCHIVE) throw new Error("Conteúdo descompactado excede 800 MB.");
  }
  return { kind: manifest.kind, files };
}
export function projectFiles(files: Files) {
  const metadata = [...files.keys()].filter((name) => name.endsWith(".json"));
  if (metadata.length !== 1) throw new Error("Projeto deve conter exatamente um documento.");
  const meta = metadata[0];
  if (!meta) throw new Error("Documento ausente.");
  const doc = parseDocument(JSON.parse(files.get(meta)?.toString("utf8") || ""));
  if (
    meta !== `${doc.id}.json` ||
    !files.has(`${doc.id}.${doc.kind === "video" ? "webm" : "png"}`) ||
    [...files.keys()].some((name) => !name.startsWith(`${doc.id}.`))
  )
    throw new Error("Mídia ou identidade do projeto inválida.");
  for (const a of doc.annotations)
    if (a.kind === "image" && !files.has(`${doc.id}.${a.assetId}.png`))
      throw new Error("Imagem de composição ausente.");
  return doc;
}
export async function importProject(root: string, source: Files, duplicate = false) {
  const doc = projectFiles(source),
    signature = sha256(
      Buffer.from(
        [...source]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, bytes]) => `${name}:${sha256(bytes)}`)
          .join("\n"),
      ),
    );
  let id = doc.id,
    attempt = duplicate ? 1 : 0;
  for (;;) {
    if (attempt) {
      const hex = createHash("sha256").update(`${doc.id}:${signature}:${attempt}`).digest("hex");
      id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    }
    const names = await fs.readdir(root);
    const existing = names.filter((name) => name.startsWith(`${id}.`));
    if (!existing.length) break;
    if (!duplicate) {
      const original = await snapshot(root, id);
      // Text recognized here later (<id>.ocr) does not make the same project a different one.
      if (!source.has(`${doc.id}.ocr`)) original.delete(`${id}.ocr`);
      const identical = [...source].every(([name, bytes]) => {
        const targetName = name.replace(doc.id, id);
        if (id !== doc.id && name === `${doc.id}.json`)
          return original
            .get(targetName)
            ?.equals(Buffer.from(JSON.stringify({ ...doc, id, deletedAt: null })));
        return original.get(targetName)?.equals(bytes);
      });
      if (identical && original.size === source.size) return { id, reused: true };
    }
    attempt++;
  }
  const record = {
    ...doc,
    id,
    deletedAt: null,
    name: duplicate ? `${doc.name.slice(0, 110)} — cópia` : doc.name,
    ...(duplicate ? { created: new Date().toISOString(), updated: new Date().toISOString() } : {}),
  };
  // Flat portable recovery remains eligible for whole-library backup after a failure.
  const recovery = path.join(root, `recovery-${randomUUID()}.edicapture`);
  const metadata = path.join(root, `recovery-${randomUUID()}.metadata`);
  try {
    await atomicWrite(recovery, encodeArchive(source, "project"));
    for (const [name, bytes] of source) {
      if (name === `${doc.id}.json`) continue;
      const target = path.join(root, name.replace(doc.id, id));
      await fs.writeFile(target, bytes, { flag: "wx" });
      if (sha256(await fs.readFile(target)) !== sha256(bytes))
        throw new Error("Falha de verificação da mídia importada.");
    }
    await atomicWrite(metadata, JSON.stringify(record));
    await fs.copyFile(metadata, path.join(root, `${id}.json`), fs.constants.COPYFILE_EXCL);
    await fs.unlink(metadata);
    await fs.unlink(recovery);
    return { id, reused: false };
  } catch (cause) {
    throw new Error(
      `Importação ou limpeza não concluída. Fonte intacta; arquivo de recuperação, se gravado: ${recovery}.`,
      {
        cause,
      },
    );
  }
}
export async function verifiedCopy(files: Files, destination: string) {
  await fs.mkdir(destination, { recursive: true });
  if ((await fs.readdir(destination)).length)
    throw new Error("Escolha uma pasta vazia. Nenhum arquivo existente foi substituído.");
  const stat = await fs.lstat(destination);
  if (stat.isSymbolicLink()) throw new Error("A pasta de destino não pode ser um link.");
  for (const [name, bytes] of files) {
    filename.parse(name);
    const target = path.join(destination, name);
    await fs.writeFile(target, bytes, { flag: "wx" });
    if (sha256(await fs.readFile(target)) !== sha256(bytes))
      throw new Error("Falha ao verificar a cópia. A biblioteca original permanece intacta.");
  }
  return destination;
}
