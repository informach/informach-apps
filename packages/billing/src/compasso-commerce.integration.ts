import { randomUUID } from "node:crypto";
import { PRODUCTS, type Product } from "@informach/config";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type Stripe from "stripe";
import { afterAll, describe, expect, it, vi } from "vitest";
import { enqueueCompassoBillingEvent, hasPendingCompassoReview } from "./collection-jobs";
import { getCompassoAccess } from "./compasso";
import { createCompassoCommerce, persistCompassoSubscriptionSnapshot } from "./compasso-commerce";
import { getBalance } from "./credits/balance";
import { LegacySubscriptionPendingError } from "./errors";
import type { SubscriptionPaymentSnapshot } from "./payment-facts";
import { createStripeProvider } from "./providers/stripe";
import type { PlanScheduleInput, PlanScheduleProvider } from "./providers/stripe-plans";

const url = process.env.DATABASE_URL;
if (!url || (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true"))
  throw new Error("Isolated database required");
if (!["127.0.0.1", "localhost", "postgres"].includes(new URL(url).hostname))
  throw new Error("Remote database refused");
const connection = postgres(url, { max: 8, prepare: false });
const db: Database = drizzle(connection, { schema });
afterAll(() => connection.end());
const products: Product[] = PRODUCTS.filter((p) => p.app === "compasso").map((p) => ({
  ...p,
  stripePriceId: { dev: `price_${p.id}`, prod: "" },
}));
const family = createFamilyService({ db });
async function fixture() {
  const actorId = `commerce-${randomUUID()}`;
  await db
    .insert(schema.users)
    .values({ id: actorId, name: "Payer", email: `${actorId}@example.test`, emailVerified: true });
  const group = await family.createGroup(actorId, "Commerce fixture");
  const customerId = `cus_${randomUUID()}`;
  type Checkout = {
    id: string;
    customer: string;
    mode: string;
    metadata: Record<string, string>;
    status: string;
    url: string;
    subscription: string | null;
    priceId: string;
  };
  const checkouts: Checkout[] = [];
  const snapshots = new Map<string, SubscriptionPaymentSnapshot>();
  let lostUpdate = false;
  let observed = 0;
  const api = {
    customers: {
      create: async (input: { email: string; metadata: Record<string, string> }) => ({
        id: customerId,
        ...input,
      }),
    },
    checkout: {
      sessions: {
        create: async (input: {
          customer: string;
          mode: string;
          metadata: Record<string, string>;
          line_items: { price: string }[];
        }) => {
          const checkout: Checkout = {
            id: `cs_${randomUUID()}`,
            customer: input.customer,
            mode: input.mode,
            metadata: input.metadata,
            status: "open",
            url: "https://checkout.example.test/subscription",
            subscription: null,
            priceId: input.line_items[0]?.price ?? "",
          };
          checkouts.push(checkout);
          return checkout;
        },
        list: (input: { customer: string; status?: string }) =>
          (async function* () {
            yield* checkouts.filter(
              (c) => c.customer === input.customer && (!input.status || input.status === c.status),
            );
          })(),
        retrieve: async (id: string) => checkouts.find((c) => c.id === id),
        expire: async (id: string) => {
          const checkout = checkouts.find((c) => c.id === id);
          if (checkout) checkout.status = "expired";
        },
      },
    },
    subscriptions: {
      list: (input: { customer: string }) =>
        (async function* () {
          for (const sub of snapshots.values())
            if (sub.customerId === input.customer)
              yield { id: sub.subscriptionId, status: sub.status };
        })(),
      update: async (id: string, input: { cancel_at_period_end: boolean }) => {
        const sub = snapshots.get(id);
        if (!sub) throw new Error("Unknown subscription");
        sub.cancelAtPeriodEnd = input.cancel_at_period_end;
        if (lostUpdate) {
          lostUpdate = false;
          throw new Error("Response lost after update");
        }
        return {
          id,
          status: sub.status,
          cancel_at_period_end: sub.cancelAtPeriodEnd,
          items: {
            data: [
              {
                current_period_start: sub.start.getTime() / 1000,
                current_period_end: sub.end.getTime() / 1000,
              },
            ],
          },
        };
      },
    },
    billingPortal: {
      sessions: {
        create: async (input: { customer: string; configuration: string }) => {
          if (input.customer !== customerId || input.configuration !== "bpc_compasso")
            throw new Error("Wrong portal scope");
          return { url: "https://billing.example.test/session" };
        },
      },
    },
  };
  const provider = createStripeProvider({
    appName: "compasso",
    client: api as unknown as Stripe,
    secretKey: "unused",
    webhookSecret: "unused",
  });
  const reader = {
    listSubscriptionIds: async (id: string) =>
      [...snapshots.values()].filter((s) => s.customerId === id).map((s) => s.subscriptionId),
    read: async (id: string) => {
      const sub = snapshots.get(id);
      if (!sub) return null;
      observed = Math.max(Date.now(), observed + 1);
      return {
        ...sub,
        periods: sub.periods.map((p) => ({ ...p })),
        observedAt: new Date(observed),
      };
    },
  };
  let losePlanResponse = false;
  const plansCreated = new Map<
    string,
    { id: string; input: PlanScheduleInput; released: boolean }
  >();
  const plans: PlanScheduleProvider = {
    async create(input) {
      const known = plansCreated.get(input.intentId);
      if (known) return known.id;
      const record = { id: `sub_sched_${randomUUID()}`, input, released: false };
      plansCreated.set(input.intentId, record);
      if (losePlanResponse) {
        losePlanResponse = false;
        throw new Error("Lost schedule response");
      }
      return record.id;
    },
    async reconcile(input) {
      const record = plansCreated.get(input.intentId);
      if (!record || record.id !== input.scheduleId || record.input.customerId !== input.customerId)
        throw new Error("Wrong schedule identity");
      const sub = snapshots.get(input.subscriptionId);
      if (!sub) throw new Error("Missing provider subscription");
      if (sub.priceId === input.toPriceId) {
        record.released = true;
        return "applied";
      }
      if (input.cancel || record.released) {
        record.released = true;
        return "canceled";
      }
      return "scheduled";
    },
  };
  const commerce = createCompassoCommerce({
    db,
    products,
    providerClient: provider,
    plans,
    reader,
    mode: "dev",
    publicUrl: "https://conta.example.test",
    portalConfigurationId: "bpc_compasso",
    verifyCatalog: async () => {},
    onError: () => {},
  });
  async function records() {
    const [customer] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.providerCustomerId, customerId));
    if (!customer) throw new Error("Missing commercial customer");
    const subs = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.customerId, customer.id));
    return { customer, subs, accountId: customer.subjectId };
  }
  function pay() {
    const checkout = checkouts.at(-1);
    if (!checkout) throw new Error("Missing Checkout");
    const subscriptionId = `sub_${randomUUID()}`;
    const start = new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
    const end = new Date(start);
    if (checkout.priceId === "price_compasso_annual") end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    const snapshot: SubscriptionPaymentSnapshot = {
      customerId,
      subscriptionId,
      priceId: checkout.priceId,
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
          lineId: "il_first",
          priceId: checkout.priceId,
          start,
          end,
          paidAt: start,
          fullyRefunded: false,
          disputed: false,
        },
      ],
    };
    snapshots.set(subscriptionId, snapshot);
    checkout.subscription = subscriptionId;
    checkout.status = "complete";
    return snapshot;
  }
  return {
    actorId,
    group,
    customerId,
    commerce,
    provider,
    reader,
    checkouts,
    snapshots,
    records,
    pay,
    plansCreated,
    losePlan: () => {
      losePlanResponse = true;
    },
    loseUpdate: () => {
      lostUpdate = true;
    },
    balance: () => getBalance({ db, app: "compasso" }, { type: "family", id: group.id }),
  };
}

describe("central Compasso commercial lifecycle", () => {
  it("prevents duplicate subscription charges until this family's legacy contracts and checkouts are settled", async () => {
    const f = await fixture();
    await db.insert(schema.familyMigrationSources).values({
      app: "cozya",
      sourceOwnerId: f.actorId,
      groupId: f.group.id,
    });
    const [legacy] = await db
      .insert(schema.customers)
      .values({
        app: "cozya",
        provider: "stripe",
        providerCustomerId: `cus_${randomUUID()}`,
        subjectType: "user",
        subjectId: f.actorId,
        email: `${f.actorId}@example.test`,
      })
      .returning();
    if (!legacy) throw new Error("Missing legacy customer");
    const [subscription] = await db
      .insert(schema.subscriptions)
      .values({
        customerId: legacy.id,
        provider: "stripe",
        providerSubscriptionId: `sub_${randomUUID()}`,
        productId: "cozya_pro_monthly",
        providerPriceId: "price_legacy_fixture",
        status: "active",
        currentPeriodStart: new Date(Date.now() - 86_400_000),
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      })
      .returning();
    if (!subscription) throw new Error("Missing legacy subscription");
    const subscribe = () =>
      f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_monthly" });
    await expect(subscribe()).rejects.toBeInstanceOf(LegacySubscriptionPendingError);
    expect(f.checkouts).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.providerCustomerId, f.customerId)),
    ).toHaveLength(0);

    // A different family can subscribe; its rights and payer are independent.
    const other = await fixture();
    await expect(
      other.commerce.subscribe(other.actorId, {
        groupId: other.group.id,
        productId: "compasso_monthly",
      }),
    ).resolves.toBeDefined();
    expect(other.checkouts).toHaveLength(1);

    await db
      .update(schema.subscriptions)
      .set({ status: "canceled" })
      .where(eq(schema.subscriptions.id, subscription.id));
    await expect(subscribe()).rejects.toBeInstanceOf(LegacySubscriptionPendingError);
    await db
      .update(schema.subscriptions)
      .set({ currentPeriodEnd: new Date(Date.now() - 1_000) })
      .where(eq(schema.subscriptions.id, subscription.id));
    const [paid] = await db
      .insert(schema.subscriptionPaymentPeriods)
      .values({
        subscriptionId: subscription.id,
        provider: "stripe",
        providerInvoiceId: `in_${randomUUID()}`,
        providerLineId: "il_fixture",
        providerPriceId: "price_legacy_fixture",
        periodStart: new Date(Date.now() - 1_000),
        periodEnd: new Date(Date.now() + 86_400_000),
        paidAt: new Date(),
      })
      .returning();
    if (!paid) throw new Error("Missing paid period");
    await expect(subscribe()).rejects.toBeInstanceOf(LegacySubscriptionPendingError);
    await db
      .update(schema.subscriptionPaymentPeriods)
      .set({ fullyRefunded: true })
      .where(eq(schema.subscriptionPaymentPeriods.id, paid.id));
    const [acceptance] = await db
      .insert(schema.legacyContractAcceptances)
      .values({
        groupId: f.group.id,
        payerUserId: f.actorId,
        subscriptionId: subscription.id,
        policyVersion: "fixture",
      })
      .returning();
    if (!acceptance) throw new Error("Missing acceptance");
    await expect(subscribe()).rejects.toBeInstanceOf(LegacySubscriptionPendingError);
    await db
      .update(schema.legacyContractAcceptances)
      .set({ cancellationConfirmedAt: new Date() })
      .where(eq(schema.legacyContractAcceptances.id, acceptance.id));
    await db.insert(schema.checkoutIntents).values({
      customerId: legacy.id,
      userId: f.actorId,
      productId: "cozya_pro_monthly",
      request: {
        priceId: "price_legacy_fixture",
        successUrl: "https://example.test/success",
        cancelUrl: "https://example.test/cancel",
        expiresAt: 1,
      },
    });
    // An expired local timestamp is not proof that a remote checkout was unpaid.
    await expect(subscribe()).rejects.toBeInstanceOf(LegacySubscriptionPendingError);
    await db.delete(schema.checkoutIntents).where(eq(schema.checkoutIntents.customerId, legacy.id));

    const [account] = await db
      .select()
      .from(schema.collectionAccounts)
      .where(eq(schema.collectionAccounts.groupId, f.group.id));
    if (!account) throw new Error("Missing family billing account");
    const futureStart = new Date(Date.now() + 86_400_000);
    const [future] = await db
      .insert(schema.legacyFutureIntents)
      .values({
        accountId: account.id,
        payerUserId: f.actorId,
        requestKey: randomUUID(),
        productId: "compasso_monthly",
        providerPriceId: "price_compasso_monthly",
        amountCents: 4990,
        interval: "month",
        paidThrough: futureStart,
        startsAt: futureStart,
        termsRevision: "a".repeat(64),
        setupExpiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    if (!future) throw new Error("Missing future intent");
    await expect(subscribe()).rejects.toBeInstanceOf(LegacySubscriptionPendingError);
    await db
      .update(schema.legacyFutureIntents)
      .set({ state: "canceled" })
      .where(eq(schema.legacyFutureIntents.id, future.id));

    const [edi] = await db
      .insert(schema.customers)
      .values({
        app: "edi",
        provider: "stripe",
        providerCustomerId: `cus_${randomUUID()}`,
        subjectType: "user",
        subjectId: f.actorId,
        email: `${f.actorId}@example.test`,
      })
      .returning();
    if (!edi) throw new Error("Missing independent customer");
    await db.insert(schema.subscriptions).values({
      customerId: edi.id,
      provider: "stripe",
      providerSubscriptionId: `sub_${randomUUID()}`,
      productId: "edi_fixture",
      providerPriceId: "price_edi_fixture",
      status: "active",
      currentPeriodStart: new Date(Date.now() - 1_000),
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    });
    await expect(subscribe()).resolves.toBeDefined();
    expect(f.checkouts).toHaveLength(1);
  });

  async function paidFixture() {
    const f = await fixture();
    await f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_monthly" });
    const snapshot = f.pay();
    const { customer, accountId } = await f.records();
    await f.commerce.reconcileCustomer(customer.id);
    const sub = (await f.records()).subs[0];
    if (!sub) throw new Error("Missing subscription");
    const changeInput = {
      accountId,
      subscriptionId: sub.id,
      requestKey: randomUUID(),
      productId: "compasso_annual" as const,
      expectedEnd: snapshot.end.toISOString(),
    };
    return { ...f, snapshot, customer, accountId, sub, changeInput };
  }

  it("schedules one native period change for concurrent requests without changing paid access or credits", async () => {
    const f = await paidFixture();
    const attempts = await Promise.all(
      [0, 1, 2].map(() => f.commerce.changePlan(f.actorId, f.changeInput)),
    );
    expect(new Set(attempts.map((a) => a.id)).size).toBe(1);
    expect(attempts[0]).toMatchObject({ status: "scheduled", effectiveAt: f.snapshot.end });
    expect(f.plansCreated.size).toBe(1);
    expect((await f.records()).subs[0]).toMatchObject({
      productId: "compasso_monthly",
      cancelAtPeriodEnd: null,
    });
    expect((await f.balance()).available).toBe(200);
    expect((await getCompassoAccess(db, f.actorId, f.group.id)).endsAt).toEqual(f.snapshot.end);
    await expect(
      f.commerce.changePlan(f.actorId, { ...f.changeInput, requestKey: randomUUID() }),
    ).rejects.toThrow("already in progress");
    await expect(
      f.commerce.changePlan(f.actorId, { ...f.changeInput, productId: "compasso_monthly" }),
    ).rejects.toThrow("conflicts");
  });

  it("recovers a lost schedule response through the durable job and can undo it without canceling the subscription", async () => {
    const f = await paidFixture();
    f.losePlan();
    await expect(f.commerce.changePlan(f.actorId, f.changeInput)).rejects.toThrow("Lost schedule");
    const [pending] = await db
      .select()
      .from(schema.collectionPlanChanges)
      .where(eq(schema.collectionPlanChanges.subscriptionId, f.sub.id));
    expect(pending).toMatchObject({ status: "preparing", providerScheduleId: null });
    expect(pending?.requestStartedAt).toBeInstanceOf(Date);
    expect((await f.commerce.runReconciliation({ customerId: f.customer.id })).failed).toBe(0);
    const recovered = await f.commerce.changePlan(f.actorId, f.changeInput);
    expect(recovered.status).toBe("scheduled");
    expect(f.plansCreated.size).toBe(1);
    const other = await fixture();
    await expect(
      f.commerce.cancelPlanChange(other.actorId, {
        accountId: f.accountId,
        changeId: recovered.id,
      }),
    ).rejects.toThrow();
    expect(
      (
        await f.commerce.cancelPlanChange(f.actorId, {
          accountId: f.accountId,
          changeId: recovered.id,
        })
      ).status,
    ).toBe("canceled");
    expect((await f.commerce.changePlan(f.actorId, f.changeInput)).status).toBe("canceled");
    expect(f.snapshot.cancelAtPeriodEnd).toBe(false);
    expect(f.snapshot.priceId).toBe("price_compasso_monthly");
    expect((await f.balance()).available).toBe(200);
  });

  it("releases a scheduled change before canceling renewal and does not restore that change with renewal", async () => {
    const f = await paidFixture();
    const change = await f.commerce.changePlan(f.actorId, f.changeInput);
    await f.commerce.setCancellation(f.actorId, {
      accountId: f.accountId,
      subscriptionId: f.sub.id,
      cancel: true,
    });
    expect(f.plansCreated.get(change.id)?.released).toBe(true);
    expect(f.snapshot.cancelAtPeriodEnd).toBe(true);
    await f.commerce.setCancellation(f.actorId, {
      accountId: f.accountId,
      subscriptionId: f.sub.id,
      cancel: false,
    });
    expect((await f.commerce.changePlan(f.actorId, f.changeInput)).status).toBe("canceled");
    expect(f.snapshot.cancelAtPeriodEnd).toBe(false);
  });

  it("rejects stale dates, unpaid periods, another payer and another subscription before any plan side effect", async () => {
    const f = await paidFixture();
    const other = await fixture();
    await expect(f.commerce.changePlan(other.actorId, f.changeInput)).rejects.toThrow();
    await expect(
      f.commerce.changePlan(f.actorId, { ...f.changeInput, subscriptionId: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      f.commerce.changePlan(f.actorId, { ...f.changeInput, expectedEnd: new Date().toISOString() }),
    ).rejects.toThrow("stale");
    const period = f.snapshot.periods[0];
    if (!period) throw new Error("Missing paid period");
    period.fullyRefunded = true;
    await expect(f.commerce.changePlan(f.actorId, f.changeInput)).rejects.toThrow("paid period");
    expect(f.plansCreated.size).toBe(0);
  });

  it("persists exact signed schedule-created recovery beyond provider event retention and rejects conflicting receipts", async () => {
    const f = await paidFixture();
    f.losePlan();
    await expect(f.commerce.changePlan(f.actorId, f.changeInput)).rejects.toThrow();
    const [change] = await db
      .select()
      .from(schema.collectionPlanChanges)
      .where(eq(schema.collectionPlanChanges.subscriptionId, f.sub.id));
    if (!change) throw new Error("Missing change");
    const record = f.plansCreated.get(change.id);
    if (!record) throw new Error("Missing provider schedule");
    const event = {
      customerId: f.customerId,
      eventId: `evt_${randomUUID()}`,
      eventType: "subscription_schedule.created",
      scheduleCreated: {
        intentId: change.id,
        subscriptionId: f.snapshot.subscriptionId,
        scheduleId: record.id,
      },
    };
    await enqueueCompassoBillingEvent(db, event);
    await enqueueCompassoBillingEvent(db, event);
    await expect(
      enqueueCompassoBillingEvent(db, {
        ...event,
        scheduleCreated: { ...event.scheduleCreated, scheduleId: "sub_sched_foreign" },
      }),
    ).rejects.toThrow("conflicts");
    await f.commerce.reconcileCustomer(f.customer.id);
    expect((await f.commerce.changePlan(f.actorId, f.changeInput)).providerScheduleId).toBe(
      record.id,
    );
  });

  it("reconciles a native applied price on the same subscription without granting a second current allowance", async () => {
    const f = await paidFixture();
    const change = await f.commerce.changePlan(f.actorId, f.changeInput);
    // The provider test clock separately verifies the actual boundary transition and invoice.
    f.snapshot.priceId = "price_compasso_annual";
    await f.commerce.reconcileCustomer(f.customer.id);
    const [receipt] = await db
      .select()
      .from(schema.collectionPlanChanges)
      .where(eq(schema.collectionPlanChanges.id, change.id));
    expect(receipt?.status).toBe("applied");
    expect((await f.records()).subs).toHaveLength(1);
    expect((await f.records()).subs[0]?.productId).toBe("compasso_annual");
    expect((await f.balance()).available).toBe(200);
  });

  it("serializes subscription Checkout and unlocks a paid family once, with the 200-credit monthly allowance", async () => {
    const f = await fixture();
    const attempts = await Promise.all(
      [0, 1, 2].map(() =>
        f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_monthly" }),
      ),
    );
    expect(new Set(attempts.map((a) => a.url)).size).toBe(1);
    expect(f.checkouts).toHaveLength(1);
    expect((await getCompassoAccess(db, f.actorId, f.group.id)).active).toBe(false);
    const snapshot = f.pay();
    const { customer } = await f.records();
    await enqueueCompassoBillingEvent(db, {
      customerId: f.customerId,
      eventId: `evt_${randomUUID()}`,
      eventType: "invoice.paid",
    });
    expect(await f.commerce.runReconciliation({ customerId: customer.id })).toEqual({
      attempted: 1,
      processed: 1,
      failed: 0,
    });
    await f.commerce.reconcileCustomer(customer.id);
    expect(await getCompassoAccess(db, f.actorId, f.group.id)).toMatchObject({
      active: true,
      source: "paid",
      endsAt: snapshot.end,
    });
    expect((await f.balance()).available).toBe(200);
    await expect(
      f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_annual" }),
    ).rejects.toThrow();
    expect(f.checkouts).toHaveLength(1);
  });

  it("an active subscription without paid invoice facts grants neither access nor credits", async () => {
    const f = await fixture();
    await f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_monthly" });
    const snapshot = f.pay();
    const periods = snapshot.periods;
    snapshot.periods = [];
    const { customer } = await f.records();
    await f.commerce.reconcileCustomer(customer.id);
    expect((await getCompassoAccess(db, f.actorId, f.group.id)).active).toBe(false);
    expect((await f.balance()).available).toBe(0);
    snapshot.periods = periods;
    await f.commerce.reconcileCustomer(customer.id);
    expect((await getCompassoAccess(db, f.actorId, f.group.id)).active).toBe(true);
    expect((await f.balance()).available).toBe(200);
  });

  it("blocks paid access when a later provider observation contradicts recorded payment evidence", async () => {
    const f = await fixture();
    await f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_monthly" });
    const snapshot = f.pay();
    const { customer } = await f.records();
    await f.commerce.reconcileCustomer(customer.id);
    expect((await getCompassoAccess(db, f.actorId, f.group.id)).active).toBe(true);
    const periods = snapshot.periods;
    snapshot.periods = [];
    snapshot.status = "trialing";
    let ready = () => {};
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await lockFamilyMembership(tx, f.actorId, f.group.id);
      ready();
      await proceed;
    });
    await held;
    const reconciliation = f.commerce.reconcileCustomer(customer.id).then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(
        async () => {
          const [row] = await db.execute<{ waiting: boolean }>(sql`select exists (
          select 1 from pg_stat_activity where datname = current_database()
            and wait_event_type = 'Lock' and query like '%family%groups%for update%'
        ) as waiting`);
          expect(row?.waiting).toBe(true);
        },
        { timeout: 5000, interval: 20 },
      );
      expect(await hasPendingCompassoReview(db, f.group.id, "subscription")).toBe(false);
    } finally {
      release();
      await holder;
    }
    const error = await reconciliation;
    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error && error.message).toContain("requires reconciliation");
    expect((await f.records()).subs[0]?.status).toBe("active");
    expect(await hasPendingCompassoReview(db, f.group.id, "subscription")).toBe(true);
    expect(await getCompassoAccess(db, f.actorId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
    });
    snapshot.periods = periods;
    snapshot.status = "active";
    expect(await f.commerce.runReconciliation({ customerId: customer.id })).toMatchObject({
      failed: 0,
    });
    expect(await hasPendingCompassoReview(db, f.group.id, "subscription")).toBe(false);
    expect((await getCompassoAccess(db, f.actorId, f.group.id)).active).toBe(true);
  });

  it("annual subscriptions release only the current calendar month's allowance", async () => {
    const f = await fixture();
    await f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_annual" });
    const snapshot = f.pay();
    const { customer } = await f.records();
    await f.commerce.reconcileCustomer(customer.id);
    expect((await f.balance()).available).toBe(200);
    const [grant] = await db
      .select()
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.ownerId, f.group.id),
          eq(schema.creditLedger.entryType, "bonus_grant"),
        ),
      );
    expect(grant?.expiresAt?.getTime()).toBeLessThan(snapshot.end.getTime());
    expect((await f.records()).subs[0]?.nextCreditGrantAt).not.toBeNull();
  });

  it("only the payer may cancel or use the portal; cancellation retains paid access and can be undone", async () => {
    const f = await fixture();
    const other = await fixture();
    await f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_monthly" });
    const snapshot = f.pay();
    const { customer, accountId } = await f.records();
    await f.commerce.reconcileCustomer(customer.id);
    const sub = (await f.records()).subs[0];
    if (!sub) throw new Error("Missing local subscription");
    const input = { accountId, subscriptionId: sub.id, cancel: true };
    await expect(f.commerce.setCancellation(other.actorId, input)).rejects.toThrow();
    await expect(f.commerce.portal(other.actorId, accountId)).rejects.toThrow();
    expect(snapshot.cancelAtPeriodEnd).toBe(false);
    await f.commerce.setCancellation(f.actorId, input);
    expect((await f.records()).subs[0]?.cancelAtPeriodEnd).toEqual(snapshot.end);
    expect((await getCompassoAccess(db, f.actorId, f.group.id)).active).toBe(true);
    expect((await f.balance()).available).toBe(200);
    await f.commerce.setCancellation(f.actorId, { ...input, cancel: false });
    expect((await f.records()).subs[0]?.cancelAtPeriodEnd).toBeNull();
    expect(await f.commerce.portal(f.actorId, accountId)).toEqual({
      url: "https://billing.example.test/session",
    });
  });

  it("a lost cancellation response is recovered by durable reconciliation", async () => {
    const f = await fixture();
    await f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_monthly" });
    const snapshot = f.pay();
    const { customer, accountId } = await f.records();
    await f.commerce.reconcileCustomer(customer.id);
    const sub = (await f.records()).subs[0];
    if (!sub) throw new Error("Missing local subscription");
    f.loseUpdate();
    await expect(
      f.commerce.setCancellation(f.actorId, { accountId, subscriptionId: sub.id, cancel: true }),
    ).rejects.toThrow("Response lost");
    expect(snapshot.cancelAtPeriodEnd).toBe(true);
    expect((await f.commerce.runReconciliation({ customerId: customer.id })).failed).toBe(0);
    expect((await f.records()).subs[0]?.cancelAtPeriodEnd).toEqual(snapshot.end);
  });

  it("rejects cross-account snapshots, ignores old observations and suspends the matching funded period on dispute", async () => {
    const f = await fixture();
    await f.commerce.subscribe(f.actorId, { groupId: f.group.id, productId: "compasso_monthly" });
    const snapshot = f.pay();
    const { customer } = await f.records();
    const product = products.find((p) => p.id === "compasso_monthly");
    const old = await f.reader.read(snapshot.subscriptionId);
    if (!product || !old) throw new Error("Missing snapshot fixture");
    await persistCompassoSubscriptionSnapshot(db, customer.id, product, old);
    await f.commerce.reconcileCustomer(customer.id);
    const period = snapshot.periods[0];
    if (!period) throw new Error("Missing paid period");
    period.disputed = true;
    await f.commerce.reconcileCustomer(customer.id);
    expect((await getCompassoAccess(db, f.actorId, f.group.id)).active).toBe(false);
    expect((await f.balance()).available).toBe(0);
    await persistCompassoSubscriptionSnapshot(db, customer.id, product, old);
    expect((await getCompassoAccess(db, f.actorId, f.group.id)).active).toBe(false);
    const current = await f.reader.read(snapshot.subscriptionId);
    if (!current) throw new Error("Missing observation");
    await persistCompassoSubscriptionSnapshot(db, customer.id, product, current);
    await expect(
      persistCompassoSubscriptionSnapshot(db, customer.id, product, {
        ...current,
        status: "canceled",
      }),
    ).rejects.toThrow("Conflicting");
    await expect(
      persistCompassoSubscriptionSnapshot(db, customer.id, product, {
        ...current,
        customerId: "cus_foreign",
      }),
    ).rejects.toThrow("another customer");
    period.disputed = false;
    await f.commerce.reconcileCustomer(customer.id);
    expect((await f.balance()).available).toBe(200);
  });
});
