import { randomUUID } from "node:crypto";
import type { SubscriptionPaymentSnapshot } from "@informach/billing/payment-facts";
import { PRODUCTS } from "@informach/config";
import { and, db, eq, inArray, sql, withDatabaseLock } from "@informach/db";
import {
  customers,
  ediBillingReconciliations,
  ediEntitlements,
  ediOutbox,
  subscriptions,
  users,
} from "@informach/db/schema";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withBillingLifecycle, withCustomerBillingLifecycle } from "./lifecycle";
import { reconcileBilling } from "./reconciliation";
import { enqueueBillingCustomer, saveCustomerSnapshots } from "./repository";

beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.EDI_ISOLATED_DATABASE !== "1" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Billing integration tests require an isolated loopback database.");
});

function barrier() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    promise,
    release() {
      if (!resolve) throw new Error("Uninitialized barrier");
      resolve();
    },
  };
}

async function fixture() {
  const userId = randomUUID();
  const customerId = `cus_${randomUUID()}`;
  const eventId = `evt_${randomUUID()}`;
  await db
    .insert(users)
    .values({ id: userId, name: "Billing integration", email: `${userId}@example.test` });
  await db.insert(customers).values({
    app: "edi",
    provider: "stripe",
    providerCustomerId: customerId,
    subjectType: "user",
    subjectId: userId,
    email: `${userId}@example.test`,
  });
  await enqueueBillingCustomer(customerId, eventId, false);
  const now = new Date();
  const end = new Date(now.getTime() + 86400000);
  const snapshot: SubscriptionPaymentSnapshot = {
    customerId,
    subscriptionId: `sub_${randomUUID()}`,
    priceId: "price_edi_integration",
    status: "active",
    start: now,
    end,
    trialEnd: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    observedAt: now,
    periods: [
      {
        invoiceId: `in_${randomUUID()}`,
        lineId: `il_${randomUUID()}`,
        priceId: "price_edi_integration",
        start: now,
        end,
        paidAt: now,
        fullyRefunded: false,
        disputed: false,
      },
    ],
  };
  const products = PRODUCTS.filter((product) => product.id === "edi_suite_monthly").map(
    (product) => ({
      ...product,
      stripePriceId: { dev: snapshot.priceId, prod: "" },
    }),
  );
  const errors: unknown[] = [];
  async function run(read: () => Promise<SubscriptionPaymentSnapshot>) {
    return reconcileBilling({
      products,
      mode: "dev",
      withCustomerLock: withCustomerBillingLifecycle,
      reader: {
        listSubscriptionIds: async (id) => (id === customerId ? [snapshot.subscriptionId] : []),
        read: async () => read(),
      },
      onError: (_customerId, error) => errors.push(error),
    });
  }
  async function entitlement() {
    return (await db.select().from(ediEntitlements).where(eq(ediEntitlements.userId, userId)))[0];
  }
  return { userId, customerId, eventId, snapshot, errors, run, entitlement };
}

async function waitForContendedLock() {
  await vi.waitFor(
    async () => {
      const rows = await db.execute(sql`select exists(
      select 1 from pg_locks where locktype = 'advisory' and not granted
    ) as waiting`);
      expect(rows[0]?.waiting).toBe(true);
    },
    { timeout: 5000, interval: 20 },
  );
}

describe("billing reconciliation and webhook serialization in PostgreSQL", () => {
  it("visits accounts beyond 25 permanent failures, with independent backoff and freshness", async () => {
    const accounts = [];
    for (let i = 0; i < 31; i++) accounts.push(await fixture());
    const failed = new Set(accounts.slice(0, 25).map((account) => account.customerId));
    const ids = accounts.map((account) => account.customerId);
    await db.delete(ediOutbox).where(inArray(ediOutbox.subjectId, ids));
    for (const [i, account] of accounts.entries())
      await db
        .update(customers)
        .set({ createdAt: new Date(946684800000 + i * 1000) })
        .where(eq(customers.providerCustomerId, account.customerId));
    const visits: string[] = [];
    const deps = {
      products: [],
      mode: "dev",
      withCustomerLock: withCustomerBillingLifecycle,
      onError: () => {},
      reader: {
        async listSubscriptionIds(id: string) {
          visits.push(id);
          if (failed.has(id)) throw new Error("Permanent provider failure");
          return [];
        },
        async read() {
          return null;
        },
      },
    } satisfies Parameters<typeof reconcileBilling>[0];
    await reconcileBilling(deps);
    expect(visits.filter((id) => failed.has(id))).toHaveLength(25);
    await reconcileBilling(deps);
    for (const account of accounts.slice(25)) expect(visits).toContain(account.customerId);
    for (const account of accounts.slice(0, 25)) {
      expect(visits.filter((id) => id === account.customerId)).toHaveLength(1);
      expect((await account.entitlement())?.reconciledAt ?? null).toBeNull();
    }
    const customerRows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(inArray(customers.providerCustomerId, [...failed]));
    const scheduleIds = customerRows.map((row) => row.id);
    const schedules = await db
      .select()
      .from(ediBillingReconciliations)
      .where(inArray(ediBillingReconciliations.customerId, scheduleIds));
    expect(schedules).toHaveLength(25);
    expect(
      schedules.every((row) => row.failures === 1 && row.nextAttemptAt > row.attemptedAt),
    ).toBe(true);
    await db
      .update(ediBillingReconciliations)
      .set({ nextAttemptAt: new Date(0) })
      .where(inArray(ediBillingReconciliations.customerId, scheduleIds));
    await reconcileBilling(deps);
    const retried = await db
      .select()
      .from(ediBillingReconciliations)
      .where(inArray(ediBillingReconciliations.customerId, scheduleIds));
    expect(
      retried.every(
        (row) =>
          row.failures === 2 && row.nextAttemptAt.getTime() - row.attemptedAt.getTime() > 55000,
      ),
    ).toBe(true);
  }, 30000);
  it("completes all customer locks under the cron guard without exhausting the lock pool", async () => {
    const item = await fixture();
    await withDatabaseLock("edi:reconcile", () => item.run(async () => item.snapshot));
    expect(item.errors).toEqual([]);
    expect((await item.entitlement())?.paidThrough).toEqual(item.snapshot.end);
  }, 15000);
  it("retires an orphaned outbox job and continues reconciling live accounts", async () => {
    const orphan = await fixture();
    await db.delete(customers).where(eq(customers.providerCustomerId, orphan.customerId));
    const live = await fixture();
    await live.run(async () => live.snapshot);
    const jobs = await db
      .select()
      .from(ediOutbox)
      .where(eq(ediOutbox.subjectId, orphan.customerId));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.processedAt).toBeInstanceOf(Date);
    expect(live.errors).toEqual([]);
    expect((await live.entitlement())?.paidThrough).toEqual(live.snapshot.end);
  });

  it("does not overwrite a concurrent refund suspension with a previously read paid snapshot", async () => {
    const item = await fixture();
    const reading = barrier();
    const continueRead = barrier();
    const reconciliation = item.run(async () => {
      reading.release();
      await continueRead.promise;
      return item.snapshot;
    });
    await reading.promise;
    const refundEventId = `evt_${randomUUID()}`;
    const webhook = withBillingLifecycle(item.userId, () =>
      enqueueBillingCustomer(item.customerId, refundEventId, true),
    );
    try {
      await waitForContendedLock();
    } finally {
      continueRead.release();
      await Promise.all([reconciliation, webhook]);
    }
    expect(item.errors).toEqual([]);
    expect(await item.entitlement()).toMatchObject({ suspended: true });
    const jobs = await db.select().from(ediOutbox).where(eq(ediOutbox.subjectId, item.customerId));
    expect(jobs.find((job) => job.dedupeKey.includes(item.eventId))?.processedAt).toBeInstanceOf(
      Date,
    );
    expect(jobs.find((job) => job.dedupeKey.includes(refundEventId))?.processedAt).toBeNull();
  }, 15000);

  it("reads Stripe only after an in-flight webhook finishes and removes fully refunded access", async () => {
    const item = await fixture();
    await saveCustomerSnapshots(item.customerId, [
      { productId: "edi_suite_monthly", snapshot: item.snapshot },
    ]);
    const held = barrier();
    const release = barrier();
    const webhook = withBillingLifecycle(item.userId, async () => {
      await enqueueBillingCustomer(item.customerId, `evt_${randomUUID()}`, true);
      held.release();
      await release.promise;
    });
    await held.promise;
    const reconciliation = item.run(async () => {
      expect(await item.entitlement()).toMatchObject({ suspended: true });
      return {
        ...item.snapshot,
        periods: item.snapshot.periods.map((period) => ({ ...period, fullyRefunded: true })),
      };
    });
    try {
      await waitForContendedLock();
    } finally {
      release.release();
      await Promise.all([webhook, reconciliation]);
    }
    expect(item.errors).toEqual([]);
    expect((await item.entitlement())?.paidThrough).toBeNull();
  }, 15000);

  it("rolls back the entire snapshot transaction on cross-customer data", async () => {
    const item = await fixture();
    const before = await item.entitlement();
    await expect(
      saveCustomerSnapshots(item.customerId, [
        { productId: "edi_suite_monthly", snapshot: item.snapshot },
        { productId: "edi_suite_monthly", snapshot: { ...item.snapshot, customerId: "cus_other" } },
      ]),
    ).rejects.toThrow("Cross-customer billing snapshot rejected");
    expect(await item.entitlement()).toEqual(before);
    const saved = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.provider, "stripe"),
          eq(subscriptions.providerSubscriptionId, item.snapshot.subscriptionId),
        ),
      );
    expect(saved).toHaveLength(0);
  });
});
