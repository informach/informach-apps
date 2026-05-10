import type { Product } from "@informach/config";
import { describe, expect, it } from "vitest";
import { type GrantMonthlyBonusDeps, grantPendingMonthlyBonusCredits } from "../sweepers";
import { createFakeDb } from "./_fake-db";

const annualProduct: Product = {
  id: "cozya_pro_annual",
  app: "cozya",
  kind: "subscription",
  name: "Cozya Pro (Anual)",
  tier: "pro",
  interval: "year",
  bonusCreditsPerMonth: 100,
  stripePriceId: { dev: "price_dev_annual", prod: "price_prod_annual" },
};

const monthlyProduct: Product = {
  id: "cozya_pro_monthly",
  app: "cozya",
  kind: "subscription",
  name: "Cozya Pro",
  tier: "pro",
  interval: "month",
  bonusCreditsPerMonth: 100,
  stripePriceId: { dev: "price_dev_monthly", prod: "price_prod_monthly" },
};

const products = [annualProduct, monthlyProduct];

function makeDeps(overrides: Partial<GrantMonthlyBonusDeps> = {}): GrantMonthlyBonusDeps {
  const { db } = createFakeDb();
  return {
    db: db as never,
    app: "test-app",
    products,
    ...overrides,
  };
}

const now = new Date("2026-05-15T12:00:00Z");

const baseAnnualSub = {
  id: "sub-1",
  providerSubscriptionId: "sub_stripe_1",
  productId: "cozya_pro_annual",
  nextCreditGrantAt: new Date("2026-05-01T00:00:00Z"),
  currentPeriodEnd: new Date("2027-04-01T00:00:00Z"),
  cancelAtPeriodEnd: null,
  subjectType: "user",
  subjectId: "user-1",
};

describe("grantPendingMonthlyBonusCredits", () => {
  it("grants bonus and advances anchor by 30 days for ready annual sub", async () => {
    const candidates = [baseAnnualSub];
    // Sequence of selects:
    //  1. candidates query
    //  2. grantBonusCredits → assertBalanceInvariant SELECT (returns balance)
    //  3. grantBonusCredits → INSERT ... RETURNING (returns ledger row)
    const ledgerRow = {
      id: "ledger-1",
      ownerType: "user",
      ownerId: "user-1",
      entryType: "bonus_grant",
      amount: 100,
      stripeEventId: `drip:${baseAnnualSub.id}:2026-05-01`,
    };
    const { db, calls } = createFakeDb({
      selectQueue: [candidates, [{ total: 0 }]],
      insertQueue: [[ledgerRow]],
    });
    const deps = makeDeps({ db: db as never, now });

    const result = await grantPendingMonthlyBonusCredits(deps);

    expect(result.scanned).toBe(1);
    expect(result.granted).toBe(1);
    expect(result.totalCredits).toBe(100);

    // The synthetic stripeEventId must include the anchor's YYYY-MM-DD.
    const insertValuesCall = calls.find(
      (c) =>
        c.mode === "values" &&
        typeof (c.args[0] as Record<string, unknown>)?.stripeEventId === "string",
    );
    const insertedEventId = (insertValuesCall?.args[0] as Record<string, unknown>)
      ?.stripeEventId as string;
    expect(insertedEventId).toBe(`drip:${baseAnnualSub.id}:2026-05-01`);

    // Last update sets nextCreditGrantAt 30 days after the previous anchor.
    const updateSets = calls.filter((c) => c.mode === "set");
    const lastUpdate = updateSets[updateSets.length - 1]?.args[0] as Record<string, unknown>;
    expect(lastUpdate.nextCreditGrantAt).toBeInstanceOf(Date);
    const advanced = lastUpdate.nextCreditGrantAt as Date;
    expect(advanced.toISOString()).toBe("2026-05-31T00:00:00.000Z");
  });

  it("skips and clears anchor when next drip would land after cancel_at_period_end", async () => {
    const cancelingSub = {
      ...baseAnnualSub,
      cancelAtPeriodEnd: new Date("2026-05-20T00:00:00Z"),
    };
    const { db, calls } = createFakeDb({
      selectQueue: [[cancelingSub]],
    });
    const deps = makeDeps({ db: db as never, now });

    const result = await grantPendingMonthlyBonusCredits(deps);

    expect(result.granted).toBe(0);
    expect(result.skipped).toBe(1);
    const grantInsert = calls.find(
      (c) =>
        c.mode === "values" &&
        typeof (c.args[0] as Record<string, unknown>)?.stripeEventId === "string",
    );
    expect(grantInsert).toBeUndefined();
    const updateSets = calls.filter((c) => c.mode === "set");
    const lastUpdate = updateSets[updateSets.length - 1]?.args[0] as Record<string, unknown>;
    // Next drip would be 2026-05-31, past the boundary 2026-05-20 → null anchor.
    expect(lastUpdate.nextCreditGrantAt).toBeNull();
  });

  it("skips and clears anchor when next drip would land after currentPeriodEnd", async () => {
    const finalAnchorSub = {
      ...baseAnnualSub,
      currentPeriodEnd: new Date("2026-05-20T00:00:00Z"),
    };
    const { db, calls } = createFakeDb({
      selectQueue: [[finalAnchorSub]],
    });
    const deps = makeDeps({ db: db as never, now });

    const result = await grantPendingMonthlyBonusCredits(deps);

    expect(result.granted).toBe(0);
    expect(result.skipped).toBe(1);
    const grantInsert = calls.find(
      (c) =>
        c.mode === "values" &&
        typeof (c.args[0] as Record<string, unknown>)?.stripeEventId === "string",
    );
    expect(grantInsert).toBeUndefined();
    const updateSets = calls.filter((c) => c.mode === "set");
    const lastUpdate = updateSets[updateSets.length - 1]?.args[0] as Record<string, unknown>;
    expect(lastUpdate.nextCreditGrantAt).toBeNull();
  });

  it("skips and clears anchor for non-annual products", async () => {
    const wrongSub = { ...baseAnnualSub, productId: "cozya_pro_monthly" };
    const { db, calls } = createFakeDb({
      selectQueue: [[wrongSub]],
    });
    const deps = makeDeps({ db: db as never, now });

    const result = await grantPendingMonthlyBonusCredits(deps);

    expect(result.granted).toBe(0);
    expect(result.skipped).toBe(1);
    const lastUpdate = (calls.find((c) => c.mode === "set")?.args[0] ?? {}) as Record<
      string,
      unknown
    >;
    expect(lastUpdate.nextCreditGrantAt).toBeNull();
  });

  it("counts replays as skipped (idempotency via stripeEventId)", async () => {
    const candidates = [baseAnnualSub];
    // Simulate replay: assertBalanceInvariant returns existing entries with sum=100
    // (treated as alreadyProcessed by grantBonusCredits when the unique constraint
    // hits — easier in this fake to short-circuit via insertQueue empty array).
    const { db } = createFakeDb({
      selectQueue: [
        candidates,
        // Inside grantBonusCredits: SELECT for prior ledger entry by stripeEventId
        [{ id: "existing-ledger-1" }],
      ],
    });
    const deps = makeDeps({ db: db as never, now });

    const result = await grantPendingMonthlyBonusCredits(deps);

    expect(result.scanned).toBe(1);
    // Replay should not increment granted.
    expect(result.granted).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("returns zeroes when no candidates match", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const deps = makeDeps({ db: db as never, now });
    const result = await grantPendingMonthlyBonusCredits(deps);
    expect(result).toEqual({ scanned: 0, granted: 0, skipped: 0, totalCredits: 0 });
  });
});
