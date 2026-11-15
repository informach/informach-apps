import { gunzipSync } from "node:zlib";

/** Orçamento de recuperação em memória; independente do teto de bytes comprimidos do catálogo. */
const MAX_DESCOMPACTADA_BYTES = 64 * 1024 * 1024;

export function decodificarFotografia(bytes: Uint8Array): unknown {
  const texto = new TextDecoder("utf-8", { fatal: true }).decode(
    gunzipSync(bytes, { maxOutputLength: MAX_DESCOMPACTADA_BYTES }),
  );
  return JSON.parse(texto);
}
