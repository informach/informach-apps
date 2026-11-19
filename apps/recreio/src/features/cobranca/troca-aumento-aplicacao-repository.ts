import "server-only";
import type { SubscriptionPaymentSnapshot } from "@informach/billing/payment-facts";
import { and, eq } from "@informach/db";
import { recreioPlanChanges as changes } from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { TentativaDeConciliacao } from "./conciliacao-fila-repository";
import {
  type ConferenciaFinanceiraDoCliente,
  conferirMarcaFinanceira,
} from "./financiamento-stripe";
import { aplicarOfertaDaTrocaLocked } from "./troca-aplicacao-repository";
import {
  type AumentoObservado,
  conferirAumentoObservado,
} from "./troca-aumento-execucao-repository";

/** Records a factual commercial application, including a later adverse payment.
 * The exact paid invoice and native funding proof remain mandatory. Game access
 * separately requires verified funding; a refund must not leave the old offer
 * falsely current or permanently block future complete observations. */
export async function aplicarAumentosObservadosLocked(
  tx: Transacao,
  prova: TentativaDeConciliacao,
  observacoes: readonly AumentoObservado[],
  snapshots: readonly SubscriptionPaymentSnapshot[],
  agora: Date,
  financiamento: ConferenciaFinanceiraDoCliente,
) {
  conferirMarcaFinanceira(financiamento);
  assertAllowed(
    financiamento.paganteId === prova.payerUserId &&
      financiamento.modo === prova.providerMode &&
      financiamento.clienteId === prova.customer?.providerCustomerId,
    "ORIGEM_FINANCEIRA",
    "A origem financeira do aumento exige conferência.",
  );
  assertAllowed(
    observacoes.length <= 1,
    "ORIGEM_FINANCEIRA",
    "Há aumentos simultâneos que exigem conferência.",
  );
  for (const observacao of observacoes) {
    if (observacao.fatura.outcome !== "applied") continue;
    const [linha] = await tx
      .select()
      .from(changes)
      .where(
        and(
          eq(changes.id, observacao.tentativa.id),
          eq(changes.groupId, prova.groupId),
          eq(changes.payerUserId, prova.payerUserId),
          eq(changes.providerMode, prova.providerMode),
        ),
      )
      .for("update");
    assertAllowed(
      linha?.requestStartedAt &&
        linha.acceptedAt &&
        linha.prorationAt &&
        linha.kind === "upgrade" &&
        linha.status === "sent" &&
        linha.resolvedAt === null &&
        linha.expectedContractRevision < 2147483646,
      "ORIGEM_FINANCEIRA",
      "O recibo do aumento exige conferência.",
    );
    conferirAumentoObservado(observacao, linha);
    const proporcional = linha.prorationAt;
    const snapshot = snapshots.find((s) => s.subscriptionId === observacao.tentativa.assinatura);
    assertAllowed(
      snapshot &&
        prova.customer &&
        snapshot.customerId === prova.customer.providerCustomerId &&
        snapshot.priceId === linha.toPriceId &&
        snapshot.observedAt.getTime() === prova.startedAt.getTime() &&
        snapshot.origin?.authorizationId === linha.purchaseId &&
        snapshot.origin.productId === linha.originProductId &&
        snapshot.origin.subjectType === "user" &&
        snapshot.origin.subjectId === prova.payerUserId &&
        agora >= proporcional &&
        snapshot.periods.some(
          (p) =>
            p.invoiceId === observacao.fatura.invoiceId &&
            p.priceId === linha.toPriceId &&
            p.start <= proporcional &&
            p.end >= snapshot.end &&
            p.start <= agora &&
            p.paidAt <= agora &&
            financiamento.financiamento.periodos.some(
              (f) =>
                f.faturaId === p.invoiceId &&
                f.linhaId === p.lineId &&
                f.precoId === p.priceId &&
                f.inicio * 1000 === p.start.getTime() &&
                f.fimOriginal * 1000 === p.end.getTime(),
            ),
        ),
      "ORIGEM_FINANCEIRA",
      "A fatura do aumento ainda exige comprovação financeira.",
    );
    await aplicarOfertaDaTrocaLocked(tx, prova, linha, agora);
  }
}
