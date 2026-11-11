import { randomUUID } from "node:crypto";
import { freezeWebParticipation } from "@informach/auth/web-participation";
import { PRODUCTS, type Product } from "@informach/config";
import { and, db, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import Stripe from "stripe";
import { beforeAll, expect, it } from "vitest";
import {
  commitBillingClosure,
  type FrozenBillingActor,
  lockBillingClosureScope,
  reconcileBillingClosure as reconcile,
} from "./closure";
import { openCompassoAccount } from "./collection-accounts";
import { getCompassoAccess } from "./compasso";
import {
  type CompassoCommerceDeps,
  createCompassoCommerce,
  persistCompassoSubscriptionSnapshot,
} from "./compasso-commerce";
import { startCreditPurchase } from "./credit-purchases";
import { grantCalendarSubscriptionCredits } from "./credits/subscription-grants";
import type { SubscriptionPaymentSnapshot } from "./payment-facts";
import { createStripeProvider } from "./providers/stripe";
import { createStripeFutureContractProvider } from "./providers/stripe-future-contract";
import type { BillingProviderClient, ProviderCreditCheckoutSnapshot } from "./providers/types";

beforeAll(() => {
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1", "postgres"].includes(
      new URL(process.env.DATABASE_URL ?? "").hostname,
    )
  )
    throw new Error("Disposable PostgreSQL required");
});
const family = createFamilyService({ db });
const products: Product[] = PRODUCTS.filter((p) => p.app === "compasso").map((p) => ({
  ...p,
  stripePriceId: { dev: `price_${p.id}`, prod: "" },
}));
async function actor() {
  const id = randomUUID();
  await db
    .insert(schema.users)
    .values({ id, name: "Financial closure", email: `${id}@example.test`, emailVerified: true });
  return id;
}
async function fixture() {
  const owner = await actor(),
    guest = await actor();
  const group = await family.createGroup(owner, "Financial closure");
  await family.acceptInvitation(
    guest,
    (await family.createInvitation(owner, group.id, `${guest}@example.test`)).token,
  );
  const account = await openCompassoAccount(db, owner, group.id);
  const [customer] = await db
    .insert(schema.customers)
    .values({
      app: "compasso",
      provider: "stripe",
      providerCustomerId: `cus_${randomUUID()}`,
      subjectType: "billing_account",
      subjectId: account.id,
      email: `${owner}@example.test`,
    })
    .returning();
  if (!customer) throw new Error("Missing customer");
  const product = products.find((p) => p.id === "compasso_annual");
  if (!product) throw new Error("Missing annual product");
  const start = new Date(Date.now() - 86400_000),
    end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const snapshot: SubscriptionPaymentSnapshot = {
    customerId: customer.providerCustomerId,
    subscriptionId: `sub_${randomUUID()}`,
    priceId: product.stripePriceId.dev,
    status: "active",
    start,
    end,
    trialEnd: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    observedAt: new Date(),
    periods: [
      {
        invoiceId: `in_${randomUUID()}`,
        lineId: `il_${randomUUID()}`,
        priceId: product.stripePriceId.dev,
        start,
        end,
        paidAt: start,
        fullyRefunded: false,
        disputed: false,
      },
    ],
  };
  const subscriptionId = await persistCompassoSubscriptionSnapshot(
    db,
    customer.id,
    product,
    snapshot,
  );
  const state: {
    closeCalls: number;
    loseCloseResponse: boolean;
    purchaseCloseCalls: number;
    observed: number;
    purchase: ProviderCreditCheckoutSnapshot | null;
  } = {
    closeCalls: 0,
    loseCloseResponse: false,
    purchaseCloseCalls: 0,
    observed: snapshot.observedAt.getTime(),
    purchase: null,
  };
  // All unconfigured provider calls fail at the transport. The tested financial
  // port below models receipts/state, while Stripe HTTP behavior has its own gate.
  const client = new Stripe("sk_test_fixture", {
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(async () => {
      throw new Error("Unexpected provider transport");
    }),
  });
  const providerClient: BillingProviderClient = {
    ...createStripeProvider({
      secretKey: "unused",
      webhookSecret: "unused",
      appName: "compasso",
      client,
    }),
    async closeCustomerSubscriptions(id) {
      expect(id).toBe(customer.providerCustomerId);
      state.closeCalls++;
      const changed = snapshot.status !== "canceled";
      snapshot.status = "canceled";
      snapshot.canceledAt ??= new Date();
      if (state.loseCloseResponse) {
        state.loseCloseResponse = false;
        throw new Error("Lost provider response");
      }
      return { expired: 0, canceled: changed ? 1 : 0, subscriptionIds: [snapshot.subscriptionId] };
    },
    async createCheckoutSession(input) {
      if (
        input.customerId !== customer.providerCustomerId ||
        input.mode !== "payment" ||
        !input.metadata.checkout_intent_id
      )
        throw new Error("Unexpected checkout admission");
      state.purchase = {
        sessionId: `cs_${randomUUID()}`,
        customerId: input.customerId,
        intentId: input.metadata.checkout_intent_id,
        status: "open",
        paymentStatus: "unpaid",
        paymentCanceled: false,
        priceId: input.priceId,
        amountCents: 1490,
        currency: "BRL",
        observedAt: new Date(++state.observed),
        payment: null,
      };
      return { id: state.purchase.sessionId, url: "https://checkout.example.test/fixture" };
    },
    async findCheckoutSession(id, intentId) {
      const p = state.purchase;
      if (!p || p.customerId !== id || p.intentId !== intentId) return null;
      return {
        id: p.sessionId,
        status: p.status,
        url: p.status === "open" ? "https://checkout.example.test/fixture" : null,
        subscriptionId: null,
      };
    },
    async readCreditCheckout(id, intentId, sessionId) {
      const p = state.purchase;
      if (!p || p.customerId !== id || p.intentId !== intentId || p.sessionId !== sessionId)
        throw new Error("Wrong purchase scope");
      state.observed = Math.max(Date.now(), state.observed + 1);
      return { ...p, observedAt: new Date(state.observed) };
    },
    async closeCreditCheckout(id, intentId, sessionId) {
      const p = state.purchase;
      if (!p || p.customerId !== id || p.intentId !== intentId || p.sessionId !== sessionId)
        throw new Error("Wrong purchase scope");
      state.purchaseCloseCalls++;
      if (p.paymentStatus !== "paid") {
        p.status = "expired";
        p.paymentCanceled = true;
      }
    },
    async prepareSubscriptionCheckout() {
      if (snapshot.status !== "canceled") throw new Error("Still renewable");
    },
  };
  const deps: CompassoCommerceDeps = {
    db,
    providerClient,
    products,
    mode: "dev",
    publicUrl: "https://conta.example.test",
    portalConfigurationId: "bpc_fixture",
    verifyCatalog: async () => {},
    onError: () => {},
    reader: {
      listSubscriptionIds: async (id) =>
        id === customer.providerCustomerId ? [snapshot.subscriptionId] : [],
      read: async (id, prices) => {
        if (id !== snapshot.subscriptionId || !prices.has(snapshot.priceId))
          throw new Error("Wrong subscription scope");
        state.observed = Math.max(Date.now(), state.observed + 1);
        return { ...snapshot, observedAt: new Date(state.observed) };
      },
    },
    plans: {
      create: async () => {
        throw new Error("Unexpected schedule admission");
      },
      reconcile: async () => {
        throw new Error("Unexpected schedule reconciliation");
      },
    },
  };
  return { owner, guest, group, account, customer, subscriptionId, snapshot, state, deps };
}
async function freeze(userId: string): Promise<FrozenBillingActor> {
  const operationId = randomUUID();
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId, operationId, expectedRevision: 0 }),
  );
  return { userId, operationId, expectedRevision: 1 };
}
const prepare = (authority: FrozenBillingActor) =>
  db.transaction((tx) => lockBillingClosureScope(tx, authority));
const commit = (authority: FrozenBillingActor, fingerprint: string) =>
  db.transaction((tx) => commitBillingClosure(tx, authority, fingerprint));
const reconcileBillingClosure = (
  deps: CompassoCommerceDeps,
  authority: FrozenBillingActor,
  fingerprint: string,
) => reconcile({ db, commerce: () => deps }, authority, fingerprint);

it("closes only the payer's mandate while preserving annual paid coverage, monthly credits and financial history", async () => {
  const f = await fixture(),
    authority = await freeze(f.owner),
    plan = await prepare(authority);
  expect(plan.financialReview).toBe(false);
  await expect(commit(authority, plan.fingerprint)).rejects.toMatchObject({
    code: "pending_operations",
  });
  await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
  await commit(authority, plan.fingerprint);
  expect(
    (
      await db
        .select()
        .from(schema.collectionAccounts)
        .where(eq(schema.collectionAccounts.id, f.account.id))
    )[0]?.closedAt,
  ).toBeInstanceOf(Date);
  expect(
    (
      await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, f.subscriptionId))
    )[0]?.status,
  ).toBe("canceled");
  expect(
    await db
      .select()
      .from(schema.subscriptionPaymentPeriods)
      .where(eq(schema.subscriptionPaymentPeriods.subscriptionId, f.subscriptionId)),
  ).toHaveLength(1);
  expect(await getCompassoAccess(db, f.guest, f.group.id)).toMatchObject({
    active: true,
    source: "paid",
  });
  const later = new Date(f.snapshot.start);
  later.setUTCMonth(later.getUTCMonth() + 2);
  expect(
    await grantCalendarSubscriptionCredits(
      { db, app: "compasso", products },
      { subscriptionId: f.subscriptionId, now: later },
    ),
  ).toMatchObject({ granted: true, amount: 200 });
  const grants = await db
    .select()
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.ownerId, f.group.id));
  expect(grants.filter((g) => g.entryType === "bonus_grant")).toHaveLength(2);
  await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
  await commit(authority, plan.fingerprint);
  expect(f.state.closeCalls).toBe(1);
});

it("a family's other adult never closes the payer's contracts or touches an independent product", async () => {
  const f = await fixture();
  await db.insert(schema.customers).values({
    provider: "stripe",
    providerCustomerId: `cus_edi_${randomUUID()}`,
    app: "edi",
    subjectType: "user",
    subjectId: f.guest,
    email: `${f.guest}@example.test`,
  });
  const authority = await freeze(f.guest),
    plan = await prepare(authority);
  expect(plan.customers).toEqual([]);
  expect(plan.accounts).toEqual([]);
  await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
  await commit(authority, plan.fingerprint);
  expect(f.state.closeCalls).toBe(0);
  expect(f.snapshot.status).toBe("active");
  expect(
    (
      await db
        .select()
        .from(schema.collectionAccounts)
        .where(eq(schema.collectionAccounts.id, f.account.id))
    )[0]?.closedAt,
  ).toBeNull();
});

it("preserves payer access to the restricted receipts portal after closure without admitting new commerce", async () => {
  const f = await fixture(),
    authority = await freeze(f.owner),
    plan = await prepare(authority);
  await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
  await commit(authority, plan.fingerprint);
  const commerce = createCompassoCommerce({
    ...f.deps,
    providerClient: {
      ...f.deps.providerClient,
      createPortalSession: async (input) => {
        expect(input.customerId).toBe(f.customer.providerCustomerId);
        expect(input.configurationId).toBe("bpc_fixture");
        return { url: "https://billing.stripe.com/p/session/receipt_fixture" };
      },
    },
  });
  expect(await commerce.portal(f.owner, f.account.id)).toMatchObject({
    url: "https://billing.stripe.com/p/session/receipt_fixture",
  });
  await expect(commerce.portal(f.guest, f.account.id)).rejects.toThrow("unavailable to this payer");
  await expect(
    commerce.setCancellation(f.owner, {
      accountId: f.account.id,
      subscriptionId: f.subscriptionId,
      cancel: false,
    }),
  ).rejects.toThrow();
});

it("retains financial proofs for each confirmed selection when the remaining scope is reviewed", async () => {
  const f = await fixture();
  const historicalGroup = await family.createGroup(f.owner, "Historical billing context");
  const authority = await freeze(f.owner),
    initial = await prepare(authority);
  await reconcileBillingClosure(f.deps, authority, initial.fingerprint);
  // Models a trusted inventory correction, not admission of new commerce by
  // the frozen actor. The coordinator must obtain consent for this new scope.
  const [historicalAccount] = await db
    .insert(schema.collectionAccounts)
    .values({
      collection: "compasso",
      groupId: historicalGroup.id,
      payerUserId: f.owner,
      closedAt: new Date(),
    })
    .returning();
  if (!historicalAccount) throw new Error("Missing historical account");
  const revised = await prepare(authority);
  expect(revised.fingerprint).not.toBe(initial.fingerprint);
  await expect(commit(authority, revised.fingerprint)).rejects.toMatchObject({
    code: "pending_operations",
  });
  await reconcileBillingClosure(f.deps, authority, revised.fingerprint);
  await commit(authority, revised.fingerprint);
  const receipts = await db
    .select()
    .from(schema.collectionClosureReceipts)
    .where(eq(schema.collectionClosureReceipts.operationId, authority.operationId));
  expect(receipts.map((receipt) => receipt.scopeFingerprint).sort()).toEqual(
    [initial.fingerprint, revised.fingerprint].sort(),
  );
  await reconcileBillingClosure(f.deps, authority, revised.fingerprint);
  expect(f.state.closeCalls).toBe(2);
});

it("recovers a lost cancellation response without certifying unfinished work or granting credits twice", async () => {
  const f = await fixture(),
    authority = await freeze(f.owner),
    plan = await prepare(authority);
  f.state.loseCloseResponse = true;
  await expect(reconcileBillingClosure(f.deps, authority, plan.fingerprint)).rejects.toThrow(
    "Lost provider response",
  );
  expect(
    await db
      .select()
      .from(schema.collectionClosureReceipts)
      .where(eq(schema.collectionClosureReceipts.operationId, authority.operationId)),
  ).toEqual([]);
  await expect(commit(authority, plan.fingerprint)).rejects.toMatchObject({
    code: "pending_operations",
  });
  await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
  await commit(authority, plan.fingerprint);
  expect(f.state.closeCalls).toBe(2);
  expect(
    await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.ownerId, f.group.id)),
  ).toHaveLength(1);
});

it.each([false, true])(
  "settles an admitted top-up before closing and preserves a late paid receipt: %s",
  async (paid) => {
    const f = await fixture();
    const purchase = await startCreditPurchase(f.deps, {
      actorId: f.owner,
      accountId: f.account.id,
      productId: "compasso_credits_100",
      requestKey: randomUUID(),
    });
    if (!f.state.purchase) throw new Error("Missing payment fixture");
    if (paid) {
      f.state.purchase.status = "complete";
      f.state.purchase.paymentStatus = "paid";
      f.state.purchase.payment = {
        id: `pi_${randomUUID()}`,
        paidAt: new Date(),
        amountRefundedCents: 0,
        disputed: false,
      };
    }
    const authority = await freeze(f.owner),
      plan = await prepare(authority);
    await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
    await commit(authority, plan.fingerprint);
    expect(
      (
        await db
          .select()
          .from(schema.creditPurchaseIntents)
          .where(eq(schema.creditPurchaseIntents.id, purchase.intentId))
      )[0]?.outcome,
    ).toBe(paid ? "paid" : "expired");
    const grants = await db
      .select()
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.ownerId, f.group.id),
          eq(schema.creditLedger.entryType, "purchase"),
        ),
      );
    expect(grants).toHaveLength(paid ? 1 : 0);
    if (paid) expect(grants[0]).toMatchObject({ amount: 100, expiresAt: null });
  },
);

it("blocks unfinished internal legacy contracts and refuses a changed scope or operation", async () => {
  const f = await fixture();
  const [legacy] = await db
    .insert(schema.customers)
    .values({
      app: "cozya",
      provider: "stripe",
      providerCustomerId: `cus_legacy_${randomUUID()}`,
      subjectType: "user",
      subjectId: f.owner,
      email: `${f.owner}@example.test`,
    })
    .returning();
  if (!legacy) throw new Error("Missing legacy customer");
  await db.insert(schema.subscriptions).values({
    customerId: legacy.id,
    provider: "stripe",
    providerSubscriptionId: `sub_legacy_${randomUUID()}`,
    productId: "historical_product",
    providerPriceId: "price_historical",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 86400_000),
  });
  const authority = await freeze(f.owner),
    plan = await prepare(authority);
  expect(plan.financialReview).toBe(true);
  await expect(reconcileBillingClosure(f.deps, authority, plan.fingerprint)).rejects.toMatchObject({
    code: "financial_review",
  });
  await expect(
    reconcileBillingClosure(f.deps, { ...authority, operationId: randomUUID() }, plan.fingerprint),
  ).rejects.toMatchObject({ code: "stale-revision" });
  await expect(reconcileBillingClosure(f.deps, authority, "a".repeat(64))).rejects.toMatchObject({
    code: "scope_changed",
  });
  expect(f.state.closeCalls).toBe(0);
});

it("retains accepted legacy receipts and blocks closure until cancellation is confirmed", async () => {
  const f = await fixture();
  const [legacy] = await db
    .insert(schema.customers)
    .values({
      app: "cozya",
      provider: "stripe",
      providerCustomerId: `cus_legacy_${randomUUID()}`,
      subjectType: "user",
      subjectId: f.owner,
      email: `${f.owner}@example.test`,
    })
    .returning();
  if (!legacy) throw new Error("Missing legacy customer");
  const [subscription] = await db
    .insert(schema.subscriptions)
    .values({
      customerId: legacy.id,
      provider: "stripe",
      providerSubscriptionId: `sub_legacy_${randomUUID()}`,
      productId: "historical_product",
      providerPriceId: "price_historical",
      status: "canceled",
      currentPeriodStart: new Date(Date.now() - 60_000),
      currentPeriodEnd: new Date(Date.now() + 86400_000),
    })
    .returning();
  if (!subscription) throw new Error("Missing legacy subscription");
  const [acceptance] = await db
    .insert(schema.legacyContractAcceptances)
    .values({
      groupId: f.group.id,
      payerUserId: f.owner,
      subscriptionId: subscription.id,
      policyVersion: "fixture",
    })
    .returning();
  if (!acceptance) throw new Error("Missing acceptance");
  const authority = await freeze(f.owner);
  const blocked = await prepare(authority);
  expect(blocked.financialReview).toBe(true);
  await expect(
    reconcileBillingClosure(f.deps, authority, blocked.fingerprint),
  ).rejects.toMatchObject({ code: "financial_review" });
  await db
    .update(schema.legacyContractAcceptances)
    .set({ cancellationConfirmedAt: new Date() })
    .where(eq(schema.legacyContractAcceptances.id, acceptance.id));
  const resolved = await prepare(authority);
  expect(resolved.financialReview).toBe(false);
  expect(resolved.retainedRecords).toBeGreaterThanOrEqual(1);
});

it("settles an unopened future setup only after closure consent and preserves its receipt", async () => {
  const f = await fixture();
  const start = new Date(Date.now() + 86400_000);
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: f.account.id,
      payerUserId: f.owner,
      requestKey: randomUUID(),
      productId: "compasso_monthly",
      providerPriceId: "price_fixture",
      amountCents: 4990,
      interval: "month",
      paidThrough: start,
      startsAt: start,
      termsRevision: "a".repeat(64),
      setupExpiresAt: new Date(Date.now() + 3600_000),
      setupProtocolVersion: 1,
    })
    .returning();
  if (!intent) throw new Error("Missing future intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  expect(plan.financialReview).toBe(false);
  await expect(commit(authority, plan.fingerprint)).rejects.toMatchObject({
    code: "pending_operations",
  });
  expect(
    (
      await db
        .select()
        .from(schema.legacyFutureIntents)
        .where(eq(schema.legacyFutureIntents.id, intent.id))
    )[0]?.state,
  ).toBe("setup_pending");
  await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
  const [settled] = await db
    .select()
    .from(schema.legacyFutureIntents)
    .where(eq(schema.legacyFutureIntents.id, intent.id));
  expect(settled?.state).toBe("canceled");
  expect(settled?.cancelRequestedAt).toBeInstanceOf(Date);
  expect((await prepare(authority)).fingerprint).toBe(plan.fingerprint);
  await commit(authority, plan.fingerprint);
});

it("keeps an unconfirmed future schedule in review and never records closure on a missing provider result", async () => {
  const f = await fixture();
  const start = new Date(Date.now() + 86400_000);
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: f.account.id,
      payerUserId: f.owner,
      requestKey: randomUUID(),
      productId: "compasso_monthly",
      providerPriceId: "price_fixture",
      amountCents: 4990,
      interval: "month",
      paidThrough: start,
      startsAt: start,
      termsRevision: "a".repeat(64),
      setupExpiresAt: new Date(Date.now() + 3600_000),
      state: "scheduling",
      setupSessionId: `cs_${randomUUID()}`,
      paymentMethodId: "pm_fixture",
    })
    .returning();
  if (!intent) throw new Error("Missing future intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  const futureProvider = createStripeFutureContractProvider({
    secretKey: "sk_test_fixture",
    mode: "dev",
  });
  await expect(
    reconcile(
      {
        db,
        commerce: () => f.deps,
        future: () => ({
          db,
          mode: "dev",
          publicUrl: "http://localhost:3011",
          futureProvider: {
            ...futureProvider,
            findSchedule: async () => null,
          },
        }),
      },
      authority,
      plan.fingerprint,
    ),
  ).rejects.toMatchObject({ code: "pending_operations" });
  const [pending] = await db
    .select()
    .from(schema.legacyFutureIntents)
    .where(eq(schema.legacyFutureIntents.id, intent.id));
  expect(pending?.state).toBe("review");
  expect(pending?.cancelRequestedAt).toBeInstanceOf(Date);
  expect(f.state.closeCalls).toBe(0);
  await expect(commit(authority, plan.fingerprint)).rejects.toMatchObject({
    code: "pending_operations",
  });
});

it("settles a reviewed setup without provider calls only when the versioned receipt proves no scheduling attempt", async () => {
  const f = await fixture();
  const start = new Date(Date.now() + 86400_000);
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: f.account.id,
      payerUserId: f.owner,
      requestKey: randomUUID(),
      productId: "compasso_monthly",
      providerPriceId: "price_fixture",
      amountCents: 4990,
      interval: "month",
      paidThrough: start,
      startsAt: start,
      termsRevision: "f".repeat(64),
      setupExpiresAt: start,
      state: "review",
      setupSessionId: `cs_${randomUUID()}`,
      paymentMethodId: "pm_fixture",
      scheduleProtocolVersion: 1,
    })
    .returning();
  if (!intent) throw new Error("Missing future intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
  const [settled] = await db
    .select()
    .from(schema.legacyFutureIntents)
    .where(eq(schema.legacyFutureIntents.id, intent.id));
  expect(settled?.state).toBe("canceled");
  expect(settled?.scheduleAttemptedAt).toBeNull();
  await commit(authority, plan.fingerprint);
});

it("does not use a legacy receipt without an attempt marker as proof that no schedule exists", async () => {
  const f = await fixture();
  const start = new Date(Date.now() + 86400_000);
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: f.account.id,
      payerUserId: f.owner,
      requestKey: randomUUID(),
      productId: "compasso_monthly",
      providerPriceId: "price_fixture",
      amountCents: 4990,
      interval: "month",
      paidThrough: start,
      startsAt: start,
      termsRevision: "1".repeat(64),
      setupExpiresAt: start,
      state: "review",
      setupSessionId: `cs_${randomUUID()}`,
      paymentMethodId: "pm_fixture",
      scheduleProtocolVersion: 0,
    })
    .returning();
  if (!intent) throw new Error("Missing future intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  const provider = createStripeFutureContractProvider({
    secretKey: "sk_test_fixture",
    mode: "dev",
  });
  await expect(
    reconcile(
      {
        db,
        commerce: () => f.deps,
        future: () => ({
          db,
          mode: "dev",
          publicUrl: "http://localhost:3011",
          futureProvider: { ...provider, findSchedule: async () => null },
        }),
      },
      authority,
      plan.fingerprint,
    ),
  ).rejects.toMatchObject({ code: "pending_operations" });
  expect(
    (
      await db
        .select()
        .from(schema.legacyFutureIntents)
        .where(eq(schema.legacyFutureIntents.id, intent.id))
    )[0]?.state,
  ).toBe("review");
  expect(f.state.closeCalls).toBe(0);
});

it("does not select or cancel a different payer's future contract", async () => {
  const f = await fixture();
  const otherGroup = await family.createGroup(f.guest, "Other payer");
  const other = await openCompassoAccount(db, f.guest, otherGroup.id);
  const start = new Date(Date.now() + 86400_000);
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: other.id,
      payerUserId: f.guest,
      requestKey: randomUUID(),
      productId: "compasso_monthly",
      providerPriceId: "price_fixture",
      amountCents: 4990,
      interval: "month",
      paidThrough: start,
      startsAt: start,
      termsRevision: "2".repeat(64),
      setupExpiresAt: start,
      setupProtocolVersion: 1,
    })
    .returning();
  if (!intent) throw new Error("Missing other payer intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  expect(plan.futureIntents.some((item) => item.id === intent.id)).toBe(false);
  await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
  await commit(authority, plan.fingerprint);
  expect(
    (
      await db
        .select()
        .from(schema.legacyFutureIntents)
        .where(eq(schema.legacyFutureIntents.id, intent.id))
    )[0]?.state,
  ).toBe("setup_pending");
});

it("recovers a lost future schedule cancellation response before closing the mandate", async () => {
  const f = await fixture();
  const start = new Date(Date.now() + 86400_000);
  const scheduleId = `sched_${randomUUID()}`;
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: f.account.id,
      payerUserId: f.owner,
      requestKey: randomUUID(),
      productId: "compasso_monthly",
      providerPriceId: "price_fixture",
      amountCents: 4990,
      interval: "month",
      paidThrough: start,
      startsAt: start,
      termsRevision: "b".repeat(64),
      setupExpiresAt: new Date(Date.now() + 3600_000),
      state: "scheduled",
      setupSessionId: `cs_${randomUUID()}`,
      paymentMethodId: "pm_fixture",
      scheduleId,
    })
    .returning();
  if (!intent) throw new Error("Missing future intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  const futureProvider = createStripeFutureContractProvider({
    secretKey: "sk_test_fixture",
    mode: "dev",
  });
  let canceled = false;
  let calls = 0;
  const deps = {
    db,
    commerce: () => f.deps,
    future: () => ({
      db,
      mode: "dev" as const,
      publicUrl: "http://localhost:3011",
      futureProvider: {
        ...futureProvider,
        findSchedule: async () => ({
          id: scheduleId,
          status: canceled ? ("canceled" as const) : ("not_started" as const),
        }),
        cancelSchedule: async () => {
          calls++;
          canceled = true;
          throw new Error("Lost cancellation response");
        },
      },
    }),
  };
  await expect(reconcile(deps, authority, plan.fingerprint)).rejects.toThrow(
    "Lost cancellation response",
  );
  expect(f.state.closeCalls).toBe(0);
  expect((await prepare(authority)).fingerprint).toBe(plan.fingerprint);
  await reconcile(deps, authority, plan.fingerprint);
  expect(calls).toBe(1);
  expect(
    (
      await db
        .select()
        .from(schema.legacyFutureIntents)
        .where(eq(schema.legacyFutureIntents.id, intent.id))
    )[0]?.state,
  ).toBe("canceled");
  await commit(authority, plan.fingerprint);
});

it("does not treat a started future schedule as canceled during closure", async () => {
  const f = await fixture();
  const start = new Date(Date.now() - 1000);
  const scheduleId = `sched_${randomUUID()}`;
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: f.account.id,
      payerUserId: f.owner,
      requestKey: randomUUID(),
      productId: "compasso_monthly",
      providerPriceId: "price_fixture",
      amountCents: 4990,
      interval: "month",
      paidThrough: start,
      startsAt: start,
      termsRevision: "c".repeat(64),
      setupExpiresAt: new Date(Date.now() - 1000),
      state: "scheduled",
      setupSessionId: `cs_${randomUUID()}`,
      paymentMethodId: "pm_fixture",
      scheduleId,
    })
    .returning();
  if (!intent) throw new Error("Missing future intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  const futureProvider = createStripeFutureContractProvider({
    secretKey: "sk_test_fixture",
    mode: "dev",
  });
  await expect(
    reconcile(
      {
        db,
        commerce: () => f.deps,
        future: () => ({
          db,
          mode: "dev",
          publicUrl: "http://localhost:3011",
          futureProvider: {
            ...futureProvider,
            findSchedule: async () => ({ id: scheduleId, status: "active" as const }),
            readSchedule: async () => ({
              id: scheduleId,
              status: "active" as const,
              subscriptionId: null,
            }),
          },
        }),
      },
      authority,
      plan.fingerprint,
    ),
  ).rejects.toMatchObject({ code: "pending_operations" });
  expect(f.state.closeCalls).toBe(0);
  await expect(commit(authority, plan.fingerprint)).rejects.toMatchObject({
    code: "pending_operations",
  });
});

it("closes a schedule that started after consent only after reconciling its exact subscription", async () => {
  const f = await fixture();
  const start = new Date(Date.now() - 1000);
  const scheduleId = `sched_${randomUUID()}`;
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: f.account.id,
      payerUserId: f.owner,
      requestKey: randomUUID(),
      productId: "compasso_annual",
      providerPriceId: f.snapshot.priceId,
      amountCents: 49900,
      interval: "year",
      paidThrough: start,
      startsAt: start,
      termsRevision: "d".repeat(64),
      setupExpiresAt: start,
      state: "scheduled",
      setupSessionId: `cs_${randomUUID()}`,
      paymentMethodId: "pm_fixture",
      scheduleId,
    })
    .returning();
  if (!intent) throw new Error("Missing future intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  const futureProvider = createStripeFutureContractProvider({
    secretKey: "sk_test_fixture",
    mode: "dev",
  });
  const deps = {
    db,
    commerce: () => f.deps,
    future: () => ({
      db,
      mode: "dev" as const,
      publicUrl: "http://localhost:3011",
      futureProvider: {
        ...futureProvider,
        findSchedule: async () => ({ id: scheduleId, status: "active" as const }),
        readSchedule: async () => ({
          id: scheduleId,
          status: f.snapshot.status === "canceled" ? ("canceled" as const) : ("active" as const),
          subscriptionId: f.snapshot.subscriptionId,
        }),
      },
    }),
  };
  await reconcile(deps, authority, plan.fingerprint);
  expect(f.state.closeCalls).toBeGreaterThanOrEqual(1);
  expect(
    (
      await db
        .select()
        .from(schema.legacyFutureIntents)
        .where(eq(schema.legacyFutureIntents.id, intent.id))
    )[0]?.state,
  ).toBe("canceled");
  await commit(authority, plan.fingerprint);
});

it("recovers when closing a started schedule succeeds but its provider response is lost", async () => {
  const f = await fixture();
  f.state.loseCloseResponse = true;
  const start = new Date(Date.now() - 1000);
  const scheduleId = `sched_${randomUUID()}`;
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: f.account.id,
      payerUserId: f.owner,
      requestKey: randomUUID(),
      productId: "compasso_annual",
      providerPriceId: f.snapshot.priceId,
      amountCents: 49900,
      interval: "year",
      paidThrough: start,
      startsAt: start,
      termsRevision: "3".repeat(64),
      setupExpiresAt: start,
      state: "scheduled",
      setupSessionId: `cs_${randomUUID()}`,
      paymentMethodId: "pm_fixture",
      scheduleId,
    })
    .returning();
  if (!intent) throw new Error("Missing future intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  const provider = createStripeFutureContractProvider({
    secretKey: "sk_test_fixture",
    mode: "dev",
  });
  const remoteStatus = () =>
    f.snapshot.status === "canceled" ? ("canceled" as const) : ("active" as const);
  const deps = {
    db,
    commerce: () => f.deps,
    future: () => ({
      db,
      mode: "dev" as const,
      publicUrl: "http://localhost:3011",
      futureProvider: {
        ...provider,
        findSchedule: async () => ({ id: scheduleId, status: remoteStatus() }),
        readSchedule: async () => ({
          id: scheduleId,
          status: remoteStatus(),
          subscriptionId: f.snapshot.subscriptionId,
        }),
      },
    }),
  };
  await expect(reconcile(deps, authority, plan.fingerprint)).rejects.toThrow(
    "Lost provider response",
  );
  expect(
    (
      await db
        .select()
        .from(schema.legacyFutureIntents)
        .where(eq(schema.legacyFutureIntents.id, intent.id))
    )[0]?.state,
  ).toBe("review");
  await reconcile(deps, authority, plan.fingerprint);
  expect(
    (
      await db
        .select()
        .from(schema.legacyFutureIntents)
        .where(eq(schema.legacyFutureIntents.id, intent.id))
    )[0]?.state,
  ).toBe("canceled");
  await commit(authority, plan.fingerprint);
});

it("does not close a customer when the started schedule names a different subscription", async () => {
  const f = await fixture();
  const start = new Date(Date.now() - 1000);
  const scheduleId = `sched_${randomUUID()}`;
  const [intent] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: f.account.id,
      payerUserId: f.owner,
      requestKey: randomUUID(),
      productId: "compasso_annual",
      providerPriceId: f.snapshot.priceId,
      amountCents: 49900,
      interval: "year",
      paidThrough: start,
      startsAt: start,
      termsRevision: "e".repeat(64),
      setupExpiresAt: start,
      state: "scheduled",
      setupSessionId: `cs_${randomUUID()}`,
      paymentMethodId: "pm_fixture",
      scheduleId,
    })
    .returning();
  if (!intent) throw new Error("Missing future intent");
  const authority = await freeze(f.owner);
  const plan = await prepare(authority);
  const futureProvider = createStripeFutureContractProvider({
    secretKey: "sk_test_fixture",
    mode: "dev",
  });
  await expect(
    reconcile(
      {
        db,
        commerce: () => f.deps,
        future: () => ({
          db,
          mode: "dev",
          publicUrl: "http://localhost:3011",
          futureProvider: {
            ...futureProvider,
            findSchedule: async () => ({ id: scheduleId, status: "active" as const }),
            readSchedule: async () => ({
              id: scheduleId,
              status: "active" as const,
              subscriptionId: `sub_${randomUUID()}`,
            }),
          },
        }),
      },
      authority,
      plan.fingerprint,
    ),
  ).rejects.toMatchObject({ code: "financial_review" });
  expect(f.state.closeCalls).toBe(0);
  await expect(commit(authority, plan.fingerprint)).rejects.toMatchObject({
    code: "pending_operations",
  });
});

it("blocks the actor's expired active reservation without treating another adult's shared-wallet reservation as their operation", async () => {
  const f = await fixture();
  await db.insert(schema.creditReservations).values({
    app: "compasso",
    consumerApp: "cozya",
    ownerType: "family",
    ownerId: f.group.id,
    actorUserId: f.guest,
    estimatedAmount: 2,
    feature: "closure-fixture",
    expiresAt: new Date(Date.now() - 60_000),
  });
  const authority = await freeze(f.owner);
  expect((await prepare(authority)).pendingOperations).toBe(false);
  // Trial/bonus actors may have a legacy wallet but no provider customer for it.
  await db.insert(schema.creditReservations).values({
    app: "agenda-da-turma",
    ownerType: "user",
    ownerId: f.owner,
    estimatedAmount: 1,
    feature: "closure-fixture",
    expiresAt: new Date(Date.now() - 60_000),
  });
  const blocked = await prepare(authority);
  expect(blocked.pendingOperations).toBe(true);
  await expect(
    reconcileBillingClosure(f.deps, authority, blocked.fingerprint),
  ).rejects.toMatchObject({ code: "pending_operations" });
  expect(f.state.closeCalls).toBe(0);
});

it("selects more than one page of immutable payer accounts including previous families without exposing another payer", async () => {
  const f = await fixture();
  const historical = Array.from({ length: 101 }, () => ({
    id: randomUUID(),
    collection: "compasso",
    groupId: f.group.id,
    payerUserId: f.owner,
    closedAt: new Date(),
  }));
  await db.insert(schema.collectionAccounts).values(historical);
  await db.insert(schema.customers).values(
    historical.map((a) => ({
      app: "compasso",
      provider: "stripe" as const,
      subjectType: "billing_account" as const,
      subjectId: a.id,
      providerCustomerId: `cus_${a.id}`,
      email: `${f.owner}@example.test`,
    })),
  );
  await db
    .update(schema.familyMembers)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(schema.familyMembers.groupId, f.group.id), eq(schema.familyMembers.userId, f.owner)),
    );
  const authority = await freeze(f.owner),
    scope = await prepare(authority);
  expect(scope.accounts).toHaveLength(102);
  expect(scope.customers).toHaveLength(102);
  expect(scope.accounts.map((a) => a.id)).toEqual(
    expect.arrayContaining(historical.map((a) => a.id)),
  );
  expect(scope.pendingOperations).toBe(false);
  expect(scope.financialReview).toBe(false);
});

it.each([false, true])(
  "retires a plan change without creating an unstarted schedule and recovers an admitted lost response: %s",
  async (started) => {
    const f = await fixture();
    const target = products.find((p) => p.id === "compasso_monthly");
    if (!target) throw new Error("Missing monthly price");
    const [change] = await db
      .insert(schema.collectionPlanChanges)
      .values({
        subscriptionId: f.subscriptionId,
        actorId: f.owner,
        requestKey: randomUUID(),
        fromPriceId: f.snapshot.priceId,
        toPriceId: target.stripePriceId.dev,
        toProductId: target.id,
        effectiveAt: f.snapshot.end,
        requestStartedAt: started ? new Date() : null,
      })
      .returning();
    if (!change) throw new Error("Missing plan intent");
    let schedule: string | undefined;
    let calls = 0;
    f.deps.plans = {
      async create(input) {
        expect(input.intentId).toBe(change.id);
        expect(input.customerId).toBe(f.customer.providerCustomerId);
        expect(input.subscriptionId).toBe(f.snapshot.subscriptionId);
        calls++;
        if (!schedule) {
          schedule = `sub_sched_${randomUUID()}`;
          throw new Error("Lost schedule response");
        }
        return schedule;
      },
      async reconcile(input) {
        expect(input.scheduleId).toBe(schedule);
        expect(input.cancel).toBe(true);
        return "canceled";
      },
    };
    const authority = await freeze(f.owner),
      plan = await prepare(authority);
    if (started) {
      await expect(reconcileBillingClosure(f.deps, authority, plan.fingerprint)).rejects.toThrow(
        "Lost schedule response",
      );
      expect(f.state.closeCalls).toBe(0);
    }
    await reconcileBillingClosure(f.deps, authority, plan.fingerprint);
    await commit(authority, plan.fingerprint);
    expect(calls).toBe(started ? 2 : 0);
    expect(
      (
        await db
          .select()
          .from(schema.collectionPlanChanges)
          .where(eq(schema.collectionPlanChanges.id, change.id))
      )[0]?.status,
    ).toBe("canceled");
  },
);
