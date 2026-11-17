import { randomUUID } from "node:crypto";
import { PRODUCTS } from "@informach/config";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { openCompassoAccount } from "../collection-accounts";
import { persistPaymentPeriods, type SubscriptionPaymentSnapshot } from "../payment-facts";
import { getBalance } from "./balance";
import { grantBonusCredits, refundCredits } from "./grant";
import {
  commitReservation,
  consumeCredits,
  releaseReservation,
  reserveCredits,
} from "./reservations";
import { authorizeCompassoSpend } from "./shared";
import { grantCalendarSubscriptionCredits } from "./subscription-grants";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["127.0.0.1", "localhost", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Funding integration requires an isolated database");
const connection = postgres(url, { max: 8, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
const deps = { db, walletScope: "compasso", authorizeSpend: authorizeCompassoSpend };
afterAll(async () => {
  await connection.end();
});

async function fixture() {
  const actorUserId = `funding-${randomUUID()}`;
  const email = `${actorUserId}@example.test`;
  await db
    .insert(schema.users)
    .values({ id: actorUserId, name: "Funding test", email, emailVerified: true });
  const group = await family.createGroup(actorUserId, "Funding test");
  const account = await openCompassoAccount(db, actorUserId, group.id);
  const [customer] = await db
    .insert(schema.customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_${randomUUID()}`,
      subjectType: "billing_account",
      subjectId: account.id,
      app: "compasso",
      email,
    })
    .returning();
  if (!customer) throw new Error("Missing customer");
  const start = new Date(Date.now() - 60_000);
  const end = new Date(Date.now() + 30 * 86_400_000);
  const [sub] = await db
    .insert(schema.subscriptions)
    .values({
      customerId: customer.id,
      provider: "stripe",
      providerSubscriptionId: `sub_${randomUUID()}`,
      productId: "compasso_monthly",
      providerPriceId: "price_funding",
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
    })
    .returning();
  if (!sub) throw new Error("Missing subscription");
  const snapshot: SubscriptionPaymentSnapshot = {
    customerId: customer.providerCustomerId,
    subscriptionId: sub.providerSubscriptionId,
    priceId: sub.providerPriceId,
    status: "active",
    start,
    end,
    trialEnd: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    periods: [
      {
        invoiceId: `in_${randomUUID()}`,
        lineId: "line",
        priceId: sub.providerPriceId,
        start,
        end,
        paidAt: start,
        fullyRefunded: false,
        disputed: false,
      },
    ],
    observedAt: new Date(),
  };
  await persistPaymentPeriods(db, sub.id, snapshot);
  const calendar = {
    db,
    app: "compasso",
    products: PRODUCTS.filter((p) => p.id === "compasso_monthly").map((p) => ({
      ...p,
      stripePriceId: { dev: "price_funding", prod: "" },
    })),
  };
  await grantCalendarSubscriptionCredits(calendar, { subscriptionId: sub.id });
  const owner = { type: "family" as const, id: group.id };
  await db.insert(schema.creditLedger).values({
    ownerType: owner.type,
    ownerId: owner.id,
    app: "compasso",
    amount: 100,
    entryType: "purchase",
  });
  const spend = { owner, actorUserId, app: "cozya", feature: "funding-test" };
  const observation = (n: number, flags: { disputed?: boolean; fullyRefunded?: boolean }) => ({
    ...snapshot,
    observedAt: new Date(snapshot.observedAt.getTime() + n),
    periods: snapshot.periods.map((p) => ({ ...p, ...flags })),
  });
  return {
    sub,
    owner,
    spend,
    snapshot,
    calendar,
    observation,
    balance: () => getBalance({ db, app: "compasso" }, owner),
  };
}

describe("payment funding reconciliation in PostgreSQL", () => {
  it("serializes repeated disputes and restorations, preserving a separately purchased balance", async () => {
    const f = await fixture();
    await consumeCredits(deps, { ...f.spend, amount: 40 });
    await Promise.all(
      Array.from({ length: 4 }, () =>
        persistPaymentPeriods(db, f.sub.id, f.observation(1, { disputed: true })),
      ),
    );
    expect((await f.balance()).available).toBe(100);
    await consumeCredits(deps, { ...f.spend, amount: 10 });
    await Promise.all(
      Array.from({ length: 4 }, () =>
        persistPaymentPeriods(db, f.sub.id, f.observation(3, { disputed: false })),
      ),
    );
    expect((await f.balance()).available).toBe(250);
    // An older observation arriving last cannot freeze the recovered grant again.
    await persistPaymentPeriods(db, f.sub.id, f.observation(2, { disputed: true }));
    expect((await f.balance()).available).toBe(250);
    const transitions = await db
      .select()
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.ownerId, f.owner.id),
          sql`${schema.creditLedger.sourceEntryId} is not null`,
        ),
      );
    expect(transitions.map((t) => t.entryType).sort()).toEqual([
      "funding_restoration",
      "funding_suspension",
    ]);
    expect(
      await grantCalendarSubscriptionCredits(f.calendar, { subscriptionId: f.sub.id }),
    ).toEqual({ granted: false, amount: 0 });
  });

  it("honors a previously accepted reservation without spending purchased credits", async () => {
    const f = await fixture();
    const reservation = await reserveCredits(deps, { ...f.spend, estimatedAmount: 40 });
    await persistPaymentPeriods(db, f.sub.id, f.observation(1, { fullyRefunded: true }));
    expect(await f.balance()).toMatchObject({ available: 100, reserved: 40 });
    await commitReservation(deps, { reservationId: reservation.id, actualAmount: 30 });
    expect(await f.balance()).toMatchObject({ available: 100, reserved: 0 });
    const precision = await db.execute<{ exact: boolean }>(
      sql`select l.effective_at = r.created_at as exact from billing.credit_ledger l join billing.credit_reservations r on r.id = l.reservation_id where r.id = ${reservation.id}::uuid`,
    );
    expect(precision[0]?.exact).toBe(true);
    await persistPaymentPeriods(db, f.sub.id, f.observation(2, {}));
    expect((await f.balance()).available).toBe(270);
  });

  it("keeps released reservations in their suspended lot until its funding is restored", async () => {
    const f = await fixture();
    const reservation = await reserveCredits(deps, { ...f.spend, estimatedAmount: 40 });
    await persistPaymentPeriods(db, f.sub.id, f.observation(1, { disputed: true }));
    await releaseReservation(deps, { reservationId: reservation.id, reason: "llm_error" });
    expect((await f.balance()).available).toBe(100);
    await persistPaymentPeriods(db, f.sub.id, f.observation(2, {}));
    expect((await f.balance()).available).toBe(300);
  });

  it("rejects snapshots belonging to a different subscription or customer without changing funds", async () => {
    const f = await fixture();
    const disputed = f.observation(1, { disputed: true });
    await expect(
      persistPaymentPeriods(db, f.sub.id, { ...disputed, customerId: "cus_somebody_else" }),
    ).rejects.toThrow("does not belong");
    await expect(
      persistPaymentPeriods(db, f.sub.id, { ...disputed, subscriptionId: "sub_somebody_else" }),
    ).rejects.toThrow("does not belong");
    expect((await f.balance()).available).toBe(300);
  });

  it("requires reconciliation if a newer complete provider observation omits a recorded period", async () => {
    const f = await fixture();
    const missing = { ...f.observation(1, {}), periods: [] };
    await expect(persistPaymentPeriods(db, f.sub.id, missing)).rejects.toThrow(
      "requires reconciliation",
    );
    expect((await f.balance()).available).toBe(300);
  });

  it("rejects reassignment of a paid invoice line and inconsistent observations atomically", async () => {
    const f = await fixture();
    const other = await fixture();
    const foreign = {
      ...other.observation(1, { disputed: true }),
      periods: f.observation(1, { disputed: true }).periods,
    };
    await expect(persistPaymentPeriods(db, other.sub.id, foreign)).rejects.toThrow(
      "immutable period",
    );
    await expect(
      persistPaymentPeriods(db, f.sub.id, f.observation(0, { disputed: true })),
    ).rejects.toThrow("same timestamp");
    const changed = f.observation(1, { disputed: true });
    await expect(
      persistPaymentPeriods(db, f.sub.id, {
        ...changed,
        periods: changed.periods.map((p) => ({ ...p, priceId: "price_foreign" })),
      }),
    ).rejects.toThrow("immutable period");
    expect((await f.balance()).available).toBe(300);
    expect((await other.balance()).available).toBe(300);
  });

  it("binds grant receipts to their wallet, amount and expiration", async () => {
    const f = await fixture();
    const other = await fixture();
    const input = {
      owner: f.owner,
      amount: 10,
      reason: "promo" as const,
      stripeEventId: `promo_${randomUUID()}`,
    };
    const first = await grantBonusCredits({ db, app: "compasso" }, input);
    expect(await grantBonusCredits({ db, app: "compasso" }, input)).toEqual({
      ...first,
      alreadyProcessed: true,
    });
    for (const changes of [
      { owner: other.owner },
      { amount: 20 },
      { expiresAt: new Date(Date.now() + 86_400_000) },
    ])
      await expect(
        grantBonusCredits({ db, app: "compasso" }, { ...input, ...changes }),
      ).rejects.toThrow();
    expect((await f.balance()).available).toBe(310);
    expect((await other.balance()).available).toBe(300);
  });

  it("limits concurrent purchase refunds to the original amount and protects their source", async () => {
    const f = await fixture();
    const other = await fixture();
    const [purchase] = await db
      .select()
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.ownerId, f.owner.id),
          eq(schema.creditLedger.entryType, "purchase"),
        ),
      );
    if (!purchase) throw new Error("Missing purchase");
    const input = {
      owner: f.owner,
      originalLedgerEntryId: purchase.id,
      amount: 60,
      reason: "customer_request",
      stripeEventId: `refund_${randomUUID()}`,
      metadata: { originalLedgerEntryId: "cannot-override", reason: "cannot-override" },
    };
    await expect(
      refundCredits({ db, app: "compasso" }, { ...input, owner: other.owner }),
    ).rejects.toThrow("this wallet");
    const results = await Promise.allSettled([
      refundCredits({ db, app: "compasso" }, input),
      refundCredits({ db, app: "compasso" }, { ...input, stripeEventId: `refund_${randomUUID()}` }),
    ]);
    const winner = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    expect(winner).toHaveLength(1);
    expect((await f.balance()).available).toBe(240);
    const [record] = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.id, winner[0]?.ledgerEntryId ?? randomUUID()));
    if (!record?.stripeEventId) throw new Error("Missing refund");
    expect(record).toMatchObject({
      amount: -60,
      sourceEntryId: purchase.id,
      metadata: { originalLedgerEntryId: purchase.id, reason: "customer_request" },
    });
    expect(
      await refundCredits(
        { db, app: "compasso" },
        { ...input, stripeEventId: record.stripeEventId },
      ),
    ).toMatchObject({ alreadyProcessed: true });
    await expect(
      refundCredits(
        { db, app: "compasso" },
        { ...input, stripeEventId: record.stripeEventId, owner: other.owner },
      ),
    ).rejects.toThrow("financial scope");
    await expect(
      refundCredits(
        { db, app: "compasso" },
        { ...input, stripeEventId: record.stripeEventId, amount: 10 },
      ),
    ).rejects.toThrow("financial scope");
  });
});
