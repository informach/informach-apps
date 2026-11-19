import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { criarMundo } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { FOTOGRAFIA_ABERTA_MAX_BYTES } from "@informach/morada-sim/formatos";
import { describe, expect, it } from "vitest";
import { limitesDoJogo } from "@/features/jogos/config";
import { prepararFotoPessoalDoMorada as preparar } from "../../../../scripts/direitos/morada";

const mundoId = "00000000-0000-4000-8000-000000000001";
const perfilId = "00000000-0000-4000-8000-000000000002";
const outroId = "00000000-0000-4000-8000-000000000003";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const politica = { retirarTextosDaFundacao: true };
function fonte(bytes?: Buffer) {
  const mundo = criarMundo({
    mundoId,
    semente: 42,
    definicao: BAIRRO_DA_PROVA,
    fundadores: [perfilId, outroId],
  });
  const foto = mundo.fotografar();
  const corpo = bytes ?? gzipSync(JSON.stringify(foto));
  return {
    foto,
    bytes: corpo,
    meta: {
      mundoId,
      schemaVersion: foto.estado.versao,
      tick: foto.tick,
      sha256: sha(corpo),
      bytes: corpo.length,
    },
  };
}

describe("direitos: bytes privados do Morada", () => {
  it("retira o perfil do gzip íntegro e preserva o outro perfil e a origem", () => {
    const f = fonte(),
      original = Buffer.from(f.bytes);
    const resultado = preparar(f.bytes, f.meta, perfilId, politica);
    expect(resultado.schemaVersion).toBe(f.meta.schemaVersion);
    expect(resultado.tick).toBe(f.meta.tick);
    expect(sha(resultado.bytes)).toBe(resultado.sha256);
    const texto = gunzipSync(resultado.bytes).toString("utf-8");
    expect(texto).not.toContain(perfilId);
    expect(texto).toContain(outroId);
    expect(f.bytes.equals(original)).toBe(true);
    expect(JSON.parse(texto).estado.familias).toEqual(f.foto.estado.familias);
    expect(
      preparar(
        resultado.bytes,
        { ...f.meta, sha256: resultado.sha256, bytes: resultado.bytes.length },
        perfilId,
        politica,
      ).bytes,
    ).toEqual(resultado.bytes);
  });

  it.each(["checksum", "tamanho", "mundo", "tick", "formato"] as const)(
    "recusa metadado divergente: %s",
    (caso) => {
      const f = fonte();
      const meta: {
        mundoId: string;
        schemaVersion: number;
        tick: number;
        sha256: string;
        bytes: number;
      } = { ...f.meta };
      if (caso === "checksum") meta.sha256 = "0".repeat(64);
      if (caso === "tamanho") meta.bytes += 1;
      if (caso === "mundo") meta.mundoId = outroId;
      if (caso === "tick") meta.tick += 1;
      if (caso === "formato") meta.schemaVersion = 2;
      expect(() => preparar(f.bytes, meta, perfilId, politica)).toThrow();
    },
  );

  it("recusa gzip inválido, UTF-8 inválido e chaves JSON repetidas, mesmo com SHA correspondente", () => {
    const invalido = fonte(Buffer.from("não é gzip"));
    const utf8 = fonte(gzipSync(Buffer.from([0xff])));
    const normal = fonte();
    const duplicado = fonte(
      gzipSync(JSON.stringify(normal.foto).replace('"versao":1,', '"versao":7,"versao":1,')),
    );
    for (const f of [invalido, utf8, duplicado])
      expect(() => preparar(f.bytes, f.meta, perfilId, politica)).toThrowError(
        expect.objectContaining({ codigo: "INTEGRIDADE" }),
      );
  });

  it("limita o corpo comprimido antes de interpretar os bytes", () => {
    const bytes = Buffer.alloc(limitesDoJogo("morada").fotografiaMaxBytes + 1);
    const f = fonte(bytes);
    expect(() => preparar(f.bytes, f.meta, perfilId, politica)).toThrowError(
      expect.objectContaining({ codigo: "LIMITE" }),
    );
  });

  it("impede expansão além do orçamento compartilhado com o servidor", () => {
    const f = fonte(gzipSync(Buffer.alloc(FOTOGRAFIA_ABERTA_MAX_BYTES + 1, 32)));
    expect(f.bytes.length).toBeLessThan(limitesDoJogo("morada").fotografiaMaxBytes);
    expect(() => preparar(f.bytes, f.meta, perfilId, politica)).toThrowError(
      expect.objectContaining({ codigo: "LIMITE" }),
    );
  });
});
