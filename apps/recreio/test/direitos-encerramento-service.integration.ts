import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  confirmarEncerramentoDeConta,
  prepararPedidoDeEncerramento,
} from "@/features/direitos/encerramento-service";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { fixtureDoLivro } from "./livro-apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";
import { adultoDoTeste } from "./teste-apoio";

async function cenario(executar: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture();
  try {
    await executar(f);
  } finally {
    try {
      await f.http.fechar();
    } finally {
      f.livro.encerrar();
    }
  }
}
async function fixture() {
  const a = await adultoDoTeste(),
    livro = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  const storage = criarArmazenamentoDoLivro({
    assinatura: livro.assinatura,
    cliente: http.cliente,
    bucket: "recreio-fixture",
    tempoLimiteMs: 2000,
  });
  await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
  const modo: "dev" = "dev";
  const config = { assinatura: livro.assinatura, storage, fonte: "a".repeat(40), modo };
  const previa = () =>
    prepararPedidoDeEncerramento(
      a.autor,
      { pedidoId: randomUUID(), tipo: "encerrar_conta", perfis: [] },
      modo,
    );
  const aceite = (p: { preparacaoId: string; planoSha256: string }) => ({
    ...p,
    confirmoEncerramento: true,
    confirmoRetiradaDosPerfis: true,
    confirmoCancelamentoDaRenovacao: true,
  });
  return { a, livro, http, config, previa, aceite };
}

describe("encerramento: serviço do consentimento com livro externo e autoridade nativa", () => {
  it("prévia V2 e três aceites completos registram somente consentimento; replay conserva bytes", () =>
    cenario(async (f) => {
      const p = await f.previa();
      expect(p.plano.formato).toBe("recreio-previa-encerramento-v2");
      const ref = { preparacaoId: p.preparacaoId, planoSha256: p.planoSha256 };
      for (const campo of [
        "confirmoEncerramento",
        "confirmoRetiradaDosPerfis",
        "confirmoCancelamentoDaRenovacao",
      ])
        await expect(
          confirmarEncerramentoDeConta(f.a.autor, { ...f.aceite(ref), [campo]: false }, f.config),
        ).rejects.toHaveProperty("name", "ZodError");
      const recibo = await confirmarEncerramentoDeConta(f.a.autor, f.aceite(ref), f.config);
      expect(recibo.estado).toBe("publishing");
      const [antes] = await db
        .select()
        .from(operations)
        .where(eq(operations.id, recibo.operacaoId));
      expect(await confirmarEncerramentoDeConta(f.a.autor, f.aceite(ref), f.config)).toEqual(
        recibo,
      );
      expect(
        (await db.select().from(operations).where(eq(operations.id, recibo.operacaoId)))[0],
      ).toEqual(antes);
      expect(
        (await db.select().from(participations).where(eq(participations.userId, f.a.conta.id)))[0],
      ).toMatchObject({ state: "closing", revision: 2 });
    }));

  it("plano legado não ganha efeitos financeiros pela nova confirmação", () =>
    cenario(async (f) => {
      const p = await prepararPedidoDeDireitos(f.a.autor, {
        pedidoId: randomUUID(),
        tipo: "encerrar_conta",
        perfis: [],
      });
      expect(p.plano.formato).toBe("recreio-previa-direitos-v1");
      await expect(
        confirmarEncerramentoDeConta(
          f.a.autor,
          f.aceite({ preparacaoId: p.preparacaoId, planoSha256: p.planoSha256 }),
          f.config,
        ),
      ).rejects.toMatchObject({ code: "ESCOPO" });
      expect(
        await db.select().from(operations).where(eq(operations.requesterUserId, f.a.conta.id)),
      ).toEqual([]);
      expect(
        await db.select().from(participations).where(eq(participations.userId, f.a.conta.id)),
      ).toEqual([]);
    }));

  it("login antigo e falha do armazenamento não viram novo consentimento", () =>
    cenario(async (f) => {
      const p = await f.previa(),
        entrada = f.aceite({ preparacaoId: p.preparacaoId, planoSha256: p.planoSha256 });
      const antigo = {
        ...f.a.autor,
        login: { ...f.a.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
      };
      await expect(confirmarEncerramentoDeConta(antigo, entrada, f.config)).rejects.toMatchObject({
        code: "LOGIN_RECENTE",
      });
      f.http.estado.negar = true;
      await expect(
        confirmarEncerramentoDeConta(f.a.autor, entrada, f.config),
      ).rejects.toMatchObject({ code: "DIREITOS_INDISPONIVEIS" });
      expect(
        await db.select().from(operations).where(eq(operations.requesterUserId, f.a.conta.id)),
      ).toEqual([]);
      expect(
        await db.select().from(participations).where(eq(participations.userId, f.a.conta.id)),
      ).toEqual([]);
    }));
});
