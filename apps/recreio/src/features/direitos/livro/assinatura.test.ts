import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixtureDoLivro } from "../../../../test/livro-apoio";
import { criarAssinaturaDoLivro, MAX_REGISTRO } from "./assinatura";

describe("livro de direitos: identidade, contexto e autenticidade", () => {
  it("conserva os dois formatos e recusa trocar suas finalidades", () => {
    const f = fixtureDoLivro();
    try {
      const i = f.intencao(),
        bytes = f.assinatura.assinarIntencao(i),
        head = f.assinatura.assinarCabecalho(f.inicial);
      expect(f.assinatura.lerIntencao(bytes)).toEqual(i);
      expect(f.assinatura.lerCabecalho(head)).toEqual(f.inicial);
      expect(() => f.assinatura.lerCabecalho(bytes)).toThrow();
      expect(() => f.assinatura.lerIntencao(head)).toThrow();
    } finally {
      f.encerrar();
    }
  });
  it("recusa livro, chave, bytes, campos e JSON duplicado divergentes", () => {
    const f = fixtureDoLivro(),
      outra = criarAssinaturaDoLivro({ livroId: randomUUID(), chaveAtiva: "v1", chaves: f.chaves }),
      segredo = randomBytes(32),
      errada = criarAssinaturaDoLivro({
        livroId: f.livroId,
        chaveAtiva: "v1",
        chaves: new Map([["v1", segredo]]),
      });
    try {
      const bytes = f.assinatura.assinarIntencao(f.intencao());
      expect(() => outra.lerIntencao(bytes)).toThrow();
      expect(() => errada.lerIntencao(bytes)).toThrow();
      expect(() =>
        f.assinatura.lerIntencao(
          Buffer.from(bytes.toString().replace('"versao":1', '"versao":1,"versao":1')),
        ),
      ).toThrow();
      expect(() =>
        f.assinatura.lerIntencao(
          Buffer.from(bytes.toString().replace('"mac":', '"extra":true,"mac":')),
        ),
      ).toThrow();
      const ruim = Buffer.from(bytes);
      ruim[1] = 0;
      expect(() => f.assinatura.lerIntencao(ruim)).toThrow();
      expect(() => f.assinatura.lerIntencao(Buffer.alloc(MAX_REGISTRO + 1))).toThrow();
    } finally {
      outra.encerrar();
      errada.encerrar();
      segredo.fill(0);
      f.encerrar();
    }
  });
  it("copia a chave admitida, suporta rotação e encerra suas capacidades", () => {
    const f = fixtureDoLivro(),
      bytes = f.assinatura.assinarIntencao(f.intencao()),
      nova = randomBytes(32),
      rotacionada = criarAssinaturaDoLivro({
        livroId: f.livroId,
        chaveAtiva: "v2",
        chaves: new Map([...f.chaves, ["v2", nova]]),
      });
    try {
      f.segredo.fill(0);
      expect(f.assinatura.lerIntencao(bytes).livroId).toBe(f.livroId);
      expect(rotacionada.lerIntencao(bytes).livroId).toBe(f.livroId);
      rotacionada.encerrar();
      expect(() => rotacionada.lerIntencao(bytes)).toThrow(/ENCERRADO/);
    } finally {
      rotacionada.encerrar();
      nova.fill(0);
      f.encerrar();
    }
  });
  it("recusa escopo duplicado, fora de ordem e autenticação futura", () => {
    const f = fixtureDoLivro();
    try {
      const i = f.intencao(),
        id = randomUUID();
      for (const entrada of [
        { ...i, perfilIds: [] },
        { ...i, perfilIds: [id, id] },
        { ...i, tipo: "encerrar_conta", perfilIds: [randomUUID(), randomUUID()].sort().reverse() },
        { ...i, autenticadaEm: "2026-11-19T11:00:00.000Z" },
        { ...i, perfilIds: [id.toUpperCase()] },
      ])
        expect(() => f.assinatura.assinarIntencao(entrada)).toThrow();
      expect(
        f.assinatura.lerIntencao(
          f.assinatura.assinarIntencao({ ...i, tipo: "encerrar_conta", perfilIds: [] }),
        ).perfilIds,
      ).toEqual([]);
      expect(() =>
        f.assinatura.assinarCabecalho({ ...f.inicial, geracao: 1, entradas: 1 }),
      ).toThrow();
    } finally {
      f.encerrar();
    }
  });
  it("rotação não aceita apenas renomear a mesma chave", () => {
    const f = fixtureDoLivro();
    try {
      expect(() =>
        criarAssinaturaDoLivro({
          livroId: f.livroId,
          chaveAtiva: "v2",
          chaves: new Map([...f.chaves, ["v2", f.segredo]]),
        }),
      ).toThrow(/CONFIGURACAO/);
    } finally {
      f.encerrar();
    }
  });
});
