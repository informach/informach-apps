import type { Database } from "@informach/db";
import {
  customers as customersTable,
  subscriptions as subscriptionsTable,
} from "@informach/db/schema";
import type { Product } from "@informach/config";
import { and, eq } from "drizzle-orm";
import { sendBillingEmail, type BillingEmailDeps } from "./../billing-emails";
import { grantBonusCredits } from "./../credits/grant";
import { safeLog, type Logger } from "./../logger";
import type { BillingAuditEvent, BillingProvider, SubjectType } from "./../types";

/**
 * Default expiry for subscription_monthly bonus credits — they should not
 * outlast the billing cycle that earned them. 31 days covers monthly cycles
 * with a small buffer for clock skew between Stripe and our DB.
 */
const MONTHLY_BONUS_TTL_DAYS = 31;

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
  // We only grant bonuses for actual subscription cycles. `manual` / `quote_accept`
  // / `subscription_threshold` / one-off invoice items don't qualify.
  const isCycle =
    billingReason === "subscription_cycle" ||
    billingReason === "subscription_create" ||
    billingReason === "subscription_update";
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

  const local = await loadLocalSubscriptionWithSubject(deps, subscriptionId);
  if (!local) {
    safeLog(deps.logger, "warn", "billing.webhook.invoice.subscription_not_local", {
      invoiceId: invoice.id,
      providerSubscriptionId: subscriptionId,
    });
    return { processed: false, reason: "subscription_not_local" };
  }

  const product = deps.products.find((p) => p.id === local.productId);
  if (!product) {
    safeLog(deps.logger, "warn", "billing.webhook.invoice.product_not_in_catalog", {
      invoiceId: invoice.id,
      productId: local.productId,
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
  const local = await loadLocalSubscriptionWithSubject(deps, subscriptionId);
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
    subjectType: row.subjectType as SubjectType,
    subjectId: row.subjectId,
    customerEmail: row.customerEmail,
    currentPeriodEnd: row.currentPeriodEnd,
    metadata: row.metadata,
  };
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
