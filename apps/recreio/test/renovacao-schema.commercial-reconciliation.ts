import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioBillingContracts as contracts,
  customers,
  subscriptions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { codigoDoBanco, novaConta } from "./apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";

/** Somente integridade SQL, com origem financeira sintética nativa já conciliada.
 * Não confirma cancelamento no Stripe, consentimento público ou liquidação real. */
async function fixture() {
  const f = await fixtureDePagamento();
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  f.concluirCheckout();
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: () => {},
  });
  expect((await processar()).conciliadas).toBe(1);
  const [c] = await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id));
  if (!c) throw new Error("Native synthetic contract absent");
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, c.subscriptionId));
  const [customer] = s
    ? await db.select().from(customers).where(eq(customers.id, s.customerId))
    : [];
  if (!s || !customer) throw new Error("Native synthetic provider references absent");
  const agora = new Date();
  const dados: typeof cancellations.$inferInsert = {
    id: randomUUID(),
    subscriptionId: c.subscriptionId,
    purchaseId: c.purchaseId,
    groupId: c.groupId,
    payerUserId: c.payerUserId,
    providerMode: c.providerMode,
    originProductId: c.originProductId,
    expectedContractRevision: c.revision,
    expectedProductId: c.currentProductId,
    expectedPriceId: c.currentPriceId,
    expectedPeriodEnd: s.currentPeriodEnd,
    providerCustomerId: customer.providerCustomerId,
    providerSubscriptionId: s.providerSubscriptionId,
    initiator: "native",
    policyVersion: "renovacao-2026-11-19-v1",
    source: "a".repeat(40),
    authenticatedAt: f.adulto.autor.login.criadoEm,
    acceptedAt: agora,
    state: "accepted",
    nextAttemptAt: agora,
    createdAt: agora,
    updatedAt: agora,
  };
  await db.insert(cancellations).values(dados);
  return { ...f, dados, agora };
}
const atualizacao = db.update(cancellations);
type Delta = Parameters<typeof atualizacao.set>[0];

describe("cancelamento da renovação: integridade do recibo durável", () => {
  it("aceite não é tentativa/observação/confirmação e não admite segundo pedido para o mesmo contrato", async () => {
    const f = await fixture();
    expect(
      (await db.select().from(cancellations).where(eq(cancellations.id, f.dados.id)))[0],
    ).toMatchObject({
      state: "accepted",
      requestStartedAt: null,
      attempts: 0,
      observedAt: null,
      confirmedAt: null,
      providerResult: null,
      observationSha256: null,
    });
    expect(
      await codigoDoBanco(db.insert(cancellations).values({ ...f.dados, id: randomUUID() })),
    ).toBe("23505");
  });

  it("FK composta recusa outro pagante, grupo, namespace, compra ou origem", async () => {
    const f = await fixture(),
      outro = await novaConta();
    const invalidos: Delta[] = [
      { payerUserId: outro.id },
      { groupId: randomUUID() },
      { providerMode: "prod" },
      { purchaseId: randomUUID() },
      { originProductId: "outro_produto" },
    ];
    for (const delta of invalidos)
      expect(
        await codigoDoBanco(
          db.update(cancellations).set(delta).where(eq(cancellations.id, f.dados.id)),
        ),
      ).toBe("23503");
  });

  it("recusa confirmação parcial, conferência sem motivo, contador falso e prazo infinito", async () => {
    const f = await fixture();
    const invalidos: Delta[] = [
      { state: "confirmed" },
      { state: "attempted" },
      { state: "review" },
      { attempts: 1 },
      { requestStartedAt: f.agora },
      { reviewCode: "provider_unavailable" },
      { providerResult: "scheduled" },
      { observedAt: f.agora },
      { expectedPeriodEnd: sql`'infinity'::timestamptz` },
      { leaseToken: randomUUID(), leaseUntil: sql`'infinity'::timestamptz` },
      { initiator: "account_closure" },
      { closureOperationId: randomUUID() },
    ];
    for (const delta of invalidos)
      expect(
        await codigoDoBanco(
          db.update(cancellations).set(delta).where(eq(cancellations.id, f.dados.id)),
        ),
      ).toBe("23514");
  });

  it("tentativa anterior e observação completa são necessárias; confirmação não conserva lease", async () => {
    const f = await fixture(),
      tentou = new Date(f.agora.getTime() + 1000),
      viu = new Date(f.agora.getTime() + 2000);
    await db
      .update(cancellations)
      .set({ state: "attempted", requestStartedAt: tentou, attempts: 1, updatedAt: tentou })
      .where(eq(cancellations.id, f.dados.id));
    const confirmacao: Delta = {
      state: "confirmed",
      providerResult: "scheduled",
      providerStopAt: f.dados.expectedPeriodEnd,
      observationSha256: "b".repeat(64),
      observedAt: viu,
      confirmedAt: viu,
      updatedAt: viu,
    };
    expect(
      await codigoDoBanco(
        db
          .update(cancellations)
          .set({
            ...confirmacao,
            leaseToken: randomUUID(),
            leaseUntil: new Date(viu.getTime() + 120_000),
          })
          .where(eq(cancellations.id, f.dados.id)),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(
        db
          .update(cancellations)
          .set({ ...confirmacao, providerStopAt: viu })
          .where(eq(cancellations.id, f.dados.id)),
      ),
    ).toBe("23514");
    await db.update(cancellations).set(confirmacao).where(eq(cancellations.id, f.dados.id));
    expect(
      (await db.select().from(cancellations).where(eq(cancellations.id, f.dados.id)))[0],
    ).toMatchObject({ state: "confirmed", leaseToken: null, leaseUntil: null });
  });
});
