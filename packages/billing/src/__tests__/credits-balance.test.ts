import { describe, expect, it } from "vitest";
import { getBalance } from "../credits/balance";
import { createFakeDb } from "./_fake-db";

const owner = { type: "user" as const, id: "user-1" };

describe("getBalance", () => {
  it("returns zeros when execute returns no rows", async () => {
    const { db, calls } = createFakeDb({ executeResult: [] });
    const balance = await getBalance({ db: db as never, app: "test-app" }, owner);
    expect(balance).toEqual({
      total: 0,
      reserved: 0,
      available: 0,
      expiringSoon: { amount: 0, firstExpiresAt: null },
    });
    expect(calls.filter((c) => c.mode === "execute")).toHaveLength(1);
  });

  it("computes available = total - reserved and surfaces expiringSoon", async () => {
    const expiresAt = new Date("2026-05-08T12:00:00.000Z");
    const { db } = createFakeDb({
      executeResult: [
        {
          total: "1500",
          reserved: "200",
          expiring_amount: "500",
          expiring_first: expiresAt,
        },
      ],
    });
    const balance = await getBalance({ db: db as never, app: "test-app" }, owner);
    expect(balance.total).toBe(1500);
    expect(balance.reserved).toBe(200);
    expect(balance.available).toBe(1300);
    expect(balance.expiringSoon.amount).toBe(500);
    expect(balance.expiringSoon.firstExpiresAt).toEqual(expiresAt);
  });

  it("coerces string sums (postgres bigint) to numbers", async () => {
    const { db } = createFakeDb({
      executeResult: [
        {
          total: "999999",
          reserved: "0",
          expiring_amount: null,
          expiring_first: null,
        },
      ],
    });
    const balance = await getBalance({ db: db as never, app: "test-app" }, owner);
    expect(balance.total).toBe(999999);
    expect(balance.expiringSoon.amount).toBe(0);
    expect(balance.expiringSoon.firstExpiresAt).toBeNull();
  });

  it("parses ISO string timestamps for expiring_first", async () => {
    const { db } = createFakeDb({
      executeResult: [
        {
          total: "100",
          reserved: "0",
          expiring_amount: "100",
          expiring_first: "2026-05-15T00:00:00Z",
        },
      ],
    });
    const balance = await getBalance({ db: db as never, app: "test-app" }, owner);
    expect(balance.expiringSoon.firstExpiresAt).toBeInstanceOf(Date);
    expect(balance.expiringSoon.firstExpiresAt?.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });
});
