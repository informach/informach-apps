import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixtureDoLivro } from "../../../../test/livro-apoio";
import { criarBucketDoLivro } from "../../../../test/livro-s3-apoio";
import { criarArmazenamentoDoLivro } from "./armazenamento";
import { conferirPrefixoDoLivro } from "./leitura";
import { admitirIntencaoNoLivro } from "./publicacao";

async function cenario(fn: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>) {
  const f = await preparar();
  try {
    await fn(f);
  } finally {
    f.encerrar();
    await f.http.fechar();
  }
}
async function preparar() {
  const f = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  const storage = criarArmazenamentoDoLivro({
    cliente: http.cliente,
    bucket: "recreio-fixture",
    assinatura: f.assinatura,
    tempoLimiteMs: 2000,
  });
  const publicar = (bytes: Buffer) =>
    admitirIntencaoNoLivro({
      storage,
      assinatura: f.assinatura,
      bytes,
      instante: "2026-11-19T10:02:00.000Z",
    });
  return { ...f, http, storage, publicar };
}

describe("admissão retomável do consentimento no livro", () => {
  it("não inicializa um livro ausente", async () =>
    cenario(async (f) => {
      await expect(f.publicar(f.assinatura.assinarIntencao(f.intencao()))).rejects.toMatchObject({
        codigo: "AUSENTE",
      });
      expect(f.http.pedidos.some((r) => r.metodo === "PUT")).toBe(false);
    }));
  it("admite exatamente uma vez e recupera uma operação anterior à última cabeça", async () =>
    cenario(async (f) => {
      await f.storage.iniciarCabecalho(f.assinatura.assinarCabecalho(f.inicial));
      const a = f.assinatura.assinarIntencao(f.intencao()),
        b = f.assinatura.assinarIntencao(f.intencao());
      expect((await f.publicar(a)).jaAdmitida).toBe(false);
      await f.publicar(b);
      const puts = f.http.pedidos.filter((r) => r.metodo === "PUT").length;
      expect((await f.publicar(a)).jaAdmitida).toBe(true);
      expect(f.http.pedidos.filter((r) => r.metodo === "PUT")).toHaveLength(puts);
      const prova = await conferirPrefixoDoLivro({
        storage: f.storage,
        maxEntradas: 2,
        tempoLimiteMs: 2000,
      });
      expect(prova.referencias.map((r) => r.operacaoId)).toEqual([
        f.assinatura.lerIntencao(a).operacaoId,
        f.assinatura.lerIntencao(b).operacaoId,
      ]);
    }));
  it("concilia CAS perdido com o SDK HTTP real sem segunda escrita", async () =>
    cenario(async (f) => {
      await f.storage.iniciarCabecalho(f.assinatura.assinarCabecalho(f.inicial));
      f.http.estado.perderCas = true;
      const bytes = f.assinatura.assinarIntencao(f.intencao());
      await f.publicar(bytes);
      expect((await f.publicar(bytes)).jaAdmitida).toBe(true);
      expect(f.http.pedidos.filter((r) => r.ifMatch)).toHaveLength(1);
    }));
  it("mesmo ID com outra intenção ou revisão não substitui um consentimento admitido", async () =>
    cenario(async (f) => {
      await f.storage.iniciarCabecalho(f.assinatura.assinarCabecalho(f.inicial));
      const doc = f.intencao();
      await f.publicar(f.assinatura.assinarIntencao(doc));
      for (const alteracao of [{ perfilIds: [randomUUID()] }, { revisao: 2 }]) {
        await expect(
          f.publicar(f.assinatura.assinarIntencao({ ...doc, ...alteracao })),
        ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      }
      expect((await f.storage.lerCabecalho()).documento.entradas).toBe(1);
    }));
  it("livro congelado não admite nem libera repetição de uma intenção já presente", async () =>
    cenario(async (f) => {
      await f.storage.iniciarCabecalho(f.assinatura.assinarCabecalho(f.inicial));
      const bytes = f.assinatura.assinarIntencao(f.intencao());
      await f.publicar(bytes);
      await f.storage.congelarCabecalho(await f.storage.lerCabecalho(), "2026-11-19T10:03:00.000Z");
      await expect(f.publicar(bytes)).rejects.toMatchObject({ codigo: "CONGELADO" });
      await expect(f.publicar(f.assinatura.assinarIntencao(f.intencao()))).rejects.toMatchObject({
        codigo: "CONGELADO",
      });
    }));
  it("recusa época divergente antes de publicar o objeto de intenção", async () =>
    cenario(async (f) => {
      await f.storage.iniciarCabecalho(f.assinatura.assinarCabecalho(f.inicial));
      const puts = f.http.pedidos.filter((r) => r.metodo === "PUT").length;
      await expect(
        f.publicar(f.assinatura.assinarIntencao({ ...f.intencao(), epoca: 1 })),
      ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
      expect(f.http.pedidos.filter((r) => r.metodo === "PUT")).toHaveLength(puts);
    }));
  it("concorrentes usam CAS; a perdedora concilia antes de qualquer repetição", async () =>
    cenario(async (f) => {
      await f.storage.iniciarCabecalho(f.assinatura.assinarCabecalho(f.inicial));
      const bytes = f.assinatura.assinarIntencao(f.intencao());
      const tentativas = await Promise.allSettled([f.publicar(bytes), f.publicar(bytes)]);
      expect(tentativas.some((r) => r.status === "fulfilled")).toBe(true);
      for (const r of tentativas)
        if (r.status === "rejected") expect(r.reason).toMatchObject({ codigo: "CONCORRENCIA" });
      expect((await f.publicar(bytes)).jaAdmitida).toBe(true);
      expect((await f.storage.lerCabecalho()).documento.entradas).toBe(1);
    }));
});
