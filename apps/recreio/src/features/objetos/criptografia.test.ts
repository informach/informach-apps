import { createHash, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { criarCifradorDeObjetos, FalhaDoObjetoPrivado } from "./criptografia";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const chave = randomBytes(32);
const configurar = (keys = new Map([["chave-1", chave]]), ativa = "chave-1") =>
  criarCifradorDeObjetos({ chaveAtiva: ativa, chaves: keys, limiteBytes: 4096 });
const contexto = { tipo: "fotografia", id: randomUUID() } as const;
const corpo = Buffer.from("CONTEUDO_PRIVADO_NAO_PUBLICAR\u0000\u00ff", "utf8");

describe("envelope privado AES-256-GCM", () => {
  it("reabre bytes exatos, sem conteúdo/chave no objeto, e usa IV novo por gravação", () => {
    const c = configurar();
    const a = c.cifrar(contexto, corpo),
      b = c.cifrar(contexto, corpo);
    expect(c.abrir(a.referencia, a.bytes)).toEqual(corpo);
    expect(c.abrir(b.referencia, b.bytes)).toEqual(corpo);
    expect(a.bytes.equals(b.bytes)).toBe(false);
    expect(a.referencia.sha256).toBe(sha(corpo));
    expect(a.referencia.sha256Cifrado).toBe(sha(a.bytes));
    expect(a.bytes.includes(corpo)).toBe(false);
    expect(a.bytes.includes(chave)).toBe(false);
    expect(corpo.toString()).toContain("CONTEUDO_PRIVADO_NAO_PUBLICAR");
  });
  it("rotaciona mantendo leitura da chave anterior e copia a configuração recebida", () => {
    const antiga = Buffer.from(chave);
    const mapa = new Map([["chave-1", antiga]]);
    const c = configurar(mapa);
    const a = c.cifrar(contexto, corpo);
    antiga.fill(0);
    mapa.clear();
    expect(c.abrir(a.referencia, a.bytes)).toEqual(corpo);
    const nova = configurar(
      new Map([
        ["chave-1", chave],
        ["chave-2", randomBytes(32)],
      ]),
      "chave-2",
    );
    expect(nova.abrir(a.referencia, a.bytes)).toEqual(corpo);
    expect(nova.cifrar(contexto, corpo).referencia.chaveId).toBe("chave-2");
    const soNova = configurar(new Map([["chave-2", randomBytes(32)]]), "chave-2");
    expect(() => soNova.abrir(a.referencia, a.bytes)).toThrowError(
      expect.objectContaining({ codigo: "CHAVE_INDISPONIVEL" }),
    );
  });
  it.each(["cifra", "tag", "iv", "cabecalho"] as const)(
    "adulterar %s não abre mesmo com checksum externo recalculado",
    (tipo) => {
      const c = configurar(),
        a = c.cifrar(contexto, corpo);
      const b = Buffer.from(a.bytes);
      const fim = 10 + b.readUInt16BE(8);
      if (tipo === "cifra") b[fim + 12] = (b[fim + 12] ?? 0) ^ 1;
      if (tipo === "tag") b[b.length - 1] = (b.at(-1) ?? 0) ^ 1;
      if (tipo === "iv") b[fim] = (b[fim] ?? 0) ^ 1;
      let referencia = { ...a.referencia, sha256Cifrado: sha(b) };
      if (tipo === "cabecalho") {
        const antigo = Buffer.from(contexto.id),
          novo = Buffer.from(randomUUID());
        const indice = b.indexOf(antigo);
        expect(indice).toBeGreaterThan(9);
        novo.copy(b, indice);
        referencia = {
          ...referencia,
          contexto: { ...contexto, id: novo.toString() },
          sha256Cifrado: sha(b),
        };
      }
      expect(() => c.abrir(referencia, b)).toThrowError(
        expect.objectContaining({ codigo: "INTEGRIDADE" }),
      );
    },
  );
  it.each([
    "contexto",
    "tipo",
    "tamanho",
    "digest",
    "chave",
    "truncado",
    "sobras",
    "envelope",
    "referencia",
  ] as const)("recusa %s divergente sem devolver conteúdo", (tipo) => {
    const c = configurar(),
      a = c.cifrar(contexto, corpo);
    const r =
      tipo === "contexto"
        ? { ...a.referencia, contexto: { ...contexto, id: randomUUID() } }
        : tipo === "tipo"
          ? { ...a.referencia, contexto: { ...contexto, tipo: "backup" } }
          : tipo === "tamanho"
            ? { ...a.referencia, bytes: corpo.length + 1 }
            : tipo === "digest"
              ? { ...a.referencia, sha256: "0".repeat(64) }
              : tipo === "referencia"
                ? { ...a.referencia, url: "https://example.test" }
                : a.referencia;
    const bytes =
      tipo === "truncado"
        ? a.bytes.subarray(0, -1)
        : tipo === "sobras"
          ? Buffer.concat([a.bytes, Buffer.alloc(1)])
          : tipo === "envelope"
            ? Buffer.from("nao cifrado")
            : a.bytes;
    const ler = tipo === "chave" ? configurar(new Map([["chave-1", randomBytes(32)]])) : c;
    expect(() => ler.abrir(r, bytes)).toThrow(FalhaDoObjetoPrivado);
  });
  it("valida limites antes de copiar bytes e não aceita configuração inválida", () => {
    const c = configurar();
    expect(() => c.cifrar(contexto, Buffer.alloc(4097))).toThrowError(
      expect.objectContaining({ codigo: "LIMITE" }),
    );
    const grande = criarCifradorDeObjetos({
      chaveAtiva: "chave-1",
      chaves: new Map([["chave-1", chave]]),
      limiteBytes: 8192,
    }).cifrar(contexto, Buffer.alloc(4097));
    expect(() => c.abrir(grande.referencia, grande.bytes)).toThrowError(
      expect.objectContaining({ codigo: "LIMITE" }),
    );
    for (const limiteBytes of [0, -1, NaN, Infinity, 1.1, 256 * 1024 * 1024 + 1])
      expect(() =>
        criarCifradorDeObjetos({
          chaveAtiva: "chave-1",
          chaves: new Map([["chave-1", chave]]),
          limiteBytes,
        }),
      ).toThrow(FalhaDoObjetoPrivado);
    expect(() => configurar(new Map([["chave-1", randomBytes(31)]]))).toThrow(FalhaDoObjetoPrivado);
    expect(() => configurar(new Map(), "ausente")).toThrow(FalhaDoObjetoPrivado);
    expect(() => configurar(new Map([["chave invalida", chave]]), "chave invalida")).toThrow(
      FalhaDoObjetoPrivado,
    );
  });
});
