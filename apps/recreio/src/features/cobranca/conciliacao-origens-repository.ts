import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import type { SubscriptionPaymentSnapshot } from "@informach/billing/payment-facts";
import { persistUserPaymentSnapshots } from "@informach/billing/user-payment-snapshots";
import type { Product } from "@informach/config";
import { and, db, eq, inArray, isNotNull, isNull, or } from "@informach/db";
import {
  recreioBillingContracts as contracts,
  recreioPurchaseAuthorizations as purchases,
} from "@informach/db/schema";
import { limiteDoPagamentoConciliado } from "@informach/recreio";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { lerSelecaoDaCompraLocked } from "./compra-selecao-repository";
import type { TentativaDeConciliacao } from "./conciliacao-fila-repository";
import { conferirOfertaAtualLocked } from "./contratos-repository";
import { persistirFinanciamentoLocked } from "./financiamento-repository";
import type { ConferenciaFinanceiraDoCliente } from "./financiamento-stripe";
import { aplicarSelecaoAdmitidaLocked } from "./selecao-aplicacao-repository";
import { aplicarReducoesObservadasLocked } from "./troca-aplicacao-repository";
import { aplicarAumentosObservadosLocked } from "./troca-aumento-aplicacao-repository";
import type { AumentoObservado } from "./troca-aumento-execucao-repository";
import type { AgendaDaTrocaObservada } from "./troca-execucao-repository";

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
    trocas?: readonly AgendaDaTrocaObservada[];
    aumentos?: readonly AumentoObservado[];
    financiamento: ConferenciaFinanceiraDoCliente;
  },
) {
  assertAllowed(prova.customer, "COBRANCA", "Cliente financeiro não confirmado.");
  const aceites = new Map<string, typeof purchases.$inferSelect>();
  const pagos = new Set<string>();
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
        produto,
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
          financiadoAte: (() => {
            const origem = entrada.financiamento.financiamento.periodos.find(
              (f) => f.faturaId === p.invoiceId && f.linhaId === p.lineId,
            );
            return origem?.estado === "comprovado" ? new Date(origem.cobertoAte * 1000) : null;
          })(),
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
    aceites.set(snapshot.subscriptionId, aceite);
    if (pagoAte) pagos.add(snapshot.subscriptionId);
  }
  await aplicarReducoesObservadasLocked(
    tx,
    prova,
    entrada.trocas ?? [],
    entrada.snapshots,
    entrada.agora,
  );
  await aplicarAumentosObservadosLocked(
    tx,
    prova,
    entrada.aumentos ?? [],
    entrada.snapshots,
    entrada.agora,
    entrada.financiamento,
  );
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
    const produto = entrada.produtos.find(
      (p) =>
        p.app === "recreio" &&
        p.kind === "subscription" &&
        p.stripePriceId[prova.providerMode] === snapshot.priceId,
    );
    assertAllowed(produto, "ORIGEM_FINANCEIRA", "Oferta financeira não reconhecida.");
    const contrato = await conferirOfertaAtualLocked(tx, {
      subscriptionId,
      purchaseId: aceite.id,
      groupId: prova.groupId,
      payerUserId: prova.payerUserId,
      providerMode: prova.providerMode,
      originProductId: aceite.productId,
      observedProductId: produto.id,
      observedPriceId: snapshot.priceId,
    });
    if (
      contrato.revision === 1 &&
      contrato.purchaseSelectionProcessedAt === null &&
      pagos.has(snapshot.subscriptionId)
    ) {
      const selecao = await lerSelecaoDaCompraLocked(tx, aceite);
      const resultado = await aplicarSelecaoAdmitidaLocked(tx, {
        grupoId: prova.groupId,
        paganteId: prova.payerUserId,
        produtoId: contrato.currentProductId,
        selecao,
        agora: entrada.agora,
      });
      await tx
        .update(contracts)
        .set({
          purchaseSelectionProcessedAt: entrada.agora,
          coverageReviewRequired: resultado.emConferencia,
        })
        .where(eq(contracts.subscriptionId, contrato.subscriptionId));
      await logAuditEventStrict(
        "recreio.purchase_selection_processed",
        prova.payerUserId,
        {
          app: "recreio",
          groupId: prova.groupId,
          authorizationId: aceite.id,
          subscriptionId: contrato.subscriptionId,
          revision: contrato.revision,
          state: resultado.emConferencia ? "selection_review" : "applied",
        },
        { writer: tx },
      );
    }
  }
  await persistirFinanciamentoLocked(
    tx,
    prova,
    entrada.financiamento,
    entrada.snapshots.map((s, i) => {
      const subscriptionId = ids[i];
      assertAllowed(subscriptionId, "ORIGEM_FINANCEIRA", "Contrato não confirmado.");
      return { subscriptionId, providerSubscriptionId: s.subscriptionId };
    }),
  );
}
