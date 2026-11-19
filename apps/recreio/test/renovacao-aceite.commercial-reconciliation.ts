import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioDeviceSessions as devices,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import {
  AceiteDoCancelamentoDaRenovacaoSchema,
  VERSAO_DO_CANCELAMENTO_DA_RENOVACAO,
} from "@/features/cobranca/renovacao-contrato";
import {
  aceitarCancelamentoDaRenovacaoNoBanco as aceitar,
  consultarCancelamentoDaRenovacaoNoBanco as consultar,
} from "@/features/cobranca/renovacao-repository";
import { consultarMinhaCobranca } from "@/features/cobranca/service";
import { criarPreparacaoDeReducao } from "@/features/cobranca/troca-cotacao-service";
import { capturarDadosPessoaisDaConta } from "@/features/direitos/captura-conta-repository";
import { eventosCom } from "./apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";
import { adultoDoTeste } from "./teste-apoio";

const config = { modo: "dev" as const, fonte: "a".repeat(40) };
async function fixture() {
  const f = await fixtureDePagamento(false, "recreio_family_monthly");
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  const remoto = f.concluirCheckout();
  const falhas: string[] = [];
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: (entrada) => {
      falhas.push(entrada.reasonCode);
    },
  });
  expect((await processar()).conciliadas).toBe(1);
  expect(falhas).toEqual([]);
  const [contrato] = await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id));
  if (!contrato) throw new Error("Native synthetic contract absent");
  const pedido = () =>
    AceiteDoCancelamentoDaRenovacaoSchema.parse({
      pedidoId: randomUUID(),
      assinaturaId: contrato.subscriptionId,
      revisaoDoContrato: contrato.revision,
      confirmoCancelamentoDaRenovacao: true,
      versaoDasCondicoes: VERSAO_DO_CANCELAMENTO_DA_RENOVACAO,
    });
  const cotar = () =>
    criarPreparacaoDeReducao(() => ({ modo: "dev", produtos: f.products }))(f.adulto.autor, {
      pedidoId: randomUUID(),
      grupoId: contrato.groupId,
      produtoDestino: "recreio_individual_monthly",
      revisaoContrato: 1,
      perfis: [],
    });
  return { ...f, remoto, contrato, pedido, cotar };
}

describe("cancelamento da renovação: aceite nativo sem envio externo", () => {
  it("pagante sem jogador registra uma vez, conserva bytes/datas e consulta sem expor referências do provedor", async () => {
    const f = await fixture(),
      p = f.pedido(),
      antes = f.requests.length;
    const recibo = await aceitar(f.adulto.autor, p, config);
    expect(recibo).toMatchObject({
      pedidoId: p.pedidoId,
      assinaturaId: f.contrato.subscriptionId,
      estado: "accepted",
      tentativaEm: null,
      confirmadoEm: null,
      resultado: null,
    });
    const [original] = await db
      .select()
      .from(cancellations)
      .where(eq(cancellations.id, p.pedidoId));
    expect(await aceitar(f.adulto.autor, p, { ...config, fonte: "b".repeat(40) })).toEqual(recibo);
    expect(await aceitar(f.adulto.autor, f.pedido(), config)).toEqual(recibo);
    expect(await consultar(f.adulto.autor, p.pedidoId, "dev")).toEqual(recibo);
    expect(
      (await db.select().from(cancellations).where(eq(cancellations.id, p.pedidoId)))[0],
    ).toEqual(original);
    expect(f.requests.length).toBe(antes);
    expect(
      (await eventosCom("cancellationId", p.pedidoId)).filter(
        (e) => e.eventType === "recreio.renewal_cancellation_accepted",
      ),
    ).toHaveLength(1);
    for (const privado of [
      f.providerCustomerId,
      f.remoto.assinatura.id,
      f.contrato.currentPriceId,
      f.adulto.conta.email,
    ])
      expect(JSON.stringify(recibo)).not.toContain(privado);
  });

  it("duas confirmações simultâneas do mesmo contrato preservam um único aceite", async () => {
    const f = await fixture();
    const [a, b] = await Promise.all([
      aceitar(f.adulto.autor, f.pedido(), config),
      aceitar(f.adulto.autor, f.pedido(), config),
    ]);
    expect(a).toEqual(b);
    expect(
      await db
        .select()
        .from(cancellations)
        .where(eq(cancellations.subscriptionId, f.contrato.subscriptionId)),
    ).toHaveLength(1);
    expect(
      (await eventosCom("cancellationId", a.pedidoId)).filter(
        (e) => e.eventType === "recreio.renewal_cancellation_accepted",
      ),
    ).toHaveLength(1);
  });

  it("encerra proposta não enviada e bloqueia nova troca antes do Stripe ou de confirmação financeira", async () => {
    const f = await fixture(),
      cotacao = await f.cotar(),
      antes = f.requests.length;
    const recibo = await aceitar(f.adulto.autor, f.pedido(), config);
    expect((await db.select().from(changes).where(eq(changes.id, cotacao.id)))[0]).toMatchObject({
      status: "canceled",
      requestStartedAt: null,
    });
    await expect(f.cotar()).rejects.toMatchObject({ code: "RENOVACAO_CANCELADA" });
    expect((await consultarMinhaCobranca(f.adulto.autor)).trocas).toMatchObject({
      contrato: { assinaturaId: f.contrato.subscriptionId, podePreparar: false },
      cancelamentoDaRenovacao: recibo,
    });
    expect(f.requests.length).toBe(antes);
  });

  it("outro adulto, referência/revisão antiga e namespace distinto não aceitam ou leem o pedido", async () => {
    const f = await fixture(),
      outro = await adultoDoTeste(),
      p = f.pedido();
    await expect(aceitar(outro.autor, p, config)).rejects.toMatchObject({ code: "COBRANCA" });
    await expect(aceitar(f.adulto.autor, p, { ...config, modo: "prod" })).rejects.toMatchObject({
      code: "COBRANCA",
    });
    await expect(
      aceitar(f.adulto.autor, { ...p, revisaoDoContrato: 2 }, config),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    const recibo = await aceitar(f.adulto.autor, p, config);
    await expect(consultar(outro.autor, recibo.pedidoId, "dev")).rejects.toMatchObject({
      code: "COBRANCA",
    });
    await expect(consultar(f.adulto.autor, recibo.pedidoId, "prod")).rejects.toMatchObject({
      code: "COBRANCA",
    });
  });

  it("contexto infantil, login não recente e revogação não criam nem revelam o recibo", async () => {
    const f = await fixture(),
      p = f.pedido();
    await expect(
      aceitar(
        {
          ...f.adulto.autor,
          login: { ...f.adulto.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
        },
        p,
        config,
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    await db
      .update(devices)
      .set({ minorContextGeneration: randomUUID() })
      .where(eq(devices.id, f.adulto.autor.sessaoDeAparelhoId));
    await expect(aceitar(f.adulto.autor, p, config)).rejects.toMatchObject({ code: "AUTH" });
    await db
      .update(devices)
      .set({ minorContextGeneration: null })
      .where(eq(devices.id, f.adulto.autor.sessaoDeAparelhoId));
    await aceitar(f.adulto.autor, p, config);
    await db
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(eq(devices.id, f.adulto.autor.sessaoDeAparelhoId));
    await expect(consultar(f.adulto.autor, p.pedidoId, "dev")).rejects.toMatchObject({
      code: "AUTH",
    });
    expect(
      (await db.select().from(cancellations).where(eq(cancellations.id, p.pedidoId)))[0]?.state,
    ).toBe("accepted");
  });

  it("falha de auditoria reverte aceite e encerramento da proposta na mesma transação", async () => {
    const f = await fixture(),
      cotacao = await f.cotar(),
      p = f.pedido();
    await db.execute(
      sql`create function audit.recusar_renovacao_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.renewal_cancellation_accepted' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_renovacao_teste before insert on audit.events for each row execute function audit.recusar_renovacao_teste()`,
    );
    try {
      await expect(aceitar(f.adulto.autor, p, config)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(await db.select().from(cancellations).where(eq(cancellations.id, p.pedidoId))).toEqual(
        [],
      );
      expect((await db.select().from(changes).where(eq(changes.id, cotacao.id)))[0]).toMatchObject({
        status: "quoted",
        resolvedAt: null,
      });
    } finally {
      await db.execute(sql`drop trigger recusar_renovacao_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_renovacao_teste()`);
    }
    expect((await aceitar(f.adulto.autor, p, config)).estado).toBe("accepted");
  });

  it("cópia pessoal inclui o próprio aceite, sem IDs privados do provedor", async () => {
    const f = await fixture();
    await aceitar(f.adulto.autor, f.pedido(), config);
    const copia = await capturarDadosPessoaisDaConta(f.adulto.autor);
    try {
      const texto = copia.bytes.toString("utf8");
      expect(texto).toContain('"tipo":"cancelamento_renovacao"');
      expect(texto).toContain(VERSAO_DO_CANCELAMENTO_DA_RENOVACAO);
      expect(texto).not.toContain(f.providerCustomerId);
      expect(texto).not.toContain(f.remoto.assinatura.id);
    } finally {
      copia.bytes.fill(0);
    }
  });
});
