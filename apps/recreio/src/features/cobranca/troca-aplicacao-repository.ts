import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import type { SubscriptionPaymentSnapshot } from "@informach/billing/payment-facts";
import { and, eq } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { TentativaDeConciliacao } from "./conciliacao-fila-repository";
import { aplicarSelecaoAdmitidaLocked } from "./selecao-aplicacao-repository";
import { type AgendaDaTrocaObservada, conferirAgendaObservada } from "./troca-execucao-repository";

/** Runs only inside the complete financial confirmation transaction. A schedule
 * phase is a commercial change, never payment proof; the existing paid-period
 * reader and final SID revalidation remain authoritative for game access. */
export async function aplicarReducoesObservadasLocked(
  tx: Transacao,
  prova: TentativaDeConciliacao,
  observacoes: readonly AgendaDaTrocaObservada[],
  snapshots: readonly SubscriptionPaymentSnapshot[],
  agora: Date,
) {
  assertAllowed(
    observacoes.length <= 1,
    "ORIGEM_FINANCEIRA",
    "Há trocas simultâneas que exigem conferência.",
  );
  for (const observacao of observacoes) {
    if (observacao.estado !== "applied") continue;
    const [linha] = await tx
      .select()
      .from(changes)
      .where(
        and(
          eq(changes.id, observacao.tentativa.id),
          eq(changes.payerUserId, prova.payerUserId),
          eq(changes.groupId, prova.groupId),
          eq(changes.providerMode, prova.providerMode),
        ),
      )
      .for("update");
    assertAllowed(
      linha?.requestStartedAt &&
        linha.acceptedAt &&
        linha.kind === "downgrade" &&
        linha.resolvedAt === null &&
        linha.expectedContractRevision < 2147483646,
      "ORIGEM_FINANCEIRA",
      "O recibo aplicado exige conferência.",
    );
    conferirAgendaObservada(observacao, linha);
    const snapshot = snapshots.find((s) => s.subscriptionId === observacao.tentativa.assinatura);
    assertAllowed(
      snapshot &&
        prova.customer &&
        snapshot.customerId === prova.customer.providerCustomerId &&
        snapshot.priceId === linha.toPriceId &&
        snapshot.start >= linha.effectiveAt &&
        agora >= linha.effectiveAt &&
        snapshot.observedAt.getTime() === prova.startedAt.getTime() &&
        snapshot.origin?.authorizationId === linha.purchaseId &&
        snapshot.origin.productId === linha.originProductId &&
        snapshot.origin.subjectType === "user" &&
        snapshot.origin.subjectId === prova.payerUserId,
      "ORIGEM_FINANCEIRA",
      "A fase efetiva não corresponde à observação financeira completa.",
    );
    await aplicarOfertaDaTrocaLocked(tx, prova, linha, agora);
  }
}

/** Shared atomic revision/selection writer, called only after the native provider
 * observation and its financial snapshot have been validated by the caller. */
export async function aplicarOfertaDaTrocaLocked(
  tx: Transacao,
  prova: TentativaDeConciliacao,
  linha: typeof changes.$inferSelect,
  agora: Date,
) {
  const [contrato] = await tx
    .select()
    .from(contracts)
    .where(eq(contracts.subscriptionId, linha.subscriptionId))
    .for("update");
  assertAllowed(
    contrato &&
      contrato.purchaseId === linha.purchaseId &&
      contrato.groupId === prova.groupId &&
      contrato.payerUserId === prova.payerUserId &&
      contrato.providerMode === prova.providerMode &&
      contrato.originProductId === linha.originProductId &&
      contrato.revision === linha.expectedContractRevision &&
      contrato.currentProductId === linha.fromProductId &&
      contrato.currentPriceId === linha.fromPriceId &&
      !contrato.coverageReviewRequired,
    "ORIGEM_FINANCEIRA",
    "A revisão do contrato mudou antes da aplicação.",
  );
  const selecao = await tx.select().from(selections).where(eq(selections.planChangeId, linha.id));
  const { emConferencia: reverSelecao } = await aplicarSelecaoAdmitidaLocked(tx, {
    grupoId: prova.groupId,
    paganteId: prova.payerUserId,
    produtoId: linha.toProductId,
    selecao,
    agora,
  });
  const revisao = linha.expectedContractRevision + 1;
  await tx
    .update(changes)
    .set({
      status: "applied",
      appliedAt: agora,
      appliedRevision: revisao,
      resolvedAt: agora,
      reviewRequired: false,
    })
    .where(eq(changes.id, linha.id));
  await tx
    .update(contracts)
    .set({
      currentProductId: linha.toProductId,
      currentPriceId: linha.toPriceId,
      currentPlanChangeId: linha.id,
      currentPlanAppliedAt: agora,
      revision: revisao,
      coverageReviewRequired: reverSelecao,
    })
    .where(eq(contracts.subscriptionId, linha.subscriptionId));
  await logAuditEventStrict(
    "recreio.plan_change_applied",
    prova.payerUserId,
    {
      app: "recreio",
      groupId: prova.groupId,
      planChangeId: linha.id,
      subscriptionId: linha.subscriptionId,
      revision: revisao,
      state: reverSelecao ? "selection_review" : "applied",
    },
    { writer: tx },
  );
}
