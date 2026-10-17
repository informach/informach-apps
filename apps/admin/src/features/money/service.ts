import "server-only";
import { daysAgo } from "@/lib/format";
import { stripeLinks } from "@/lib/links";
import { isProductKey, PRODUCT_KEYS, type ProductKey } from "@/lib/products";
import {
  aiTaskOutcome,
  type CreditTotals,
  creditTotals,
  cycleListCents,
  planLabel,
  scheduledPhrases,
  subscriptionMovementFrom,
  summarizeScheduled,
  summarizeSubscriptions,
  switchingTotal,
  WEBHOOK_WINDOW_DAYS,
  webhookConsequence,
  webhookNeedsResend,
  webhookProduct,
} from "./logic";
import {
  creditPackSales,
  ledgerFlow,
  overdueReservations,
  pastDueSubscriptions,
  reservationTotals,
  scheduledChanges,
  subscriptionMovementRows,
  subscriptionStatusRows,
  webhookProblems,
  webhookProblemTotals,
  webhooksProcessedSince,
} from "./repository";

export const STATUS_LABEL: Record<string, string> = {
  active: "ativas",
  trialing: "em teste",
  past_due: "em atraso",
  canceled: "canceladas",
  incomplete: "incompletas",
  incomplete_expired: "incompletas vencidas",
  unpaid: "não pagas",
  paused: "pausadas",
};

const STATUS_LABEL_ONE: Record<string, string> = {
  active: "ativa",
  trialing: "em teste",
  past_due: "em atraso",
  canceled: "cancelada",
  incomplete: "incompleta",
  incomplete_expired: "incompleta vencida",
  unpaid: "não paga",
  paused: "pausada",
};

/** "1 cancelada", "3 canceladas". */
export function statusCount(total: number, status: string): string {
  const label = (total === 1 ? STATUS_LABEL_ONE[status] : STATUS_LABEL[status]) ?? status;
  return `${total.toLocaleString("pt-BR")} ${label}`;
}

export type ProductMoney = {
  product: ProductKey;
  monthly: number;
  annual: number;
  trialing: number;
  pastDue: number;
  mrrCents: number;
  unpriced: number;
  /** Cancelamentos marcados para o fim do período (troca de plano não entra). */
  scheduled: number;
  /** Trocas de plano marcadas para o fim do período. */
  switching: number;
  /** "2 com cancelamento agendado", "1 com troca para Cozya Pro mensal no fim do período". */
  scheduledPhrases: string[];
  started30: number;
  canceled30: number;
  /** Assinaturas encerradas numa troca de plano: a pessoa continua assinante. */
  switched30: number;
  /** Outras situações, de qualquer época (canceladas, incompletas, pausadas...). */
  others: { status: string; total: number }[];
  hasAny: boolean;
};

export type PastDueItem = {
  userId: string;
  name: string;
  product: ProductKey | null;
  plan: string;
  periodStart: Date;
  amountCents: number | null;
  stripeUrl: string;
};

export type WebhookItem = {
  id: string;
  eventType: string;
  product: ProductKey | null;
  attempts: number;
  createdAt: Date;
  /** Passou dos três dias em que o Stripe reenvia sozinho. */
  needsResend: boolean;
  consequence: string;
  stripeUrl: string;
};

export type CreditFlow = CreditTotals & {
  product: ProductKey;
  /** Tarefas de IA que falharam e não cobraram, e os créditos que estavam reservados para elas. */
  failedTasks: number;
  returnedOnFailure: number;
  packs: number;
  packCents: number;
};

export type MoneyView = {
  now: Date;
  totals: {
    mrrCents: number;
    active: number;
    pastDue: number;
    scheduled: number;
    switching: number;
    packs: number;
    packCents: number;
    unpriced: number;
  };
  products: ProductMoney[];
  pastDue: PastDueItem[];
  webhooks: WebhookItem[];
  /** Todos os avisos sem processamento na janela, além dos que a lista mostra. */
  webhookTotals: { total: number; needsResend: number };
  processed24h: number;
  credits: CreditFlow[];
  overdueReservations: number;
};

export async function getMoney(now: Date = new Date()): Promise<MoneyView> {
  const since30 = daysAgo(30, now);
  const webhookSince = daysAgo(WEBHOOK_WINDOW_DAYS, now);
  const [
    statusRows,
    scheduledRows,
    movementRows,
    pastDueRows,
    webhooks,
    webhookTotals,
    processed24h,
    packs,
    ledger,
    reservations,
    overdue,
  ] = await Promise.all([
    subscriptionStatusRows(),
    scheduledChanges(),
    subscriptionMovementRows(since30),
    pastDueSubscriptions(),
    webhookProblems(webhookSince, now),
    webhookProblemTotals(webhookSince, now),
    webhooksProcessedSince(daysAgo(1, now)),
    creditPackSales(since30),
    ledgerFlow(since30),
    reservationTotals(since30),
    overdueReservations(now),
  ]);

  const summary = summarizeSubscriptions(statusRows);
  const scheduled = summarizeScheduled(scheduledRows);
  const movement = subscriptionMovementFrom(movementRows, since30);
  const products: ProductMoney[] = PRODUCT_KEYS.map((product) => {
    const subs = summary.get(product);
    const others = new Map<string, number>();
    for (const row of statusRows) {
      if (row.app !== product || ["active", "trialing", "past_due"].includes(row.status)) continue;
      others.set(row.status, (others.get(row.status) ?? 0) + row.total);
    }
    const moved = movement.get(product);
    const changes = scheduled.get(product);
    return {
      product,
      monthly: subs?.monthly ?? 0,
      annual: subs?.annual ?? 0,
      trialing: subs?.trialing ?? 0,
      pastDue: subs?.pastDue ?? 0,
      mrrCents: subs?.mrrCents ?? 0,
      unpriced: subs?.unpriced ?? 0,
      scheduled: changes?.canceling ?? 0,
      switching: switchingTotal(changes),
      scheduledPhrases: scheduledPhrases(changes),
      started30: moved?.started ?? 0,
      canceled30: moved?.canceled ?? 0,
      switched30: moved?.switched ?? 0,
      others: [...others.entries()].map(([status, total]) => ({ status, total })),
      hasAny: statusRows.some((row) => row.app === product),
    };
  });

  const credits: CreditFlow[] = PRODUCT_KEYS.map((product) => {
    const sold = packs.find((row) => row.app === product);
    const tasks = aiTaskOutcome(reservations.filter((row) => row.app === product));
    return {
      product,
      ...creditTotals(ledger.filter((row) => row.app === product)),
      failedTasks: tasks.returned,
      returnedOnFailure: tasks.returnedCredits,
      packs: sold?.packs ?? 0,
      packCents: sold?.amountCents ?? 0,
    };
  }).filter(
    (flow) =>
      flow.granted ||
      flow.consumed ||
      flow.compensated ||
      flow.refunded ||
      flow.reachedExpiry ||
      flow.failedTasks ||
      flow.packs,
  );

  return {
    now,
    totals: {
      mrrCents: products.reduce((sum, row) => sum + row.mrrCents, 0),
      active: products.reduce((sum, row) => sum + row.monthly + row.annual, 0),
      pastDue: products.reduce((sum, row) => sum + row.pastDue, 0),
      scheduled: products.reduce((sum, row) => sum + row.scheduled, 0),
      switching: products.reduce((sum, row) => sum + row.switching, 0),
      packs: packs.reduce((sum, row) => sum + row.packs, 0),
      packCents: packs.reduce((sum, row) => sum + row.amountCents, 0),
      unpriced: products.reduce((sum, row) => sum + row.unpriced, 0),
    },
    products,
    pastDue: pastDueRows.map((row) => ({
      userId: row.userId,
      name: row.name,
      product: isProductKey(row.app) ? row.app : null,
      plan: planLabel(row.productId),
      periodStart: row.periodStart,
      amountCents: cycleListCents(row.productId),
      stripeUrl: stripeLinks.subscription(row.providerSubscriptionId),
    })),
    webhooks: webhooks.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      product: webhookProduct(row.providerEventId),
      attempts: row.attempts,
      createdAt: row.createdAt,
      needsResend: webhookNeedsResend(row.createdAt, now),
      consequence: webhookConsequence(row.eventType),
      stripeUrl: stripeLinks.event(row.providerEventId),
    })),
    webhookTotals,
    processed24h,
    credits,
    overdueReservations: overdue,
  };
}
