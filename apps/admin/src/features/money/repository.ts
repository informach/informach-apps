import "server-only";
import { PRO_STATUSES } from "@informach/billing";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "@informach/db";
import {
  creditLedger,
  creditReservations,
  customers,
  oneTimePayments,
  subscriptions,
  users,
  webhookEvents,
} from "@informach/db/schema";
import { readDb } from "@/lib/read-db";
import { iso } from "../overview/sql-time";
import { type MovementRow, type ScheduledRow, STRIPE_RETRY_DAYS, type StatusRow } from "./logic";

/**
 * Leituras de dinheiro. Só agregados e os campos necessários para achar a
 * pessoa: nunca `payload` nem `error` do webhook (podem carregar dados do
 * provedor), nunca e-mail.
 */

/** Assinaturas por app, produto e situação, de todas as épocas. */
export async function subscriptionStatusRows(): Promise<StatusRow[]> {
  const rows = await readDb()
    .select({
      app: customers.app,
      productId: subscriptions.productId,
      status: subscriptions.status,
      total: count(),
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .groupBy(customers.app, subscriptions.productId, subscriptions.status);
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

export type AppCount = { app: string; total: number };

/**
 * Assinaturas Pro com fim já marcado, por app e pelo plano que vem depois:
 * `pending_product_id` vazio é cancelamento; preenchido é troca de plano.
 */
export async function scheduledChanges(): Promise<ScheduledRow[]> {
  const rows = await readDb()
    .select({
      app: customers.app,
      pendingProductId: subscriptions.pendingProductId,
      total: count(),
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        inArray(subscriptions.status, [...PRO_STATUSES]),
        isNotNull(subscriptions.cancelAtPeriodEnd),
      ),
    )
    .groupBy(customers.app, subscriptions.pendingProductId);
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/**
 * Assinaturas que entram no movimento desde `since`, com um dia de folga para
 * achar a assinatura antiga de uma troca de plano. O `canceled_at` do Stripe é a
 * data do pedido; a cancelada no fim do período terminou no fim marcado.
 */
export async function subscriptionMovementRows(since: Date): Promise<MovementRow[]> {
  const from = iso(new Date(since.getTime() - 86_400_000));
  const endedAt = sql<Date | null>`case when ${subscriptions.status} = 'canceled'
    then coalesce(${subscriptions.cancelAtPeriodEnd}, ${subscriptions.canceledAt}, ${subscriptions.updatedAt}) end`;
  const rows = await readDb()
    .select({
      id: subscriptions.id,
      customerId: subscriptions.customerId,
      app: customers.app,
      status: subscriptions.status,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      previousSubscription: sql<string | null>`${subscriptions.metadata}->>'previous_subscription'`,
      createdAt: subscriptions.createdAt,
      confirmedAt: subscriptions.confirmedAt,
      endedAt,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      or(
        sql`${subscriptions.confirmedAt} >= ${from}`,
        sql`${subscriptions.createdAt} >= ${from}`,
        sql`${endedAt} >= ${from}`,
      ),
    );
  return rows.map((row) => ({
    ...row,
    endedAt: row.endedAt ? new Date(row.endedAt) : null,
  }));
}

export type PastDueRow = {
  userId: string;
  name: string;
  app: string;
  productId: string;
  /** Início do período cuja renovação não foi paga. */
  periodStart: Date;
  providerSubscriptionId: string;
};

export async function pastDueSubscriptions(limit = 50): Promise<PastDueRow[]> {
  return readDb()
    .select({
      userId: users.id,
      name: users.name,
      app: customers.app,
      productId: subscriptions.productId,
      periodStart: subscriptions.currentPeriodStart,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(users, eq(customers.subjectId, users.id))
    .where(and(eq(subscriptions.status, "past_due"), eq(customers.subjectType, "user")))
    .orderBy(subscriptions.currentPeriodStart)
    .limit(limit);
}

export async function pastDueByApp(): Promise<AppCount[]> {
  const rows = await readDb()
    .select({ app: customers.app, total: count() })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(eq(subscriptions.status, "past_due"))
    .groupBy(customers.app);
  return rows.map((row) => ({ app: row.app, total: Number(row.total) }));
}

export type WebhookProblem = {
  id: string;
  eventType: string;
  providerEventId: string;
  attempts: number;
  createdAt: Date;
};

/**
 * Avisos do Stripe sem processamento: deram erro ou ficaram presos no meio
 * (começaram há mais de 15 minutos e não terminaram). O Stripe reenvia por três
 * dias; depois disso o aviso não volta sozinho, por isso a janela é de 30 dias.
 */
function webhookProblemFilter(since: Date, now: Date) {
  const stuckBefore = new Date(now.getTime() - 15 * 60_000);
  return and(
    isNull(webhookEvents.processedAt),
    gte(webhookEvents.createdAt, since),
    or(isNotNull(webhookEvents.error), lt(webhookEvents.processingStartedAt, stuckBefore)),
  );
}

export async function webhookProblems(
  since: Date,
  now: Date,
  limit = 20,
): Promise<WebhookProblem[]> {
  return readDb()
    .select({
      id: webhookEvents.id,
      eventType: webhookEvents.eventType,
      providerEventId: webhookEvents.providerEventId,
      attempts: webhookEvents.attempts,
      createdAt: webhookEvents.createdAt,
    })
    .from(webhookEvents)
    .where(webhookProblemFilter(since, now))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(limit);
}

/** Quantos avisos estão sem processamento, sem o limite da lista, e quantos já passaram dos três dias. */
export async function webhookProblemTotals(
  since: Date,
  now: Date,
): Promise<{ total: number; needsResend: number }> {
  const resendBefore = new Date(now.getTime() - STRIPE_RETRY_DAYS * 86_400_000);
  const [row] = await readDb()
    .select({
      total: count(),
      needsResend:
        sql<number>`count(*) filter (where ${webhookEvents.createdAt} < ${iso(resendBefore)})`.mapWith(
          Number,
        ),
    })
    .from(webhookEvents)
    .where(webhookProblemFilter(since, now));
  return { total: Number(row?.total ?? 0), needsResend: row?.needsResend ?? 0 };
}

export async function webhooksProcessedSince(since: Date): Promise<number> {
  const [row] = await readDb()
    .select({ total: count() })
    .from(webhookEvents)
    .where(gte(webhookEvents.processedAt, since));
  return Number(row?.total ?? 0);
}

export type CreditPackSales = { app: string; packs: number; amountCents: number; credits: number };

export async function creditPackSales(since: Date): Promise<CreditPackSales[]> {
  const rows = await readDb()
    .select({
      app: customers.app,
      packs: count(),
      amountCents: sql<number>`coalesce(sum(${oneTimePayments.amountCents}), 0)`.mapWith(Number),
      credits: sql<number>`coalesce(sum(${oneTimePayments.creditAmount}), 0)`.mapWith(Number),
    })
    .from(oneTimePayments)
    .innerJoin(customers, eq(oneTimePayments.customerId, customers.id))
    .where(
      and(
        eq(oneTimePayments.status, "paid"),
        eq(oneTimePayments.currency, "BRL"),
        gte(oneTimePayments.paidAt, since),
      ),
    )
    .groupBy(customers.app);
  return rows.map((row) => ({ ...row, packs: Number(row.packs) }));
}

export type LedgerFlow = { app: string; entryType: string; amount: number; entries: number };

/** Movimento de créditos por app e tipo de lançamento desde `since`. */
export async function ledgerFlow(since: Date): Promise<LedgerFlow[]> {
  const rows = await readDb()
    .select({
      app: creditLedger.app,
      entryType: creditLedger.entryType,
      amount: sql<number>`coalesce(sum(${creditLedger.amount}), 0)`.mapWith(Number),
      entries: count(),
    })
    .from(creditLedger)
    .where(gte(creditLedger.createdAt, since))
    .groupBy(creditLedger.app, creditLedger.entryType);
  return rows.map((row) => ({ ...row, entries: Number(row.entries) }));
}

export type ReservationTotals = { app: string; status: string; total: number; credits: number };

/**
 * Tarefas de IA criadas desde `since`, por app e situação, com os créditos
 * reservados. `released` e `expired` são as que falharam e não cobraram.
 */
export async function reservationTotals(since: Date): Promise<ReservationTotals[]> {
  const rows = await readDb()
    .select({
      app: creditReservations.app,
      status: creditReservations.status,
      total: count(),
      credits: sql<number>`coalesce(sum(${creditReservations.estimatedAmount}), 0)`.mapWith(Number),
    })
    .from(creditReservations)
    .where(gte(creditReservations.createdAt, since))
    .groupBy(creditReservations.app, creditReservations.status);
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/** Reservas de crédito abertas além do prazo: a rotina de 5 minutos devolve. */
export async function overdueReservations(now: Date): Promise<number> {
  const [row] = await readDb()
    .select({ total: count() })
    .from(creditReservations)
    .where(and(eq(creditReservations.status, "active"), lt(creditReservations.expiresAt, now)));
  return Number(row?.total ?? 0);
}

/** Pessoas que já confirmaram uma assinatura em cada app, em qualquer época. */
export async function everSubscribedByApp(apps: string[]): Promise<AppCount[]> {
  const rows = await readDb()
    .select({
      app: customers.app,
      total: sql<number>`count(distinct ${customers.subjectId})`.mapWith(Number),
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(and(isNotNull(subscriptions.confirmedAt), inArray(customers.app, apps)))
    .groupBy(customers.app);
  return rows;
}
