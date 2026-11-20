import { randomUUID } from "node:crypto";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  recreioFundingCaptures as captures,
  recreioBillingContracts as contracts,
  recreioPaymentFunding as current,
  events,
  recreioFundingObservations as observations,
  subscriptionPaymentPeriods as periods,
  recreioFundingSourcePeriods as sources,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
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
import { capturarDadosPessoaisDaConta } from "@/features/direitos/captura-conta-repository";
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
  const [encontrado] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.purchaseId, f.recibo.id));
  if (!encontrado) throw new Error("Native contract absent");
  const contrato = encontrado;
  const iniciais = await db
    .select()
    .from(observations)
    .where(eq(observations.subscriptionId, contrato.subscriptionId));
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
      .where(
        and(
          eq(periods.subscriptionId, contrato.subscriptionId),
          inArray(periods.providerInvoiceId, [
            financeiro.identidade("in_original"),
            financeiro.identidade("in_credit"),
            financeiro.identidade("in_renewal"),
          ]),
        ),
      );
  return { ...f, financeiro, contrato, iniciais, ler, vinculos, tentativa, gravar, estados };
}

describe("escrita nativa das provas de financiamento", () => {
  it("copia contrato, observações, capturas e fontes somente do pagante, sem somar provas repetidas", async () => {
    const f = await fixture(),
      outra = await fixture();
    await f.gravar(await f.tentativa(), await f.ler());
    const estados = await f.estados(),
      original = estados.find(
        (e) => e.periodo.providerLineId === f.financeiro.identidade("il_original"),
      );
    if (!original) throw new Error("Original period absent");
    // Additional historical copy fixtures exercise compound pagination, not
    // provider reconciliation or the economic validity of a synthetic charge.
    await db.insert(observations).values(
      Array.from({ length: 105 }, () => ({
        paymentPeriodId: original.periodo.id,
        subscriptionId: f.contrato.subscriptionId,
        provider: "stripe" as const,
        purchaseId: f.contrato.purchaseId,
        groupId: f.contrato.groupId,
        payerUserId: f.adulto.conta.id,
        providerMode: "dev" as const,
        originProductId: f.contrato.originProductId,
        fundingStatus: "review" as const,
        fundedUntil: original.prova.fundedUntil,
        policyVersion: "copy-fixture-v1",
        evidenceHash: `${randomUUID()}${randomUUID()}`.replaceAll("-", ""),
        firstObservedAt: new Date(),
      })),
    );
    await db.insert(captures).values(
      Array.from({ length: 105 }, (_, n) => ({
        observationId: original.prova.id,
        providerChargeId: `ch_copy_${n.toString().padStart(3, "0")}`,
        amountCapturedCents: 1,
        amountRefundedCents: 0,
        disputed: false,
      })),
    );
    await db.insert(sources).values(
      Array.from({ length: 105 }, (_, n) => ({
        observationId: original.prova.id,
        providerChargeId: `ch_copy_${n.toString().padStart(3, "0")}`,
        sourcePaymentPeriodId: original.periodo.id,
        sourceSubscriptionId: f.contrato.subscriptionId,
        sourcePurchaseId: f.contrato.purchaseId,
        sourceOriginProductId: f.contrato.originProductId,
        provider: "stripe" as const,
        groupId: f.contrato.groupId,
        payerUserId: f.adulto.conta.id,
        providerMode: "dev" as const,
      })),
    );
    const propias = await db
      .select()
      .from(observations)
      .where(eq(observations.payerUserId, f.adulto.conta.id));
    const ids = propias.map((o) => o.id);
    const capturas = await db.select().from(captures).where(inArray(captures.observationId, ids));
    const origens = await db.select().from(sources).where(inArray(sources.observationId, ids));
    const copia = await capturarDadosPessoaisDaConta(f.adulto.autor);
    try {
      const texto = copia.bytes.toString("utf8");
      const Linha = z.object({ tipo: z.string(), dados: z.record(z.string(), z.unknown()) });
      const linhas = texto
        .trim()
        .split("\n")
        .map((l) => Linha.parse(JSON.parse(l)));
      const secao = (tipo: string) => linhas.filter((l) => l.tipo === tipo).map((l) => l.dados);
      expect(secao("contrato_nativo")).toEqual([
        expect.objectContaining({
          assinaturaReferencia: f.contrato.subscriptionId,
          produtoOriginal: f.contrato.originProductId,
          produtoAtual: f.contrato.currentProductId,
          revisao: f.contrato.revision,
        }),
      ]);
      expect(secao("conferencia_financeira")).toHaveLength(1);
      expect(secao("observacao_financiamento")).toHaveLength(propias.length);
      expect(secao("captura_observada")).toHaveLength(capturas.length);
      expect(secao("origem_financiamento")).toHaveLength(origens.length);
      expect(secao("leitura_financiamento")).toEqual([
        {
          valoresDeCapturasPodemSeRepetirEntreObservacoes: true,
          valoresDeCapturasNaoRepresentamRateioPorPeriodo: true,
          totaisCalculados: false,
        },
      ]);
      const cobrancaRepetida = origens.filter(
        (o) =>
          o.sourcePaymentPeriodId === original.periodo.id &&
          !o.providerChargeId.startsWith("ch_copy_"),
      );
      expect(cobrancaRepetida.length).toBeGreaterThan(1);
      for (const c of capturas)
        expect(secao("captura_observada")).toContainEqual({
          observacaoReferencia: c.observationId,
          cobrancaReferencia: c.providerChargeId,
          valorCapturadoCentavos: c.amountCapturedCents,
          valorEstornadoCentavos: c.amountRefundedCents,
          contestado: c.disputed,
        });
      for (const segredo of [
        outra.adulto.conta.id,
        outra.adulto.conta.email,
        outra.contrato.subscriptionId,
        outra.recibo.id,
        outra.providerCustomerId,
        f.providerCustomerId,
        f.contrato.originPriceId,
        "leaseToken",
        "leaseUntil",
        "evidenceHash",
        ...propias.map((o) => o.evidenceHash),
      ])
        expect(texto).not.toContain(segredo);
    } finally {
      copia.bytes.fill(0);
    }
  });
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
          eq(events.actorId, f.adulto.conta.id),
          eq(events.eventType, "recreio.payment_funding_observed"),
        ),
      );
    expect(auditoria).toHaveLength(f.iniciais.length + 3);
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
    ).toHaveLength(f.iniciais.length + 3);
    expect(
      await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.actorId, f.adulto.conta.id),
            eq(events.eventType, "recreio.payment_funding_observed"),
          ),
        ),
    ).toHaveLength(f.iniciais.length + 3);
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
    ).toHaveLength(f.iniciais.length + 6);
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
    ).toEqual(f.iniciais);
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
