import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodificarFotografia } from "./fotografia";

describe("leitura limitada da fotografia", () => {
  it("conserva o documento JSON e recusa gzip/UTF-8 inválidos", () => {
    const documento = { formato: "morada.foto", mundoId: "mundo", nome: "Família Ipê" };
    expect(decodificarFotografia(gzipSync(JSON.stringify(documento)))).toEqual(documento);
    expect(() => decodificarFotografia(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => decodificarFotografia(gzipSync(new Uint8Array([0xff])))).toThrow();
  });

  it("interrompe a expansão acima de 64 MiB mesmo quando a entrada comprimida é pequena", () => {
    const comprimida = gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1, 32));
    expect(comprimida.length).toBeLessThan(128 * 1024);
    expect(() => decodificarFotografia(comprimida)).toThrow(
      expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
    );
  });
});
