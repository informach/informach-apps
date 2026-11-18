import "server-only";
import type { SubscriptionPaymentSnapshot } from "@informach/billing/payment-facts";
import { persistUserPaymentSnapshots } from "@informach/billing/user-payment-snapshots";
import type { Product } from "@informach/config";
import { and, db, eq, inArray, isNotNull, isNull, or } from "@informach/db";
import { recreioPurchaseAuthorizations as purchases } from "@informach/db/schema";
import { limiteDoPagamentoConciliado } from "@informach/recreio";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { TentativaDeConciliacao } from "./conciliacao-fila-repository";
import { garantirContratoOriginalLocked } from "./contratos-repository";

export type VinculoDoCheckout = {
  authorizationId: string;
  sessionId: string;
  subscriptionId: string;
};

/** Scoped read for a technical attempt already admitted under the lifecycle.
 * Browser-provided identity never reaches this adapter.
 */
export async function lerOrigensDaConciliacao(
  prova: TentativaDeConciliacao,
  ids: readonly string[],
) {
  if (!ids.length) return [];
  return db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.payerUserId, prova.payerUserId),
        eq(purchases.groupId, prova.groupId),
        eq(purchases.providerMode, prova.providerMode),
        inArray(purchases.id, [...ids]),
        isNotNull(purchases.requestStartedAt),
        or(isNull(purchases.resolution), eq(purchases.resolution, "checkout_completed")),
      ),
    );
}

/** Same transaction as the financial confirmation/SID revalidation. Origin is
 * re-read under lock after network I/O; a completed Checkout alone grants nothing.
 */
export async function persistirFatosDaConciliacao(
  tx: Transacao,
  prova: TentativaDeConciliacao,
  entrada: {
    snapshots: readonly SubscriptionPaymentSnapshot[];
    produtos: readonly Product[];
    vinculos: readonly VinculoDoCheckout[];
    agora: Date;
  },
) {
  assertAllowed(prova.customer, "COBRANCA", "Cliente financeiro não confirmado.");
  const aceites = new Map<string, { id: string; productId: string }>();
  for (const snapshot of entrada.snapshots) {
    const origem = snapshot.origin;
    assertAllowed(
      origem && origem.subjectType === "user" && origem.subjectId === prova.payerUserId,
      "ORIGEM_FINANCEIRA",
      "A origem da assinatura exige conferência.",
    );
    const [aceite] = await tx
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.id, origem.authorizationId),
          eq(purchases.payerUserId, prova.payerUserId),
          eq(purchases.groupId, prova.groupId),
          eq(purchases.providerMode, prova.providerMode),
        ),
      )
      .for("update");
    const produto = entrada.produtos.find(
      (p) =>
        p.app === "recreio" &&
        p.kind === "subscription" &&
        p.stripePriceId[prova.providerMode] === snapshot.priceId,
    );
    assertAllowed(
      aceite?.requestStartedAt &&
        (aceite.resolution === null || aceite.resolution === "checkout_completed") &&
        aceite.productId === origem.productId &&
        produto?.id === aceite.productId,
      "ORIGEM_FINANCEIRA",
      "A oferta da assinatura exige conferência.",
    );
    const vinculo = entrada.vinculos.find(
      (v) => v.authorizationId === aceite.id && v.subscriptionId === snapshot.subscriptionId,
    );
    const sessaoId = aceite.providerSessionId ?? vinculo?.sessionId;
    assertAllowed(
      sessaoId &&
        (aceite.providerSubscriptionId === snapshot.subscriptionId ||
          (aceite.providerSubscriptionId === null && vinculo && vinculo.sessionId === sessaoId)),
      "ORIGEM_FINANCEIRA",
      "O vínculo do Checkout exige conferência.",
    );
    const pagoAte = limiteDoPagamentoConciliado(
      {
        status: snapshot.status,
        precoId: snapshot.priceId,
        inicioDoPeriodo: snapshot.start,
        fimDoPeriodo: snapshot.end,
        fimDoTeste: snapshot.trialEnd,
        cancelaEm: snapshot.cancelAtPeriodEnd ? snapshot.end : null,
        origemAdmitida: true,
        conferidoEm: entrada.agora,
        emConferencia: false,
        periodos: snapshot.periods.map((p) => ({
          precoId: p.priceId,
          inicio: p.start,
          fim: p.end,
          pagoEm: p.paidAt,
          estornado: p.fullyRefunded,
          contestado: p.disputed,
        })),
      },
      entrada.agora,
    );
    await tx
      .update(purchases)
      .set({
        providerSessionId: sessaoId,
        providerSubscriptionId: snapshot.subscriptionId,
        ...(aceite.resolvedAt
          ? {}
          : pagoAte
            ? {
                resolvedAt: entrada.agora,
                resolution: "checkout_completed" as const,
                reviewRequired: false,
              }
            : { reviewRequired: true }),
      })
      .where(
        and(
          eq(purchases.id, aceite.id),
          eq(purchases.payerUserId, prova.payerUserId),
          eq(purchases.providerMode, prova.providerMode),
        ),
      );
    aceites.set(snapshot.subscriptionId, { id: aceite.id, productId: aceite.productId });
  }
  const ids = await persistUserPaymentSnapshots(tx, {
    app: "recreio",
    payerId: prova.payerUserId,
    customerId: prova.customer.id,
    providerCustomerId: prova.customer.providerCustomerId,
    mode: prova.providerMode,
    products: entrada.produtos,
    snapshots: entrada.snapshots,
  });
  for (const [index, snapshot] of entrada.snapshots.entries()) {
    const subscriptionId = ids[index];
    const aceite = aceites.get(snapshot.subscriptionId);
    assertAllowed(subscriptionId && aceite, "ORIGEM_FINANCEIRA", "Contrato não confirmado.");
    await garantirContratoOriginalLocked(tx, {
      subscriptionId,
      purchaseId: aceite.id,
      groupId: prova.groupId,
      payerUserId: prova.payerUserId,
      providerMode: prova.providerMode,
      originProductId: aceite.productId,
      originPriceId: snapshot.priceId,
    });
  }
}
