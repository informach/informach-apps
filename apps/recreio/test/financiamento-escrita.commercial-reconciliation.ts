import { randomUUID } from "node:crypto";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  recreioBillingContracts as contracts,
  recreioPaymentFunding as current,
  events,
  recreioFundingObservations as observations,
  subscriptionPaymentPeriods as periods,
  recreioFundingSourcePeriods as sources,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  confirmarConciliacaoLocked,
  iniciarConciliacaoLocked,
  reservarProximaConciliacao,
  type TentativaDeConciliacao,
} from "@/features/cobranca/conciliacao-fila-repository";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { prepararPeriodosDoFinanciamento } from "@/features/cobranca/financiamento-periodos";
import { persistirFinanciamentoLocked } from "@/features/cobranca/financiamento-repository";
import type { ConferenciaFinanceiraDoCliente } from "@/features/cobranca/financiamento-stripe";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { fixtureDeFinanciamento } from "./financiamento-stripe-apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";

/** Native acceptance/lease, SDK, PostgreSQL and audit are real. Core rows for
 * the funding writer are synthetic preconditions; root/access is not qualified. */
async function fixture() {
  const f = await fixtureDePagamento(false, "recreio_individual_annual");
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  const remoto = f.concluirCheckout();
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: () => {},
  });
  expect((await processar()).conciliadas).toBe(1);
  const [contrato] = await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id));
  if (!contrato) throw new Error("Native contract absent");
  const financeiro = fixtureDeFinanciamento({
    paganteId: f.adulto.conta.id,
    autorizacaoId: f.recibo.id,
    clienteId: f.providerCustomerId,
    assinaturaId: remoto.assinatura.id,
    sufixo: randomUUID().replaceAll("-", ""),
  });
  const ler = () =>
    financeiro.conference.conferirCliente(
      {
        clienteId: f.providerCustomerId,
        paganteId: f.adulto.conta.id,
        assinaturaIds: [remoto.assinatura.id],
        precosAceitos: financeiro.input.precosAceitos,
      },
      { deadlineMs: Date.now() + 90_000 },
    );
  const vinculos = [
    { subscriptionId: contrato.subscriptionId, providerSubscriptionId: remoto.assinatura.id },
  ];
  async function tentativa() {
    await db.execute(
      sql`update recreio.billing_reconciliations set next_attempt_at=clock_timestamp()-interval '10 years', lease_token=null, lease_until=null where payer_user_id=${f.adulto.conta.id} and provider_mode='dev'`,
    );
    return comCicloDeCobranca(f.adulto.conta.id, async () => {
      const reservada = await reservarProximaConciliacao("dev");
      if (!reservada || reservada.payerUserId !== f.adulto.conta.id)
        throw new Error("Target lease absent");
      return iniciarConciliacaoLocked(reservada);
    });
  }
  async function gravar(
    prova: TentativaDeConciliacao,
    conferencia: ConferenciaFinanceiraDoCliente,
  ) {
    return comCicloDeCobranca(f.adulto.conta.id, () =>
      confirmarConciliacaoLocked(prova, async (tx) => {
        const snapshots = prepararPeriodosDoFinanciamento(conferencia, prova.startedAt);
        // Fixtures provide the writer's existing core rows, with original flags.
        // Real runtime integration must persist these together in its root TX.
        for (const snapshot of snapshots)
          for (const p of snapshot.periods) {
            await tx
              .insert(periods)
              .values({
                subscriptionId: contrato.subscriptionId,
                provider: "stripe",
                providerInvoiceId: p.invoiceId,
                providerLineId: p.lineId,
                providerPriceId: p.priceId,
                periodStart: p.start,
                periodEnd: p.end,
                paidAt: p.paidAt,
                fullyRefunded: p.fullyRefunded,
                disputed: p.disputed,
                reconciledAt: prova.startedAt,
              })
              .onConflictDoUpdate({
                target: [periods.provider, periods.providerInvoiceId, periods.providerLineId],
                set: {
                  fullyRefunded: p.fullyRefunded,
                  disputed: p.disputed,
                  reconciledAt: prova.startedAt,
                },
                setWhere: eq(periods.subscriptionId, contrato.subscriptionId),
              });
          }
        await persistirFinanciamentoLocked(tx, prova, conferencia, vinculos);
      }),
    );
  }
  const estados = () =>
    db
      .select({ periodo: periods, prova: observations, atual: current })
      .from(current)
      .innerJoin(observations, eq(observations.id, current.observationId))
      .innerJoin(periods, eq(periods.id, current.paymentPeriodId))
      .where(eq(periods.subscriptionId, contrato.subscriptionId));
  return { ...f, financeiro, contrato, ler, vinculos, tentativa, gravar, estados };
}

describe("escrita nativa das provas de financiamento", () => {
  it("preserva o período anual, limita sua prova e registra fontes e auditoria sem valores", async () => {
    const f = await fixture(),
      conferencia = await f.ler(),
      tentativa = await f.tentativa();
    await f.gravar(tentativa, conferencia);
    const estados = await f.estados();
    expect(estados).toHaveLength(3);
    expect(estados.every((e) => e.prova.fundingStatus === "verified")).toBe(true);
    const original = estados.find(
      (e) => e.periodo.providerLineId === f.financeiro.identidade("il_original"),
    );
    expect(original?.periodo.periodEnd.getTime()).toBe((1795032000 + 365 * 86400) * 1000);
    expect(original?.prova.fundedUntil.getTime()).toBe(1795032000 * 1000);
    const referencias = await db
      .select()
      .from(sources)
      .where(
        inArray(
          sources.observationId,
          estados.map((e) => e.prova.id),
        ),
      );
    expect(referencias).toHaveLength(3);
    expect(referencias.every((r) => r.sourcePaymentPeriodId === original?.periodo.id)).toBe(true);
    const auditoria = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.userId, f.adulto.conta.id),
          eq(events.eventType, "recreio.payment_funding_observed"),
        ),
      );
    expect(auditoria).toHaveLength(3);
    expect(
      auditoria.every(
        (e) =>
          Object.keys(e.payload ?? {})
            .sort()
            .join() === "app,groupId,observationId,paymentPeriodId,state,subscriptionId",
      ),
    ).toBe(true);
  });
  it("refresh idêntico reutiliza conteúdo e atualiza somente o relógio da prova", async () => {
    const f = await fixture(),
      conferencia = await f.ler();
    await f.gravar(await f.tentativa(), conferencia);
    const antes = await f.estados();
    const nova = await f.tentativa();
    await f.gravar(nova, await f.ler());
    const depois = await f.estados();
    expect(depois.map((e) => e.prova.id).sort()).toEqual(antes.map((e) => e.prova.id).sort());
    expect(depois.every((e) => e.atual.observedAt.getTime() === nova.startedAt.getTime())).toBe(
      true,
    );
    expect(
      await db
        .select()
        .from(observations)
        .where(eq(observations.subscriptionId, f.contrato.subscriptionId)),
    ).toHaveLength(3);
    expect(
      await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.userId, f.adulto.conta.id),
            eq(events.eventType, "recreio.payment_funding_observed"),
          ),
        ),
    ).toHaveLength(3);
  });
  it("estorno da origem revoga todos os dependentes e conserva flags próprias e observações antigas", async () => {
    const f = await fixture();
    await f.gravar(await f.tentativa(), await f.ler());
    const antes = await f.estados();
    f.financeiro.charge.amount_refunded = 59900;
    f.financeiro.charge.refunded = true;
    await f.gravar(await f.tentativa(), await f.ler());
    const depois = await f.estados();
    expect(depois.every((e) => e.prova.fundingStatus === "revoked")).toBe(true);
    expect(
      depois
        .filter((e) => e.periodo.providerLineId !== f.financeiro.identidade("il_original"))
        .every((e) => !e.periodo.fullyRefunded && !e.periodo.disputed),
    ).toBe(true);
    expect(
      await db
        .select()
        .from(observations)
        .where(
          inArray(
            observations.id,
            antes.map((e) => e.prova.id),
          ),
        ),
    ).toHaveLength(3);
    expect(
      await db
        .select()
        .from(observations)
        .where(eq(observations.subscriptionId, f.contrato.subscriptionId)),
    ).toHaveLength(6);
  });
  it("rejeita conteúdo diferente no mesmo relógio e leitura anterior à prova atual", async () => {
    const f = await fixture(),
      conferencia = await f.ler(),
      antiga = await f.tentativa();
    await f.gravar(antiga, conferencia);
    f.financeiro.charge.amount_refunded = 1;
    const parcial = await f.ler();
    await expect(
      db.transaction((tx) => persistirFinanciamentoLocked(tx, antiga, parcial, f.vinculos)),
    ).rejects.toMatchObject({ code: "ORIGEM_FINANCEIRA" });
    await f.gravar(await f.tentativa(), parcial);
    await expect(
      db.transaction((tx) => persistirFinanciamentoLocked(tx, antiga, conferencia, f.vinculos)),
    ).rejects.toMatchObject({ code: "ORIGEM_FINANCEIRA" });
    expect((await f.estados()).every((e) => e.prova.fundingStatus === "review")).toBe(true);
  });
  it("contrato de outro pagante não pode receber esta prova", async () => {
    const f = await fixture(),
      outro = await fixture(),
      conferencia = await f.ler(),
      tentativa = await f.tentativa();
    await expect(
      db.transaction((tx) =>
        persistirFinanciamentoLocked(tx, tentativa, conferencia, outro.vinculos),
      ),
    ).rejects.toMatchObject({ code: "ORIGEM_FINANCEIRA" });
    expect(await f.estados()).toEqual([]);
  });
  it("falha na auditoria reverte prova, fontes, ponteiro e os períodos da captura", async () => {
    const f = await fixture(),
      conferencia = await f.ler(),
      tentativa = await f.tentativa();
    await db.execute(
      sql`create function recreio.recusar_financiamento_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.payment_funding_observed' then raise exception 'fixture funding audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_financiamento_fixture before insert on audit.events for each row execute function recreio.recusar_financiamento_fixture()`,
    );
    try {
      await expect(f.gravar(tentativa, conferencia)).rejects.toThrow();
    } finally {
      await db.execute(sql`drop trigger recusar_financiamento_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_financiamento_fixture()`);
    }
    expect(await f.estados()).toEqual([]);
    expect(
      await db
        .select()
        .from(observations)
        .where(eq(observations.subscriptionId, f.contrato.subscriptionId)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(periods)
        .where(
          and(
            eq(periods.subscriptionId, f.contrato.subscriptionId),
            eq(periods.providerInvoiceId, f.financeiro.identidade("in_original")),
          ),
        ),
    ).toEqual([]);
  });
});
