import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";

const pathSchema = z
  .string()
  .min(1)
  .max(32768)
  .refine((value) => isAbsolute(value) && !value.includes("\0"));
const key = (path: string) => (process.platform === "win32" ? path.toLowerCase() : path);
const outputExtensions = new Set([
  ".ediaula",
  ".edifoto",
  ".edisvg",
  ".json",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".srt",
  ".vtt",
  ".svg",
  ".html",
  ".md",
]);
/** Flush beside the destination and replace only after the complete write succeeds. */
const queuedWrites = new Map<string, Promise<void>>();
export function atomicWrite(path: string, bytes: Uint8Array | string): Promise<void> {
  return serializeWrites([path], () => writeAtomic(path, bytes));
}
function serializeWrites<T>(paths: readonly string[], operation: () => Promise<T>): Promise<T> {
  const identities = paths.map((path) => key(resolve(path)));
  const previous = Promise.all(identities.map((identity) => queuedWrites.get(identity)));
  // A previous error is returned to its own caller. A later explicit save must
  // still be able to recover; both branches preserve the original call order.
  const next = previous.then(operation, operation);
  const marker = next.then(
    () => undefined,
    () => undefined,
  );
  for (const identity of identities) queuedWrites.set(identity, marker);
  const finished = () => {
    for (const identity of identities)
      if (queuedWrites.get(identity) === marker) queuedWrites.delete(identity);
  };
  marker.then(finished);
  return next;
}

/** Stage related outputs before touching user files. On a commit failure restore
 * previous bytes; a failed restoration preserves the recovery directory.
 * A filesystem cannot atomically replace several files together across a crash. */
export function withStagedFiles(
  destinations: readonly string[],
  operation: (staged: ReadonlyMap<string, string>) => Promise<void>,
  beforeCommit: () => void | Promise<void> = () => {},
): Promise<void> {
  if (
    !destinations.length ||
    new Set(destinations.map((path) => key(resolve(path)))).size !== destinations.length
  )
    throw new Error("Output destinations must be nonempty and unique");
  const first = destinations[0];
  if (!first || !destinations.every((path) => isAbsolute(path) && dirname(path) === dirname(first)))
    throw new Error("Related outputs must share an absolute parent directory");
  return serializeWrites(destinations, async () => {
    const directory = await mkdtemp(join(dirname(first), ".edi-output-"));
    const outputDirectory = join(directory, "outputs");
    const backupDirectory = join(directory, "backups");
    const backups = new Map<string, string>();
    const committed: string[] = [];
    let preserveRecovery = false;
    let failed = false;
    let failure: unknown;
    try {
      await mkdir(outputDirectory);
      await mkdir(backupDirectory);
      const staged = new Map(
        destinations.map((path) => [path, join(outputDirectory, basename(path))]),
      );
      await operation(staged);
      for (const [index, path] of destinations.entries()) {
        const output = staged.get(path);
        if (!output || !(await lstat(output)).isFile()) throw new Error("Missing staged output");
        await using handle = await open(output, "r+");
        await handle.sync();
        try {
          const original = await lstat(path);
          if (!original.isFile()) throw new Error("Cannot replace a non-file output");
          const backup = join(backupDirectory, `${index}.backup`);
          await copyFile(path, backup, constants.COPYFILE_EXCL);
          backups.set(path, backup);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
      }
      await beforeCommit();
      for (const path of destinations) {
        const output = staged.get(path);
        if (!output) throw new Error("Missing staged output mapping");
        await rename(output, path);
        committed.push(path);
      }
    } catch (error) {
      failed = true;
      failure = error;
      const recoveryFailures: unknown[] = [];
      for (const path of committed.reverse()) {
        try {
          const backup = backups.get(path);
          if (backup) await rename(backup, path);
          else await unlink(path);
        } catch (recoveryError) {
          recoveryFailures.push(recoveryError);
        }
      }
      if (recoveryFailures.length) {
        preserveRecovery = true;
        failure = new AggregateError(
          [error, ...recoveryFailures],
          `A recuperação precisa ser concluída a partir de ${directory}`,
        );
      }
    }
    if (!preserveRecovery) {
      try {
        await rm(directory, { recursive: true });
      } catch (cleanup) {
        if (failed) throw new AggregateError([failure, cleanup], "Output cleanup failed");
        throw new Error(
          `A exportação foi concluída, mas a limpeza das cópias temporárias em ${directory} falhou. Os arquivos finais foram preservados.`,
          { cause: cleanup },
        );
      }
    }
    if (failed) throw failure;
  });
}
async function writeAtomic(path: string, bytes: Uint8Array | string): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let created = false;
  try {
    {
      await using handle = await open(temporary, "wx", 0o600);
      created = true;
      await handle.writeFile(bytes);
      await handle.sync();
    }
    await rename(temporary, path);
  } catch (error) {
    if (!created) throw error;
    try {
      await unlink(temporary);
    } catch (cleanup) {
      if (!(cleanup instanceof Error && "code" in cleanup && cleanup.code === "ENOENT"))
        throw new AggregateError(
          [error, cleanup],
          "File write failed and temporary-file cleanup also failed",
        );
    }
    throw error;
  }
}
export function createFileAuthority(projectExtensions: readonly string[]) {
  const reads = new Set<string>();
  const writes = new Set<string>();
  const directories = new Set<string>();
  const pending = new Map<string, Promise<void>>();
  const recovery = (path: string) =>
    projectExtensions.some((extension) => path.toLowerCase().endsWith(`.${extension}`));
  async function canonical(path: string, writing = false) {
    const input = pathSchema.parse(path);
    try {
      return await realpath(input);
    } catch (error) {
      if (writing && error instanceof Error && "code" in error && error.code === "ENOENT")
        return join(await realpath(dirname(input)), basename(input));
      throw error;
    }
  }
  function inDirectory(path: string) {
    return [...directories].some((root) => {
      const child = relative(root, key(path));
      return child !== "" && !child.startsWith("..") && !isAbsolute(child);
    });
  }
  return {
    async grantRead(path: string) {
      const normalized = await canonical(path);
      if (!(await stat(normalized)).isFile()) throw new Error("Expected a selected file");
      reads.add(key(normalized));
      if (recovery(normalized)) writes.add(key(normalized));
    },
    async grantWrite(path: string) {
      const normalized = await canonical(path, true);
      if (!outputExtensions.has(extname(normalized).toLowerCase()))
        throw new Error("Unsupported output file format");
      writes.add(key(normalized));
      reads.add(key(normalized));
    },
    async grantDirectory(path: string) {
      const normalized = await canonical(path);
      if (!(await stat(normalized)).isDirectory())
        throw new Error("Expected a selected output directory");
      directories.add(key(normalized));
    },
    deferRead(path: string) {
      const input = pathSchema.parse(path);
      const operation = this.grantRead(input);
      pending.set(key(resolve(input)), operation);
      operation.catch(() => {
        console.error("[edi] dropped_file_permission_failed");
      });
    },
    async assertRead(path: string): Promise<string> {
      const input = pathSchema.parse(path);
      await pending.get(key(resolve(input)));
      const normalized = await canonical(input);
      if (!reads.has(key(normalized)))
        throw new Error("Selecione ou abra este arquivo antes de utilizá-lo.");
      return normalized;
    },
    async canRead(path: unknown): Promise<boolean> {
      const input = pathSchema.parse(path);
      await pending.get(key(resolve(input)));
      try {
        return reads.has(key(await canonical(input)));
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
        throw error;
      }
    },
    async assertWrite(path: string, restricted: boolean): Promise<string> {
      const normalized = await canonical(path, true);
      if (
        !outputExtensions.has(extname(normalized).toLowerCase()) ||
        (!writes.has(key(normalized)) && !inDirectory(normalized))
      )
        throw new Error("Escolha o destino pelo diálogo de salvamento.");
      if (restricted && !recovery(normalized))
        throw new Error(
          "A recuperação permite salvar o projeto existente, não exportar novos arquivos.",
        );
      return normalized;
    },
    /** Whether `path` was chosen as a destination (or lies in a chosen folder); false if its folder is gone. */
    async canWrite(path: unknown): Promise<boolean> {
      const input = pathSchema.parse(path);
      try {
        const normalized = await canonical(input, true);
        return (
          outputExtensions.has(extname(normalized).toLowerCase()) &&
          (writes.has(key(normalized)) || inDirectory(normalized))
        );
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
        throw error;
      }
    },
    /**
     * A file written beside an exported video or sound, named after it: its captions
     * (`aula.srt`, `aula.vtt`, translated as `aula.en.srt`), its thumbnail (`aula.jpg`) and the
     * platform package (`aula.plataforma.json`). Nothing else, nowhere else.
     */
    async assertRelatedExport(primary: string, path: string): Promise<string> {
      const selected = await this.assertWrite(primary, false);
      const related = await canonical(path, true);
      const ext = extname(related).toLowerCase();
      const base = key(basename(selected, extname(selected)));
      const name = key(basename(related, extname(related)));
      const named =
        name === base ||
        ([".srt", ".vtt"].includes(ext) &&
          name.startsWith(`${base}.`) &&
          /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(name.slice(base.length + 1))) ||
        (ext === ".json" && name === `${base}.plataforma`);
      if (
        ![".mp4", ".mp3"].includes(extname(selected).toLowerCase()) ||
        ![".srt", ".vtt", ".jpg", ".json"].includes(ext) ||
        (ext === ".json" && name === base) ||
        key(dirname(selected)) !== key(dirname(related)) ||
        !named
      )
        throw new Error("A saída auxiliar não pertence ao vídeo selecionado.");
      return related;
    },
    async canReadAll(raw: unknown): Promise<boolean[]> {
      const paths = z.array(pathSchema).max(5000).parse(raw);
      return Promise.all(paths.map((path) => this.canRead(path)));
    },
    async grantReadAll(paths: readonly string[]) {
      for (const path of paths) await this.grantRead(path);
    },
  };
}
/** Validate structured IPC values before passing them to an editor-specific contract. */
export function validateIpcValues(values: unknown[]) {
  let nodes = 0;
  function visit(value: unknown, depth: number) {
    if (++nodes > 100000 || depth > 50) throw new Error("IPC structure exceeds limit");
    if (value === null || value === undefined || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Invalid IPC number");
      return;
    }
    if (typeof value === "string") {
      if (value.length > 32 * 1024 ** 2) throw new Error("IPC string exceeds limit");
      return;
    }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      if (value.byteLength > 512 * 1024 ** 2) throw new Error("IPC binary exceeds limit");
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (
      typeof value === "object" &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))
    ) {
      for (const [name, child] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(name))
          throw new Error("Unsafe IPC property");
        visit(child, depth + 1);
      }
      return;
    }
    throw new Error("Unsupported IPC value");
  }
  visit(values, 0);
}
