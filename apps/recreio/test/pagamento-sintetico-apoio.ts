import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioBillingContracts as contracts,
  recreioPaymentFunding as funding,
  recreioGroups as groups,
  recreioBillingReconciliations as jobs,
  recreioFundingObservations as observations,
  subscriptionPaymentPeriods as periods,
  recreioPurchaseAuthorizations as purchases,
  subscriptions,
} from "@informach/db/schema";
import { VERSAO_DO_FINANCIAMENTO } from "@/features/cobranca/financiamento-regras";
import { AceiteDaCompraSchema, conferirOfertaDaCompra } from "@/features/cobranca/regras";
import type { ContaDeTeste } from "./apoio";
import { pedidoDaCompra } from "./compra-apoio";

/** Explicit SQL test facts for admission/fallback. This models an already
 * confirmed contract, not native consent, a provider request or a paid invoice.
 * Actual native/SDK/PG paths have their own isolated gates.
 */
export async function registrarPagamentoSintetico(
  conta: ContaDeTeste,
  assinatura: typeof subscriptions.$inferSelect,
  observadoEm = new Date(),
  falha?: "origem" | "modo" | "fatura",
) {
  const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, conta.id));
  if (!grupo) throw new Error("Fixture payer group absent");
  const pedido = AceiteDaCompraSchema.parse(pedidoDaCompra(assinatura.productId));
  const oferta = conferirOfertaDaCompra(pedido),
    agora = observadoEm;
  if (falha !== "origem")
    await db.insert(purchases).values({
      id: pedido.pedidoId,
      payerUserId: conta.id,
      groupId: grupo.id,
      providerMode: falha === "modo" ? "prod" : "dev",
      ...oferta,
      policyVersion: pedido.versaoDasCondicoes,
      adultDeclarationVersion: pedido.versaoDaDeclaracao,
      acceptedAt: agora,
      requestStartedAt: agora,
      providerSessionId: `cs_fixture_${randomUUID()}`,
      providerSubscriptionId: assinatura.providerSubscriptionId,
      resolvedAt: agora,
      resolution: "checkout_completed",
      reviewRequired: false,
    });
  const [periodo] =
    falha === "fatura"
      ? []
      : await db
          .insert(periods)
          .values({
            subscriptionId: assinatura.id,
            provider: "stripe",
            providerInvoiceId: `in_fixture_${randomUUID()}`,
            providerLineId: `il_fixture_${randomUUID()}`,
            providerPriceId: assinatura.providerPriceId,
            periodStart: assinatura.currentPeriodStart,
            periodEnd: assinatura.currentPeriodEnd,
            paidAt: new Date(agora.getTime() - 1000),
            reconciledAt: agora,
          })
          .returning();
  if (falha !== "origem") {
    await db.insert(contracts).values({
      subscriptionId: assinatura.id,
      purchaseId: pedido.pedidoId,
      groupId: grupo.id,
      payerUserId: conta.id,
      providerMode: falha === "modo" ? "prod" : "dev",
      originProductId: assinatura.productId,
      originPriceId: assinatura.providerPriceId,
      currentProductId: assinatura.productId,
      currentPriceId: assinatura.providerPriceId,
      purchaseSelectionProcessedAt: agora,
    });
    if (periodo) {
      const [prova] = await db
        .insert(observations)
        .values({
          paymentPeriodId: periodo.id,
          subscriptionId: assinatura.id,
          provider: "stripe",
          purchaseId: pedido.pedidoId,
          groupId: grupo.id,
          payerUserId: conta.id,
          providerMode: falha === "modo" ? "prod" : "dev",
          originProductId: assinatura.productId,
          fundingStatus: "verified",
          fundedUntil: periodo.periodEnd,
          policyVersion: VERSAO_DO_FINANCIAMENTO,
          evidenceHash: "0".repeat(64),
          firstObservedAt: agora,
        })
        .returning();
      if (!prova) throw new Error("Synthetic funding proof absent");
      await db
        .insert(funding)
        .values({ paymentPeriodId: periodo.id, observationId: prova.id, observedAt: agora });
    }
  }
  await db
    .update(subscriptions)
    .set({ providerObservedAt: agora })
    .where(eq(subscriptions.id, assinatura.id));
  await db
    .insert(jobs)
    .values({
      payerUserId: conta.id,
      groupId: grupo.id,
      providerMode: "dev",
      createdAt: agora,
      updatedAt: agora,
      lastAttemptAt: agora,
      lastConfirmedAt: agora,
      attemptCount: 1,
      reviewRequired: false,
      reviewReason: null,
      nextAttemptAt: new Date(agora.getTime() + 300_000),
    })
    .onConflictDoUpdate({
      target: [jobs.payerUserId, jobs.providerMode],
      set: {
        updatedAt: agora,
        lastAttemptAt: agora,
        lastConfirmedAt: agora,
        attemptCount: sql`${jobs.attemptCount}+1`,
        reviewRequired: false,
        reviewReason: null,
        nextAttemptAt: new Date(agora.getTime() + 300_000),
      },
    });
  return agora;
}
