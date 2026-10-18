import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MAX_VIDEO_BYTES } from "./video-files.ts";
import { writeWindowsFileDrop } from "./windows-file-clipboard.mts";

type ExportFormat = "png" | "jpg" | "webp" | "webm" | "mp4" | "gif";
interface ExportIdentity {
  file: string;
  format: ExportFormat;
  size: number;
  ino: number;
  dev: number;
  mtime: number;
  ctime: number;
  sha256: string;
}
async function identity(file: string, format: ExportFormat): Promise<ExportIdentity> {
  const maximum = ["webm", "mp4", "gif"].includes(format) ? MAX_VIDEO_BYTES : 400_000_000;
  const stat = await fs.lstat(file);
  if (
    !path.isAbsolute(file) ||
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    !stat.size ||
    stat.size > maximum
  )
    throw new Error("Arquivo final inválido ou maior que 400 MB. Exporte novamente.");
  const handle = await fs.open(file, "r");
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev)
      throw new Error("Arquivo final substituído. Exporte novamente.");
    const hash = createHash("sha256");
    let total = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      total += chunk.length;
      if (total > maximum) throw new Error("Arquivo final excede o limite do formato.");
      hash.update(chunk);
    }
    const after = await handle.stat();
    if (total !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs)
      throw new Error("Arquivo final mudou durante a leitura. Exporte novamente.");
    return {
      file,
      format,
      size: stat.size,
      ino: stat.ino,
      dev: stat.dev,
      mtime: stat.mtimeMs,
      ctime: stat.ctimeMs,
      sha256: hash.digest("hex"),
    };
  } finally {
    await handle.close();
  }
}
export class FinalExport {
  private current: ExportIdentity | null = null;
  private generation = 0;
  async remember(file: string, format: ExportFormat) {
    const generation = ++this.generation;
    this.current = null;
    const result = await identity(file, format);
    if (generation === this.generation) this.current = result;
  }
  async validated() {
    const recorded = this.current;
    if (!recorded) throw new Error("Exporte um arquivo antes de copiar o arquivo ou seu caminho.");
    let actual: ExportIdentity;
    try {
      actual = await identity(recorded.file, recorded.format);
    } catch (cause) {
      throw new Error("O arquivo exportado não está mais disponível. Exporte novamente.", {
        cause,
      });
    }
    if (this.current !== recorded || JSON.stringify(actual) !== JSON.stringify(recorded))
      throw new Error("O arquivo exportado foi alterado ou substituído. Exporte novamente.");
    return actual;
  }
  async copyFile(assertAccess: () => void) {
    const result = await this.validated();
    if (result.size > 400_000_000)
      throw new Error(
        "O vídeo foi exportado; copiar arquivo para a área de transferência aceita até 400 MB. Use o arquivo salvo.",
      );
    assertAccess();
    await writeWindowsFileDrop(result.file, result.sha256, result.size);
    return result.file;
  }
}
