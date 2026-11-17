import {
  lockActiveWebParticipation,
  webCommercialLockKey,
} from "@informach/auth/web-participation";
import { isStripePriceIdConfigured, type Product, type StripeMode } from "@informach/config";
import { type Database, withDatabaseLocksWait, withDatabaseLockWait } from "@informach/db";
import {
  creditLedger,
  creditPurchaseIntents,
  customers,
  oneTimePayments,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { assertAccountPayer, resolveCreditOwner } from "./collection-accounts";
import { assertCompassoFundingClear, requestCollectionReconciliation } from "./collection-jobs";
import { setGrantFundingState } from "./credits/funding";
import { refundCredits } from "./credits/grant";
import { lockCreditOwner } from "./credits/locks";
import { getOrCreateCustomer } from "./customers";
import { BillingError, CheckoutPendingError, InvalidProductError } from "./errors";
import type { BillingProviderClient, ProviderCreditCheckoutSnapshot } from "./providers/types";

type Intent = typeof creditPurchaseIntents.$inferSelect;
type Customer = typeof customers.$inferSelect;
export type CreditPurchaseProvider = Pick<
  BillingProviderClient,
  | "createCustomer"
  | "createCheckoutSession"
  | "findCheckoutSession"
  | "readCreditCheckout"
  | "closeCreditCheckout"
>;
export type CreditPurchaseDeps = {
  db: Database;
  providerClient: CreditPurchaseProvider;
  products: readonly Product[];
  mode: StripeMode;
  publicUrl: string;
};
type ReceiptDeps = Pick<CreditPurchaseDeps, "db">;
const startSchema = z.object({
  actorId: z.string().min(1).max(200),
  accountId: z.uuid(),
  requestKey: z.uuid(),
  productId: z.string().min(1).max(120),
});
export type CreditPurchaseResult =
  | { intentId: string; status: "paid" | "pending" | "expired" | "failed" }
  | { intentId: string; status: "open"; url: string };

export const withCompassoBillingLock = <T>(accountId: string, operation: () => Promise<T>) =>
  withDatabaseLockWait(`compasso:billing:${accountId}`, operation);

/** User-initiated changes must be ordered with freezing even across provider I/O.
 * Reconciliation retains the account-only lock: it settles existing obligations. */
export function withActiveCompassoBillingLock<T>(
  db: Database,
  actorId: string,
  accountId: string,
  operation: () => Promise<T>,
) {
  return withDatabaseLocksWait(
    [webCommercialLockKey(actorId), `compasso:billing:${accountId}`],
    async () => {
      await db.transaction((tx) => lockActiveWebParticipation(tx, actorId));
      return operation();
    },
  );
}

/** A confirmed request key never becomes a second purchase after a retry. */
export async function startCreditPurchase(
  deps: CreditPurchaseDeps,
  raw: z.input<typeof startSchema>,
): Promise<CreditPurchaseResult> {
  const input = startSchema.parse(raw);
  const product = deps.products.find(
    (item) => item.id === input.productId && item.app === "compasso" && item.kind === "credit_pack",
  );
  if (
    !product?.creditAmount ||
    !product.listPrice ||
    !isStripePriceIdConfigured(product.stripePriceId[deps.mode])
  )
    throw new InvalidProductError(input.productId, "Compasso credit price is not configured");
  const { creditAmount, listPrice } = product;
  const provider = purchaseProvider(deps.providerClient);
  const origin = new URL(deps.publicUrl);
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    !["https:", "http:"].includes(origin.protocol)
  )
    throw new BillingError("Invalid account origin");
  return withActiveCompassoBillingLock(deps.db, input.actorId, input.accountId, async () => {
    const { account, email } = await assertAccountPayer(deps.db, input.actorId, input.accountId);
    if (account.collection !== "compasso" || account.closedAt)
      throw new BillingError("Commercial account is unavailable for purchases");
    await deps.db.transaction((tx) => lockFamilyMembership(tx, input.actorId, account.groupId));
    await assertCompassoFundingClear(deps.db, account.groupId);
    const record = await getOrCreateCustomer(
      {
        db: deps.db,
        provider: "stripe",
        providerClient: deps.providerClient,
        organizationsEnabled: false,
        app: "compasso",
      },
      { subject: { type: "billing_account", id: account.id }, actorId: input.actorId, email },
    );
    const [customer] = await deps.db
      .select()
      .from(customers)
      .where(eq(customers.id, record.customerId));
    if (!customer) throw new BillingError("Credit customer is unavailable");
    let [intent] = await deps.db
      .select()
      .from(creditPurchaseIntents)
      .where(
        and(
          eq(creditPurchaseIntents.customerId, customer.id),
          eq(creditPurchaseIntents.requestKey, input.requestKey),
        ),
      );
    if (intent && (intent.productId !== product.id || intent.userId !== input.actorId))
      throw new BillingError("Purchase request key conflicts with its receipt");
    if (!intent) {
      const [pending] = await deps.db
        .select()
        .from(creditPurchaseIntents)
        .where(
          and(
            eq(creditPurchaseIntents.customerId, customer.id),
            eq(creditPurchaseIntents.outcome, "pending"),
          ),
        );
      if (pending) throw new CheckoutPendingError();
      intent = await deps.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(creditPurchaseIntents)
          .values({
            customerId: customer.id,
            userId: input.actorId,
            requestKey: input.requestKey,
            productId: product.id,
            priceId: product.stripePriceId[deps.mode],
            credits: creditAmount,
            amountCents: listPrice.amountCents,
            currency: listPrice.currency.toUpperCase(),
            request: {
              successUrl: `${origin.origin}/?compra=retorno#compasso`,
              cancelUrl: `${origin.origin}/#compasso`,
              expiresAt: Math.floor(Date.now() / 1000) + 3600,
            },
          })
          .returning();
        if (!created) throw new BillingError("Could not reserve credit purchase");
        await requestCollectionReconciliation(tx, {
          customerId: customer.id,
          kind: "credit_purchase",
          subjectId: created.id,
        });
        return created;
      });
    }
    if (!intent) throw new BillingError("Could not reserve credit purchase");
    return recoverCreditPurchase({ db: deps.db, providerClient: provider }, customer, intent);
  });
}

const existingSchema = startSchema.pick({ actorId: true, accountId: true }).extend({
  intentId: z.uuid(),
});

/** Payers may finish/cancel an already authorized purchase after leaving the family. */
export async function resumeCreditPurchase(
  deps: CreditPurchaseDeps,
  raw: z.input<typeof existingSchema>,
): Promise<CreditPurchaseResult> {
  const input = existingSchema.parse(raw);
  return withCompassoBillingLock(input.accountId, async () => {
    const { customer, intent } = await payerReceipt(deps.db, input);
    return recoverCreditPurchase(
      { db: deps.db, providerClient: purchaseProvider(deps.providerClient) },
      customer,
      intent,
    );
  });
}

/** Never clear the local guard until the provider can no longer collect this payment. */
export async function cancelCreditPurchase(
  deps: CreditPurchaseDeps,
  raw: z.input<typeof existingSchema>,
): Promise<CreditPurchaseResult> {
  const input = existingSchema.parse(raw);
  return withCompassoBillingLock(input.accountId, async () => {
    const { customer, intent } = await payerReceipt(deps.db, input);
    return closeCreditPurchaseLocked(deps, customer, intent);
  });
}

/** Reusable settlement for the authenticated payer and the confirmed closure
 * worker. The caller holds the account lifecycle lock; no nested pool lock. */
export async function closeCreditPurchaseLocked(
  deps: Pick<CreditPurchaseDeps, "db" | "providerClient">,
  customer: Customer,
  intent: Intent,
): Promise<CreditPurchaseResult> {
  if (intent.outcome !== "pending") return { intentId: intent.id, status: intent.outcome };
  if (!intent.requestStarted) {
    const status = await finishUnstartedPurchase(deps.db, intent.id, "failed");
    return { intentId: intent.id, status };
  }
  const provider = purchaseProvider(deps.providerClient);
  const recovered = await recoverCreditPurchase(
    { db: deps.db, providerClient: provider },
    customer,
    intent,
  );
  if (recovered.status !== "pending" && recovered.status !== "open") return recovered;
  const [current] = await deps.db
    .select()
    .from(creditPurchaseIntents)
    .where(eq(creditPurchaseIntents.id, intent.id));
  if (!current?.providerSessionId) throw new CheckoutPendingError();
  await provider.closeCreditCheckout(
    customer.providerCustomerId,
    intent.id,
    current.providerSessionId,
  );
  const snapshot = await provider.readCreditCheckout(
    customer.providerCustomerId,
    intent.id,
    current.providerSessionId,
  );
  return {
    intentId: intent.id,
    status: await reconcileCreditPurchase(deps, intent.id, snapshot),
  };
}

async function payerReceipt(db: Database, input: z.infer<typeof existingSchema>) {
  const { account } = await assertAccountPayer(db, input.actorId, input.accountId);
  if (account.collection !== "compasso")
    throw new BillingError("Commercial account is outside Compasso");
  const [record] = await db
    .select({ intent: creditPurchaseIntents, customer: customers })
    .from(creditPurchaseIntents)
    .innerJoin(customers, eq(customers.id, creditPurchaseIntents.customerId))
    .where(
      and(
        eq(creditPurchaseIntents.id, input.intentId),
        eq(customers.app, "compasso"),
        eq(customers.subjectType, "billing_account"),
        eq(customers.subjectId, input.accountId),
      ),
    );
  if (!record) throw new BillingError("Credit purchase is unavailable to this payer");
  return record;
}

/** Durable worker/webhook entry: it also rechecks previously paid purchases for refunds/disputes. */
export async function refreshCreditPurchase(
  deps: Pick<CreditPurchaseDeps, "db" | "providerClient">,
  intentId: string,
): Promise<CreditPurchaseResult> {
  const [record] = await deps.db
    .select({ intent: creditPurchaseIntents, customer: customers })
    .from(creditPurchaseIntents)
    .innerJoin(customers, eq(customers.id, creditPurchaseIntents.customerId))
    .where(
      and(
        eq(creditPurchaseIntents.id, z.uuid().parse(intentId)),
        eq(customers.app, "compasso"),
        eq(customers.subjectType, "billing_account"),
        eq(customers.provider, "stripe"),
      ),
    );
  if (!record) throw new BillingError("Unknown Compasso credit purchase");
  return withCompassoBillingLock(record.customer.subjectId, async () => {
    const [intent] = await deps.db
      .select()
      .from(creditPurchaseIntents)
      .where(eq(creditPurchaseIntents.id, intentId));
    if (!intent) throw new BillingError("Credit purchase disappeared during reconciliation");
    const provider = purchaseProvider(deps.providerClient);
    if (!intent.providerSessionId || intent.outcome === "pending")
      return recoverCreditPurchase(
        { db: deps.db, providerClient: provider },
        record.customer,
        intent,
      );
    const snapshot = await provider.readCreditCheckout(
      record.customer.providerCustomerId,
      intent.id,
      intent.providerSessionId,
    );
    return { intentId, status: await reconcileCreditPurchase(deps, intent.id, snapshot) };
  });
}

async function finishUnstartedPurchase(
  db: Database,
  intentId: string,
  outcome: "failed" | "expired",
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(creditPurchaseIntents)
      .where(eq(creditPurchaseIntents.id, intentId))
      .for("update");
    if (!current) throw new BillingError("Unknown credit purchase");
    if (current.outcome !== "pending") return current.outcome;
    await tx
      .update(creditPurchaseIntents)
      .set({ outcome, resolvedAt: new Date() })
      .where(eq(creditPurchaseIntents.id, intentId));
    return outcome;
  });
}

function purchaseProvider(provider: CreditPurchaseProvider) {
  if (
    !provider.findCheckoutSession ||
    !provider.readCreditCheckout ||
    !provider.closeCreditCheckout
  )
    throw new BillingError("Provider does not support recoverable credit purchases");
  return {
    createCheckoutSession: provider.createCheckoutSession,
    findCheckoutSession: provider.findCheckoutSession,
    readCreditCheckout: provider.readCreditCheckout,
    closeCreditCheckout: provider.closeCreditCheckout,
  };
}

/** Called under the account lifecycle lock; a fixed expiry also bounds an unknown response. */
async function recoverCreditPurchase(
  deps: ReceiptDeps & { providerClient: ReturnType<typeof purchaseProvider> },
  customer: Customer,
  intent: Intent,
): Promise<CreditPurchaseResult> {
  if (intent.outcome !== "pending") return { intentId: intent.id, status: intent.outcome };
  let state = intent.requestStarted
    ? await deps.providerClient.findCheckoutSession(
        customer.providerCustomerId,
        intent.id,
        intent.providerSessionId,
      )
    : null;
  if (!state && intent.request.expiresAt <= Math.floor(Date.now() / 1000)) {
    return {
      intentId: intent.id,
      status: await finishUnstartedPurchase(deps.db, intent.id, "expired"),
    };
  }
  if (!state) {
    await deps.db
      .update(creditPurchaseIntents)
      .set({ requestStarted: true })
      .where(eq(creditPurchaseIntents.id, intent.id));
    const created = await deps.providerClient.createCheckoutSession({
      ...intent.request,
      mode: "payment",
      customerId: customer.providerCustomerId,
      priceId: intent.priceId,
      metadata: {
        subject_type: customer.subjectType,
        subject_id: customer.subjectId,
        product_id: intent.productId,
        credit_amount: String(intent.credits),
        checkout_intent_id: intent.id,
      },
      idempotencyKey: `compasso:credits:${intent.id}`,
    });
    await deps.db
      .update(creditPurchaseIntents)
      .set({ providerSessionId: created.id })
      .where(eq(creditPurchaseIntents.id, intent.id));
    state = await deps.providerClient.findCheckoutSession(
      customer.providerCustomerId,
      intent.id,
      created.id,
    );
    if (!state) throw new CheckoutPendingError();
  }
  const snapshot = await deps.providerClient.readCreditCheckout(
    customer.providerCustomerId,
    intent.id,
    state.id,
  );
  const outcome = await reconcileCreditPurchase(deps, intent.id, snapshot);
  if (snapshot.status === "open" && state.url)
    return { intentId: intent.id, status: "open", url: state.url };
  return { intentId: intent.id, status: outcome };
}

/** A webhook/job supplies an authenticated provider read, never a browser's success flag. */
export async function reconcileCreditPurchase(
  deps: ReceiptDeps,
  intentId: string,
  snapshot: ProviderCreditCheckoutSnapshot,
): Promise<Intent["outcome"]> {
  return deps.db.transaction(async (tx) => {
    const [intent] = await tx
      .select()
      .from(creditPurchaseIntents)
      .where(eq(creditPurchaseIntents.id, intentId))
      .for("update");
    if (!intent) throw new BillingError("Unknown credit purchase receipt");
    const [customer] = await tx.select().from(customers).where(eq(customers.id, intent.customerId));
    if (
      customer?.app !== "compasso" ||
      customer.subjectType !== "billing_account" ||
      customer.provider !== "stripe" ||
      snapshot.intentId !== intent.id ||
      snapshot.customerId !== customer.providerCustomerId ||
      snapshot.priceId !== intent.priceId ||
      snapshot.amountCents !== intent.amountCents ||
      snapshot.currency !== intent.currency ||
      (intent.providerSessionId && snapshot.sessionId !== intent.providerSessionId) ||
      !Number.isFinite(snapshot.observedAt.getTime())
    )
      throw new BillingError("Credit checkout does not match its immutable receipt");
    if (intent.observedAt && intent.observedAt > snapshot.observedAt) return intent.outcome;
    const payment = snapshot.payment;
    if (!payment) {
      if (snapshot.paymentStatus !== "unpaid" || intent.outcome === "paid")
        throw new BillingError("Paid checkout is missing its settlement");
      if (snapshot.status === "open" && snapshot.paymentCanceled)
        throw new BillingError("Open checkout cannot have a canceled settlement");
      const outcome =
        snapshot.status === "expired" ? "expired" : snapshot.paymentCanceled ? "failed" : "pending";
      if (intent.outcome !== "pending" && intent.outcome !== outcome)
        throw new BillingError("Terminal checkout cannot reopen");
      if (
        intent.observedAt?.getTime() === snapshot.observedAt.getTime() &&
        intent.outcome !== outcome
      )
        throw new BillingError("Conflicting credit payment observation");
      await tx
        .update(creditPurchaseIntents)
        .set({
          providerSessionId: snapshot.sessionId,
          observedAt: snapshot.observedAt,
          outcome,
          resolvedAt: outcome === "pending" ? null : new Date(),
        })
        .where(eq(creditPurchaseIntents.id, intent.id));
      return outcome;
    }
    if (
      snapshot.status !== "complete" ||
      snapshot.paymentStatus !== "paid" ||
      snapshot.paymentCanceled ||
      !["pending", "paid"].includes(intent.outcome) ||
      !Number.isInteger(payment.amountRefundedCents) ||
      payment.amountRefundedCents < intent.refundedAmountCents ||
      payment.amountRefundedCents > intent.amountCents ||
      !Number.isFinite(payment.paidAt.getTime())
    )
      throw new BillingError("Invalid or regressive credit payment facts");
    if (
      intent.observedAt?.getTime() === snapshot.observedAt.getTime() &&
      (intent.disputed !== payment.disputed ||
        intent.refundedAmountCents !== payment.amountRefundedCents ||
        intent.outcome !== "paid")
    )
      throw new BillingError("Conflicting credit payment observation");
    const owner = await resolveCreditOwner(tx, "compasso", {
      type: customer.subjectType,
      id: customer.subjectId,
    });
    await lockCreditOwner(tx, owner);
    await tx
      .insert(oneTimePayments)
      .values({
        customerId: customer.id,
        provider: "stripe",
        providerPaymentId: payment.id,
        productId: intent.productId,
        amountCents: intent.amountCents,
        currency: intent.currency,
        status: "paid",
        creditAmount: intent.credits,
        paidAt: payment.paidAt,
        metadata: { checkoutIntentId: intent.id },
      })
      .onConflictDoNothing({
        target: [oneTimePayments.provider, oneTimePayments.providerPaymentId],
      });
    const [paid] = await tx
      .select()
      .from(oneTimePayments)
      .where(
        and(
          eq(oneTimePayments.provider, "stripe"),
          eq(oneTimePayments.providerPaymentId, payment.id),
        ),
      );
    if (
      !paid ||
      paid.customerId !== customer.id ||
      paid.productId !== intent.productId ||
      paid.amountCents !== intent.amountCents ||
      paid.currency !== intent.currency ||
      paid.creditAmount !== intent.credits ||
      paid.metadata?.checkoutIntentId !== intent.id ||
      paid.paidAt?.getTime() !== payment.paidAt.getTime() ||
      (intent.paymentId && intent.paymentId !== paid.id)
    )
      throw new BillingError("Credit payment belongs to another receipt");
    const grantKey = `compasso:purchase:${intent.id}`;
    await tx
      .insert(creditLedger)
      .values({
        ownerType: owner.type,
        ownerId: owner.id,
        app: "compasso",
        entryType: "purchase",
        amount: intent.credits,
        expiresAt: null,
        paymentId: paid.id,
        stripeEventId: grantKey,
        productSku: intent.productId,
        actorUserId: intent.userId,
        createdAt: sql`clock_timestamp()`,
        metadata: { checkoutIntentId: intent.id },
      })
      .onConflictDoNothing({ target: creditLedger.stripeEventId });
    const [grant] = await tx
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.stripeEventId, grantKey));
    if (
      !grant ||
      grant.ownerId !== owner.id ||
      grant.ownerType !== owner.type ||
      grant.app !== "compasso" ||
      grant.entryType !== "purchase" ||
      grant.amount !== intent.credits ||
      grant.paymentId !== paid.id ||
      grant.expiresAt
    )
      throw new BillingError("Credit purchase grant conflicts with its receipt");
    // Refunds are irreversible. Revoke the proportional integer units once;
    // a dispute instead freezes/restores the original remaining lot.
    const revoked = Number(
      (BigInt(intent.credits) * BigInt(payment.amountRefundedCents) +
        BigInt(intent.amountCents) -
        1n) /
        BigInt(intent.amountCents),
    );
    if (revoked > intent.revokedCredits)
      await refundCredits(
        { db: tx, app: "compasso" },
        {
          owner,
          originalLedgerEntryId: grant.id,
          amount: revoked - intent.revokedCredits,
          stripeEventId: `compasso:refund:${intent.id}:${revoked}`,
          reason: "payment_refund",
          metadata: { paymentId: paid.id },
        },
      );
    await setGrantFundingState(tx, grant, payment.disputed, snapshot.observedAt, {
      paymentId: paid.id,
      reason: payment.disputed ? "disputed" : "funding_restored",
    });
    await tx
      .update(oneTimePayments)
      .set({
        status: payment.amountRefundedCents === intent.amountCents ? "refunded" : "paid",
        updatedAt: new Date(),
      })
      .where(eq(oneTimePayments.id, paid.id));
    await tx
      .update(creditPurchaseIntents)
      .set({
        providerSessionId: snapshot.sessionId,
        outcome: "paid",
        paymentId: paid.id,
        refundedAmountCents: payment.amountRefundedCents,
        revokedCredits: revoked,
        disputed: payment.disputed,
        observedAt: snapshot.observedAt,
        resolvedAt: intent.resolvedAt ?? new Date(),
      })
      .where(eq(creditPurchaseIntents.id, intent.id));
    return "paid";
  });
}
