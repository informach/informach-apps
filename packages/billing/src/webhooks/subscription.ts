import type { Product } from "@informach/config";
import { findProductByPriceId } from "@informach/config";
import type { Database } from "@informach/db";
import { customers, subscriptions } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { type BillingEmailDeps, sendBillingEmail } from "./../billing-emails";
import { type Logger, safeLog } from "./../logger";
import type { BillingAuditEvent, BillingProvider, SubscriptionStatus } from "./../types";

type StripeSubscriptionItemLike = {
  price?: { id?: string } | null;
  /** Basil API (2025-03-31+) moved billing period fields from the Subscription root to each item. */
  current_period_start?: number | null;
  current_period_end?: number | null;
};

type StripeSubscriptionLike = {
  id: string;
  customer: string | { id: string } | null;
  status: string;
  cancel_at?: number | null;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  trial_end?: number | null;
  items?: { data?: StripeSubscriptionItemLike[] };
  metadata?: Record<string, string>;
};

export type SubscriptionWebhookDeps = {
  db: Database;
  provider: BillingProvider;
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
  emails?: BillingEmailDeps;
};

export type SubscriptionLifecycleOptions = {
  /** Product catalog — used for productName resolution in emails. */
  products?: readonly Product[];
};

const SUBSCRIPTION_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

function normalizeStatus(raw: string): SubscriptionStatus {
  if ((SUBSCRIPTION_STATUSES as Set<string>).has(raw)) {
    return raw as SubscriptionStatus;
  }
  return "incomplete";
}

function unixToDate(seconds: number | null | undefined): Date | null {
  if (seconds === null || seconds === undefined) return null;
  return new Date(seconds * 1000);
}

function extractCustomerId(customer: StripeSubscriptionLike["customer"]): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
}

function extractPriceId(items: StripeSubscriptionLike["items"]): string | null {
  return items?.data?.[0]?.price?.id ?? null;
}

/**
 * Reads the current billing period from the FIRST subscription item.
 * Since the 2025-03-31.basil API, periods live on items, not on the
 * Subscription root. Multi-item subscriptions with mixed periods fall outside
 * this contract — we treat the first item as canonical.
 */
function extractCurrentPeriod(items: StripeSubscriptionLike["items"]): {
  start: Date | null;
  end: Date | null;
} {
  const firstItem = items?.data?.[0];
  return {
    start: unixToDate(firstItem?.current_period_start),
    end: unixToDate(firstItem?.current_period_end),
  };
}

/**
 * Idempotently upserts a subscription row from a Stripe subscription payload.
 * Handles `customer.subscription.{created,updated}`. Status transitions to
 * `canceled` are handled via the `customer.subscription.deleted` event.
 */
export async function handleSubscriptionLifecycle(
  deps: SubscriptionWebhookDeps,
  subscription: StripeSubscriptionLike,
  eventType:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted",
  options: SubscriptionLifecycleOptions = {},
): Promise<{ upserted: boolean; reason?: string }> {
  const providerCustomerId = extractCustomerId(subscription.customer);
  if (!providerCustomerId) {
    safeLog(deps.logger, "warn", "billing.webhook.subscription.missing_customer", {
      subscriptionId: subscription.id,
    });
    return { upserted: false, reason: "missing_customer" };
  }

  const customerRows = await deps.db
    .select({
      id: customers.id,
      email: customers.email,
      subjectType: customers.subjectType,
      subjectId: customers.subjectId,
    })
    .from(customers)
    .where(
      and(
        eq(customers.provider, deps.provider),
        eq(customers.providerCustomerId, providerCustomerId),
      ),
    )
    .limit(1);

  const customerRow = customerRows[0];
  if (!customerRow) {
    safeLog(deps.logger, "error", "billing.webhook.subscription.customer_not_found", {
      providerCustomerId,
      subscriptionId: subscription.id,
    });
    return { upserted: false, reason: "customer_not_found" };
  }

  const priceId = extractPriceId(subscription.items);
  if (!priceId) {
    safeLog(deps.logger, "warn", "billing.webhook.subscription.missing_price", {
      subscriptionId: subscription.id,
    });
    return { upserted: false, reason: "missing_price" };
  }

  const productId =
    subscription.metadata?.product_id ?? findProductByPriceId(priceId)?.id ?? "unknown";
  const isDeletion = eventType === "customer.subscription.deleted";
  const status: SubscriptionStatus = isDeletion ? "canceled" : normalizeStatus(subscription.status);

  const period = extractCurrentPeriod(subscription.items);
  const periodStart = period.start ?? new Date();
  const periodEnd = period.end ?? new Date();
  const cancelAtPeriodEnd = subscription.cancel_at_period_end
    ? (unixToDate(subscription.cancel_at) ?? periodEnd)
    : null;
  const canceledAt = isDeletion
    ? (unixToDate(subscription.canceled_at) ?? new Date())
    : unixToDate(subscription.canceled_at);
  const trialEnd = unixToDate(subscription.trial_end);

  await deps.db
    .insert(subscriptions)
    .values({
      customerId: customerRow.id,
      provider: deps.provider,
      providerSubscriptionId: subscription.id,
      productId,
      providerPriceId: priceId,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
      canceledAt,
      trialEnd,
      metadata: subscription.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [subscriptions.provider, subscriptions.providerSubscriptionId],
      set: {
        status,
        productId,
        providerPriceId: priceId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd,
        canceledAt,
        trialEnd,
        metadata: subscription.metadata ?? {},
        updatedAt: new Date(),
      },
    });

  const auditType = isDeletion
    ? "billing.subscription_canceled"
    : eventType === "customer.subscription.created"
      ? "billing.subscription_created"
      : "billing.subscription_updated";
  emitAudit(deps, auditType, {
    subscriptionId: subscription.id,
    customerId: customerRow.id,
    productId,
    status,
  });

  safeLog(deps.logger, "info", `billing.webhook.${auditType}`, {
    subscriptionId: subscription.id,
    productId,
    status,
  });

  // Send subscription-canceled email when this event represents a cancellation:
  //   - subscription.deleted (immediate or end of billing cycle)
  //   - subscription.updated where cancel_at_period_end was JUST flipped to true
  // Fresh-cancel detection on `updated` would require tracking previous state;
  // we keep it simple and email on every updated-with-cancel-set, idempotency
  // guarded by `email_deliveries.(category, messageKey)` UNIQUE.
  const isCancellation =
    isDeletion || (eventType === "customer.subscription.updated" && Boolean(cancelAtPeriodEnd));
  if (isCancellation && deps.emails && customerRow.email) {
    const product = options.products?.find((p) => p.id === productId);
    const productName = product?.name ?? productId;
    const accessUntil = formatDatePtBR(cancelAtPeriodEnd ?? periodEnd);
    await sendBillingEmail(deps.emails, {
      category: "billing.subscription-canceled",
      recipient: {
        email: customerRow.email,
        userId: customerRow.subjectType === "user" ? customerRow.subjectId : undefined,
      },
      // Per-cancel idempotency: deletion gets the providerSubscriptionId; an
      // update-cancel uses canceledAt timestamp so a re-cancel after reactivate
      // still goes through.
      messageKey: isDeletion
        ? `subscription_canceled_${subscription.id}`
        : `subscription_cancel_scheduled_${subscription.id}_${(canceledAt ?? new Date()).toISOString()}`,
      productName,
      accessUntil,
    });
  }

  return { upserted: true };
}

function formatDatePtBR(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function emitAudit(
  deps: SubscriptionWebhookDeps,
  eventType: BillingAuditEvent["eventType"],
  payload: Record<string, unknown>,
): void {
  if (!deps.onAudit) return;
  try {
    deps.onAudit({
      eventType,
      actorId: null,
      payload,
      timestamp: new Date(),
    });
  } catch {
    // audit must never break the webhook flow
  }
}
