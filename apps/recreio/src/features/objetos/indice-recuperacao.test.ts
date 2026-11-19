import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { criarIndiceDeRecuperacao } from "../../../scripts/backup/indice-recuperacao";

function fixture() {
  const id = randomUUID(),
    destino = {
      bucketId: randomUUID(),
      bucketName: "recreio-fixture",
      escopo: "qualification" as const,
    },
    chaves = new Map([
      ["v1", randomBytes(32)],
      ["v2", randomBytes(32)],
    ]);
  const publicacao = {
    tipo: "publicado",
    capturaId: id,
    destino,
    source: "b".repeat(40),
    iniciadaEm: "2026-11-19T00:00:00.000Z",
    conferidaEm: "2026-11-19T00:01:00.000Z",
    arquivo: {
      formato: "recreio-arquivo-cifrado-v1",
      chaveId: "v1",
      contexto: { tipo: "backup", id },
      bytes: 1234,
      sha256: "a".repeat(64),
      sha256Cifrado: "b".repeat(64),
      bytesCifrados: 1414,
    },
    composto: {
      formato: "recreio-captura-composta-v1",
      capturaId: id,
      bytes: 1234,
      sha256: "a".repeat(64),
    },
    inventario: { quantidade: 2, bytesCifrados: 400, sha256: "c".repeat(64) },
  };
  const retirada = {
    tipo: "retirado",
    capturaId: id,
    destino,
    source: "b".repeat(40),
    registradaEm: "2026-11-19T00:00:30.000Z",
    arquivoSha256Cifrado: publicacao.arquivo.sha256Cifrado,
    motivo: "abandonado",
  };
  const indice = criarIndiceDeRecuperacao({ destino, chaveAtiva: "v2", chaves });
  return { id, destino, chaves, publicacao, retirada, indice };
}
function registro(bytes: Uint8Array) {
  return z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.from(bytes).toString("utf8")));
}
function alterar(bytes: Uint8Array, fn: (v: Record<string, unknown>) => void) {
  const r = registro(bytes);
  fn(r);
  return Buffer.from(JSON.stringify(r));
}

describe("índice privado de recuperação: HMAC, rotação e retirada", () => {
  it("publicação canônica é idempotente e vincula ambos os arquivos", () => {
    const f = fixture(),
      a = f.indice.assinar(f.publicacao),
      b = f.indice.assinar(f.publicacao);
    expect(a).toEqual(b);
    expect(f.indice.conferir(a, f.id)).toEqual(f.publicacao);
    expect(f.indice.conferirDisponivel(a, { tipo: "ausente" }, f.id)).toEqual(f.publicacao);
    for (const k of f.chaves.values()) expect(a.includes(k)).toBe(false);
    f.indice.encerrar();
  });
  it("retirada prevalece sobre publicação tardia, sem depender de LastModified", () => {
    const f = fixture(),
      p = f.indice.assinar(f.publicacao),
      r = f.indice.assinar(f.retirada);
    expect(f.indice.conferir(r, f.id)).toEqual(f.retirada);
    expect(() => f.indice.conferirDisponivel(p, { tipo: "encontrada", bytes: r }, f.id)).toThrow(
      expect.objectContaining({ codigo: "RETIRADO" }),
    );
    f.indice.encerrar();
  });
  it("resultado inconclusivo da retirada nunca equivale a ausência", () => {
    const f = fixture(),
      p = f.indice.assinar(f.publicacao);
    expect(() => f.indice.conferirDisponivel(p, { tipo: "inconclusiva" }, f.id)).toThrow(
      expect.objectContaining({ codigo: "INCONCLUSIVO" }),
    );
    f.indice.encerrar();
  });
  it("retirada assinada com outro SHA é contradição, não é ignorada", () => {
    const f = fixture(),
      p = f.indice.assinar(f.publicacao),
      r = f.indice.assinar({ ...f.retirada, arquivoSha256Cifrado: "d".repeat(64) });
    expect(() => f.indice.conferirDisponivel(p, { tipo: "encontrada", bytes: r }, f.id)).toThrow(
      expect.objectContaining({ codigo: "INTEGRIDADE" }),
    );
    f.indice.encerrar();
  });
  it.each(["source", "data", "destino", "mac"] as const)(
    "alteração de %s sem chave não é autenticada",
    (caso) => {
      const f = fixture(),
        a = f.indice.assinar(f.publicacao);
      const b = alterar(a, (r) => {
        if (caso === "mac") {
          r.mac = "d".repeat(64);
          return;
        }
        const c = z.record(z.string(), z.unknown()).parse(r.corpo);
        if (caso === "source") c.source = "d".repeat(40);
        else if (caso === "data") c.conferidaEm = "2026-11-19T00:02:00.000Z";
        else c.destino = { ...f.destino, bucketName: "recreio-outro" };
        r.corpo = c;
      });
      expect(() => f.indice.conferir(b, f.id)).toThrow(
        expect.objectContaining({ codigo: "INTEGRIDADE" }),
      );
      f.indice.encerrar();
    },
  );
  it("chave AES não é aceita diretamente como chave HMAC", () => {
    const f = fixture(),
      a = f.indice.assinar(f.publicacao),
      r = registro(a);
    delete r.mac;
    const k = f.chaves.get("v2");
    if (!k) throw new Error("Chave ausente");
    const mac = createHmac("sha256", k)
        .update(Buffer.from("recreio:backup-index:v1\0"))
        .update(JSON.stringify(r))
        .digest("hex"),
      forjado = Buffer.from(JSON.stringify({ ...r, mac }));
    expect(() => f.indice.conferir(forjado, f.id)).toThrow(
      expect.objectContaining({ codigo: "INTEGRIDADE" }),
    );
    f.indice.encerrar();
  });
  it.each(["contexto", "sha", "bytes", "composto"] as const)(
    "referências divergentes (%s) não são assinadas",
    (caso) => {
      const f = fixture();
      const p = {
        ...f.publicacao,
        arquivo: { ...f.publicacao.arquivo, contexto: { ...f.publicacao.arquivo.contexto } },
        composto: { ...f.publicacao.composto },
      };
      if (caso === "contexto") p.arquivo.contexto.id = randomUUID();
      else if (caso === "sha") p.arquivo.sha256 = "d".repeat(64);
      else if (caso === "bytes") p.composto.bytes++;
      else p.composto.capturaId = randomUUID();
      expect(() => f.indice.assinar(p)).toThrow(expect.objectContaining({ codigo: "INTEGRIDADE" }));
      f.indice.encerrar();
    },
  );
  it("nova chave verifica publicação assinada com versão antiga conservada", () => {
    const f = fixture(),
      antigo = criarIndiceDeRecuperacao({ destino: f.destino, chaveAtiva: "v1", chaves: f.chaves }),
      a = antigo.assinar(f.publicacao);
    expect(f.indice.conferir(a, f.id)).toEqual(f.publicacao);
    antigo.encerrar();
    f.indice.encerrar();
  });
  it("ausência da chave de assinatura não usa fallback atual", () => {
    const f = fixture(),
      antigo = criarIndiceDeRecuperacao({ destino: f.destino, chaveAtiva: "v1", chaves: f.chaves }),
      a = antigo.assinar(f.publicacao),
      k = f.chaves.get("v2");
    if (!k) throw new Error("Chave ausente");
    const novo = criarIndiceDeRecuperacao({
      destino: f.destino,
      chaveAtiva: "v2",
      chaves: new Map([["v2", k]]),
    });
    expect(() => novo.conferir(a, f.id)).toThrow(
      expect.objectContaining({ codigo: "CHAVE_INDISPONIVEL" }),
    );
    novo.encerrar();
    antigo.encerrar();
    f.indice.encerrar();
  });
  it("assinatura conhecida não encobre chave de arquivo indisponível", () => {
    const f = fixture(),
      a = f.indice.assinar(f.publicacao),
      k = f.chaves.get("v2");
    if (!k) throw new Error("Chave ausente");
    const novo = criarIndiceDeRecuperacao({
      destino: f.destino,
      chaveAtiva: "v2",
      chaves: new Map([["v2", k]]),
    });
    expect(() => novo.conferir(a, f.id)).toThrow(
      expect.objectContaining({ codigo: "CHAVE_INDISPONIVEL" }),
    );
    expect(() => novo.assinar(f.publicacao)).toThrow(
      expect.objectContaining({ codigo: "CHAVE_INDISPONIVEL" }),
    );
    novo.encerrar();
    f.indice.encerrar();
  });
  it("chaveiro e destino admitidos são cópias independentes", () => {
    const f = fixture(),
      p = { ...f.publicacao, destino: { ...f.destino } },
      a = f.indice.assinar(p);
    for (const k of f.chaves.values()) k.fill(0);
    f.chaves.clear();
    f.destino.bucketName = "recreio-alterado";
    expect(f.indice.assinar(p)).toEqual(a);
    expect(f.indice.conferir(a, f.id)).toEqual(p);
    f.indice.encerrar();
  });
  it.each(["campos", "duplicada", "espacos", "mac_curto", "excesso"] as const)(
    "documento não canônico/inválido (%s) falha fechado",
    (caso) => {
      const f = fixture(),
        a = f.indice.assinar(f.publicacao);
      const b =
        caso === "campos"
          ? alterar(a, (r) => {
              r.url = "https://example.test";
            })
          : caso === "duplicada"
            ? Buffer.from(
                a
                  .toString("utf8")
                  .replace(
                    '"formato":"recreio-indice-backup-v1"',
                    '"formato":"recreio-indice-backup-v1","formato":"recreio-indice-backup-v1"',
                  ),
              )
            : caso === "espacos"
              ? Buffer.from(JSON.stringify(registro(a), null, 2))
              : caso === "mac_curto"
                ? alterar(a, (r) => {
                    r.mac = "00";
                  })
                : Buffer.alloc(32 * 1024 + 1);
      expect(() => f.indice.conferir(b, f.id)).toThrow(
        expect.objectContaining({ codigo: caso === "excesso" ? "LIMITE" : "INTEGRIDADE" }),
      );
      f.indice.encerrar();
    },
  );
  it("captura e escopo de homologação não podem ser trocados para produção", () => {
    const f = fixture(),
      a = f.indice.assinar(f.publicacao),
      outro = criarIndiceDeRecuperacao({
        destino: { ...f.destino, escopo: "production" },
        chaveAtiva: "v2",
        chaves: f.chaves,
      });
    expect(() => f.indice.conferir(a, randomUUID())).toThrow(
      expect.objectContaining({ codigo: "INTEGRIDADE" }),
    );
    expect(() => outro.conferir(a, f.id)).toThrow(
      expect.objectContaining({ codigo: "INTEGRIDADE" }),
    );
    outro.encerrar();
    f.indice.encerrar();
  });
  it.each(["2026-11-18T23:59:00.000Z", "2026-11-19T00:01:00Z"])(
    "data divergente/não canônica %s é recusada",
    (conferidaEm) => {
      const f = fixture();
      expect(() => f.indice.assinar({ ...f.publicacao, conferidaEm })).toThrow(
        expect.objectContaining({ codigo: "INTEGRIDADE" }),
      );
      f.indice.encerrar();
    },
  );
  it("encerrar não revoga os buffers do titular e impede assinar/verificar", () => {
    const f = fixture(),
      a = f.indice.assinar(f.publicacao),
      antes = new Map([...f.chaves].map(([id, k]) => [id, Buffer.from(k)]));
    f.indice.encerrar();
    expect(f.chaves).toEqual(antes);
    expect(() => f.indice.assinar(f.publicacao)).toThrow(
      expect.objectContaining({ codigo: "ENCERRADO" }),
    );
    expect(() => f.indice.conferir(a, f.id)).toThrow(
      expect.objectContaining({ codigo: "ENCERRADO" }),
    );
  });
});
