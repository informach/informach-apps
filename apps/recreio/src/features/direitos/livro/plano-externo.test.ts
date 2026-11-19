import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixtureDoLivro } from "../../../../test/livro-apoio";
import { criarBucketDoLivro } from "../../../../test/livro-s3-apoio";
import { PlanoDeDireitosSchema } from "../preparacao-contrato";
import { criarArmazenamentoDoLivro } from "./armazenamento";
import { resumoDoRegistro } from "./assinatura";
import { lerPlanoExterno, MAX_PLANO_EXTERNO, serializarPlanoExterno } from "./plano-externo";
import { admitirIntencaoNoLivro } from "./publicacao";

function plano(mundos = 0) {
  const perfil = randomUUID();
  return PlanoDeDireitosSchema.parse({
    formato: "recreio-previa-direitos-v1",
    tipo: "retirar_perfil",
    contaId: randomUUID(),
    perfis: [{ id: perfil, tipo: "adult", versao: 1, responsabilidadeId: null }],
    mundos: Array.from({ length: mundos }, () => randomUUID())
      .sort()
      .map((id) => ({
        id,
        jogo: "morada",
        revisao: 0,
        diario: 0,
        gestao: 1,
        cerca: 0,
        estado: "hibernating",
        outrosParticipantes: 0,
      })),
    identidadeGlobalPreservada: true,
    financeiroSeparado: true,
  });
}
async function cenario(fn: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>) {
  const f = await preparar();
  try {
    await fn(f);
  } finally {
    f.livro.encerrar();
    await f.http.fechar();
  }
}
async function preparar() {
  const livro = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  const storage = criarArmazenamentoDoLivro({
    assinatura: livro.assinatura,
    cliente: http.cliente,
    bucket: "recreio-fixture",
    tempoLimiteMs: 2000,
  });
  return { livro, http, storage };
}
describe("plano privado endereçado pelo SHA da intenção", () => {
  it("confere SHA e representação canônica sem aceitar perda de campos", () => {
    const p = plano(),
      bytes = Buffer.from(JSON.stringify(p)),
      sha = resumoDoRegistro(bytes);
    expect(lerPlanoExterno(bytes, sha)).toEqual(p);
    expect(serializarPlanoExterno(p, sha)).toEqual(bytes);
    expect(() => lerPlanoExterno(bytes, "a".repeat(64))).toThrow(
      "recreio.rights_ledger.INTEGRIDADE",
    );
    for (const texto of [
      JSON.stringify({ ...p, segredo: "não aceitar" }),
      JSON.stringify(p, null, 2),
      JSON.stringify(p).replace("{", '{"tipo":"encerrar_conta",'),
    ]) {
      const invalido = Buffer.from(texto);
      expect(() => lerPlanoExterno(invalido, resumoDoRegistro(invalido))).toThrow(
        "recreio.rights_ledger.INTEGRIDADE",
      );
    }
  });
  it("recusa UTF-8 inválido, JSON inválido e payload além do orçamento", () => {
    for (const bytes of [Buffer.from([255]), Buffer.from("{"), Buffer.alloc(MAX_PLANO_EXTERNO + 1)])
      expect(() => lerPlanoExterno(bytes, resumoDoRegistro(bytes))).toThrow(
        "recreio.rights_ledger.INTEGRIDADE",
      );
  });
  it("guarda e relê um plano de 512 mundos sem depender do banco original", async () =>
    cenario(async (f) => {
      const p = plano(512),
        bytes = Buffer.from(JSON.stringify(p)),
        sha = resumoDoRegistro(bytes);
      expect(bytes.length).toBeGreaterThan(32 * 1024);
      await f.storage.publicarPlano(sha, bytes);
      await f.storage.publicarPlano(sha, bytes);
      // Nova composição, sem preparação/SQL/cache do escritor.
      const nova = criarArmazenamentoDoLivro({
        assinatura: f.livro.assinatura,
        cliente: f.http.cliente,
        bucket: "recreio-fixture",
        tempoLimiteMs: 2000,
      });
      expect(await nova.lerPlano(sha)).toEqual(p);
      expect(f.http.pedidos.filter((r) => r.metodo === "PUT").every((r) => r.ifNone === "*")).toBe(
        true,
      );
      expect([...f.http.objetos.keys()]).toEqual([
        `/recreio-fixture/${f.storage.prefixo}planos/${sha}.json`,
      ]);
    }));
  it("corrupção, ausência e falta de permissão nunca viram plano vazio", async () =>
    cenario(async (f) => {
      const p = plano(),
        bytes = Buffer.from(JSON.stringify(p)),
        sha = resumoDoRegistro(bytes);
      await expect(f.storage.lerPlano(sha)).rejects.toMatchObject({ codigo: "AUSENTE" });
      await f.storage.publicarPlano(sha, bytes);
      f.http.estado.corromper = true;
      await expect(f.storage.lerPlano(sha)).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      f.http.estado.corromper = false;
      f.http.estado.negar = true;
      await expect(f.storage.publicarPlano(sha, bytes)).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
    }));
  it("recusa endereço livre e tamanho excessivo antes de qualquer chamada HTTP", async () =>
    cenario(async (f) => {
      expect(() => f.storage.lerPlano("../../segredo")).toThrow(
        "recreio.rights_ledger.CONFIGURACAO",
      );
      expect(() =>
        f.storage.publicarPlano("a".repeat(64), Buffer.alloc(MAX_PLANO_EXTERNO + 1)),
      ).toThrow("recreio.rights_ledger.INTEGRIDADE");
      expect(f.http.pedidos).toHaveLength(0);
    }));
  it("admite a intenção somente após reler o plano exato e preserva o dedup", async () =>
    cenario(async (f) => {
      const p = plano(),
        bytes = Buffer.from(JSON.stringify(p)),
        sha = resumoDoRegistro(bytes);
      await f.storage.iniciarCabecalho(f.livro.assinatura.assinarCabecalho(f.livro.inicial));
      const doc = {
        ...f.livro.intencao(),
        contaId: p.contaId,
        perfilIds: p.perfis.map((p) => p.id),
        planoSha256: sha,
      };
      const config = {
        storage: f.storage,
        assinatura: f.livro.assinatura,
        bytes: f.livro.assinatura.assinarIntencao(doc),
        plano: bytes,
        instante: "2026-11-19T10:01:00.000Z",
      };
      expect((await admitirIntencaoNoLivro(config)).jaAdmitida).toBe(false);
      expect((await admitirIntencaoNoLivro(config)).jaAdmitida).toBe(true);
      expect(await f.storage.lerPlano(sha)).toEqual(p);
      expect((await f.storage.lerCabecalho()).documento.entradas).toBe(1);
    }));
  it("plano divergente não publica intenção ou avança a cabeça", async () =>
    cenario(async (f) => {
      await f.storage.iniciarCabecalho(f.livro.assinatura.assinarCabecalho(f.livro.inicial));
      const p = plano(),
        bytes = Buffer.from(JSON.stringify(p));
      await expect(
        admitirIntencaoNoLivro({
          storage: f.storage,
          assinatura: f.livro.assinatura,
          bytes: f.livro.assinatura.assinarIntencao(f.livro.intencao()),
          plano: bytes,
          instante: "2026-11-19T10:01:00.000Z",
        }),
      ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect((await f.storage.lerCabecalho()).documento.entradas).toBe(0);
      expect([...f.http.objetos.keys()].some((k) => k.includes("/intencoes/"))).toBe(false);
    }));
});
