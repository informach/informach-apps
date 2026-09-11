import { describe, expect, it } from "vitest";
import { getBalance } from "../credits/balance";
import { createFakeDb } from "./_fake-db";

const owner = { type: "user" as const, id: "user-1" };
describe("getBalance", () => {
  it("returns zeros for an empty ledger", async () => {
    const { db } = createFakeDb({
      executeResult: [{ ledger: [], reserved: "0", as_of: "2026-05-01T00:00:00Z" }],
    });
    expect(await getBalance({ db: db as never, app: "test-app" }, owner)).toEqual({
      total: 0,
      reserved: 0,
      available: 0,
      expiringSoon: { amount: 0, firstExpiresAt: null },
    });
  });
  it("uses one database snapshot and subtracts active reservations from the remaining grant", async () => {
    const { db, calls } = createFakeDb({
      executeResult: [
        {
          ledger: [
            {
              id: "grant",
              amount: 50,
              entryType: "bonus_grant",
              createdAt: "2026-04-25T00:00:00Z",
              expiresAt: "2026-05-05T00:00:00Z",
            },
            {
              id: "use",
              amount: -20,
              entryType: "consumption",
              createdAt: "2026-04-26T00:00:00Z",
              expiresAt: null,
            },
          ],
          reserved: "2",
          as_of: "2026-05-01T00:00:00Z",
        },
      ],
    });
    expect(await getBalance({ db: db as never, app: "test-app" }, owner)).toEqual({
      total: 30,
      reserved: 2,
      available: 28,
      expiringSoon: { amount: 30, firstExpiresAt: new Date("2026-05-05T00:00:00Z") },
    });
    expect(calls.filter((c) => c.mode === "execute")).toHaveLength(1);
  });
});
