import { describe, expect, it, vi } from "vitest";
import { reconcileSubscriptionStatuses } from "../sweepers";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

const periodEnd = new Date("2026-06-01T00:00:00Z");
const sampleLocal = {
  id: "sub-row-1",
  providerSubscriptionId: "sub_test_1",
  status: "active",
  currentPeriodEnd: periodEnd,
  cancelAtPeriodEnd: null,
  canceledAt: null,
};

describe("reconcileSubscriptionStatuses", () => {
  it("does nothing when local matches Stripe (status + period_end + cancelAtPeriodEnd)", async () => {
    const { db, calls } = createFakeDb({ selectResult: [sampleLocal] });
    const { provider } = createFakeProvider({
      subscriptionSummary: {
        id: "sub_test_1",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
      },
    });
    const result = await reconcileSubscriptionStatuses({
      db: db as never,
      provider: "stripe",
      app: "test-app",
      providerClient: provider,
    });
    expect(result).toEqual({ scanned: 1, reconciled: 0, mismatches: 0, errors: 0 });
    expect(calls.find((c) => c.mode === "update")).toBeUndefined();
  });

  it("updates local when status drifts (active → past_due in Stripe)", async () => {
    const { db, calls } = createFakeDb({ selectResult: [sampleLocal] });
    const { provider } = createFakeProvider({
      subscriptionSummary: {
        id: "sub_test_1",
        status: "past_due",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
      },
    });
    const result = await reconcileSubscriptionStatuses({
      db: db as never,
      provider: "stripe",
      app: "test-app",
      providerClient: provider,
    });
    expect(result).toEqual({ scanned: 1, reconciled: 1, mismatches: 1, errors: 0 });
    expect(calls.some((c) => c.mode === "update")).toBe(true);
  });

  it("marks local canceled when Stripe returns null (subscription deleted)", async () => {
    const { db, calls } = createFakeDb({ selectResult: [sampleLocal] });
    const { provider } = createFakeProvider();
    provider.retrieveSubscription = vi.fn(async () => null);
    const result = await reconcileSubscriptionStatuses({
      db: db as never,
      provider: "stripe",
      app: "test-app",
      providerClient: provider,
    });
    expect(result.reconciled).toBe(1);
    expect(result.mismatches).toBe(1);
    expect(calls.some((c) => c.mode === "update")).toBe(true);
  });

  it("detects cancelAtPeriodEnd drift (user clicked cancel via portal)", async () => {
    const { db } = createFakeDb({ selectResult: [sampleLocal] });
    const { provider } = createFakeProvider({
      subscriptionSummary: {
        id: "sub_test_1",
        status: "active",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEnd,
      },
    });
    const result = await reconcileSubscriptionStatuses({
      db: db as never,
      provider: "stripe",
      app: "test-app",
      providerClient: provider,
    });
    expect(result.reconciled).toBe(1);
    expect(result.mismatches).toBe(1);
  });

  it("counts errors per-row without aborting the loop", async () => {
    const { db } = createFakeDb({
      selectResult: [
        sampleLocal,
        { ...sampleLocal, id: "sub-row-2", providerSubscriptionId: "sub_test_2" },
      ],
    });
    const { provider } = createFakeProvider({
      subscriptionSummary: {
        id: "ok",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
      },
    });
    let count = 0;
    provider.retrieveSubscription = vi.fn(async () => {
      count++;
      if (count === 1) throw new Error("stripe transient");
      return null; // sub 2 → deleted on Stripe
    });
    const result = await reconcileSubscriptionStatuses({
      db: db as never,
      provider: "stripe",
      app: "test-app",
      providerClient: provider,
    });
    expect(result.scanned).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.reconciled).toBe(1); // sub-row-2 was reconciled
  });

  it("returns zero counts on empty local set", async () => {
    const { db } = createFakeDb({ selectResult: [] });
    const { provider } = createFakeProvider();
    const result = await reconcileSubscriptionStatuses({
      db: db as never,
      provider: "stripe",
      app: "test-app",
      providerClient: provider,
    });
    expect(result).toEqual({ scanned: 0, reconciled: 0, mismatches: 0, errors: 0 });
    expect(provider.retrieveSubscription).not.toHaveBeenCalled();
  });
});
