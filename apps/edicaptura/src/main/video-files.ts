import { createHash, randomUUID } from "node:crypto";
import fs, { lstat, open, rename, unlink } from "node:fs/promises";
import path from "node:path";

export const MAX_VIDEO_BYTES = 32 * 1024 ** 3;
export const COPY_BUFFER_BYTES = 256 * 1024;
export const VIDEO_DISK_RESERVE_BYTES = 256 * 1024 ** 2;
/** Admission uses the filesystem receiving this allocation, including retained files. */
export async function assertVideoDiskSpace(directory: string, additionalBytes: number) {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0)
    throw new Error("Orçamento de disco inválido.");
  const disk = await fs.statfs(directory);
  if (disk.bavail * disk.bsize < VIDEO_DISK_RESERVE_BYTES + additionalBytes)
    throw new Error(
      "Disco sem espaço para concluir mantendo a reserva. Libere espaço e tente novamente.",
    );
}
export async function videoIdentity(file: string, max = MAX_VIDEO_BYTES) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > max)
    throw new Error("Vídeo ausente, inválido ou maior que o limite de disco.");
  return stat;
}

/** Main-owned paths only. Copy with a fixed buffer, verify the open file, sync, then publish. */
export async function copyVideo(source: string, destination: string, exclusive = false) {
  const expected = await videoIdentity(source);
  const temporary = path.join(path.dirname(destination), `.${randomUUID()}.video-part`);
  const input = await open(source, "r");
  let created = false;
  try {
    const opened = await input.stat();
    if (opened.ino !== expected.ino || opened.dev !== expected.dev)
      throw new Error("O vídeo foi substituído durante a leitura.");
    await assertVideoDiskSpace(path.dirname(destination), expected.size * (exclusive ? 2 : 1));
    const output = await open(temporary, "wx", 0o600);
    created = true;
    try {
      const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
      let total = 0;
      while (total < expected.size) {
        const { bytesRead } = await input.read(
          buffer,
          0,
          Math.min(buffer.length, expected.size - total),
          total,
        );
        if (!bytesRead) throw new Error("O vídeo mudou durante a cópia.");
        await output.writeFile(buffer.subarray(0, bytesRead));
        total += bytesRead;
      }
      const after = await input.stat();
      if (
        after.size !== expected.size ||
        after.mtimeMs !== expected.mtimeMs ||
        after.ctimeMs !== expected.ctimeMs
      )
        throw new Error("O vídeo mudou durante a cópia.");
      await output.sync();
    } finally {
      await output.close();
    }
    if (exclusive) {
      // COPYFILE_EXCL preserves batch-export's no-overwrite contract, including races.
      const { copyFile, constants } = await import("node:fs/promises");
      await copyFile(temporary, destination, constants.COPYFILE_EXCL);
      const final = await open(destination, "r+");
      try {
        await final.sync();
      } finally {
        await final.close();
      }
      await unlink(temporary);
    } else await rename(temporary, destination);
    created = false;
  } finally {
    await input.close();
    if (created) await unlink(temporary);
  }
}

export async function hashVideo(file: string) {
  const expected = await videoIdentity(file);
  const handle = await open(file, "r");
  try {
    const hash = createHash("sha256");
    let total = 0;
    for await (const bytes of handle.createReadStream({
      autoClose: false,
      highWaterMark: COPY_BUFFER_BYTES,
    })) {
      total += bytes.length;
      if (total > expected.size) throw new Error("O vídeo mudou durante a verificação.");
      hash.update(bytes);
    }
    const after = await handle.stat();
    if (
      total !== expected.size ||
      after.ino !== expected.ino ||
      after.dev !== expected.dev ||
      after.mtimeMs !== expected.mtimeMs
    )
      throw new Error("O vídeo mudou durante a verificação.");
    return { bytes: total, sha256: hash.digest("hex") };
  } finally {
    await handle.close();
  }
}
