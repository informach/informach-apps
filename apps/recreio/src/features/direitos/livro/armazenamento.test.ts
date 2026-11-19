import { describe, expect, it } from "vitest";
import { fixtureDoLivro } from "../../../../test/livro-apoio";
import { criarBucketDoLivro } from "../../../../test/livro-s3-apoio";
import { criarArmazenamentoDoLivro } from "./armazenamento";

async function cenario(
  fn: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>,
  maxAttempts = 1,
  tempoLimiteMs = 2000,
) {
  const f = await preparar(maxAttempts, tempoLimiteMs);
  try {
    await fn(f);
  } finally {
    f.encerrar();
    await f.http.fechar();
  }
}
async function preparar(maxAttempts: number, tempoLimiteMs: number) {
  const f = fixtureDoLivro(),
    http = await criarBucketDoLivro(maxAttempts),
    storage = criarArmazenamentoDoLivro({
      cliente: http.cliente,
      bucket: "recreio-fixture",
      assinatura: f.assinatura,
      tempoLimiteMs,
    });
  return {
    ...f,
    http,
    storage,
    async iniciar() {
      return storage.iniciarCabecalho(f.assinatura.assinarCabecalho(f.inicial));
    },
    async intencaoGuardada() {
      const bytes = f.assinatura.assinarIntencao(f.intencao());
      await storage.publicarIntencao(bytes);
      return bytes;
    },
  };
}
describe("livro externo: HTTP fechado com SDK real", () => {
  it("ausência não inicializa livro e bucket inexistente não vira livro vazio", async () =>
    cenario(async (f) => {
      await expect(f.storage.lerCabecalho()).rejects.toMatchObject({ codigo: "AUSENTE" });
      expect(f.http.pedidos.every((r) => r.metodo === "GET")).toBe(true);
      f.http.estado.bucketAusente = true;
      await expect(f.storage.lerCabecalho()).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
    }));
  it("inicializa explicitamente e confirma replay sem sobrescrever", async () =>
    cenario(async (f) => {
      const a = await f.iniciar(),
        b = await f.iniciar();
      expect(a.sha256).toBe(b.sha256);
      expect(Object.isFrozen(a.documento)).toBe(true);
      const bytes = await f.intencaoGuardada();
      await f.storage.publicarIntencao(bytes);
      const i = f.assinatura.lerIntencao(bytes),
        alterada = f.assinatura.assinarIntencao({ ...i, planoSha256: "f".repeat(64) });
      await expect(f.storage.publicarIntencao(alterada)).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
      expect(f.http.pedidos.filter((r) => r.metodo === "PUT").every((r) => r.ifNone === "*")).toBe(
        true,
      );
    }));
  it("CAS concorrente admite somente um ramo e não sobrescreve com ETag antigo", async () =>
    cenario(async (f) => {
      const base = await f.iniciar(),
        a = await f.intencaoGuardada(),
        b = await f.intencaoGuardada(),
        ha = f.assinatura.assinarCabecalho(f.proximo(base, a)),
        hb = f.assinatura.assinarCabecalho(f.proximo(base, b)),
        resultados = await Promise.allSettled([
          f.storage.trocarCabecalho(base, ha),
          f.storage.trocarCabecalho(base, hb),
        ]);
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const falhou = resultados.find((r) => r.status === "rejected");
      expect(falhou?.status === "rejected" && falhou.reason).toMatchObject({
        codigo: "CONCORRENCIA",
      });
      const atual = await f.storage.lerCabecalho(),
        perdera =
          atual.documento.ultimaIntencao?.sha256 ===
          f.assinatura.lerCabecalho(ha).ultimaIntencao?.sha256
            ? hb
            : ha;
      await expect(f.storage.trocarCabecalho(base, perdera)).rejects.toMatchObject({
        codigo: "CONCORRENCIA",
      });
      expect((await f.storage.lerCabecalho()).sha256).toBe(atual.sha256);
      expect(f.http.pedidos.filter((r) => r.ifMatch).every((r) => r.ifNone === undefined)).toBe(
        true,
      );
    }));
  it("resposta CAS perdida é conciliada por bytes/MAC, sem repetir o PUT", async () =>
    cenario(async (f) => {
      const base = await f.iniciar(),
        bytes = await f.intencaoGuardada(),
        proximo = f.assinatura.assinarCabecalho(f.proximo(base, bytes));
      f.http.estado.perderCas = true;
      expect((await f.storage.trocarCabecalho(base, proximo)).documento.geracao).toBe(1);
      expect(f.http.pedidos.filter((r) => r.ifMatch)).toHaveLength(1);
    }));
  it("recusa cabeçalho pendurado, raiz divergente e capacidade fabricada antes do CAS", async () =>
    cenario(async (f) => {
      const base = await f.iniciar(),
        bytes = f.assinatura.assinarIntencao(f.intencao()),
        proximo = f.proximo(base, bytes);
      await expect(
        f.storage.trocarCabecalho(base, f.assinatura.assinarCabecalho(proximo)),
      ).rejects.toMatchObject({ codigo: "AUSENTE" });
      await f.storage.publicarIntencao(bytes);
      await expect(
        f.storage.trocarCabecalho(
          base,
          f.assinatura.assinarCabecalho({ ...proximo, raizSha256: "f".repeat(64) }),
        ),
      ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect(() =>
        f.storage.trocarCabecalho({ ...base }, f.assinatura.assinarCabecalho(proximo)),
      ).toThrow(/CONFIGURACAO/);
      expect(f.http.pedidos.filter((r) => r.ifMatch)).toHaveLength(0);
    }));
  it("recusa MAC corrompido e acesso negado sem tratar como vazio", async () =>
    cenario(async (f) => {
      await f.iniciar();
      f.http.estado.corromper = true;
      await expect(f.storage.lerCabecalho()).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      f.http.estado.corromper = false;
      f.http.estado.negar = true;
      await expect(f.storage.lerCabecalho()).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
    }));
  it("recusa retry SDK e cancelamento antes de qualquer I/O", async () => {
    await cenario(async (f) => {
      await expect(f.storage.lerCabecalho()).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
      expect(f.http.pedidos).toHaveLength(0);
    }, 2);
    await cenario(async (f) => {
      const c = new AbortController();
      c.abort();
      await expect(f.storage.lerCabecalho(c.signal)).rejects.toMatchObject({
        codigo: "INCONCLUSIVO",
      });
      expect(f.http.pedidos).toHaveLength(0);
    });
  });
  it("prazo abrange a leitura e o fechamento do corpo", async () =>
    cenario(
      async (f) => {
        f.http.estado.silenciarGet = true;
        await expect(f.storage.lerCabecalho()).rejects.toMatchObject({ codigo: "INCONCLUSIVO" });
      },
      1,
      80,
    ));
});
