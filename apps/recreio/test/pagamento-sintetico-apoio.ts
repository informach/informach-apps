import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioGroups as groups,
  recreioBillingReconciliations as jobs,
  subscriptionPaymentPeriods as periods,
  recreioPurchaseAuthorizations as purchases,
  subscriptions,
} from "@informach/db/schema";
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
) {
  const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, conta.id));
  if (!grupo) throw new Error("Fixture payer group absent");
  const pedido = AceiteDaCompraSchema.parse(pedidoDaCompra(assinatura.productId));
  const oferta = conferirOfertaDaCompra(pedido),
    agora = observadoEm;
  await db.insert(purchases).values({
    id: pedido.pedidoId,
    payerUserId: conta.id,
    groupId: grupo.id,
    providerMode: "dev",
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
  await db.insert(periods).values({
    subscriptionId: assinatura.id,
    provider: "stripe",
    providerInvoiceId: `in_fixture_${randomUUID()}`,
    providerLineId: `il_fixture_${randomUUID()}`,
    providerPriceId: assinatura.providerPriceId,
    periodStart: assinatura.currentPeriodStart,
    periodEnd: assinatura.currentPeriodEnd,
    paidAt: new Date(agora.getTime() - 1000),
    reconciledAt: agora,
  });
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
}
