import { open } from "node:fs/promises";

/** One descriptor and a sentinel byte bound a regular file even if it grows
 * after stat. The native-dialog caller owns the path, never the renderer. */
export async function readBoundedBytes(path: string, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 32_000_000)
    throw new Error("Limite de leitura inválido.");
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("Selecione um arquivo regular.");
    if (info.size > maxBytes) throw new Error("Arquivo excede o limite de bytes permitido.");
    const bytes = Buffer.alloc(maxBytes + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await handle.read(bytes, used, bytes.length - used, used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > maxBytes) throw new Error("Arquivo excede o limite de bytes permitido.");
    return bytes.subarray(0, used);
  } finally {
    await handle.close();
  }
}
