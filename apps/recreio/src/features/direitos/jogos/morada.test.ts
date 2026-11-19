import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { jogoPorId } from "@informach/config/jogos";
import { criarMundo, restaurar } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { FOTOGRAFIA_ABERTA_MAX_BYTES } from "@informach/morada-sim/formatos";
import { describe, expect, it } from "vitest";
import {
  prepararFotoPessoalDoMorada as preparar,
  prepararRecuperacaoDoMorada,
} from "../../../../scripts/direitos/morada";

const mundoId = "00000000-0000-4000-8000-000000000001";
const perfilId = "00000000-0000-4000-8000-000000000002";
const outroId = "00000000-0000-4000-8000-000000000003";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const politica = { retirarTextosDaFundacao: true };
const manifesto = jogoPorId("morada");
if (!manifesto) throw new Error("Morada absent from canonical catalog");
const fotografiaMaxBytes = manifesto.limites.fotografiaMaxBytes;
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
    const bytes = Buffer.alloc(fotografiaMaxBytes + 1);
    const f = fonte(bytes);
    expect(() => preparar(f.bytes, f.meta, perfilId, politica)).toThrowError(
      expect.objectContaining({ codigo: "LIMITE" }),
    );
  });

  it("impede expansão além do orçamento compartilhado com o servidor", () => {
    const f = fonte(gzipSync(Buffer.alloc(FOTOGRAFIA_ABERTA_MAX_BYTES + 1, 32)));
    expect(f.bytes.length).toBeLessThan(fotografiaMaxBytes);
    expect(() => preparar(f.bytes, f.meta, perfilId, politica)).toThrowError(
      expect.objectContaining({ codigo: "LIMITE" }),
    );
  });
  function diarioDaRetirada(f: ReturnType<typeof fonte>) {
    const mundo = restaurar(f.foto),
      acesso = mundo.estado.acessos.find((a) => a.perfilId === perfilId);
    if (!acesso) throw new Error("Access absent");
    mundo.aplicar({ t: "revogar_acesso", perfilId, familiaId: acesso.familiaId });
    const fatos = mundo.avancar(0).fatos;
    return {
      diarioFonte: 0,
      diarioFinal: fatos.length,
      entradas: fatos.map((f, i) => ({
        seq: i + 1,
        tick: f.tick,
        fatoId: f.id,
        bytes: Buffer.from(JSON.stringify(f)),
      })),
    };
  }
  it("recupera os fatos confirmados sem alterar o corpo de origem", () => {
    const f = fonte(),
      original = Buffer.from(f.bytes),
      diario = diarioDaRetirada(f);
    const resultado = prepararRecuperacaoDoMorada(f.bytes, f.meta, diario),
      texto = gunzipSync(resultado.bytes).toString("utf-8");
    expect(texto).not.toContain(perfilId);
    expect(texto).toContain(outroId);
    expect(f.bytes).toEqual(original);
    expect(resultado.schemaVersion).toBe(3);
    expect(resultado.sha256).toBe(sha(resultado.bytes));
  });
  it("diário com buraco, identidade divergente ou JSON inválido não produz foto", () => {
    const f = fonte(),
      diario = diarioDaRetirada(f),
      entrada = diario.entradas[0];
    if (!entrada) throw new Error("Journal absent");
    for (const e of [
      { ...entrada, seq: 2 },
      { ...entrada, fatoId: "outro-fato" },
      { ...entrada, tick: entrada.tick + 1 },
    ])
      expect(() =>
        prepararRecuperacaoDoMorada(f.bytes, f.meta, { ...diario, entradas: [e] }),
      ).toThrowError(expect.objectContaining({ codigo: "INTEGRIDADE" }));
    expect(() =>
      prepararRecuperacaoDoMorada(f.bytes, f.meta, {
        ...diario,
        entradas: [{ ...entrada, bytes: Buffer.from("{") }],
      }),
    ).toThrow(/^morada.journal.INTEGRIDADE$/);
    expect(() =>
      prepararRecuperacaoDoMorada(f.bytes, f.meta, {
        ...diario,
        diarioFinal: diario.diarioFinal + 1,
      }),
    ).toThrowError(expect.objectContaining({ codigo: "INTEGRIDADE" }));
  });
  it.each([1, 2])("conserva o formato V%s ao recuperar fatos compatíveis", (versao) => {
    const f = fonte(),
      diario = diarioDaRetirada(f);
    const { loja, catalogoDePinturas, edicoes, historicoDaCasa, ...v2 } = f.foto.estado;
    const { revisao_objeto, ...contadores } = v2.contadores;
    const objetos = {
      ...v2.objetos,
      porId: Object.fromEntries(
        Object.entries(v2.objetos.porId).map(([id, objeto]) => {
          const { revisao, pintura, ...antigo } = objeto;
          return [id, antigo];
        }),
      ),
    };
    const legado2 = { ...v2, versao: 2, contadores, objetos };
    const { fundacao, catalogoDeAparencias, ...v1 } = legado2;
    const foto = { ...f.foto, estado: versao === 1 ? { ...v1, versao: 1 } : legado2 },
      bytes = gzipSync(JSON.stringify(foto));
    const r = prepararRecuperacaoDoMorada(
      bytes,
      { ...f.meta, schemaVersion: versao, sha256: sha(bytes), bytes: bytes.byteLength },
      diario,
    );
    expect(r.schemaVersion).toBe(versao);
    expect(JSON.parse(gunzipSync(r.bytes).toString("utf-8")).estado.versao).toBe(versao);
  });
});
