import { PRO_STATUSES } from "@informach/billing";
import { findProduct } from "@informach/config";
import { isProductKey, PRODUCTS, type ProductKey } from "@/lib/products";

/**
 * Receita estimada pelo preço de tabela do catálogo (`@informach/config`).
 * O valor cobrado de verdade (cupom, troca de plano no meio do ciclo) vive no
 * Stripe; aqui é a ordem de grandeza para acompanhar o mês.
 */

/** Preço de tabela por mês, em centavos: anual dividido por 12. `null` quando o catálogo não tem preço. */
export function monthlyListCents(productId: string): number | null {
  const product = findProduct(productId);
  if (product?.kind !== "subscription" || product.listPrice?.currency !== "BRL") return null;
  return product.interval === "year"
    ? Math.round(product.listPrice.amountCents / 12)
    : product.listPrice.amountCents;
}

/**
 * Receita estimada por mês, em centavos, pelo preço de tabela: só assinaturas
 * `active` (teste grátis ainda não paga, `past_due` não pagou), com o anual
 * dividido por 12 e arredondado por plano (`monthlyListCents`). É a conta do
 * Painel, de Dinheiro, de Produtos e do resumo da semana, e por arredondar por
 * plano a soma dos produtos é igual ao total. `total` é a contagem da linha
 * agrupada; sem ele, a linha é uma assinatura.
 */
export function monthlyRevenueCents(
  rows: ReadonlyArray<{ productId: string; status: string; total?: number }>,
): number {
  let cents = 0;
  for (const row of rows) {
    if (row.status !== "active") continue;
    const monthly = monthlyListCents(row.productId);
    if (monthly !== null) cents += monthly * (row.total ?? 1);
  }
  return cents;
}

/** Preço de tabela do ciclo (o que a pessoa paga por renovação), em centavos. */
export function cycleListCents(productId: string): number | null {
  const product = findProduct(productId);
  if (product?.listPrice?.currency !== "BRL") return null;
  return product.listPrice.amountCents;
}

export function productInterval(productId: string): "month" | "year" | null {
  return findProduct(productId)?.interval ?? null;
}

/**
 * Nome do plano para a tela: "Cozya Pro mensal", "Cozya Pro anual". O catálogo
 * escreve o ciclo de jeitos diferentes ("anual", "(Anual)" ou nada), então o
 * ciclo sai do `interval` e o nome perde o sufixo antigo.
 */
export function planLabel(productId: string): string {
  const product = findProduct(productId);
  if (!product) return productId;
  const base = product.name
    .replace(/\s*\((anual|mensal)\)\s*$/i, "")
    .replace(/\s+(anual|mensal)$/i, "")
    .trim();
  if (product.interval === "year") return `${base} anual`;
  if (product.interval === "month") return `${base} mensal`;
  return base;
}

export type StatusRow = { app: string; productId: string; status: string; total: number };

export type AppSubscriptions = {
  app: ProductKey;
  /** Com acesso Pro agora, pela regra de `PRO_STATUSES` (`active` e `trialing`). */
  pro: number;
  monthly: number;
  annual: number;
  trialing: number;
  /** Em atraso, pela regra de `OVERDUE_STATUSES` (`past_due` e `unpaid`). */
  pastDue: number;
  /** Receita estimada por mês, em centavos, só das assinaturas `active`. */
  mrrCents: number;
  /** Assinaturas ativas cujo produto não tem preço no catálogo. */
  unpriced: number;
};

export function isProStatus(status: string): boolean {
  return (PRO_STATUSES as readonly string[]).includes(status);
}

/**
 * "Em atraso": a renovação não foi paga. `past_due` ainda tem tentativas do
 * Stripe; `unpaid` esgotou as tentativas e o acesso pago está suspenso. As duas
 * contam igual em Pessoas, no Painel, em Dinheiro e em Produtos.
 */
export const OVERDUE_STATUSES = ["past_due", "unpaid"] as const;

export function isOverdueStatus(status: string): boolean {
  return (OVERDUE_STATUSES as readonly string[]).includes(status);
}

/**
 * Agrupa as contagens por app. Pro segue `PRO_STATUSES` do pacote de cobrança
 * (`active` e `trialing`). Só `active` entra na receita: `trialing` é Pro sem
 * cobrança ainda, e as em atraso (`OVERDUE_STATUSES`) não são Pro nem receita
 * até o pagamento passar.
 */
export function summarizeSubscriptions(rows: StatusRow[]): Map<ProductKey, AppSubscriptions> {
  const result = new Map<ProductKey, AppSubscriptions>();
  for (const row of rows) {
    if (!isProductKey(row.app)) continue;
    const entry =
      result.get(row.app) ??
      ({
        app: row.app,
        pro: 0,
        monthly: 0,
        annual: 0,
        trialing: 0,
        pastDue: 0,
        mrrCents: 0,
        unpriced: 0,
      } satisfies AppSubscriptions);
    if (row.status === "active") {
      if (productInterval(row.productId) === "year") entry.annual += row.total;
      else entry.monthly += row.total;
      if (monthlyListCents(row.productId) === null) entry.unpriced += row.total;
      else entry.mrrCents += monthlyRevenueCents([row]);
    } else if (row.status === "trialing") entry.trialing += row.total;
    else if (isOverdueStatus(row.status)) entry.pastDue += row.total;
    if (isProStatus(row.status)) entry.pro += row.total;
    result.set(row.app, entry);
  }
  return result;
}

/**
 * Assinaturas Pro com fim marcado, por app e pelo plano que vem depois. Sem
 * plano depois é cancelamento; com plano depois (`pending_product_id`) é troca
 * de plano no fim do período, e a pessoa continua assinante.
 */
export type ScheduledRow = { app: string; pendingProductId: string | null; total: number };
export type ScheduledChanges = {
  canceling: number;
  switches: { productId: string; total: number }[];
};

export function summarizeScheduled(rows: ScheduledRow[]): Map<string, ScheduledChanges> {
  const result = new Map<string, ScheduledChanges>();
  for (const row of rows) {
    const entry = result.get(row.app) ?? { canceling: 0, switches: [] };
    if (row.pendingProductId === null) entry.canceling += row.total;
    else {
      const existing = entry.switches.find((item) => item.productId === row.pendingProductId);
      if (existing) existing.total += row.total;
      else entry.switches.push({ productId: row.pendingProductId, total: row.total });
    }
    result.set(row.app, entry);
  }
  for (const entry of result.values()) entry.switches.sort((a, b) => b.total - a.total);
  return result;
}

export function switchingTotal(changes: ScheduledChanges | undefined): number {
  return changes?.switches.reduce((sum, item) => sum + item.total, 0) ?? 0;
}

/** "2 com cancelamento agendado", "1 com troca para Cozya Pro mensal no fim do período". */
export function scheduledPhrases(changes: ScheduledChanges | undefined): string[] {
  if (!changes) return [];
  const phrases: string[] = [];
  if (changes.canceling > 0)
    phrases.push(`${changes.canceling.toLocaleString("pt-BR")} com cancelamento agendado`);
  for (const item of changes.switches)
    phrases.push(
      `${item.total.toLocaleString("pt-BR")} com troca para ${planLabel(item.productId)} no fim do período`,
    );
  return phrases;
}

/**
 * Uma assinatura no movimento dos últimos 30 dias. `previousSubscription` vem de
 * `metadata.previous_subscription`, gravado quando a troca de plano agendada
 * cria a assinatura nova. `endedAt` só existe nas canceladas: o fim marcado ou,
 * no cancelamento imediato, a data do cancelamento.
 */
export type MovementRow = {
  id: string;
  customerId: string;
  app: string;
  status: string;
  providerSubscriptionId: string;
  previousSubscription: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  endedAt: Date | null;
};

export type Movement = { started: number; canceled: number; switched: number };

/** Assinatura nova que nasce até um dia antes ou depois do fim da antiga, na mesma conta de cobrança. */
const REPLACEMENT_WINDOW_MS = 86_400_000;

function replaces(next: MovementRow, previous: MovementRow): boolean {
  if (next.id === previous.id || next.customerId !== previous.customerId) return false;
  if (previous.status !== "canceled" || next.createdAt < previous.createdAt) return false;
  if (next.previousSubscription === previous.providerSubscriptionId) return true;
  return (
    previous.endedAt !== null &&
    Math.abs(next.createdAt.getTime() - previous.endedAt.getTime()) <= REPLACEMENT_WINDOW_MS
  );
}

/**
 * Novas, canceladas e trocas de plano desde `since`, por app. A troca de plano
 * agendada encerra uma assinatura e abre outra: a encerrada conta como troca, não
 * como cancelada, e a aberta não conta como nova. Cancelada sem nunca ter sido
 * confirmada (checkout que não terminou) não conta.
 */
export function subscriptionMovementFrom(
  rows: readonly MovementRow[],
  since: Date,
): Map<string, Movement> {
  const result = new Map<string, Movement>();
  const entry = (app: string) => {
    const existing = result.get(app);
    if (existing) return existing;
    const created = { started: 0, canceled: 0, switched: 0 };
    result.set(app, created);
    return created;
  };
  for (const row of rows) {
    const isReplacement =
      row.previousSubscription !== null || rows.some((other) => replaces(row, other));
    if (row.confirmedAt && row.confirmedAt >= since && !isReplacement) entry(row.app).started += 1;
    if (row.status !== "canceled" || !row.endedAt || row.endedAt < since) continue;
    if (rows.some((other) => replaces(other, row))) entry(row.app).switched += 1;
    else if (row.confirmedAt) entry(row.app).canceled += 1;
  }
  return result;
}

/**
 * Créditos pelo razão (`billing.credit_ledger`), somados por tipo de lançamento.
 * - concedidos: compra, bônus do plano e promoção;
 * - compensações: créditos dados à pessoa pela equipe (`adjustment`);
 * - retirados por reembolso: a compra devolvida no Stripe tira os créditos dela;
 * - chegaram ao vencimento: o lançamento de vencimento guarda o valor concedido,
 *   não o que sobrou sem uso. O que de fato venceu sem uso só sai do replay do
 *   razão, que o pacote de cobrança não expõe.
 */
export type CreditTotals = {
  granted: number;
  consumed: number;
  compensated: number;
  refunded: number;
  reachedExpiry: number;
};

const GRANT_TYPES = new Set(["purchase", "bonus_grant", "promo_grant"]);

export function creditTotals(
  rows: ReadonlyArray<{ entryType: string; amount: number }>,
): CreditTotals {
  const sumOf = (match: (type: string) => boolean) =>
    rows.filter((row) => match(row.entryType)).reduce((sum, row) => sum + row.amount, 0);
  return {
    granted: sumOf((type) => GRANT_TYPES.has(type)),
    consumed: Math.abs(sumOf((type) => type === "consumption")),
    compensated: sumOf((type) => type === "adjustment"),
    refunded: Math.abs(sumOf((type) => type === "refund")),
    reachedExpiry: Math.abs(sumOf((type) => type === "expiration")),
  };
}

/**
 * Tarefas de IA pelas reservas de crédito (`billing.credit_reservations`). A
 * tarefa que falha solta a reserva (`released`) ou deixa vencer (`expired`) e
 * não cobra nada: é isso que "falhou e devolveu o crédito" quer dizer em todas
 * as telas. A taxa conta só as encerradas; as em andamento ficam de fora.
 */
export type TaskOutcome = {
  tasks: number;
  active: number;
  resolved: number;
  returned: number;
  /** Créditos que estavam reservados para as tarefas que falharam. */
  returnedCredits: number;
  failureRate: number | null;
};

export function aiTaskOutcome(
  rows: ReadonlyArray<{ status: string; total: number; credits?: number }>,
): TaskOutcome {
  const outcome = { tasks: 0, active: 0, resolved: 0, returned: 0, returnedCredits: 0 };
  for (const row of rows) {
    outcome.tasks += row.total;
    if (row.status === "active") outcome.active += row.total;
    else if (row.status === "committed") outcome.resolved += row.total;
    else if (row.status === "released" || row.status === "expired") {
      outcome.resolved += row.total;
      outcome.returned += row.total;
      outcome.returnedCredits += row.credits ?? 0;
    }
  }
  return {
    ...outcome,
    failureRate: outcome.resolved > 0 ? outcome.returned / outcome.resolved : null,
  };
}

/** O Stripe reenvia um aviso sozinho por três dias. */
export const STRIPE_RETRY_DAYS = 3;
/**
 * Por quanto tempo um aviso sem processamento continua na tela: a lista de
 * eventos do Stripe vai até 30 dias para trás.
 */
export const WEBHOOK_WINDOW_DAYS = 30;

/** Passou dos três dias de reenvio automático: só volta se alguém reenviar pelo Stripe. */
export function webhookNeedsResend(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > STRIPE_RETRY_DAYS * 86_400_000;
}

/** O Stripe guarda o evento como `<nome do app>:evt_...`; o prefixo diz de qual produto veio. */
export function webhookProduct(providerEventId: string): ProductKey | null {
  const separator = providerEventId.lastIndexOf(":");
  if (separator <= 0) return null;
  const scope = providerEventId.slice(0, separator).trim();
  for (const key of Object.keys(PRODUCTS) as ProductKey[]) {
    if (PRODUCTS[key].name === scope || key === scope) return key;
  }
  return null;
}

/** Descrição curta do que um tipo de evento do Stripe faz, para a frase de consequência. */
export function webhookConsequence(eventType: string): string {
  if (eventType === "invoice.paid")
    return "Até ser processado, uma renovação pode não liberar os créditos do mês.";
  if (eventType === "invoice.payment_failed")
    return "Até ser processado, o atraso pode não aparecer na conta da pessoa.";
  if (eventType === "checkout.session.completed")
    return "Até ser processado, uma compra pode não liberar o plano ou os créditos.";
  if (eventType.startsWith("customer.subscription."))
    return "Até ser processado, o plano da pessoa pode estar desatualizado aqui.";
  if (eventType.startsWith("charge.") || eventType.startsWith("payment_intent."))
    return "Até ser processado, um pagamento ou reembolso pode não refletir na conta.";
  return "Até ser processado, a conta pode não refletir o que aconteceu no Stripe.";
}
