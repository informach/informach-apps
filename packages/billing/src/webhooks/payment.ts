import { findApp, type Product } from "@informach/config";
import type { Database } from "@informach/db";
import { creditLedger, customers, oneTimePayments } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { type BillingEmailDeps, sendBillingEmail } from "./../billing-emails";
import { resolveCreditOwner } from "../collection-accounts";
import { getBalance } from "../credits/balance";
import { isMigratingCreditApp, settleLegacyCreditPayment } from "../credits/legacy-payments";
import { lockCreditOwner } from "../credits/locks";
import {
  convertedLegacyAmount,
  findCreditWalletMigration,
  forwardMigratedCreditEntry,
} from "../credits/migration-forwarding";
import { BillingError } from "../errors";
import { type Logger, safeLog } from "./../logger";
import type { BillingProviderClient } from "../providers/types";
import type { BillingAuditEvent, BillingProvider } from "./../types";

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
  /** App slug — escopo do credit_ledger ao gravar a compra. */
  app: string;
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
  emails?: BillingEmailDeps;
  /** Product catalog — used for productName resolution in receipts. */
  products: readonly Product[];
  providerClient?: Pick<BillingProviderClient, "readCreditPayment">;
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
  if (
    subjectTypeRaw !== "user" &&
    subjectTypeRaw !== "organization" &&
    subjectTypeRaw !== "billing_account"
  ) {
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
  if (isMigratingCreditApp(deps.app) && product.app !== deps.app)
    throw new BillingError("Credit product is outside this webhook scope");
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

  const subjectType = subjectTypeRaw;
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
        eq(customers.app, deps.app),
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
  const migrating = isMigratingCreditApp(deps.app);
  if (migrating && !deps.providerClient?.readCreditPayment)
    throw new BillingError("Legacy purchase requires authoritative payment reconciliation");
  const snapshot =
    migrating && deps.providerClient?.readCreditPayment
      ? await deps.providerClient.readCreditPayment(providerCustomerId, paymentIntent.id)
      : null;
  if (
    snapshot &&
    (snapshot.paymentId !== paymentIntent.id ||
      snapshot.customerId !== providerCustomerId ||
      snapshot.amountCents !== amountCents ||
      snapshot.currency.toUpperCase() !== currency)
  )
    throw new BillingError("Payment event conflicts with its settled receipt");

  const result = await deps.db.transaction(async (tx) => {
    const creditOwner = await resolveCreditOwner(tx, deps.app, {
      type: subjectType,
      id: subjectId,
    });
    await lockCreditOwner(tx, creditOwner);
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
        .select()
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
      if (
        migrating &&
        (existing[0].customerId !== customer.id ||
          existing[0].productId !== productId ||
          existing[0].amountCents !== amountCents ||
          existing[0].currency !== currency ||
          existing[0].creditAmount !== creditAmount)
      )
        throw new BillingError("Payment replay conflicts with its original purchase");
      paymentId = existing[0].id;
    }

    if (snapshot) {
      // Distinct deliveries/reconciliation identifiers must not grant the same paid purchase twice.
      const prior = await tx
        .select()
        .from(creditLedger)
        .where(and(eq(creditLedger.paymentId, paymentId), eq(creditLedger.entryType, "purchase")));
      if (prior.length) {
        const grant = prior[0];
        if (
          prior.length !== 1 ||
          !grant ||
          grant.ownerType !== creditOwner.type ||
          grant.ownerId !== creditOwner.id ||
          grant.app !== deps.app ||
          grant.amount !== creditAmount
        )
          throw new BillingError("Payment has a conflicting credit grant");
        await settleLegacyCreditPayment(tx, deps.app, paymentId, snapshot);
        return { ledgerEntryId: grant.id, paymentId, replay: true };
      }
    }

    // 2) credit_ledger purchase entry — idempotent via stripe_event_id UNIQUE partial
    const insertedLedger = await tx
      .insert(creditLedger)
      .values({
        ownerType: creditOwner.type,
        ownerId: creditOwner.id,
        app: deps.app,
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
      await forwardMigratedCreditEntry(tx, insertedLedger[0].id, {
        app: deps.app,
        owner: creditOwner,
      });
      if (snapshot) await settleLegacyCreditPayment(tx, deps.app, paymentId, snapshot);
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
      .where(
        and(
          eq(creditLedger.stripeEventId, eventId),
          eq(creditLedger.paymentId, paymentId),
          eq(creditLedger.app, deps.app),
          eq(creditLedger.ownerType, creditOwner.type),
          eq(creditLedger.ownerId, creditOwner.id),
          eq(creditLedger.amount, creditAmount),
          eq(creditLedger.entryType, "purchase"),
        ),
      )
      .limit(1);
    if (!existingLedger[0]) throw new BillingError("Credit event conflicts with another purchase");
    if (snapshot) await settleLegacyCreditPayment(tx, deps.app, paymentId, snapshot);
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
    const display = await deps.db.transaction(async (tx) => {
      const creditOwner = await resolveCreditOwner(tx, deps.app, {
        type: subjectType,
        id: subjectId,
      });
      await lockCreditOwner(tx, creditOwner);
      const migration = await findCreditWalletMigration(tx, deps.app, creditOwner);
      const refundedCredits = snapshot
        ? Number(
            (BigInt(creditAmount) * BigInt(snapshot.amountRefundedCents) +
              BigInt(snapshot.amountCents) -
              1n) /
              BigInt(snapshot.amountCents),
          )
        : 0;
      return {
        creditAmount: migration
          ? convertedLegacyAmount(creditAmount, migration.multiplier)
          : creditAmount,
        balanceAfter:
          migration || creditOwner.type === "family"
            ? undefined
            : (await getBalance({ db: tx, app: deps.app }, creditOwner)).total,
        conversion: migration
          ? {
              sourceName: findApp(deps.app)?.name ?? deps.emails?.appName ?? deps.app,
              sourceCredits: creditAmount,
            }
          : undefined,
        settlement: snapshot
          ? {
              refundedCredits: migration
                ? convertedLegacyAmount(refundedCredits, migration.multiplier)
                : refundedCredits,
              underReview: snapshot.disputed,
            }
          : undefined,
      };
    });
    await sendBillingEmail(
      { ...deps.emails, ...(display.conversion ? { appName: "Compasso" } : {}) },
      {
        category: "billing.credits-purchased",
        recipient: {
          email: customer.email,
          userId: subjectType === "user" ? subjectId : undefined,
        },
        messageKey: result.ledgerEntryId,
        ...display,
      },
    );
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
