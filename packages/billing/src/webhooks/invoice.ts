import type { Product } from "@informach/config";
import type { Database } from "@informach/db";
import {
  customers as customersTable,
  subscriptions as subscriptionsTable,
} from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { type BillingEmailDeps, sendBillingEmail } from "./../billing-emails";
import { grantBonusCredits } from "./../credits/grant";
import { type Logger, safeLog } from "./../logger";
import type { BillingProviderClient } from "./../providers";
import type {
  BillingAuditEvent,
  BillingProvider,
  SubjectType,
  SubscriptionStatus,
} from "./../types";

/**
 * Default expiry for subscription_monthly bonus credits — they should not
 * outlast the billing cycle that earned them. 31 days covers monthly cycles
 * with a small buffer for clock skew between Stripe and our DB.
 */
const MONTHLY_BONUS_TTL_DAYS = 31;
/** Drip cadence for annual plans: 30 days between monthly grants. */
const ANNUAL_DRIP_INTERVAL_MS = 30 * 86_400_000;

type StripeInvoiceLike = {
  id: string;
  customer: string | { id: string } | null;
  billing_reason?: string | null;
  /** Dahlia API: subscription reference moved here from the root. */
  parent?: {
    subscription_details?: {
      subscription?: string | { id: string } | null;
    } | null;
  } | null;
  metadata?: Record<string, string>;
  /** Total amount paid for this invoice, in the smallest currency unit (cents). */
  amount_paid?: number | null;
  currency?: string | null;
};

export type InvoiceWebhookDeps = {
  db: Database;
  provider: BillingProvider;
  providerClient: BillingProviderClient;
  emails?: BillingEmailDeps;
  /** Resolved product catalog for THIS app — used to look up bonusCreditsPerMonth. */
  products: readonly Product[];
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
};

export type InvoiceWebhookResult = {
  processed: boolean;
  reason: string;
};

/**
 * Handles `invoice.paid`. For renewal/initial cycles of a subscription whose
 * product has `bonusCreditsPerMonth`, grants those credits with a 31d expiry.
 * Idempotent via `creditLedger.stripe_event_id` UNIQUE — replays are no-ops.
 */
export async function handleInvoicePaid(
  deps: InvoiceWebhookDeps,
  invoice: StripeInvoiceLike,
  eventId: string,
): Promise<InvoiceWebhookResult> {
  const billingReason = invoice.billing_reason ?? "";
  // We grant the monthly bonus on TWO billing events only:
  //   - `subscription_create` — the very first invoice of a sub (initial activation)
  //   - `subscription_cycle`  — periodic renewal (monthly cycle, or annual rollover)
  //
  // `subscription_update` is a mid-cycle change (plan swap, quantity change,
  // proration). It is NOT a renewal — the user already received the bonus for
  // the current month at create time. Granting on update would either
  // double-credit the same month (monthly→monthly swap) or hand the user a
  // bonus they aren't due (monthly→annual upgrade, where the next monthly
  // batch is owned by the drip sweeper and anchored 30d out).
  //
  // Same reasoning excludes `manual`, `quote_accept`, `subscription_threshold`,
  // one-off invoice items, etc.
  const isCycle = billingReason === "subscription_cycle" || billingReason === "subscription_create";
  if (!isCycle) {
    safeLog(deps.logger, "debug", "billing.webhook.invoice.skip_non_cycle", {
      invoiceId: invoice.id,
      billingReason,
    });
    return { processed: false, reason: `non_cycle:${billingReason || "unknown"}` };
  }

  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) {
    safeLog(deps.logger, "debug", "billing.webhook.invoice.no_subscription", {
      invoiceId: invoice.id,
    });
    return { processed: false, reason: "no_subscription" };
  }

  const local = await loadOrRecoverLocalSubscriptionWithSubject(deps, subscriptionId);
  if (!local) {
    safeLog(deps.logger, "warn", "billing.webhook.invoice.subscription_not_local", {
      invoiceId: invoice.id,
      providerSubscriptionId: subscriptionId,
    });
    return { processed: false, reason: "subscription_not_local" };
  }

  // PriceId is the SOURCE OF TRUTH for which plan the customer is paying for.
  // Webhooks can race with our optimistic local UPDATE in switchPlan: when
  // `subscriptions.update` swaps the price, Stripe emits both
  // `customer.subscription.updated` and `invoice.paid` in close succession.
  // If the invoice handler runs first and reads `local.productId`, it would
  // still see the OLD product. Resolving through priceId avoids that.
  const product = resolveProductByPriceId(deps.products, local.providerPriceId, local.productId);
  if (!product) {
    safeLog(deps.logger, "warn", "billing.webhook.invoice.product_not_in_catalog", {
      invoiceId: invoice.id,
      providerPriceId: local.providerPriceId,
      localProductId: local.productId,
    });
    return { processed: false, reason: "product_not_in_catalog" };
  }
  const bonus = product.bonusCreditsPerMonth ?? 0;
  if (bonus <= 0) {
    safeLog(deps.logger, "debug", "billing.webhook.invoice.no_bonus_for_product", {
      invoiceId: invoice.id,
      productId: product.id,
    });
    return { processed: false, reason: "no_bonus_for_product" };
  }

  // Annual plans pay once a year but should drip credits monthly. Instead of
  // granting 12× the bonus up front (or worse, only 1× a year):
  //   - on subscription_create: grant the first batch immediately AND anchor
  //     next_credit_grant_at to drip 30d later (see grantPendingMonthlyBonusCredits).
  //   - on subscription_cycle (yearly renewal): only reset the anchor — do NOT
  //     re-grant, otherwise the user would receive both an immediate batch and
  //     the next sweeper batch ~30d later.
  // (subscription_update was already filtered out by the isCycle check above.)
  if (product.interval === "year") {
    const next = new Date(Date.now() + ANNUAL_DRIP_INTERVAL_MS);
    if (billingReason === "subscription_create") {
      const result = await grantBonusCredits(
        {
          db: deps.db,
          logger: deps.logger,
          onAudit: deps.onAudit,
        },
        {
          owner: { type: local.subjectType, id: local.subjectId },
          amount: bonus,
          reason: "subscription_monthly",
          expiresAt: new Date(Date.now() + MONTHLY_BONUS_TTL_DAYS * 86_400_000),
          stripeEventId: eventId,
          metadata: {
            invoiceId: invoice.id,
            productId: product.id,
            billingReason,
            interval: "year",
            grantKind: "annual_initial",
          },
        },
      );
      await deps.db
        .update(subscriptionsTable)
        .set({ nextCreditGrantAt: next, updatedAt: new Date() })
        .where(eq(subscriptionsTable.id, local.id));
      safeLog(
        deps.logger,
        "info",
        result.alreadyProcessed
          ? "billing.webhook.invoice.annual_initial_replay"
          : "billing.webhook.invoice.annual_initial_granted",
        {
          invoiceId: invoice.id,
          subscriptionId: local.id,
          productId: product.id,
          bonus,
          nextCreditGrantAt: next.toISOString(),
        },
      );
      if (!result.alreadyProcessed && deps.emails && local.customerEmail) {
        const amountFormatted = formatBrlAmount(
          invoice.amount_paid ?? 0,
          invoice.currency ?? "brl",
        );
        await sendBillingEmail(deps.emails, {
          category: "billing.payment-success",
          recipient: {
            email: local.customerEmail,
            userId: local.subjectType === "user" ? local.subjectId : undefined,
          },
          messageKey: `payment_success_${invoice.id}`,
          productName: product.name,
          amountFormatted,
        });
      }
      return {
        processed: true,
        reason: result.alreadyProcessed ? "annual_initial_replay" : "annual_initial_granted",
      };
    }
    // billingReason === "subscription_cycle" (annual renewal)
    await deps.db
      .update(subscriptionsTable)
      .set({ nextCreditGrantAt: next, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, local.id));
    if (deps.emails && local.customerEmail) {
      await sendBillingEmail(deps.emails, {
        category: "billing.subscription-renewed",
        recipient: {
          email: local.customerEmail,
          userId: local.subjectType === "user" ? local.subjectId : undefined,
        },
        messageKey: `subscription_renewed_${invoice.id}`,
        productName: product.name,
        nextBillingDate: formatDatePtBR(local.currentPeriodEnd),
      });
    }
    safeLog(deps.logger, "info", "billing.webhook.invoice.annual_renewal_anchor_reset", {
      invoiceId: invoice.id,
      subscriptionId: local.id,
      productId: product.id,
      nextCreditGrantAt: next.toISOString(),
    });
    return { processed: true, reason: "annual_renewal_anchor_reset" };
  }

  const result = await grantBonusCredits(
    {
      db: deps.db,
      logger: deps.logger,
      onAudit: deps.onAudit,
    },
    {
      owner: { type: local.subjectType, id: local.subjectId },
      amount: bonus,
      reason: "subscription_monthly",
      expiresAt: new Date(Date.now() + MONTHLY_BONUS_TTL_DAYS * 86_400_000),
      stripeEventId: eventId,
      metadata: {
        invoiceId: invoice.id,
        productId: product.id,
        billingReason,
      },
    },
  );

  safeLog(
    deps.logger,
    "info",
    result.alreadyProcessed
      ? "billing.webhook.invoice.bonus_replay_ignored"
      : "billing.webhook.invoice.bonus_granted",
    {
      invoiceId: invoice.id,
      ledgerEntryId: result.ledgerEntryId,
      productId: product.id,
      bonus,
    },
  );

  // Send transactional confirmation — only on the FRESH grant (not replays).
  //   subscription_create → billing.payment-success (initial activation receipt)
  //   subscription_cycle  → billing.subscription-renewed (renewal confirmation)
  // For subscription_update, we don't email — proration changes are noisy and
  // the user already saw the change in the portal.
  if (!result.alreadyProcessed && deps.emails && local.customerEmail) {
    const recipient = {
      email: local.customerEmail,
      userId: local.subjectType === "user" ? local.subjectId : undefined,
    };
    if (billingReason === "subscription_create") {
      const amountFormatted = formatBrlAmount(invoice.amount_paid ?? 0, invoice.currency ?? "brl");
      await sendBillingEmail(deps.emails, {
        category: "billing.payment-success",
        recipient,
        messageKey: `payment_success_${invoice.id}`,
        productName: product.name,
        amountFormatted,
      });
    } else if (billingReason === "subscription_cycle") {
      await sendBillingEmail(deps.emails, {
        category: "billing.subscription-renewed",
        recipient,
        messageKey: `subscription_renewed_${invoice.id}`,
        productName: product.name,
        nextBillingDate: formatDatePtBR(local.currentPeriodEnd),
      });
    }
  }

  return {
    processed: true,
    reason: result.alreadyProcessed ? "bonus_already_granted" : "bonus_granted",
  };
}

/**
 * Handles `invoice.payment_failed`. Marks the local subscription as `past_due`
 * and increments a dunning attempt counter in `metadata.dunning`. The actual
 * email send is handled by the `retryFailedDunningEmails` sweeper, which lets
 * us throttle/retry without blocking the webhook ack.
 */
export async function handleInvoicePaymentFailed(
  deps: InvoiceWebhookDeps,
  invoice: StripeInvoiceLike,
  eventId: string,
): Promise<InvoiceWebhookResult> {
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) {
    return { processed: false, reason: "no_subscription" };
  }
  const local = await loadOrRecoverLocalSubscriptionWithSubject(deps, subscriptionId);
  if (!local) {
    safeLog(deps.logger, "warn", "billing.webhook.invoice.payment_failed_no_local", {
      invoiceId: invoice.id,
      providerSubscriptionId: subscriptionId,
    });
    return { processed: false, reason: "subscription_not_local" };
  }

  const dunningPayload = {
    invoiceId: invoice.id,
    eventId,
    failedAt: new Date().toISOString(),
  };
  const newMetadata: Record<string, unknown> = {
    ...local.metadata,
    dunning: {
      ...(typeof local.metadata.dunning === "object" && local.metadata.dunning
        ? (local.metadata.dunning as Record<string, unknown>)
        : {}),
      lastFailedAt: dunningPayload.failedAt,
      lastInvoiceId: invoice.id,
      lastEventId: eventId,
      pending: true,
    },
  };

  await deps.db
    .update(subscriptionsTable)
    .set({
      status: "past_due",
      metadata: newMetadata,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.id, local.id));

  if (deps.onAudit) {
    try {
      deps.onAudit({
        eventType: "billing.payment_failed",
        actorId: null,
        payload: {
          invoiceId: invoice.id,
          subscriptionId: local.id,
          providerSubscriptionId: subscriptionId,
          subjectType: local.subjectType,
          subjectId: local.subjectId,
        },
        timestamp: new Date(),
      });
    } catch {
      // audit must never break the webhook
    }
  }

  safeLog(deps.logger, "warn", "billing.webhook.invoice.payment_failed", {
    invoiceId: invoice.id,
    subscriptionId: local.id,
    subjectType: local.subjectType,
    subjectId: local.subjectId,
  });

  return { processed: true, reason: "subscription_past_due" };
}

function extractSubscriptionId(invoice: StripeInvoiceLike): string | null {
  const ref = invoice.parent?.subscription_details?.subscription;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

type LocalSubWithSubject = {
  id: string;
  productId: string;
  providerPriceId: string;
  subjectType: SubjectType;
  subjectId: string;
  customerEmail: string;
  currentPeriodEnd: Date;
  metadata: Record<string, unknown>;
};

async function loadLocalSubscriptionWithSubject(
  deps: InvoiceWebhookDeps,
  providerSubscriptionId: string,
): Promise<LocalSubWithSubject | null> {
  const rows = await deps.db
    .select({
      id: subscriptionsTable.id,
      productId: subscriptionsTable.productId,
      providerPriceId: subscriptionsTable.providerPriceId,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      metadata: subscriptionsTable.metadata,
      subjectType: customersTable.subjectType,
      subjectId: customersTable.subjectId,
      customerEmail: customersTable.email,
    })
    .from(subscriptionsTable)
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .where(
      and(
        eq(subscriptionsTable.provider, deps.provider),
        eq(subscriptionsTable.providerSubscriptionId, providerSubscriptionId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    productId: row.productId,
    providerPriceId: row.providerPriceId,
    subjectType: row.subjectType as SubjectType,
    subjectId: row.subjectId,
    customerEmail: row.customerEmail,
    currentPeriodEnd: row.currentPeriodEnd,
    metadata: row.metadata,
  };
}

/**
 * Resolves a Product from the catalog using the priceId as the source of
 * truth. Falls back to a last-known productId only when the price isn't in
 * our catalog (typically a misconfigured product).
 */
function resolveProductByPriceId(
  products: readonly Product[],
  priceId: string,
  fallbackProductId: string,
): Product | undefined {
  const byPrice = products.find(
    (p) => p.stripePriceId.dev === priceId || p.stripePriceId.prod === priceId,
  );
  if (byPrice) return byPrice;
  return products.find((p) => p.id === fallbackProductId);
}

async function loadOrRecoverLocalSubscriptionWithSubject(
  deps: InvoiceWebhookDeps,
  providerSubscriptionId: string,
): Promise<LocalSubWithSubject | null> {
  const existing = await loadLocalSubscriptionWithSubject(deps, providerSubscriptionId);
  if (existing) return existing;
  return recoverLocalSubscriptionFromProvider(deps, providerSubscriptionId);
}

async function recoverLocalSubscriptionFromProvider(
  deps: InvoiceWebhookDeps,
  providerSubscriptionId: string,
): Promise<LocalSubWithSubject | null> {
  if (!deps.providerClient.retrieveSubscriptionDetails) return null;
  const details = await deps.providerClient.retrieveSubscriptionDetails(providerSubscriptionId);
  if (!details) return null;
  if (!details.providerPriceId) {
    safeLog(deps.logger, "warn", "billing.webhook.invoice.recover_missing_price", {
      providerSubscriptionId,
    });
    return null;
  }

  const customerRows = await deps.db
    .select({
      id: customersTable.id,
      email: customersTable.email,
      subjectType: customersTable.subjectType,
      subjectId: customersTable.subjectId,
    })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.provider, deps.provider),
        eq(customersTable.providerCustomerId, details.providerCustomerId),
      ),
    )
    .limit(1);
  const customer = customerRows[0];
  if (!customer) {
    safeLog(deps.logger, "warn", "billing.webhook.invoice.recover_customer_not_found", {
      providerSubscriptionId,
      providerCustomerId: details.providerCustomerId,
    });
    return null;
  }

  const product = details.productId
    ? deps.products.find((p) => p.id === details.productId)
    : findProductInCatalogByPriceId(deps.products, details.providerPriceId);
  if (!product) {
    safeLog(deps.logger, "warn", "billing.webhook.invoice.recover_product_not_in_catalog", {
      providerSubscriptionId,
      providerPriceId: details.providerPriceId,
      productId: details.productId,
    });
    return null;
  }
  const productId = product.id;
  const currentPeriodStart = details.currentPeriodStart ?? new Date();
  const currentPeriodEnd = details.currentPeriodEnd ?? new Date();
  const cancelAtPeriodEnd = details.cancelAtPeriodEnd ? currentPeriodEnd : null;

  await deps.db
    .insert(subscriptionsTable)
    .values({
      customerId: customer.id,
      provider: deps.provider,
      providerSubscriptionId: details.id,
      productId,
      providerPriceId: details.providerPriceId,
      status: normalizeStatus(details.status),
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      canceledAt: details.canceledAt,
      trialEnd: details.trialEnd,
      metadata: details.metadata,
    })
    .onConflictDoUpdate({
      target: [subscriptionsTable.provider, subscriptionsTable.providerSubscriptionId],
      set: {
        status: normalizeStatus(details.status),
        productId,
        providerPriceId: details.providerPriceId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        canceledAt: details.canceledAt,
        trialEnd: details.trialEnd,
        metadata: details.metadata,
        updatedAt: new Date(),
      },
    });

  safeLog(deps.logger, "info", "billing.webhook.invoice.subscription_recovered", {
    providerSubscriptionId,
    productId,
  });

  return {
    id: details.id,
    productId,
    providerPriceId: details.providerPriceId,
    subjectType: customer.subjectType as SubjectType,
    subjectId: customer.subjectId,
    customerEmail: customer.email,
    currentPeriodEnd,
    metadata: details.metadata,
  };
}

function findProductInCatalogByPriceId(
  products: readonly Product[],
  priceId: string,
): Product | undefined {
  return products.find((p) => p.stripePriceId.dev === priceId || p.stripePriceId.prod === priceId);
}

function normalizeStatus(raw: string): SubscriptionStatus {
  const valid = [
    "active",
    "trialing",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ] as const;
  return (valid as readonly string[]).includes(raw) ? (raw as SubscriptionStatus) : "incomplete";
}

function formatBrlAmount(amountCents: number, currency: string): string {
  // Stripe represents amounts in the smallest currency unit (cents). pt-BR
  // currency formatting handles the conversion.
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatDatePtBR(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
