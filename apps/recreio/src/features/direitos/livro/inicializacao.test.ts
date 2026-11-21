import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixtureDoLivro } from "../../../../test/livro-apoio";
import { criarBucketDoLivro } from "../../../../test/livro-s3-apoio";
import { criarArmazenamentoDoLivro } from "./armazenamento";
import { inicializarLivroDeDireitos, inspecionarLivroDeDireitos } from "./inicializacao";

async function cenario(executar: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>) {
  const f = await preparar();
  try {
    await executar(f);
  } finally {
    f.assinatura.encerrar();
    await f.http.fechar();
  }
}
async function preparar() {
  const f = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  return {
    ...f,
    http,
    livroEsperado: f.livroId,
    storage: criarArmazenamentoDoLivro({
      cliente: http.cliente,
      bucket: "recreio-fixture",
      assinatura: f.assinatura,
      tempoLimiteMs: 2000,
    }),
  };
}
describe("inicialização explícita do livro: SDK e HTTP reais", () => {
  it("inspeção ausente só lê; destino errado recusa antes da rede", async () =>
    cenario(async (f) => {
      await expect(
        inspecionarLivroDeDireitos({ ...f, livroEsperado: randomUUID() }),
      ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
      expect(f.http.pedidos).toHaveLength(0);
      expect(await inspecionarLivroDeDireitos(f)).toBeNull();
      expect(f.http.pedidos.every((p) => p.metodo === "GET")).toBe(true);
      expect(f.http.objetos.size).toBe(0);
    }));
  it("cria cabeçalho e histórico com escrita condicional e repetição sem PUT", async () =>
    cenario(async (f) => {
      const primeiro = await inicializarLivroDeDireitos(f),
        pedidos = f.http.pedidos.length;
      expect(primeiro.jaInicializado).toBe(false);
      expect(primeiro.cabecalho.documento).toMatchObject({
        estado: "aberto",
        epoca: 0,
        entradas: 0,
        geracao: 0,
      });
      expect(f.http.objetos.size).toBe(2);
      expect(f.http.pedidos.filter((p) => p.metodo === "PUT").every((p) => p.ifNone === "*")).toBe(
        true,
      );
      const repetido = await inicializarLivroDeDireitos(f);
      expect(repetido.jaInicializado).toBe(true);
      expect(repetido.cabecalho.sha256).toBe(primeiro.cabecalho.sha256);
      expect(f.http.pedidos.slice(pedidos).every((p) => p.metodo === "GET")).toBe(true);
    }));
  it("livro congelado conserva bytes, época e estado", async () =>
    cenario(async (f) => {
      await inicializarLivroDeDireitos(f);
      const congelado = await f.storage.congelarCabecalho(
          await f.storage.lerCabecalho(),
          new Date().toISOString(),
        ),
        pedidos = f.http.pedidos.length;
      const existente = await inicializarLivroDeDireitos(f);
      expect(existente.cabecalho.sha256).toBe(congelado.sha256);
      expect(existente.cabecalho.documento.estado).toBe("congelado");
      expect(f.http.pedidos.slice(pedidos).every((p) => p.metodo === "GET")).toBe(true);
    }));
  it.each(["negar", "bucketAusente", "corromper"] as const)(
    "%s nunca é ausência que permita inicializar",
    async (flag) =>
      cenario(async (f) => {
        if (flag === "corromper") await inicializarLivroDeDireitos(f);
        f.http.estado[flag] = true;
        const pedidos = f.http.pedidos.length;
        await expect(inicializarLivroDeDireitos(f)).rejects.toThrow();
        expect(f.http.pedidos.slice(pedidos).every((p) => p.metodo === "GET")).toBe(true);
      }),
  );
});
