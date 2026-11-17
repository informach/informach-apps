import { randomUUID } from "node:crypto";
import { PRODUCTS, type Product } from "@informach/config";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { openCompassoAccount } from "./collection-accounts";
import {
  enqueueCompassoBillingEvent,
  hasPendingCompassoReview,
  runCollectionBillingJobs,
} from "./collection-jobs";
import { getCompassoAccess, startCompassoTrial } from "./compasso";
import {
  type CreditPurchaseDeps,
  type CreditPurchaseProvider,
  cancelCreditPurchase,
  reconcileCreditPurchase,
  refreshCreditPurchase,
  resumeCreditPurchase,
  startCreditPurchase,
} from "./credit-purchases";
import { getBalance } from "./credits/balance";
import { commitReservation, reserveCredits } from "./credits/reservations";
import { authorizeCompassoSpend } from "./credits/shared";
import type { ProviderCheckoutInput, ProviderCreditCheckoutSnapshot } from "./providers/types";

const url = process.env.DATABASE_URL;
if (!url || (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true"))
  throw new Error("Credit purchase tests require an isolated database");
if (!["127.0.0.1", "localhost", "postgres"].includes(new URL(url).hostname))
  throw new Error("Credit purchase tests cannot use a remote database");
const connection = postgres(url, { max: 12, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
afterAll(() => connection.end());

// A stateful boundary simulator: database, lifecycle locks, ledger and permissions remain real.
function providerFixture() {
  const checkouts = new Map<
    string,
    { request: ProviderCheckoutInput; snapshot: ProviderCreditCheckoutSnapshot }
  >();
  let loseNextResponse = false;
  let rejectCancellation = false;
  let lastObserved = 0;
  const client: CreditPurchaseProvider = {
    createCustomer: async (input) => ({
      id: `cus_${input.subject.id}`,
      email: input.email,
      metadata: input.metadata ?? {},
    }),
    createCheckoutSession: async (request) => {
      const intentId = request.metadata.checkout_intent_id;
      if (!intentId) throw new Error("Missing durable purchase receipt");
      let row = checkouts.get(intentId);
      if (!row) {
        row = {
          request,
          snapshot: {
            intentId,
            sessionId: `cs_${intentId}`,
            customerId: request.customerId,
            status: "open",
            paymentStatus: "unpaid",
            paymentCanceled: false,
            priceId: request.priceId,
            amountCents: 1490,
            currency: "BRL",
            observedAt: new Date(),
            payment: null,
          },
        };
        checkouts.set(intentId, row);
      } else if (JSON.stringify(row.request) !== JSON.stringify(request))
        throw new Error("Idempotency payload changed");
      if (loseNextResponse) {
        loseNextResponse = false;
        throw new Error("Connection lost after creation");
      }
      return { id: row.snapshot.sessionId, url: `https://checkout.example.test/${intentId}` };
    },
    findCheckoutSession: async (customerId, intentId, sessionId) => {
      const row = checkouts.get(intentId);
      if (!row) return null;
      if (
        row.snapshot.customerId !== customerId ||
        (sessionId && sessionId !== row.snapshot.sessionId)
      )
        throw new Error("Wrong checkout owner");
      return {
        id: row.snapshot.sessionId,
        status: row.snapshot.status,
        url: row.snapshot.status === "open" ? `https://checkout.example.test/${intentId}` : null,
        subscriptionId: null,
      };
    },
    readCreditCheckout: async (customerId, intentId, sessionId) => {
      const row = checkouts.get(intentId);
      if (!row || row.snapshot.customerId !== customerId || row.snapshot.sessionId !== sessionId)
        throw new Error("Wrong receipt");
      lastObserved = Math.max(lastObserved + 1, Date.now());
      return {
        ...row.snapshot,
        payment: row.snapshot.payment ? { ...row.snapshot.payment } : null,
        observedAt: new Date(lastObserved),
      };
    },
    closeCreditCheckout: async (customerId, intentId, sessionId) => {
      const row = checkouts.get(intentId);
      if (!row || row.snapshot.customerId !== customerId || row.snapshot.sessionId !== sessionId)
        throw new Error("Wrong receipt");
      if (rejectCancellation) throw new Error("Payment still processing");
      if (row.snapshot.status === "open") row.snapshot.status = "expired";
      else if (row.snapshot.paymentStatus === "unpaid") row.snapshot.paymentCanceled = true;
      else throw new Error("Already paid");
    },
  };
  function row(id: string) {
    const found = checkouts.get(id);
    if (!found) throw new Error("Missing provider fixture");
    return found;
  }
  function pay(id: string) {
    const item = row(id);
    item.snapshot.status = "complete";
    item.snapshot.paymentStatus = "paid";
    item.snapshot.payment = {
      id: `pi_${id}`,
      paidAt: new Date(Math.floor(Date.now() / 1000) * 1000),
      amountRefundedCents: 0,
      disputed: false,
    };
    return item.snapshot.payment;
  }
  return {
    client,
    checkouts,
    row,
    pay,
    loseResponse: () => {
      loseNextResponse = true;
    },
    refuseCancellation: (value: boolean) => {
      rejectCancellation = value;
    },
  };
}

async function fixture() {
  const actorId = `purchase-${randomUUID()}`;
  await db
    .insert(schema.users)
    .values({ id: actorId, name: "Payer", email: `${actorId}@example.test`, emailVerified: true });
  const group = await family.createGroup(actorId, "Credit purchase fixture");
  const account = await openCompassoAccount(db, actorId, group.id);
  const provider = providerFixture();
  const products: Product[] = PRODUCTS.filter((p) => p.app === "compasso").map((p) => ({
    ...p,
    stripePriceId: { dev: `price_${p.id}`, prod: "" },
  }));
  const product = products.find((p) => p.kind === "credit_pack" && p.creditAmount === 100);
  if (!product) throw new Error("Missing Compasso pack");
  const deps: CreditPurchaseDeps = {
    db,
    products,
    mode: "dev",
    publicUrl: "https://conta.example.test",
    providerClient: provider.client,
  };
  const input = { actorId, accountId: account.id, requestKey: randomUUID(), productId: product.id };
  const owner = { type: "family" as const, id: group.id };
  const balance = () => getBalance({ db, app: "compasso" }, owner);
  const receipt = (intentId: string) => ({ actorId, accountId: account.id, intentId });
  const snapshot = async (intentId: string) => {
    const row = provider.row(intentId);
    if (!provider.client.readCreditCheckout) throw new Error("Missing reader");
    return provider.client.readCreditCheckout(
      row.snapshot.customerId,
      intentId,
      row.snapshot.sessionId,
    );
  };
  return { actorId, group, account, provider, deps, input, owner, balance, receipt, snapshot };
}

describe("recoverable Compasso credit purchases", () => {
  it("a known topup dispute holds new wallet use without suspending the app subscription and then freezes only that lot", async () => {
    const f = await fixture();
    await startCompassoTrial(
      { db, trialHashSecret: "isolated-purchase-risk-trial-secret-at-least-32" },
      f.actorId,
      f.group.id,
    );
    const purchase = await startCreditPurchase(f.deps, f.input);
    const payment = f.provider.pay(purchase.intentId);
    await refreshCreditPurchase(f.deps, purchase.intentId);
    expect((await f.balance()).available).toBe(120);
    const [customer] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.subjectId, f.account.id));
    if (!customer) throw new Error("Missing customer");
    payment.disputed = true;
    await enqueueCompassoBillingEvent(db, {
      eventId: `evt_${randomUUID()}`,
      eventType: "charge.dispute.created",
      customerId: customer.providerCustomerId,
      paymentId: payment.id,
    });
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(true);
    expect(await hasPendingCompassoReview(db, f.group.id, "subscription")).toBe(false);
    expect(await getCompassoAccess(db, f.actorId, f.group.id)).toMatchObject({
      active: true,
      source: "trial",
    });
    await expect(
      startCreditPurchase(f.deps, { ...f.input, requestKey: randomUUID() }),
    ).rejects.toThrow("conferência");
    await runCollectionBillingJobs(
      {
        db,
        onError: () => {},
        reconcile: async (job) => {
          if (job.kind === "credit_purchase") await refreshCreditPurchase(f.deps, job.subjectId);
          return {};
        },
      },
      { customerId: customer.id },
    );
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(false);
    expect((await f.balance()).available).toBe(20);
  });
  it("concurrent retries create one Checkout and one permanent grant, including a lost response", async () => {
    const f = await fixture();
    f.provider.loseResponse();
    await expect(startCreditPurchase(f.deps, f.input)).rejects.toThrow("Connection lost");
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () => startCreditPurchase(f.deps, f.input)),
    );
    expect(new Set(attempts.map((a) => a.intentId)).size).toBe(1);
    expect(f.provider.checkouts.size).toBe(1);
    const intentId = attempts[0]?.intentId;
    if (!intentId) throw new Error("Missing receipt");
    expect((await f.balance()).available).toBe(0);
    f.provider.pay(intentId);
    await Promise.all(Array.from({ length: 4 }, () => refreshCreditPurchase(f.deps, intentId)));
    expect((await f.balance()).available).toBe(100);
    const grants = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.ownerId, f.group.id));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ amount: 100, entryType: "purchase", expiresAt: null });
    expect(await startCreditPurchase(f.deps, f.input)).toEqual({ intentId, status: "paid" });
    expect(f.provider.checkouts.size).toBe(1);
  });

  it("blocks a new purchase until the existing Checkout is canceled; old retries never buy again", async () => {
    const f = await fixture();
    const first = await startCreditPurchase(f.deps, f.input);
    const next = { ...f.input, requestKey: randomUUID() };
    await expect(startCreditPurchase(f.deps, next)).rejects.toThrow();
    expect(await resumeCreditPurchase(f.deps, f.receipt(first.intentId))).toMatchObject({
      status: "open",
    });
    expect(await cancelCreditPurchase(f.deps, f.receipt(first.intentId))).toEqual({
      intentId: first.intentId,
      status: "expired",
    });
    expect(await startCreditPurchase(f.deps, next)).toMatchObject({ status: "open" });
    expect(await startCreditPurchase(f.deps, f.input)).toEqual({
      intentId: first.intentId,
      status: "expired",
    });
    expect(f.provider.checkouts.size).toBe(2);
  });

  it("does not grant on delayed completion and retains its guard when provider cancellation is refused", async () => {
    const f = await fixture();
    const first = await startCreditPurchase(f.deps, f.input);
    f.provider.row(first.intentId).snapshot.status = "complete";
    expect(await refreshCreditPurchase(f.deps, first.intentId)).toMatchObject({
      status: "pending",
    });
    expect((await f.balance()).available).toBe(0);
    f.provider.refuseCancellation(true);
    await expect(cancelCreditPurchase(f.deps, f.receipt(first.intentId))).rejects.toThrow(
      "still processing",
    );
    await expect(
      startCreditPurchase(f.deps, { ...f.input, requestKey: randomUUID() }),
    ).rejects.toThrow();
    f.provider.refuseCancellation(false);
    expect(await cancelCreditPurchase(f.deps, f.receipt(first.intentId))).toMatchObject({
      status: "failed",
    });
    expect((await f.balance()).available).toBe(0);
    expect(
      await startCreditPurchase(f.deps, { ...f.input, requestKey: randomUUID() }),
    ).toMatchObject({ status: "open" });
  });

  it("rejects customer, price, amount and settlement contradictions without partial ledger writes", async () => {
    const f = await fixture();
    const { intentId } = await startCreditPurchase(f.deps, f.input);
    f.provider.pay(intentId);
    const snapshot = await f.snapshot(intentId);
    for (const invalid of [
      { ...snapshot, customerId: "cus_other" },
      { ...snapshot, priceId: "price_other" },
      { ...snapshot, amountCents: 1 },
      { ...snapshot, paymentCanceled: true },
      { ...snapshot, payment: null },
      { ...snapshot, paymentStatus: "no_payment_required" as const },
    ])
      await expect(reconcileCreditPurchase(f.deps, intentId, invalid)).rejects.toThrow();
    expect((await f.balance()).available).toBe(0);
    expect(
      await db
        .select()
        .from(schema.oneTimePayments)
        .where(eq(schema.oneTimePayments.providerPaymentId, `pi_${intentId}`)),
    ).toHaveLength(0);
    await reconcileCreditPurchase(f.deps, intentId, snapshot);
    expect((await f.balance()).available).toBe(100);
  });

  it("fully refunded payments first seen after refund never expose spendable credits", async () => {
    const f = await fixture();
    const { intentId } = await startCreditPurchase(f.deps, f.input);
    f.provider.pay(intentId).amountRefundedCents = 1490;
    await refreshCreditPurchase(f.deps, intentId);
    await refreshCreditPurchase(f.deps, intentId);
    expect((await f.balance()).available).toBe(0);
    const [receipt] = await db
      .select()
      .from(schema.creditPurchaseIntents)
      .where(eq(schema.creditPurchaseIntents.id, intentId));
    expect(receipt).toMatchObject({
      outcome: "paid",
      revokedCredits: 100,
      refundedAmountCents: 1490,
    });
    const entries = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.ownerId, f.group.id));
    expect(entries.map((e) => e.amount).sort((a, b) => a - b)).toEqual([-100, 100]);
  });

  it("revokes rounded proportional units exactly once, and refuses regressive/equal-time conflicting facts", async () => {
    const f = await fixture();
    const { intentId } = await startCreditPurchase(f.deps, f.input);
    const payment = f.provider.pay(intentId);
    await refreshCreditPurchase(f.deps, intentId);
    payment.amountRefundedCents = 1;
    const oneCent = await f.snapshot(intentId);
    await reconcileCreditPurchase(f.deps, intentId, oneCent);
    await reconcileCreditPurchase(f.deps, intentId, oneCent);
    expect((await f.balance()).available).toBe(99);
    payment.amountRefundedCents = 745;
    const half = await f.snapshot(intentId);
    await reconcileCreditPurchase(f.deps, intentId, half);
    expect((await f.balance()).available).toBe(50);
    await reconcileCreditPurchase(f.deps, intentId, oneCent); // late old observation is ignored
    expect((await f.balance()).available).toBe(50);
    await expect(
      reconcileCreditPurchase(f.deps, intentId, {
        ...half,
        payment: { ...payment, amountRefundedCents: 0 },
      }),
    ).rejects.toThrow();
    await expect(
      reconcileCreditPurchase(f.deps, intentId, {
        ...half,
        payment: { ...payment, disputed: true },
      }),
    ).rejects.toThrow("Conflicting");
    payment.amountRefundedCents = 1;
    await expect(refreshCreditPurchase(f.deps, intentId)).rejects.toThrow("regressive");
  });

  it("freezes/restores only the disputed lot's remaining credits, preserving unrelated purchases", async () => {
    const f = await fixture();
    const first = await startCreditPurchase(f.deps, f.input);
    const payment = f.provider.pay(first.intentId);
    await refreshCreditPurchase(f.deps, first.intentId);
    const spendDeps = { db, walletScope: "compasso", authorizeSpend: authorizeCompassoSpend };
    const reservation = await reserveCredits(spendDeps, {
      owner: f.owner,
      actorUserId: f.actorId,
      app: "cozya",
      feature: "test.purchase",
      estimatedAmount: 30,
    });
    await commitReservation(spendDeps, { reservationId: reservation.id, actualAmount: 30 });
    const second = await startCreditPurchase(f.deps, { ...f.input, requestKey: randomUUID() });
    f.provider.pay(second.intentId);
    await refreshCreditPurchase(f.deps, second.intentId);
    payment.disputed = true;
    await refreshCreditPurchase(f.deps, first.intentId);
    expect((await f.balance()).available).toBe(100);
    await refreshCreditPurchase(f.deps, first.intentId);
    payment.disputed = false;
    await refreshCreditPurchase(f.deps, first.intentId);
    expect((await f.balance()).available).toBe(170);
  });

  it("prevents outsiders and non-payers from accessing receipts; a removed payer can cancel but cannot buy", async () => {
    const f = await fixture();
    const other = await fixture();
    const { intentId } = await startCreditPurchase(f.deps, f.input);
    await expect(
      resumeCreditPurchase(f.deps, { ...f.receipt(intentId), actorId: other.actorId }),
    ).rejects.toThrow();
    await expect(
      cancelCreditPurchase(f.deps, {
        actorId: other.actorId,
        accountId: other.account.id,
        intentId,
      }),
    ).rejects.toThrow();
    const invite = await family.createInvitation(
      f.actorId,
      f.group.id,
      `${other.actorId}@example.test`,
    );
    await family.acceptInvitation(other.actorId, invite.token);
    await family.transferAdministration(f.actorId, f.group.id, other.actorId);
    await expect(
      startCreditPurchase(f.deps, { ...f.input, actorId: other.actorId }),
    ).rejects.toThrow();
    await family.revokeMember(other.actorId, f.group.id, f.actorId);
    await expect(
      startCreditPurchase(f.deps, { ...f.input, requestKey: randomUUID() }),
    ).rejects.toThrow();
    expect(await cancelCreditPurchase(f.deps, f.receipt(intentId))).toMatchObject({
      status: "expired",
    });
  });

  it("an unknown response past its fixed expiry is resolved without creating a fresh Checkout", async () => {
    const f = await fixture();
    f.provider.loseResponse();
    await expect(startCreditPurchase(f.deps, f.input)).rejects.toThrow();
    const [intent] = await db
      .select()
      .from(schema.creditPurchaseIntents)
      .where(
        and(
          eq(schema.creditPurchaseIntents.userId, f.actorId),
          eq(schema.creditPurchaseIntents.requestKey, f.input.requestKey),
        ),
      );
    if (!intent) throw new Error("Missing receipt");
    // Model a request that never reached Stripe: its receipt exists, provider search is empty.
    f.provider.checkouts.clear();
    await db
      .update(schema.creditPurchaseIntents)
      .set({ request: { ...intent.request, expiresAt: Math.floor(Date.now() / 1000) - 1 } })
      .where(eq(schema.creditPurchaseIntents.id, intent.id));
    expect(await resumeCreditPurchase(f.deps, f.receipt(intent.id))).toEqual({
      intentId: intent.id,
      status: "expired",
    });
    expect(f.provider.checkouts.size).toBe(0);
    expect((await f.balance()).available).toBe(0);
  });
});
