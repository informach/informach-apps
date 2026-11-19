import { and, type Database, eq, gt } from "@informach/db";
import {
  customers,
  subscriptionPaymentPeriods as periods,
  subscriptions,
} from "@informach/db/schema";
import { BillingError } from "./errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Snapshot/autoridade pessoal são do coordenador nativo. Este leitor pertence
 * ao domínio financeiro, não decide gameplay e nunca lê outro pagante/app.
 * Páginas de projeções explícitas, sem metadados livres, URLs ou segredos. */
function escopo(contaId: string, limite: number) {
  if (
    !contaId ||
    contaId.length > 256 ||
    !Number.isSafeInteger(limite) ||
    limite < 1 ||
    limite > 100
  )
    throw new BillingError("Invalid personal financial page");
  return and(
    eq(customers.app, "recreio"),
    eq(customers.subjectType, "user"),
    eq(customers.subjectId, contaId),
  );
}

export function readPersonalRecreioSubscriptions(
  tx: Tx,
  contaId: string,
  apos: string | null,
  limite: number,
) {
  const condicao = escopo(contaId, limite);
  return tx
    .select({
      cursor: subscriptions.id,
      produto: subscriptions.productId,
      estado: subscriptions.status,
      inicioPeriodo: subscriptions.currentPeriodStart,
      fimPeriodo: subscriptions.currentPeriodEnd,
      cancelamentoProgramadoEm: subscriptions.cancelAtPeriodEnd,
      canceladaEm: subscriptions.canceledAt,
      confirmadaEm: subscriptions.confirmedAt,
      criadaEm: subscriptions.createdAt,
      emailDeCobranca: customers.email,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(and(condicao, apos ? gt(subscriptions.id, apos) : undefined))
    .orderBy(subscriptions.id)
    .limit(limite);
}

export function readPersonalRecreioPaymentPeriods(
  tx: Tx,
  contaId: string,
  apos: string | null,
  limite: number,
) {
  const condicao = escopo(contaId, limite);
  return tx
    .select({
      cursor: periods.id,
      produto: subscriptions.productId,
      inicioPeriodo: periods.periodStart,
      fimPeriodo: periods.periodEnd,
      pagoEm: periods.paidAt,
      estornadoIntegralmente: periods.fullyRefunded,
      contestado: periods.disputed,
      conciliadoEm: periods.reconciledAt,
    })
    .from(periods)
    .innerJoin(subscriptions, eq(subscriptions.id, periods.subscriptionId))
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(and(condicao, apos ? gt(periods.id, apos) : undefined))
    .orderBy(periods.id)
    .limit(limite);
}
