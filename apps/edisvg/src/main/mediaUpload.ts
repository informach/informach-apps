import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  RASTER_EXTENSIONS,
  RASTER_FORMATS,
  RASTER_LIMITS,
  RASTER_SLICE_BYTES,
} from "../shared/raster/limits";
import { suggestedNameSchema } from "./exportPayload";

const limitByExtension = new Map<string, number>(
  RASTER_FORMATS.map((format) => [RASTER_EXTENSIONS[format], RASTER_LIMITS.maxBytes[format]]),
);
const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "png.zip": (bytes) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4,
  gif: (bytes) => String.fromCharCode(...bytes.subarray(0, 6)) === "GIF89a",
  mp4: (bytes) => String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp",
  webm: (bytes) => bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3,
};
const headerSchema = z.strictObject({
  extension: z.enum(Object.values(RASTER_EXTENSIONS) as [string, ...string[]]),
  size: z.number().int().min(8),
  name: suggestedNameSchema.optional(),
});

interface Upload {
  id: string;
  extension: string;
  name?: string;
  bytes: Buffer;
  received: number;
}

/** One export in flight at a time: the bytes are staged in a buffer of the announced size and
 * handed to the save only when every slice arrived and the content matches its format. */
export function createMediaUploads() {
  let current: Upload | undefined;
  const active = (id: unknown) => {
    if (!current || current.id !== id)
      throw new Error("Envio da exportação inexistente ou expirado.");
    return current;
  };
  function fail(message: string): never {
    current = undefined;
    throw new Error(message);
  }
  return {
    begin(input: unknown) {
      current = undefined;
      const header = headerSchema.parse(input, { jitless: true });
      if (header.size > (limitByExtension.get(header.extension) ?? 0))
        throw new Error("Imagem ou vídeo exportado excede o limite de tamanho.");
      current = {
        id: randomUUID(),
        extension: header.extension,
        ...(header.name ? { name: header.name } : {}),
        bytes: Buffer.allocUnsafe(header.size),
        received: 0,
      };
      return current.id;
    },
    append(id: unknown, slice: unknown) {
      const upload = active(id);
      if (
        !(slice instanceof Uint8Array) ||
        slice.byteLength < 1 ||
        slice.byteLength > RASTER_SLICE_BYTES
      )
        fail("Parte da exportação inválida.");
      if (upload.received + slice.byteLength > upload.bytes.length)
        fail("A exportação enviou mais bytes do que anunciou.");
      upload.bytes.set(slice, upload.received);
      upload.received += slice.byteLength;
    },
    /** Hands the complete file over and forgets it; a failed check also forgets it. */
    finish(id: unknown): { extension: string; content: Buffer; name?: string } {
      const upload = active(id);
      current = undefined;
      if (upload.received !== upload.bytes.length)
        throw new Error("A exportação chegou incompleta.");
      if (!signatures[upload.extension]?.(upload.bytes))
        throw new Error("Conteúdo não corresponde ao formato exportado.");
      return {
        extension: upload.extension,
        content: upload.bytes,
        ...(upload.name ? { name: upload.name } : {}),
      };
    },
    discard(id: unknown) {
      if (current?.id === id) current = undefined;
    },
  };
}
