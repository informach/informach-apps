import { randomUUID } from "node:crypto";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { openCompassoAccount } from "./collection-accounts";
import {
  enqueueCompassoBillingEvent,
  hasPendingCompassoReview,
  requestCollectionReconciliation,
  runCollectionBillingJobs,
} from "./collection-jobs";
import { getCompassoAccess, startCompassoTrial } from "./compasso";
import { getBalance } from "./credits/balance";
import { commitReservation, reserveCredits } from "./credits/reservations";
import { authorizeCompassoSpend } from "./credits/shared";

const url = process.env.DATABASE_URL;
if (!url || (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true"))
  throw new Error("Isolated database required");
if (!["127.0.0.1", "localhost", "postgres"].includes(new URL(url).hostname))
  throw new Error("Remote database refused");
const connection = postgres(url, { max: 6, prepare: false });
const db: Database = drizzle(connection, { schema });
afterAll(() => connection.end());
function barrier() {
  let release: () => void = () => {
    throw new Error("Barrier not initialized");
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: () => release() };
}
async function fixture() {
  const actorId = `jobs-${randomUUID()}`;
  await db
    .insert(schema.users)
    .values({ id: actorId, name: "Payer", email: `${actorId}@example.test`, emailVerified: true });
  const group = await createFamilyService({ db }).createGroup(actorId, "Reconciliation");
  const account = await openCompassoAccount(db, actorId, group.id);
  const [customer] = await db
    .insert(schema.customers)
    .values({
      app: "compasso",
      provider: "stripe",
      providerCustomerId: `cus_${randomUUID()}`,
      subjectType: "billing_account",
      subjectId: account.id,
      email: `${actorId}@example.test`,
    })
    .returning();
  if (!customer) throw new Error("Missing customer");
  const event = {
    eventId: `evt_${randomUUID()}`,
    eventType: "invoice.paid",
    customerId: customer.providerCustomerId,
  };
  const jobs = () =>
    db
      .select()
      .from(schema.collectionBillingJobs)
      .where(eq(schema.collectionBillingJobs.customerId, customer.id));
  return {
    actorId,
    group,
    customer,
    event,
    jobs,
    options: { customerId: customer.id },
    request: { customerId: customer.id, kind: "subscription" as const, subjectId: customer.id },
  };
}

describe("durable collection billing queue", () => {
  it("orders adverse event admission with the family's authorized transactions", async () => {
    const f = await fixture();
    const ready = barrier();
    const release = barrier();
    const holder = db.transaction(async (tx) => {
      await lockFamilyMembership(tx, f.actorId, f.group.id);
      ready.resolve();
      await release.promise;
    });
    await ready.promise;
    const adverse = { ...f.event, eventType: "charge.dispute.created", paymentId: "pi_disputed" };
    const admitted = enqueueCompassoBillingEvent(db, adverse);
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
      expect(await hasPendingCompassoReview(db, f.group.id)).toBe(false);
    } finally {
      release.resolve();
      await holder;
    }
    expect(await admitted).toMatchObject({ accepted: true });
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(true);
  });
  it("holds new usage on an adverse event until every observed risk version is reconciled, including crashes and racing events", async () => {
    const f = await fixture();
    await startCompassoTrial(
      { db, trialHashSecret: "isolated-credit-risk-trial-secret-at-least-32" },
      f.actorId,
      f.group.id,
    );
    const spendDeps = { db, walletScope: "compasso", authorizeSpend: authorizeCompassoSpend };
    const input = {
      owner: { type: "family" as const, id: f.group.id },
      actorUserId: f.actorId,
      app: "cozya",
      feature: "test.risk",
      estimatedAmount: 1,
    };
    const accepted = await reserveCredits(spendDeps, input);
    const adverse = { ...f.event, eventType: "charge.dispute.created", paymentId: "pi_disputed" };
    await enqueueCompassoBillingEvent(db, adverse);
    expect(await getCompassoAccess(db, f.actorId, f.group.id)).toMatchObject({
      active: false,
      source: "review",
      canStartTrial: false,
    });
    await expect(reserveCredits(spendDeps, input)).rejects.toThrow("conferência");
    await commitReservation(spendDeps, { reservationId: accepted.id, actualAmount: 1 });
    expect((await getBalance({ db, app: "compasso" }, input.owner)).available).toBe(19);
    await runCollectionBillingJobs(
      {
        db,
        onError: () => {},
        reconcile: async () => {
          throw new Error("Provider unavailable");
        },
      },
      f.options,
    );
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(true);
    await enqueueCompassoBillingEvent(db, { ...f.event, eventId: `evt_${randomUUID()}` });
    await runCollectionBillingJobs(
      {
        db,
        onError: () => {},
        reconcile: async () => {
          await enqueueCompassoBillingEvent(db, { ...adverse, eventId: `evt_${randomUUID()}` });
          return {};
        },
      },
      f.options,
    );
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(true);
    await runCollectionBillingJobs(
      { db, onError: () => {}, reconcile: async () => ({}) },
      f.options,
    );
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(false);
    expect(await getCompassoAccess(db, f.actorId, f.group.id)).toMatchObject({
      active: true,
      source: "trial",
    });
    await enqueueCompassoBillingEvent(db, adverse);
    expect(await hasPendingCompassoReview(db, f.group.id)).toBe(false);
    const next = await reserveCredits(spendDeps, input);
    await commitReservation(spendDeps, { reservationId: next.id, actualAmount: 1 });
    expect((await getBalance({ db, app: "compasso" }, input.owner)).available).toBe(18);
  });
  it("stores minimal event receipts once and preserves a new event that arrives during reconciliation", async () => {
    const f = await fixture();
    expect(await enqueueCompassoBillingEvent(db, f.event)).toEqual({
      accepted: true,
      duplicate: false,
    });
    expect(await enqueueCompassoBillingEvent(db, f.event)).toEqual({
      accepted: true,
      duplicate: true,
    });
    const result = await runCollectionBillingJobs(
      {
        db,
        onError: () => {},
        reconcile: async () => {
          await enqueueCompassoBillingEvent(db, { ...f.event, eventId: `evt_${randomUUID()}` });
          return {};
        },
      },
      f.options,
    );
    expect(result).toEqual({ attempted: 1, processed: 1, failed: 0 });
    expect((await f.jobs())[0]).toMatchObject({
      requestedVersion: 2,
      processedVersion: 1,
      leaseToken: null,
    });
    expect(
      await runCollectionBillingJobs(
        { db, reconcile: async () => ({}), onError: () => {} },
        f.options,
      ),
    ).toMatchObject({ processed: 1 });
    const [done] = await f.jobs();
    expect(done).toMatchObject({ requestedVersion: 2, processedVersion: 2 });
    expect(done?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 5 * 3600_000);
    const [receipt] = await db
      .select()
      .from(schema.collectionBillingEvents)
      .where(eq(schema.collectionBillingEvents.providerEventId, f.event.eventId));
    expect(Object.keys(receipt ?? {}).sort()).toEqual([
      "createdAt",
      "customerId",
      "eventType",
      "id",
      "providerEventId",
    ]);
  });

  it("leases prevent concurrent workers from executing the same job and can recover after a crash", async () => {
    const f = await fixture();
    await requestCollectionReconciliation(db, f.request);
    const entered = barrier();
    const finish = barrier();
    const first = runCollectionBillingJobs(
      {
        db,
        onError: () => {},
        reconcile: async () => {
          entered.resolve();
          await finish.promise;
          return {};
        },
      },
      f.options,
    );
    await entered.promise;
    try {
      expect(
        await runCollectionBillingJobs(
          {
            db,
            reconcile: async () => {
              throw new Error("Double execution");
            },
            onError: () => {},
          },
          f.options,
        ),
      ).toEqual({ attempted: 0, processed: 0, failed: 0 });
    } finally {
      finish.resolve();
    }
    expect((await first).processed).toBe(1);
    await db
      .update(schema.collectionBillingJobs)
      .set({ leaseToken: randomUUID(), leaseUntil: new Date(0), nextAttemptAt: new Date(0) })
      .where(eq(schema.collectionBillingJobs.customerId, f.customer.id));
    expect(
      (
        await runCollectionBillingJobs(
          { db, reconcile: async () => ({}), onError: () => {} },
          f.options,
        )
      ).processed,
    ).toBe(1);
  });

  it("failed work remains retryable with backoff even when telemetry fails", async () => {
    const f = await fixture();
    await requestCollectionReconciliation(db, f.request);
    expect(
      await runCollectionBillingJobs(
        {
          db,
          reconcile: async () => {
            throw new Error("Provider offline");
          },
          onError: async () => {
            throw new Error("Telemetry offline");
          },
        },
        f.options,
      ),
    ).toEqual({ attempted: 1, processed: 0, failed: 1 });
    const [pending] = await f.jobs();
    expect(pending).toMatchObject({ attempts: 1, processedVersion: 0, leaseToken: null });
    expect(pending?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    await db
      .update(schema.collectionBillingJobs)
      .set({ nextAttemptAt: sql`now()` })
      .where(eq(schema.collectionBillingJobs.customerId, f.customer.id));
    await runCollectionBillingJobs(
      { db, reconcile: async () => ({ terminal: true }), onError: () => {} },
      f.options,
    );
    expect(await f.jobs()).toHaveLength(0);
  });

  it("unknown customers are ignored and conflicting event identities cannot overwrite work", async () => {
    const f = await fixture();
    const other = await fixture();
    expect(
      await enqueueCompassoBillingEvent(db, { ...f.event, customerId: "cus_unknown" }),
    ).toEqual({ accepted: false, duplicate: false });
    await enqueueCompassoBillingEvent(db, f.event);
    await expect(
      enqueueCompassoBillingEvent(db, {
        ...f.event,
        customerId: other.customer.providerCustomerId,
      }),
    ).rejects.toThrow("conflicts");
    await expect(
      enqueueCompassoBillingEvent(db, { ...f.event, eventType: "charge.refunded" }),
    ).rejects.toThrow("conflicts");
    expect(await other.jobs()).toHaveLength(0);
    expect((await f.jobs())[0]?.requestedVersion).toBe(1);
  });
});
