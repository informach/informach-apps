import { describe, expect, it, vi } from "vitest";
import {
  expireMonthlyBonusCredits,
  releaseExpiredReservations,
  retryFailedDunningEmails,
} from "../sweepers";
import { createFakeDb } from "./_fake-db";

describe("expireMonthlyBonusCredits", () => {
  it("counts and sums returned rows from the INSERT...SELECT", async () => {
    const { db } = createFakeDb({
      executeResult: [{ amount: 500 }, { amount: 1000 }, { amount: 250 }],
    });
    const result = await expireMonthlyBonusCredits({ db: db as never, app: "test-app" });
    expect(result).toEqual({ expired: 3, totalCredits: 1750 });
  });

  it("returns zeros when no rows expire", async () => {
    const { db } = createFakeDb({ executeResult: [] });
    const result = await expireMonthlyBonusCredits({ db: db as never, app: "test-app" });
    expect(result).toEqual({ expired: 0, totalCredits: 0 });
  });

  it("coerces postgres bigint string amounts to numbers", async () => {
    const { db } = createFakeDb({
      executeResult: [{ amount: "500" }, { amount: "200" }],
    });
    const result = await expireMonthlyBonusCredits({ db: db as never, app: "test-app" });
    expect(result.totalCredits).toBe(700);
  });
});

describe("releaseExpiredReservations", () => {
  it("returns count of rows touched", async () => {
    const { db } = createFakeDb({
      executeResult: [{ id: "res-1" }, { id: "res-2" }],
    });
    const result = await releaseExpiredReservations({ db: db as never, app: "test-app" });
    expect(result).toEqual({ released: 2 });
  });

  it("returns 0 when nothing to release", async () => {
    const { db } = createFakeDb({ executeResult: [] });
    const result = await releaseExpiredReservations({ db: db as never, app: "test-app" });
    expect(result).toEqual({ released: 0 });
  });
});

describe("retryFailedDunningEmails", () => {
  const subA = {
    id: "sub-a",
    providerSubscriptionId: "sub_test_1",
    metadata: {
      dunning: { pending: true, lastInvoiceId: "in_1", attempts: 0 },
    },
    customerId: "cust-1",
    subjectType: "organization",
    subjectId: "org-1",
  };

  it("stops suppressed notifications without recording a delivery or consuming an attempt", async () => {
    const { db, calls } = createFakeDb({ selectResult: [subA] });
    const result = await retryFailedDunningEmails({
      db: db as never,
      app: "test-app",
      provider: "stripe",
      send: async () => ({ status: "suppressed" }),
    });
    expect(result).toEqual({ scanned: 1, sent: 0, skipped: 1 });
    expect(calls.find((call) => call.mode === "set")?.args[0]).toMatchObject({
      metadata: { dunning: { pending: false, attempts: 0 } },
    });
    expect(calls.find((call) => call.mode === "set")?.args[0]).not.toHaveProperty(
      "metadata.dunning.lastSentAt",
    );
  });

  it("invokes send for eligible past_due subs and updates metadata", async () => {
    const { db, calls } = createFakeDb({ selectResult: [subA] });
    const send = vi.fn(async () => undefined);
    const result = await retryFailedDunningEmails({
      db: db as never,
      app: "test-app",
      provider: "stripe",
      send,
    });
    expect(result.scanned).toBe(1);
    expect(result.sent).toBe(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "sub-a",
        invoiceId: "in_1",
        attempt: 1,
      }),
    );
    expect(calls.some((c) => c.mode === "update")).toBe(true);
  });

  it("dry-runs when no send fn is provided", async () => {
    const { db, calls } = createFakeDb({ selectResult: [subA] });
    const result = await retryFailedDunningEmails({
      db: db as never,
      app: "test-app",
      provider: "stripe",
    });
    expect(result.sent).toBe(0);
    expect(result.scanned).toBe(1);
    expect(calls.some((c) => c.mode === "update")).toBe(false);
  });

  it("skips when attempt would exceed maxAttempts", async () => {
    const { db } = createFakeDb({
      selectResult: [
        {
          ...subA,
          metadata: {
            dunning: { pending: true, lastInvoiceId: "in_1", attempts: 3 },
          },
        },
      ],
    });
    const send = vi.fn();
    const result = await retryFailedDunningEmails({
      db: db as never,
      app: "test-app",
      provider: "stripe",
      send,
      maxAttempts: 3,
    });
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("skips when within cooldown window", async () => {
    const recent = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
    const { db } = createFakeDb({
      selectResult: [
        {
          ...subA,
          metadata: {
            dunning: {
              pending: true,
              lastInvoiceId: "in_1",
              attempts: 1,
              lastSentAt: recent,
            },
          },
        },
      ],
    });
    const send = vi.fn();
    const result = await retryFailedDunningEmails({
      db: db as never,
      app: "test-app",
      provider: "stripe",
      send,
      cooldownHours: 24,
    });
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("counts send error as skipped without throwing", async () => {
    const { db } = createFakeDb({ selectResult: [subA] });
    const send = vi.fn(async () => {
      throw new Error("smtp failure");
    });
    const result = await retryFailedDunningEmails({
      db: db as never,
      app: "test-app",
      provider: "stripe",
      send,
    });
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("returns zero counts when no past_due subs found", async () => {
    const { db } = createFakeDb({ selectResult: [] });
    const result = await retryFailedDunningEmails({
      db: db as never,
      app: "test-app",
      provider: "stripe",
    });
    expect(result).toEqual({ scanned: 0, sent: 0, skipped: 0 });
  });
});
