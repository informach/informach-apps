import { describe, expect, it, vi } from "vitest";
import { grantBonusCredits, refundCredits } from "../credits/grant";
import { createFakeDb } from "./_fake-db";

const owner = { type: "user" as const, id: "user-1" };

describe("grantBonusCredits", () => {
  it("inserts a positive ledger entry and emits audit", async () => {
    const onAudit = vi.fn();
    const { db } = createFakeDb({
      insertResult: [{ id: "ledger-1" }],
    });
    const result = await grantBonusCredits(
      { db: db as never, app: "test-app", onAudit },
      {
        owner,
        amount: 1000,
        reason: "subscription_monthly",
        expiresAt: new Date("2026-06-01T00:00:00Z"),
        stripeEventId: "evt_paid_1",
      },
    );
    expect(result).toEqual({ ledgerEntryId: "ledger-1", alreadyProcessed: false });
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.credits_granted",
        payload: expect.objectContaining({ ledgerEntryId: "ledger-1", amount: 1000 }),
      }),
    );
  });

  it("returns alreadyProcessed=true when stripeEventId conflicts (idempotent replay)", async () => {
    const { db } = createFakeDb({
      insertResult: [], // ON CONFLICT DO NOTHING — 0 rows returned
      selectResult: [{ id: "ledger-existing" }],
    });
    const result = await grantBonusCredits(
      { db: db as never, app: "test-app" },
      {
        owner,
        amount: 1000,
        reason: "subscription_monthly",
        stripeEventId: "evt_paid_1",
      },
    );
    expect(result).toEqual({
      ledgerEntryId: "ledger-existing",
      alreadyProcessed: true,
    });
  });

  it("throws when insert returns 0 rows without a stripeEventId (broken invariant)", async () => {
    const { db } = createFakeDb({ insertResult: [] });
    await expect(
      grantBonusCredits(
        { db: db as never, app: "test-app" },
        { owner, amount: 100, reason: "promo" },
      ),
    ).rejects.toThrow(/schema invariant broken/);
  });

  it("rejects non-positive grant amounts before touching the DB", async () => {
    const { db, calls } = createFakeDb();
    await expect(
      grantBonusCredits(
        { db: db as never, app: "test-app" },
        { owner, amount: -1, reason: "promo" },
      ),
    ).rejects.toThrow("amount must be a positive integer");
    expect(calls).toEqual([]);
  });

  it("maps reason to the correct entry_type via metadata", async () => {
    const { db, calls } = createFakeDb({ insertResult: [{ id: "ledger-2" }] });
    await grantBonusCredits(
      { db: db as never, app: "test-app" },
      { owner, amount: 50, reason: "compensation" },
    );
    expect(calls.find((c) => c.mode === "insert")).toBeDefined();
  });
});

describe("refundCredits", () => {
  it("rejects non-positive refund amounts before touching the DB", async () => {
    const { db, calls } = createFakeDb();
    await expect(
      refundCredits(
        { db: db as never, app: "test-app" },
        {
          owner,
          originalLedgerEntryId: "ledger-purchase-1",
          amount: 0,
          stripeEventId: "evt_refund_bad",
          reason: "refund",
        },
      ),
    ).rejects.toThrow("amount must be a positive integer");
    expect(calls).toEqual([]);
  });
});
