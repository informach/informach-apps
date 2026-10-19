import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { z } from "zod";
import {
  assertVideoDiskSpace,
  COPY_BUFFER_BYTES,
  hashVideo,
  MAX_VIDEO_BYTES,
  VIDEO_DISK_RESERVE_BYTES,
} from "./video-files.ts";

export const RECORD_CHUNK_BYTES = 1024 * 1024;
export const RECORD_MAX_PARTS = 100_000;
export const RECORD_RESERVE_BYTES = VIDEO_DISK_RESERVE_BYTES;
const MAX_JOURNAL_BYTES = 32_000_000;
const uuid = z.string().uuid();
const partSchema = z.strictObject({
  sequence: z.number().int().nonnegative(),
  bytes: z.number().int().positive().max(RECORD_CHUNK_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  durationMs: z.number().finite().nonnegative().max(86400_000),
});
const journalSchema = z.strictObject({
  version: z.literal(1),
  id: uuid,
  libraryRoot: z.string().refine(path.isAbsolute),
  created: z.string().datetime(),
  status: z.enum(["recording", "interrupted", "finalized", "committed"]),
  maxBytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
  maxDurationMs: z.number().int().positive().max(86400_000),
  durationMs: z.number().finite().nonnegative().max(86400_000),
  bytes: z.number().int().nonnegative(),
  parts: z.array(partSchema).max(RECORD_MAX_PARTS),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export type RecordingJournal = z.infer<typeof journalSchema>;
export const appendSchema = z.strictObject({
  sessionId: uuid,
  sequence: partSchema.shape.sequence,
  bytes: z.instanceof(Uint8Array),
  sha256: partSchema.shape.sha256,
  durationMs: partSchema.shape.durationMs,
});
export const finishSchema = z.strictObject({
  sessionId: uuid,
  durationMs: partSchema.shape.durationMs,
});

/** On-disk journal is the authority, never a renderer's accumulated byte count. */
export class RecordingStore {
  private busy = new Set<string>();
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  directory(id: string) {
    return path.join(this.root, uuid.parse(id));
  }
  private journalFile(id: string) {
    return path.join(this.directory(id), "journal.json");
  }
  private partFile(id: string, sequence: number) {
    return path.join(this.directory(id), `${sequence}.chunk`);
  }
  private async exclusive<T>(id: string, operation: () => Promise<T>) {
    uuid.parse(id);
    if (this.busy.has(id)) throw new Error("Aguarde a confirmação da parte anterior.");
    this.busy.add(id);
    try {
      return await operation();
    } finally {
      this.busy.delete(id);
    }
  }
  async read(id: string) {
    const directory = await fs.lstat(this.directory(id));
    const metadata = await fs.lstat(this.journalFile(id));
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > MAX_JOURNAL_BYTES
    )
      throw new Error("Journal inválido ou grande demais.");
    const raw = await fs.readFile(this.journalFile(id), "utf8");
    if (raw.length > MAX_JOURNAL_BYTES) throw new Error("Journal excedeu o limite.");
    const journal = journalSchema.parse(JSON.parse(raw));
    if (
      journal.bytes > journal.maxBytes ||
      journal.durationMs > journal.maxDurationMs + 5000 ||
      journal.parts.some(
        (part, index) =>
          part.durationMs > journal.durationMs ||
          part.durationMs < (journal.parts[index - 1]?.durationMs ?? 0),
      )
    )
      throw new Error("Journal excede os limites da sessão.");
    if (
      journal.id !== id ||
      journal.parts.some((part, i) => part.sequence !== i) ||
      journal.parts.reduce((sum, part) => sum + part.bytes, 0) !== journal.bytes
    )
      throw new Error("Journal inconsistente. Os arquivos foram preservados.");
    return journal;
  }
  private async write(journal: RecordingJournal) {
    const bytes = JSON.stringify(journalSchema.parse(journal));
    await assertVideoDiskSpace(this.directory(journal.id), Buffer.byteLength(bytes));
    return atomicWrite(this.journalFile(journal.id), bytes);
  }
  async capacity(libraryRoot: string, seconds = 3600) {
    const duration = z.number().int().min(1).max(86400).parse(seconds);
    await fs.mkdir(this.root, { recursive: true });
    const [rawDisk, libraryDisk] = await Promise.all([
      fs.statfs(this.root),
      fs.statfs(libraryRoot),
    ]);
    const available = Math.min(
      rawDisk.bavail * rawDisk.bsize,
      libraryDisk.bavail * libraryDisk.bsize,
    );
    // Conservative on distinct volumes too: each volume can hold all three media
    // lifetimes, plus the current journal and its atomic replacement, without consuming reserve.
    const maxBytes = Math.min(
      MAX_VIDEO_BYTES,
      Math.floor((available - RECORD_RESERVE_BYTES - 2 * MAX_JOURNAL_BYTES) / 3),
    );
    if (maxBytes < RECORD_CHUNK_BYTES * 4)
      throw new Error("Espaço insuficiente para gravar e salvar com recuperação.");
    // 6 Mbps video plus container margin. Recheck space before every durable append.
    return {
      availableBytes: available,
      maxBytes,
      maxDurationMs: Math.min(duration * 1000, Math.floor(maxBytes / 900_000) * 1000),
      chunkBytes: RECORD_CHUNK_BYTES,
      maxParts: RECORD_MAX_PARTS,
    };
  }
  async begin(libraryRoot: string, seconds = 3600) {
    const capacity = await this.capacity(libraryRoot, seconds);
    const journal: RecordingJournal = {
      version: 1,
      id: randomUUID(),
      libraryRoot: path.resolve(libraryRoot),
      created: new Date().toISOString(),
      status: "recording",
      maxBytes: capacity.maxBytes,
      maxDurationMs: capacity.maxDurationMs,
      durationMs: 0,
      bytes: 0,
      parts: [],
    };
    await fs.mkdir(this.directory(journal.id));
    await this.write(journal);
    return { sessionId: journal.id, ...capacity };
  }
  async append(raw: unknown) {
    const input = appendSchema.parse(raw);
    if (!input.bytes.byteLength || input.bytes.byteLength > RECORD_CHUNK_BYTES)
      throw new Error("Parte de vídeo excede 1 MiB.");
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    if (sha256 !== input.sha256) throw new Error("Checksum da parte de vídeo não corresponde.");
    return this.exclusive(input.sessionId, async () => {
      const journal = await this.read(input.sessionId);
      const previous = journal.parts[input.sequence];
      if (previous) {
        if (
          previous.sha256 !== sha256 ||
          previous.bytes !== input.bytes.byteLength ||
          previous.durationMs !== input.durationMs
        )
          throw new Error("Repetição conflitante da parte de vídeo.");
        await this.verifyPart(journal.id, previous);
        return { sequence: input.sequence, bytes: journal.bytes, durationMs: journal.durationMs };
      }
      if (journal.status !== "recording" || input.sequence !== journal.parts.length)
        throw new Error("Sessão encerrada ou parte fora de ordem.");
      if (journal.parts.length >= RECORD_MAX_PARTS)
        throw new Error("Limite de partes atingido. Preserve e salve o vídeo existente.");
      if (
        input.durationMs < journal.durationMs ||
        input.durationMs > journal.maxDurationMs + 5000 ||
        journal.bytes + input.bytes.byteLength > journal.maxBytes
      )
        throw new Error(
          "Limite de duração ou espaço da sessão atingido. Preserve e salve o vídeo existente.",
        );
      const disk = await fs.statfs(this.root);
      if (disk.bavail * disk.bsize < RECORD_RESERVE_BYTES + input.bytes.byteLength * 3)
        throw new Error("Disco sem espaço. Libere espaço e tente salvar novamente.");
      const part = {
        sequence: input.sequence,
        bytes: input.bytes.byteLength,
        sha256,
        durationMs: input.durationMs,
      };
      // A crash after chunk sync but before journal sync leaves a harmless orphan.
      const file = this.partFile(journal.id, input.sequence);
      try {
        const existing = await hashVideo(file);
        if (existing.sha256 !== sha256 || existing.bytes !== part.bytes)
          throw new Error("Parte órfã conflitante; original preservado.");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        await atomicWrite(file, input.bytes);
      }
      journal.parts.push(part);
      journal.bytes += part.bytes;
      journal.durationMs = input.durationMs;
      await this.write(journal);
      return { sequence: input.sequence, bytes: journal.bytes, durationMs: journal.durationMs };
    });
  }
  private async verifyPart(id: string, part: z.infer<typeof partSchema>) {
    const actual = await hashVideo(this.partFile(id, part.sequence));
    if (actual.bytes !== part.bytes || actual.sha256 !== part.sha256)
      throw new Error("Parte de gravação danificada. O original foi preservado.");
  }
  private async hashParts(journal: RecordingJournal) {
    const hash = createHash("sha256");
    for (const part of journal.parts) {
      await this.verifyPart(journal.id, part);
      const input = await fs.open(this.partFile(journal.id, part.sequence), "r");
      try {
        let bytes = 0;
        const partHash = createHash("sha256");
        for await (const chunk of input.createReadStream({
          autoClose: false,
          highWaterMark: COPY_BUFFER_BYTES,
        })) {
          bytes += chunk.length;
          if (bytes > part.bytes) throw new Error("Parte alterada durante a leitura.");
          partHash.update(chunk);
          hash.update(chunk);
        }
        if (bytes !== part.bytes || partHash.digest("hex") !== part.sha256)
          throw new Error("Parte alterada durante a leitura.");
      } finally {
        await input.close();
      }
    }
    return hash.digest("hex");
  }
  async finish(raw: unknown) {
    const input = finishSchema.parse(raw);
    return this.exclusive(input.sessionId, async () => {
      const journal = await this.read(input.sessionId);
      if (!journal.bytes) throw new Error("A gravação não gerou quadros recuperáveis.");
      if (input.durationMs < journal.durationMs || input.durationMs > journal.maxDurationMs + 5000)
        throw new Error("Duração inválida.");
      if (journal.status !== "committed") {
        journal.status = "finalized";
        journal.durationMs = input.durationMs;
        await this.write(journal);
      }
      return journal;
    });
  }
  async recoveries() {
    await fs.mkdir(this.root, { recursive: true });
    const items: {
      sessionId: string;
      created?: string;
      bytes?: number;
      durationMs?: number;
      status: string;
      error?: string;
      libraryRoot?: string;
    }[] = [];
    for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !uuid.safeParse(entry.name).success) continue;
      try {
        const journal = await this.read(entry.name);
        if (journal.status === "committed") continue;
        if (journal.status === "recording") {
          // A synced next part may outlive the process before its journal ACK.
          // Its time is unknown: retain the last confirmed active duration until native probe (5b).
          while (journal.parts.length < RECORD_MAX_PARTS) {
            const sequence = journal.parts.length;
            try {
              const orphan = await hashVideo(this.partFile(journal.id, sequence));
              if (
                orphan.bytes > RECORD_CHUNK_BYTES ||
                journal.bytes + orphan.bytes > journal.maxBytes
              )
                throw new Error("Parte órfã excede o orçamento da sessão.");
              journal.parts.push({ sequence, ...orphan, durationMs: journal.durationMs });
              journal.bytes += orphan.bytes;
            } catch (error) {
              if (error instanceof Error && "code" in error && error.code === "ENOENT") break;
              throw error;
            }
          }
          journal.status = "interrupted";
          await this.write(journal);
        }
        items.push({
          sessionId: journal.id,
          created: journal.created,
          bytes: journal.bytes,
          durationMs: journal.durationMs,
          status: journal.status,
          libraryRoot: journal.libraryRoot,
        });
      } catch (error) {
        items.push({
          sessionId: entry.name,
          status: "damaged",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return items;
  }
  async commit<T>(
    id: string,
    libraryRoot: string,
    publish: (file: string, journal: RecordingJournal) => Promise<T>,
    readBack: (result: T) => Promise<void>,
  ) {
    return this.exclusive(id, async () => {
      const journal = await this.read(id);
      if (path.resolve(libraryRoot) !== journal.libraryRoot)
        throw new Error("Abra a biblioteca original antes de recuperar esta gravação.");
      if (!journal.bytes || journal.status === "recording")
        throw new Error("Finalize a gravação antes de recuperar.");
      const assembled = path.join(this.directory(id), "recording.webm");
      if (journal.status !== "committed") {
        let retained: Awaited<ReturnType<typeof hashVideo>> | undefined;
        try {
          retained = await hashVideo(assembled);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
        if (retained) {
          const expected = journal.sha256 ?? (await this.hashParts(journal));
          if (retained.bytes !== journal.bytes || retained.sha256 !== expected)
            throw new Error("Montagem de recuperação danificada; partes originais preservadas.");
          if (!journal.sha256) {
            journal.sha256 = expected;
            await this.write(journal);
          }
        } else {
          await assertVideoDiskSpace(
            this.directory(id),
            journal.bytes +
              Buffer.byteLength(JSON.stringify({ ...journal, sha256: "0".repeat(64) })),
          );
          const staging = path.join(this.directory(id), `${randomUUID()}.assembling`);
          const output = await fs.open(staging, "wx", 0o600);
          try {
            for (const part of journal.parts) {
              await this.verifyPart(id, part);
              const input = await fs.open(this.partFile(id, part.sequence), "r");
              try {
                for await (const chunk of input.createReadStream({
                  autoClose: false,
                  highWaterMark: COPY_BUFFER_BYTES,
                }))
                  await output.writeFile(chunk);
              } finally {
                await input.close();
              }
            }
            await output.sync();
          } catch (error) {
            await output.close();
            await fs.unlink(staging);
            throw error;
          }
          await output.close();
          await fs.rename(staging, assembled);
          const checksum = (await hashVideo(assembled)).sha256;
          if (journal.sha256 && journal.sha256 !== checksum)
            throw new Error("Montagem difere da gravação confirmada; originais preservados.");
          journal.sha256 = checksum;
          await this.write(journal);
        }
      }
      const result = await publish(assembled, journal);
      // Reading/issuing the authorized playback capability must succeed before raw cleanup.
      await readBack(result);
      journal.status = "committed";
      await this.write(journal);
      for (const part of journal.parts)
        await fs.rm(this.partFile(id, part.sequence), { force: true });
      await fs.rm(assembled, { force: true });
      return result;
    });
  }
}
