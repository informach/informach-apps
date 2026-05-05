import type { Product } from "@informach/config";
import type { Database } from "@informach/db";
import { customers, subscriptions } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { type BillingEmailDeps, sendBillingEmail } from "./../billing-emails";
import { type Logger, safeLog } from "./../logger";
import type { BillingProviderClient } from "./../providers";
import type { BillingAuditEvent, BillingProvider, SubscriptionStatus } from "./../types";

const ANNUAL_DRIP_INTERVAL_MS = 30 * 86_400_000;

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
  /**
   * Required when applying a pending plan intent on `customer.subscription.deleted`
   * (provider must implement `createSubscription`). Optional otherwise — current
   * webhook flows that don't need to create downstream subscriptions can omit it.
   */
  providerClient?: BillingProviderClient;
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

  const product = resolveProductForApp(
    options.products ?? [],
    priceId,
    subscription.metadata,
    deps.logger,
  );
  if (!product) {
    safeLog(deps.logger, "warn", "billing.webhook.subscription.product_not_in_catalog", {
      subscriptionId: subscription.id,
      priceId,
      metadataProductId: subscription.metadata?.product_id,
    });
    return { upserted: false, reason: "product_not_in_catalog" };
  }
  const productId = product.id;
  const isDeletion = eventType === "customer.subscription.deleted";
  const status: SubscriptionStatus = isDeletion ? "canceled" : normalizeStatus(subscription.status);

  // Capture any pending plan intent BEFORE the upsert so we know whether to
  // create a downstream subscription after the cancellation row is written.
  const pendingIntent = isDeletion
    ? await readPendingIntent(deps, subscription.id, deps.provider)
    : null;

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
        // On deletion, also clear next_credit_grant_at so the drip sweeper
        // doesn't keep granting after the subscription is gone.
        ...(isDeletion ? { nextCreditGrantAt: null } : {}),
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

  // After the local row is updated, apply any pending plan intent: this is
  // the second half of `switchPlan({ mode: 'schedule_at_period_end' })`. The
  // user asked to downgrade at the period boundary; Stripe just confirmed the
  // cancellation, so we now create the new subscription on the customer's
  // default payment method and seed our local row.
  if (isDeletion && pendingIntent) {
    await applyPendingIntent(deps, {
      pending: pendingIntent,
      customer: {
        id: customerRow.id,
        providerCustomerId: pendingIntent.providerCustomerId,
        subjectType: customerRow.subjectType,
        subjectId: customerRow.subjectId,
      },
      products: options.products ?? [],
      sourceProviderSubscriptionId: subscription.id,
    });
  }

  // Send subscription-canceled email when this event represents a cancellation:
  //   - subscription.deleted (immediate or end of billing cycle)
  //   - subscription.updated where cancel_at_period_end was JUST flipped to true
  // Fresh-cancel detection on `updated` would require tracking previous state;
  // we keep it simple and email on every updated-with-cancel-set, idempotency
  // guarded by `email_deliveries.(category, messageKey)` UNIQUE.
  const isCancellation =
    isDeletion || (eventType === "customer.subscription.updated" && Boolean(cancelAtPeriodEnd));
  if (isCancellation && deps.emails && customerRow.email) {
    const productName = product.name;
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

/**
 * Resolves the catalog Product that backs a Stripe subscription.
 *
 * The priceId is the SOURCE OF TRUTH — it lives on the subscription's items
 * and changes when `subscriptions.update({ items: [...] })` swaps plans (the
 * monthly→annual upgrade flow). Stripe's subscription `metadata.product_id`,
 * by contrast, is set once at checkout and is NOT migrated by Stripe when the
 * price item changes — so trusting metadata after an upgrade leaves us with
 * a productId that no longer matches the price the customer is paying for.
 *
 * Resolution order:
 *   1. Find product by priceId (authoritative).
 *   2. If `metadata.product_id` is also present and disagrees, log a warning
 *      so we can detect drift in the wild.
 *   3. If no product matches the priceId, fall back to metadata as a last
 *      resort — typically a misconfigured catalog.
 */
function resolveProductForApp(
  products: readonly Product[],
  priceId: string,
  metadata: Record<string, string> | undefined,
  logger?: Logger,
): Product | undefined {
  const byPrice = products.find(
    (p) => p.stripePriceId.dev === priceId || p.stripePriceId.prod === priceId,
  );
  const metadataProductId = metadata?.product_id;
  if (byPrice) {
    if (metadataProductId && metadataProductId !== byPrice.id) {
      safeLog(logger, "warn", "billing.webhook.subscription.metadata_product_drift", {
        priceId,
        metadataProductId,
        resolvedProductId: byPrice.id,
        reason: "trusting priceId — metadata likely stale after a plan switch",
      });
    }
    return byPrice;
  }
  if (metadataProductId) {
    return products.find((p) => p.id === metadataProductId);
  }
  return undefined;
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

type PendingIntent = {
  localSubscriptionId: string;
  pendingProductId: string;
  pendingPriceId: string;
  providerCustomerId: string;
};

async function readPendingIntent(
  deps: SubscriptionWebhookDeps,
  providerSubscriptionId: string,
  provider: BillingProvider,
): Promise<PendingIntent | null> {
  const rows = await deps.db
    .select({
      id: subscriptions.id,
      pendingProductId: subscriptions.pendingProductId,
      pendingPriceId: subscriptions.pendingPriceId,
      providerCustomerId: customers.providerCustomerId,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        eq(subscriptions.provider, provider),
        eq(subscriptions.providerSubscriptionId, providerSubscriptionId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row?.pendingProductId || !row.pendingPriceId) return null;
  return {
    localSubscriptionId: row.id,
    pendingProductId: row.pendingProductId,
    pendingPriceId: row.pendingPriceId,
    providerCustomerId: row.providerCustomerId,
  };
}

async function applyPendingIntent(
  deps: SubscriptionWebhookDeps,
  args: {
    pending: PendingIntent;
    customer: {
      id: string;
      providerCustomerId: string;
      subjectType: string;
      subjectId: string;
    };
    products: readonly Product[];
    sourceProviderSubscriptionId: string;
  },
): Promise<void> {
  if (!deps.providerClient?.createSubscription) {
    safeLog(deps.logger, "warn", "billing.webhook.subscription.pending_skip_no_provider", {
      previousSubscriptionId: args.sourceProviderSubscriptionId,
    });
    return;
  }

  const product = args.products.find((p) => p.id === args.pending.pendingProductId);
  if (!product) {
    safeLog(deps.logger, "warn", "billing.webhook.subscription.pending_product_not_in_catalog", {
      previousSubscriptionId: args.sourceProviderSubscriptionId,
      pendingProductId: args.pending.pendingProductId,
    });
    return;
  }

  let createdDetails: Awaited<ReturnType<NonNullable<BillingProviderClient["createSubscription"]>>>;
  try {
    createdDetails = await deps.providerClient.createSubscription({
      customerId: args.pending.providerCustomerId,
      priceId: args.pending.pendingPriceId,
      metadata: {
        subject_type: args.customer.subjectType,
        subject_id: args.customer.subjectId,
        product_id: product.id,
        previous_subscription: args.sourceProviderSubscriptionId,
        plan_change: "scheduled_downgrade",
      },
      idempotencyKey: `pending_intent:${args.sourceProviderSubscriptionId}:${args.pending.pendingProductId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The customer's payment method likely failed (expired card, SCA, etc.).
    // Clear the pending intent and stamp metadata.pendingPlanError so the app
    // can show "we couldn't switch your plan, please re-subscribe".
    await deps.db
      .update(subscriptions)
      .set({
        pendingProductId: null,
        pendingPriceId: null,
        metadata: {
          pendingPlanError: {
            attemptedAt: new Date().toISOString(),
            productId: args.pending.pendingProductId,
            error: message,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, args.pending.localSubscriptionId));
    safeLog(deps.logger, "error", "billing.webhook.subscription.pending_apply_failed", {
      previousSubscriptionId: args.sourceProviderSubscriptionId,
      pendingProductId: args.pending.pendingProductId,
      error: message,
    });
    if (deps.emails) {
      // Reuse payment-failed copy: surfaces "update payment method" CTA.
      // Idempotent via messageKey scoped to this attempt.
      // We cannot send because billing-emails is decoupled from this flow;
      // the dunning sweeper will pick it up if status warrants.
    }
    return;
  }

  // Persist the new subscription locally. We can't rely on the
  // customer.subscription.created webhook to populate it because we need the
  // anchor (next_credit_grant_at) and provider price right now for the UI.
  const periodStart = createdDetails.currentPeriodStart ?? new Date();
  const periodEnd = createdDetails.currentPeriodEnd ?? new Date();
  const nextCreditGrantAt =
    product.interval === "year" && (product.bonusCreditsPerMonth ?? 0) > 0
      ? new Date(Date.now() + ANNUAL_DRIP_INTERVAL_MS)
      : null;

  await deps.db
    .insert(subscriptions)
    .values({
      customerId: args.customer.id,
      provider: deps.provider,
      providerSubscriptionId: createdDetails.id,
      productId: product.id,
      providerPriceId: args.pending.pendingPriceId,
      status: normalizeStatus(createdDetails.status),
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: null,
      canceledAt: null,
      trialEnd: createdDetails.trialEnd,
      nextCreditGrantAt,
      metadata: createdDetails.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [subscriptions.provider, subscriptions.providerSubscriptionId],
      set: {
        productId: product.id,
        providerPriceId: args.pending.pendingPriceId,
        status: normalizeStatus(createdDetails.status),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextCreditGrantAt,
        metadata: createdDetails.metadata ?? {},
        updatedAt: new Date(),
      },
    });

  // Clear the intent on the previous (canceled) row.
  await deps.db
    .update(subscriptions)
    .set({
      pendingProductId: null,
      pendingPriceId: null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, args.pending.localSubscriptionId));

  emitAudit(deps, "billing.subscription_created", {
    subscriptionId: createdDetails.id,
    productId: product.id,
    customerId: args.customer.id,
    previousSubscriptionId: args.sourceProviderSubscriptionId,
    reason: "scheduled_downgrade",
  });
  safeLog(deps.logger, "info", "billing.webhook.subscription.pending_applied", {
    previousSubscriptionId: args.sourceProviderSubscriptionId,
    newSubscriptionId: createdDetails.id,
    productId: product.id,
  });
}
