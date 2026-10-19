import { open } from "node:fs/promises";

/** Reads a regular file through one handle, with a bound even if it grows while being read. */
export async function readBoundedFile(path: string, maximum: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 512 * 1024 * 1024)
    throw new Error("Limite de leitura inválido.");
  const handle = await open(path, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > maximum)
      throw new Error(
        `Escolha um arquivo não vazio de até ${Math.round(maximum / 1024 / 1024)} MB.`,
      );
    const buffer = new Uint8Array(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        Math.min(buffer.length - offset, 1024 * 1024),
        offset,
      );
      if (!bytesRead) throw new Error("O arquivo mudou durante a leitura. Escolha-o novamente.");
      offset += bytesRead;
    }
    const extra = await handle.read(new Uint8Array(1), 0, 1, offset),
      after = await handle.stat();
    if (
      extra.bytesRead ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw new Error("O arquivo mudou durante a leitura. Escolha-o novamente.");
    return buffer;
  } finally {
    await handle.close();
  }
}
