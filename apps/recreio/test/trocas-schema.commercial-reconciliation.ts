import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioBillingReconciliations as financialJobs,
  recreioProfiles as profiles,
  recreioPurchaseAuthorizations as purchases,
  recreioPlanChangeProfiles as selections,
  subscriptions,
} from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { lerFatosDoGrupo } from "@/features/acesso/repository";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { conferirOfertaAtualLocked } from "@/features/cobranca/contratos-repository";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { codigoDoBanco } from "./apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";

/** SQL integrity only: native synthetic purchase, then direct rows/constraints.
 * No plan-change writer, provider settlement or new access is being certified. */
async function fixture() {
  const f = await fixtureDePagamento();
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
  const [purchase] = await db.select().from(purchases).where(eq(purchases.id, f.recibo.id));
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, remoto.assinatura.id));
  if (!purchase || !subscription) throw new Error("Native synthetic financial origin absent");
  const origin: typeof contracts.$inferInsert = {
    subscriptionId: subscription.id,
    purchaseId: purchase.id,
    groupId: purchase.groupId,
    payerUserId: purchase.payerUserId,
    providerMode: purchase.providerMode,
    originProductId: purchase.productId,
    originPriceId: subscription.providerPriceId,
    currentProductId: purchase.productId,
    currentPriceId: subscription.providerPriceId,
  };
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.subscriptionId, subscription.id));
  expect(contract).toMatchObject({ ...origin, revision: 1, currentPlanChangeId: null });
  const [confirmed] = await db
    .select()
    .from(financialJobs)
    .where(eq(financialJobs.payerUserId, origin.payerUserId));
  if (!confirmed?.lastConfirmedAt) throw new Error("Native synthetic confirmation absent");
  // Logical SQL receipt times follow the actual confirmation; no provider clock claim.
  const now = new Date(confirmed.lastConfirmedAt.getTime() + 1000);
  const quote: typeof changes.$inferInsert = {
    id: randomUUID(),
    subscriptionId: subscription.id,
    purchaseId: purchase.id,
    groupId: purchase.groupId,
    payerUserId: purchase.payerUserId,
    providerMode: purchase.providerMode,
    originProductId: purchase.productId,
    expectedContractRevision: 1,
    fromProductId: purchase.productId,
    fromPriceId: subscription.providerPriceId,
    toProductId: "recreio_family_monthly",
    toPriceId: "price_recreio_family_monthly",
    toAmountCents: 12790,
    toInterval: "month",
    kind: "upgrade",
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    effectiveAt: now,
    prorationAt: now,
    quotedAmountCents: 6800,
    quotedSubtotalCents: 12790,
    quotedCreditCents: -5990,
    quotedTotalCents: 6800,
    currency: "BRL",
    policyVersion: "troca-fixture-v1",
    quotedAt: now,
    quoteExpiresAt: new Date(now.getTime() + 300_000),
    status: "quoted",
  };
  await db.insert(changes).values(quote);
  const acceptedAt = new Date(now.getTime() + 1);
  const requestStartedAt = new Date(now.getTime() + 2);
  const appliedAt = new Date(now.getTime() + 3);
  const applied: Partial<typeof changes.$inferInsert> = {
    acceptedAt,
    requestStartedAt,
    appliedAt,
    resolvedAt: appliedAt,
    appliedRevision: 2,
    providerInvoiceId: `in_change_${randomUUID()}`,
    status: "applied",
  };
  const current: Partial<typeof contracts.$inferInsert> = {
    currentProductId: quote.toProductId,
    currentPriceId: quote.toPriceId,
    revision: 2,
    currentPlanChangeId: quote.id,
    currentPlanAppliedAt: appliedAt,
  };
  return { origin, quote, applied, current, now, processar, falhas };
}

describe("recibos e autoridade atual das trocas no PostgreSQL", () => {
  it("admite somente a oferta atual aplicada sem reinicializar origem ou revisão", async () => {
    const f = await fixture();
    await db.update(changes).set(f.applied).where(eq(changes.id, f.quote.id));
    await db
      .update(contracts)
      .set(f.current)
      .where(eq(contracts.subscriptionId, f.origin.subscriptionId));
    const atual = await db.transaction((tx) =>
      conferirOfertaAtualLocked(tx, {
        subscriptionId: f.origin.subscriptionId,
        purchaseId: f.origin.purchaseId,
        groupId: f.origin.groupId,
        payerUserId: f.origin.payerUserId,
        providerMode: f.origin.providerMode,
        originProductId: f.origin.originProductId,
        observedProductId: f.quote.toProductId,
        observedPriceId: f.quote.toPriceId,
      }),
    );
    expect(atual).toMatchObject({
      ...f.current,
      originProductId: f.origin.originProductId,
      originPriceId: f.origin.originPriceId,
    });
    await expect(
      db.transaction((tx) =>
        conferirOfertaAtualLocked(tx, {
          subscriptionId: f.origin.subscriptionId,
          purchaseId: f.origin.purchaseId,
          groupId: f.origin.groupId,
          payerUserId: f.origin.payerUserId,
          providerMode: f.origin.providerMode,
          originProductId: f.origin.originProductId,
          observedProductId: f.origin.originProductId,
          observedPriceId: f.origin.originPriceId,
        }),
      ),
    ).rejects.toMatchObject({ code: "ORIGEM_FINANCEIRA" });
  });

  it("oferta diferente da compra não cria revisão inicial quando não há autoridade atual", async () => {
    const f = await fixture();
    await db.delete(contracts).where(eq(contracts.subscriptionId, f.origin.subscriptionId));
    await expect(
      db.transaction((tx) =>
        conferirOfertaAtualLocked(tx, {
          subscriptionId: f.origin.subscriptionId,
          purchaseId: f.origin.purchaseId,
          groupId: f.origin.groupId,
          payerUserId: f.origin.payerUserId,
          providerMode: f.origin.providerMode,
          originProductId: f.origin.originProductId,
          observedProductId: f.quote.toProductId,
          observedPriceId: f.quote.toPriceId,
        }),
      ),
    ).rejects.toMatchObject({ code: "ORIGEM_FINANCEIRA" });
    expect(
      await db
        .select()
        .from(contracts)
        .where(eq(contracts.subscriptionId, f.origin.subscriptionId)),
    ).toEqual([]);
  });

  it("oferta atual com escopo de outro pagante é recusada mesmo com destino igual", async () => {
    const f = await fixture();
    await expect(
      db.transaction((tx) =>
        conferirOfertaAtualLocked(tx, {
          subscriptionId: f.origin.subscriptionId,
          purchaseId: f.origin.purchaseId,
          groupId: f.origin.groupId,
          payerUserId: "foreign_payer",
          providerMode: f.origin.providerMode,
          originProductId: f.origin.originProductId,
          observedProductId: f.origin.originProductId,
          observedPriceId: f.origin.originPriceId,
        }),
      ),
    ).rejects.toMatchObject({ code: "ORIGEM_FINANCEIRA" });
  });
  it("preserva os valores aceitos e recusa oferta futura ou parcelas inválidas", async () => {
    const f = await fixture();
    for (const patch of [
      { toAmountCents: 0 },
      { quotedSubtotalCents: -1 },
      { quotedCreditCents: 1 },
    ])
      expect(
        await codigoDoBanco(db.update(changes).set(patch).where(eq(changes.id, f.quote.id))),
      ).toBe("23514");
    const [saved] = await db.select().from(changes).where(eq(changes.id, f.quote.id));
    expect(saved).toMatchObject({
      toAmountCents: 12790,
      toInterval: "month",
      quotedSubtotalCents: 12790,
      quotedCreditCents: -5990,
      quotedTotalCents: 6800,
    });
  });
  it("revisão de seleção exige troca aplicada e aparece no leitor financeiro", async () => {
    const f = await fixture();
    expect(
      await codigoDoBanco(
        db
          .update(contracts)
          .set({ coverageReviewRequired: true })
          .where(eq(contracts.subscriptionId, f.origin.subscriptionId)),
      ),
    ).toBe("23514");
    await db.update(changes).set(f.applied).where(eq(changes.id, f.quote.id));
    await db
      .update(contracts)
      .set({ ...f.current, coverageReviewRequired: true })
      .where(eq(contracts.subscriptionId, f.origin.subscriptionId));
    const facts = await lerFatosDoGrupo(GrupoIdSchema.parse(f.origin.groupId));
    expect(facts?.assinaturaAtiva?.financeiro.emConferencia).toBe(true);
  });
  it("o leitor não volta à compra original quando a autoridade atual já mudou", async () => {
    const f = await fixture();
    const ler = () => lerFatosDoGrupo(GrupoIdSchema.parse(f.origin.groupId));
    expect((await ler())?.assinaturaAtiva?.financeiro.origemAdmitida).toBe(true);
    await db.update(changes).set(f.applied).where(eq(changes.id, f.quote.id));
    await db
      .update(contracts)
      .set(f.current)
      .where(eq(contracts.subscriptionId, f.origin.subscriptionId));
    expect((await ler())?.assinaturaAtiva?.financeiro.origemAdmitida).toBe(false);
    // Changing a projection alone cannot refresh the financial confirmation.
    await db
      .update(subscriptions)
      .set({ productId: f.quote.toProductId, providerPriceId: f.quote.toPriceId })
      .where(eq(subscriptions.id, f.origin.subscriptionId));
    expect((await ler())?.assinaturaAtiva?.financeiro.origemAdmitida).toBe(false);
  });
  it("uma conciliação da oferta original não sobrescreve contrato que já aponta para outra revisão", async () => {
    const f = await fixture();
    await db.update(changes).set(f.applied).where(eq(changes.id, f.quote.id));
    await db
      .update(contracts)
      .set(f.current)
      .where(eq(contracts.subscriptionId, f.origin.subscriptionId));
    await db.execute(
      sql`update recreio.billing_reconciliations set next_attempt_at=clock_timestamp() where payer_user_id=${f.origin.payerUserId} and provider_mode='dev'`,
    );
    expect(await f.processar()).toMatchObject({
      conciliadas: 0,
      emConferencia: 1,
      falhasTecnicas: 0,
    });
    expect(f.falhas).toEqual(["foreign_contract"]);
    const [saved] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.subscriptionId, f.origin.subscriptionId));
    expect(saved).toMatchObject(f.current);
  });
  it("não admite oferta nova antes do recibo aplicado e depois exige a revisão exata", async () => {
    const f = await fixture();
    const update = () =>
      db
        .update(contracts)
        .set(f.current)
        .where(eq(contracts.subscriptionId, f.origin.subscriptionId));
    expect(await codigoDoBanco(update())).toBe("23503");
    await db.update(changes).set(f.applied).where(eq(changes.id, f.quote.id));
    await update();
    const [atual] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.subscriptionId, f.origin.subscriptionId));
    expect(atual).toMatchObject({
      revision: 2,
      currentProductId: f.quote.toProductId,
      currentPlanChangeId: f.quote.id,
    });
    expect(
      await codigoDoBanco(
        db
          .update(contracts)
          .set({ revision: 3 })
          .where(eq(contracts.subscriptionId, f.origin.subscriptionId)),
      ),
    ).toBe("23503");
    expect(
      await codigoDoBanco(
        db
          .update(contracts)
          .set({ currentProductId: f.quote.fromProductId, currentPriceId: f.quote.fromPriceId })
          .where(eq(contracts.subscriptionId, f.origin.subscriptionId)),
      ),
    ).toBe("23503");
    expect(["23001", "23503"]).toContain(
      await codigoDoBanco(db.delete(changes).where(eq(changes.id, f.quote.id))),
    );
  });

  it("a compra original prende pagante, grupo, modo e produto", async () => {
    const f = await fixture();
    for (const mismatch of [
      { payerUserId: "foreign_payer" },
      { groupId: randomUUID() },
      { providerMode: "prod" as const },
      { originProductId: "foreign_product" },
    ]) {
      expect(
        await codigoDoBanco(db.update(changes).set(mismatch).where(eq(changes.id, f.quote.id))),
      ).toBe("23503");
      expect(
        await codigoDoBanco(
          db
            .update(contracts)
            .set(
              mismatch.originProductId
                ? { ...mismatch, currentProductId: mismatch.originProductId }
                : mismatch,
            )
            .where(eq(contracts.subscriptionId, f.origin.subscriptionId)),
        ),
      ).toBe("23503");
    }
  });

  it("não inventa revisão inicial, repetição pendente ou preço inicial diferente", async () => {
    const f = await fixture();
    expect(
      await codigoDoBanco(
        db
          .update(contracts)
          .set({ revision: 2 })
          .where(eq(contracts.subscriptionId, f.origin.subscriptionId)),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(
        db
          .update(contracts)
          .set({ currentPriceId: "price_foreign" })
          .where(eq(contracts.subscriptionId, f.origin.subscriptionId)),
      ),
    ).toBe("23514");
    expect(await codigoDoBanco(db.insert(changes).values({ ...f.quote, id: randomUUID() }))).toBe(
      "23505",
    );
  });

  it("recusa aceite vencido, envio sem aceite e aplicação sem tentativa/fatura", async () => {
    const f = await fixture();
    const update = (patch: Partial<typeof changes.$inferInsert>) =>
      db.update(changes).set(patch).where(eq(changes.id, f.quote.id));
    expect(
      await codigoDoBanco(update({ status: "accepted", acceptedAt: f.quote.quoteExpiresAt })),
    ).toBe("23514");
    expect(await codigoDoBanco(update({ status: "sent", requestStartedAt: f.now }))).toBe("23514");
    expect(await codigoDoBanco(update({ ...f.applied, requestStartedAt: null }))).toBe("23514");
    expect(await codigoDoBanco(update({ ...f.applied, providerInvoiceId: null }))).toBe("23514");
    expect(await codigoDoBanco(update({ ...f.applied, appliedRevision: 3 }))).toBe("23514");
  });

  it("redução não admite proporcional, vigência antecipada ou aplicação antes do fim pago", async () => {
    const f = await fixture();
    const downgrade = {
      kind: "downgrade" as const,
      prorationAt: null,
      quotedAmountCents: 0,
      quotedSubtotalCents: 0,
      quotedCreditCents: 0,
      quotedTotalCents: 0,
      effectiveAt: f.quote.periodEnd,
    };
    const update = (patch: Partial<typeof changes.$inferInsert>) =>
      db.update(changes).set(patch).where(eq(changes.id, f.quote.id));
    // Direct SQL fixture tests the timing constraint, independently of catalog classification.
    await update(downgrade);
    expect(await codigoDoBanco(update({ quotedAmountCents: 1 }))).toBe("23514");
    expect(await codigoDoBanco(update({ effectiveAt: f.now }))).toBe("23514");
    expect(
      await codigoDoBanco(
        update({ ...f.applied, providerInvoiceId: null, providerScheduleId: "sub_sched_fixture" }),
      ),
    ).toBe("23514");
  });

  it("apagamento de perfil invalida seleção sem apagar o recibo da troca", async () => {
    const f = await fixture();
    // Bare SQL row only: does not certify a native child registration or responsibility.
    const [perfil] = await db
      .insert(profiles)
      .values({ groupId: f.origin.groupId, kind: "minor", nickname: "Fixture SQL" })
      .returning();
    if (!perfil) throw new Error("SQL profile absent");
    const selection = {
      planChangeId: f.quote.id,
      groupId: f.origin.groupId,
      profileReference: perfil.id,
      profileId: perfil.id,
      policyVersion: 1,
      coverageEnabled: true,
    };
    expect(
      await codigoDoBanco(
        db.insert(selections).values({ ...selection, profileReference: randomUUID() }),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(db.insert(selections).values({ ...selection, groupId: randomUUID() })),
    ).toBe("23503");
    await db.insert(selections).values(selection);
    await db.delete(profiles).where(eq(profiles.id, perfil.id));
    const [saved] = await db
      .select()
      .from(selections)
      .where(eq(selections.planChangeId, f.quote.id));
    expect(saved).toMatchObject({ profileId: null, profileReference: perfil.id, policyVersion: 1 });
    expect(await db.select().from(changes).where(eq(changes.id, f.quote.id))).toHaveLength(1);
  });
});
