import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioFundingCaptures as captures,
  recreioBillingContracts as contracts,
  recreioPaymentFunding as current,
  recreioFundingObservations as observations,
  subscriptionPaymentPeriods as periods,
  recreioFundingSourcePeriods as sources,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { codigoDoBanco } from "./apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";

/** SQL integrity only. Native synthetic purchase supplies real scope, then
 * direct fixture rows test constraints. No funding writer/access is certified. */
async function fixture() {
  const f = await fixtureDePagamento();
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  const remoto = f.concluirCheckout();
  const falhas: string[] = [];
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: (entrada) => {
      if (entrada.payerId === f.adulto.conta.id) falhas.push(entrada.reasonCode);
    },
  });
  expect((await processar()).conciliadas).toBe(1);
  expect(falhas).toEqual([]);
  const [contrato] = await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id));
  if (!contrato) throw new Error("Native financial contract absent");
  const [periodo] = await db
    .select()
    .from(periods)
    .where(eq(periods.subscriptionId, contrato.subscriptionId));
  if (!periodo) throw new Error("Native paid period absent");
  const row = {
    id: randomUUID(),
    paymentPeriodId: periodo.id,
    subscriptionId: contrato.subscriptionId,
    provider: "stripe",
    purchaseId: contrato.purchaseId,
    groupId: contrato.groupId,
    payerUserId: contrato.payerUserId,
    providerMode: contrato.providerMode,
    originProductId: contrato.originProductId,
    fundingStatus: "verified",
    fundedUntil: periodo.periodEnd,
    policyVersion: "sql-funding-fixture-v1",
    evidenceHash: "a".repeat(64),
    firstObservedAt: new Date(),
  } satisfies typeof observations.$inferInsert;
  await db.insert(observations).values(row);
  const capture: typeof captures.$inferInsert = {
    observationId: row.id,
    providerChargeId: remoto.charge.id,
    amountCapturedCents: remoto.charge.amount_captured,
    amountRefundedCents: 0,
    disputed: false,
  };
  await db.insert(captures).values(capture);
  const source: typeof sources.$inferInsert = {
    observationId: row.id,
    providerChargeId: capture.providerChargeId,
    sourcePaymentPeriodId: periodo.id,
    sourceSubscriptionId: contrato.subscriptionId,
    sourcePurchaseId: contrato.purchaseId,
    sourceOriginProductId: contrato.originProductId,
    provider: "stripe",
    groupId: contrato.groupId,
    payerUserId: contrato.payerUserId,
    providerMode: contrato.providerMode,
  };
  return { ...f, contrato, periodo, row, capture, source };
}

describe("integridade SQL da origem financeira nativa", () => {
  it("mantém o período original e separa prova imutável do relógio atual", async () => {
    const f = await fixture();
    await db.insert(sources).values(f.source);
    await db
      .insert(current)
      .values({
        paymentPeriodId: f.periodo.id,
        observationId: f.row.id,
        observedAt: f.row.firstObservedAt,
      });
    const [original] = await db.select().from(periods).where(eq(periods.id, f.periodo.id));
    expect(original).toEqual(f.periodo);
    expect(
      await codigoDoBanco(db.insert(observations).values({ ...f.row, id: randomUUID() })),
    ).toBe("23505");
    expect(["23001", "23503"]).toContain(
      await codigoDoBanco(db.delete(observations).where(eq(observations.id, f.row.id))),
    );
    expect(["23001", "23503"]).toContain(
      await codigoDoBanco(db.delete(periods).where(eq(periods.id, f.periodo.id))),
    );
  });
  it("não combina período, contrato ou pagante de outro escopo", async () => {
    const f = await fixture(),
      outro = await fixture();
    for (const patch of [
      { paymentPeriodId: outro.periodo.id },
      { subscriptionId: outro.contrato.subscriptionId },
      { providerMode: "prod" as const },
      { groupId: outro.contrato.groupId },
      { payerUserId: outro.contrato.payerUserId },
      { originProductId: "foreign_product" },
    ])
      expect(
        await codigoDoBanco(
          db.update(observations).set(patch).where(eq(observations.id, f.row.id)),
        ),
      ).toBe("23503");
    expect(
      await codigoDoBanco(
        db
          .insert(current)
          .values({
            paymentPeriodId: outro.periodo.id,
            observationId: f.row.id,
            observedAt: new Date(),
          }),
      ),
    ).toBe("23503");
  });
  it("fontes precisam da mesma captura observada e do contrato nativo do mesmo pagante", async () => {
    const f = await fixture(),
      outro = await fixture();
    for (const patch of [
      { providerChargeId: "ch_foreign" },
      { sourcePaymentPeriodId: outro.periodo.id },
      { sourceSubscriptionId: outro.contrato.subscriptionId },
      { sourcePurchaseId: outro.contrato.purchaseId },
      { payerUserId: outro.contrato.payerUserId },
      { groupId: outro.contrato.groupId },
      { providerMode: "prod" as const },
    ])
      expect(await codigoDoBanco(db.insert(sources).values({ ...f.source, ...patch }))).toBe(
        "23503",
      );
    await db.insert(sources).values(f.source);
    expect(await codigoDoBanco(db.insert(sources).values(f.source))).toBe("23505");
  });
  it("não aceita estados/hash/datas inválidos ou valores monetários falsos", async () => {
    const f = await fixture();
    expect(
      await codigoDoBanco(
        db
          .update(observations)
          .set({ evidenceHash: "incomplete" })
          .where(eq(observations.id, f.row.id)),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(
        db.update(observations).set({ provider: "asaas" }).where(eq(observations.id, f.row.id)),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(
        db.execute(
          sql`update recreio.funding_observations set funded_until='infinity' where id=${f.row.id}`,
        ),
      ),
    ).toBe("23514");
    for (const patch of [
      { amountCapturedCents: 0 },
      { amountRefundedCents: -1 },
      { amountRefundedCents: f.capture.amountCapturedCents + 1 },
    ])
      expect(
        await codigoDoBanco(
          db.update(captures).set(patch).where(eq(captures.observationId, f.row.id)),
        ),
      ).toBe("23514");
    expect(
      await codigoDoBanco(
        db
          .insert(current)
          .values({
            paymentPeriodId: f.periodo.id,
            observationId: f.row.id,
            observedAt: sql`'infinity'::timestamptz`,
          }),
      ),
    ).toBe("23514");
  });
});
