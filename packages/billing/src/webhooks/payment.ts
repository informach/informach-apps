import type { Product } from "@informach/config";
import type { Database } from "@informach/db";
import { creditLedger, customers, oneTimePayments } from "@informach/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { type BillingEmailDeps, sendBillingEmail } from "./../billing-emails";
import { type Logger, safeLog } from "./../logger";
import type { BillingAuditEvent, BillingProvider, SubjectType } from "./../types";

type StripePaymentIntentLike = {
  id: string;
  customer: string | { id: string } | null;
  amount?: number;
  currency?: string;
  latest_charge?: string | { id: string } | null;
  metadata?: Record<string, string>;
};

export type PaymentWebhookDeps = {
  db: Database;
  provider: BillingProvider;
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
  emails?: BillingEmailDeps;
  /** Product catalog — used for productName resolution in receipts. */
  products: readonly Product[];
};

export type PaymentWebhookResult = {
  processed: boolean;
  reason: string;
};

/**
 * Idempotently handles `payment_intent.succeeded`. For credit-pack purchases
 * (metadata.product_id + credit_amount set), inserts a `one_time_payments` row
 * and a positive `credit_ledger` entry in a single transaction. Both rows are
 * deduplicated:
 *   - `one_time_payments (provider, provider_payment_id)` UNIQUE
 *   - `credit_ledger (stripe_event_id)` UNIQUE partial
 * Replays return `processed: true, reason: 'already_granted'`.
 *
 * Payments without `credit_amount` metadata (e.g., one-time non-credit purchases
 * we may add later) are skipped with `reason: 'not_a_credit_pack'`.
 */
export async function handlePaymentIntentSucceeded(
  deps: PaymentWebhookDeps,
  paymentIntent: StripePaymentIntentLike,
  eventId: string,
): Promise<PaymentWebhookResult> {
  const metadata = paymentIntent.metadata ?? {};
  const subjectTypeRaw = metadata.subject_type;
  const subjectId = metadata.subject_id;
  const productId = metadata.product_id;
  const creditAmountRaw = metadata.credit_amount;

  if (!subjectTypeRaw || !subjectId || !productId) {
    safeLog(deps.logger, "warn", "billing.webhook.payment.missing_subject_metadata", {
      paymentIntentId: paymentIntent.id,
      eventId,
      hasSubjectType: Boolean(subjectTypeRaw),
      hasSubjectId: Boolean(subjectId),
      hasProductId: Boolean(productId),
    });
    return { processed: false, reason: "missing_subject_metadata" };
  }
  if (subjectTypeRaw !== "user" && subjectTypeRaw !== "organization") {
    safeLog(deps.logger, "warn", "billing.webhook.payment.invalid_subject_type", {
      paymentIntentId: paymentIntent.id,
      subjectTypeRaw,
    });
    return { processed: false, reason: "invalid_subject_type" };
  }
  const product = deps.products.find((p) => p.id === productId);
  if (!product) {
    safeLog(deps.logger, "warn", "billing.webhook.payment.product_not_in_catalog", {
      paymentIntentId: paymentIntent.id,
      productId,
    });
    return { processed: false, reason: "product_not_in_catalog" };
  }
  if (product.kind !== "credit_pack") {
    safeLog(deps.logger, "debug", "billing.webhook.payment.not_a_credit_pack", {
      paymentIntentId: paymentIntent.id,
      productId,
      kind: product.kind,
    });
    return { processed: false, reason: "not_a_credit_pack" };
  }
  if (!product.creditAmount || product.creditAmount <= 0) {
    safeLog(deps.logger, "warn", "billing.webhook.payment.invalid_product_credit_amount", {
      paymentIntentId: paymentIntent.id,
      productId,
      configuredCreditAmount: product.creditAmount,
    });
    return { processed: false, reason: "invalid_product_credit_amount" };
  }
  if (!creditAmountRaw) {
    safeLog(deps.logger, "warn", "billing.webhook.payment.missing_credit_amount", {
      paymentIntentId: paymentIntent.id,
      productId,
    });
    return { processed: false, reason: "missing_credit_amount" };
  }
  const normalizedCreditAmountRaw = creditAmountRaw.trim();
  const metadataCreditAmount = /^\d+$/.test(normalizedCreditAmountRaw)
    ? Number(normalizedCreditAmountRaw)
    : Number.NaN;
  if (
    !Number.isInteger(metadataCreditAmount) ||
    metadataCreditAmount <= 0 ||
    metadataCreditAmount !== product.creditAmount
  ) {
    safeLog(deps.logger, "warn", "billing.webhook.payment.invalid_credit_amount", {
      paymentIntentId: paymentIntent.id,
      creditAmountRaw,
      configuredCreditAmount: product.creditAmount,
    });
    return { processed: false, reason: "invalid_credit_amount" };
  }
  const creditAmount = product.creditAmount;

  const subjectType = subjectTypeRaw as SubjectType;
  const providerCustomerId = extractCustomerId(paymentIntent.customer);
  if (!providerCustomerId) {
    safeLog(deps.logger, "warn", "billing.webhook.payment.missing_customer", {
      paymentIntentId: paymentIntent.id,
    });
    return { processed: false, reason: "missing_customer" };
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
  const customer = customerRows[0];
  if (!customer) {
    safeLog(deps.logger, "error", "billing.webhook.payment.customer_not_found", {
      paymentIntentId: paymentIntent.id,
      providerCustomerId,
    });
    return { processed: false, reason: "customer_not_found" };
  }
  if (customer.subjectType !== subjectType || customer.subjectId !== subjectId) {
    safeLog(deps.logger, "warn", "billing.webhook.payment.customer_subject_mismatch", {
      paymentIntentId: paymentIntent.id,
      providerCustomerId,
      metadataSubjectType: subjectType,
      metadataSubjectId: subjectId,
      customerSubjectType: customer.subjectType,
      customerSubjectId: customer.subjectId,
    });
    return { processed: false, reason: "customer_subject_mismatch" };
  }

  const latestChargeId =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : (paymentIntent.latest_charge?.id ?? null);
  const amountCents = paymentIntent.amount ?? 0;
  const currency = (paymentIntent.currency ?? "brl").toUpperCase();

  const result = await deps.db.transaction(async (tx) => {
    // 1) one_time_payments — idempotent via (provider, provider_payment_id) UNIQUE
    const insertedPayment = await tx
      .insert(oneTimePayments)
      .values({
        customerId: customer.id,
        provider: deps.provider,
        providerPaymentId: paymentIntent.id,
        productId,
        amountCents,
        currency,
        status: "paid",
        creditAmount,
        paidAt: new Date(),
        metadata: {
          subjectType,
          subjectId,
          stripeEventId: eventId,
          ...(latestChargeId ? { stripeChargeId: latestChargeId } : {}),
        },
      })
      .onConflictDoNothing({
        target: [oneTimePayments.provider, oneTimePayments.providerPaymentId],
      })
      .returning({ id: oneTimePayments.id });

    let paymentId: string;
    if (insertedPayment.length > 0 && insertedPayment[0]) {
      paymentId = insertedPayment[0].id;
    } else {
      // Conflict — read back existing payment row id for ledger linkage.
      const existing = await tx
        .select({ id: oneTimePayments.id })
        .from(oneTimePayments)
        .where(
          and(
            eq(oneTimePayments.provider, deps.provider),
            eq(oneTimePayments.providerPaymentId, paymentIntent.id),
          ),
        )
        .limit(1);
      if (!existing[0]) {
        throw new Error(
          "@informach/billing: oneTimePayments insert returned 0 rows but no existing row found",
        );
      }
      paymentId = existing[0].id;
    }

    // 2) credit_ledger purchase entry — idempotent via stripe_event_id UNIQUE partial
    const insertedLedger = await tx
      .insert(creditLedger)
      .values({
        ownerType: subjectType,
        ownerId: subjectId,
        entryType: "purchase",
        amount: creditAmount,
        expiresAt: null,
        paymentId,
        stripeEventId: eventId,
        productSku: productId,
        metadata: { productId, paymentIntentId: paymentIntent.id },
      })
      .onConflictDoNothing({
        target: [creditLedger.stripeEventId],
      })
      .returning({ id: creditLedger.id });

    if (insertedLedger.length > 0 && insertedLedger[0]) {
      return {
        ledgerEntryId: insertedLedger[0].id,
        paymentId,
        replay: false,
      };
    }
    // Replay path: ledger already had an entry for this event_id. Re-read for id.
    const existingLedger = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.stripeEventId, eventId))
      .limit(1);
    return {
      ledgerEntryId: existingLedger[0]?.id ?? null,
      paymentId,
      replay: true,
    };
  });

  if (deps.onAudit) {
    try {
      deps.onAudit({
        eventType: "billing.payment_succeeded",
        actorId: null,
        payload: {
          paymentIntentId: paymentIntent.id,
          paymentId: result.paymentId,
          ledgerEntryId: result.ledgerEntryId,
          subjectType,
          subjectId,
          productId,
          creditAmount,
          amountCents,
          currency,
          replay: result.replay,
        },
        timestamp: new Date(),
      });
    } catch {
      // audit must never break the webhook
    }
  }

  safeLog(
    deps.logger,
    "info",
    result.replay ? "billing.webhook.payment.replay_ignored" : "billing.webhook.payment.granted",
    {
      paymentIntentId: paymentIntent.id,
      paymentId: result.paymentId,
      ledgerEntryId: result.ledgerEntryId,
      creditAmount,
      productId,
    },
  );

  // Send the credits-purchased receipt — only on the FRESH grant, not on replays.
  // Email send failures are swallowed inside sendBillingEmail (logged), so this
  // never blocks the webhook ack. Idempotency: messageKey = ledgerEntryId, which
  // is stable per Stripe event.
  if (!result.replay && deps.emails && customer.email && result.ledgerEntryId) {
    const balanceAfter = await readOwnerBalanceAfter(deps.db, subjectType, subjectId);
    await sendBillingEmail(deps.emails, {
      category: "billing.credits-purchased",
      recipient: {
        email: customer.email,
        userId: subjectType === "user" ? subjectId : undefined,
      },
      messageKey: result.ledgerEntryId,
      creditAmount,
      balanceAfter,
    });
  }

  return {
    processed: true,
    reason: result.replay ? "already_granted" : "credit_pack_granted",
  };
}

function extractCustomerId(customer: StripePaymentIntentLike["customer"]): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
}

/**
 * Reads the owner's balance immediately after a grant. Single round-trip, no
 * locks — this is for display only (email body), not for accounting decisions.
 */
async function readOwnerBalanceAfter(
  db: Database,
  ownerType: SubjectType,
  ownerId: string,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM billing.credit_ledger
    WHERE owner_type = ${ownerType}
      AND owner_id = ${ownerId}
      AND entry_type <> 'expiration'
      AND (expires_at IS NULL OR expires_at > now())
  `);
  const rows = result as unknown as Array<{ total: number | string | null }>;
  return Number(rows[0]?.total ?? 0);
}
