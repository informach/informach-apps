import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ZodType } from "zod";
import { atomicWrite } from "./files.ts";

export interface LocalCodec {
  encode(value: string): Uint8Array;
  decode(value: Uint8Array): string;
}
const plain: LocalCodec = {
  encode: (value) => new TextEncoder().encode(value),
  decode: (value) => new TextDecoder("utf-8", { fatal: true }).decode(value),
};
const missing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";
/** Invalid data is preserved and reported; only an absent file yields defaults. */
export function createValidatedStore<T>(
  root: string,
  filename: string,
  schema: ZodType<T>,
  defaults: T,
  codec: LocalCodec = plain,
) {
  if (!/^[a-z0-9-]+\.(json|bin)$/.test(filename))
    throw new Error("Arquivo de dados locais inválido.");
  const path = join(root, filename),
    limit = 48 * 1024 * 1024;
  let tail = Promise.resolve();
  const read = async (): Promise<T> => {
    let bytes: Uint8Array;
    try {
      if ((await stat(path)).size > limit) throw new Error("Tamanho acima do limite local.");
      bytes = await readFile(path);
    } catch (error) {
      if (missing(error)) return schema.parse(defaults);
      throw error;
    }
    try {
      return schema.parse(JSON.parse(codec.decode(bytes)));
    } catch {
      throw new Error(
        `O arquivo local ${filename} está inválido e foi preservado. Abra Preferências para reparar os dados locais.`,
      );
    }
  };
  const write = async (raw: unknown): Promise<T> => {
    const value = schema.parse(raw),
      encoded = codec.encode(JSON.stringify(value));
    if (encoded.length > limit) throw new Error("Dados locais acima do limite de 48 MB.");
    await mkdir(root, { recursive: true });
    await atomicWrite(path, encoded);
    return value;
  };
  const serial = <R>(operation: () => Promise<R>): Promise<R> => {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return {
    read,
    write: (value: unknown) => serial(() => write(value)),
    update: (operation: (current: T) => T) => serial(async () => write(operation(await read()))),
    reset: () =>
      serial(async () => {
        let backup: string | null = null;
        try {
          backup = join(root, `${filename}.${Date.now()}.${randomUUID()}.backup`);
          await copyFile(path, backup, constants.COPYFILE_EXCL);
        } catch (error) {
          if (missing(error)) backup = null;
          else throw error;
        }
        const value = await write(defaults);
        return { value, backup };
      }),
  };
}
