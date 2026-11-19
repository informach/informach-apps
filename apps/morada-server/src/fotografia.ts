import { gunzipSync } from "node:zlib";
import { FOTOGRAFIA_ABERTA_MAX_BYTES } from "@informach/morada-sim/formatos";

export function decodificarFotografia(bytes: Uint8Array): unknown {
  const texto = new TextDecoder("utf-8", { fatal: true }).decode(
    gunzipSync(bytes, { maxOutputLength: FOTOGRAFIA_ABERTA_MAX_BYTES }),
  );
  return JSON.parse(texto);
}
