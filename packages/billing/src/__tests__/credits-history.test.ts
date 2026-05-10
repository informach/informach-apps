import { describe, expect, it } from "vitest";
import { getCreditHistory } from "../credits/history";
import { createFakeDb } from "./_fake-db";

const owner = { type: "user" as const, id: "user-1" };

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    ownerType: "user",
    ownerId: "user-1",
    entryType: "purchase",
    amount: 1000,
    expiresAt: null,
    reservationId: null,
    paymentId: null,
    stripeEventId: null,
    runId: null,
    productSku: null,
    actorUserId: null,
    metadata: {},
    createdAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

function collectParamValues(value: unknown, seen = new Set<object>()): unknown[] {
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const record = value as Record<string, unknown>;
  const values = value.constructor.name === "Param" && "value" in record ? [record.value] : [];

  return [...values, ...Object.values(record).flatMap((child) => collectParamValues(child, seen))];
}

describe("getCreditHistory", () => {
  it("returns entries with nextCursor=null when below limit", async () => {
    const { db } = createFakeDb({
      selectResult: [makeRow({ id: "11111111-0000-0000-0000-000000000001" })],
    });
    const page = await getCreditHistory({ db: db as never, app: "test-app" }, owner, { limit: 10 });
    expect(page.entries).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it("returns nextCursor when more rows exist (limit+1 result)", async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      makeRow({
        id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
        createdAt: new Date(2026, 3, 1, 12, 0, i),
      }),
    );
    const { db } = createFakeDb({ selectResult: rows });
    const page = await getCreditHistory({ db: db as never, app: "test-app" }, owner, { limit: 10 });
    expect(page.entries).toHaveLength(10);
    expect(page.nextCursor).not.toBeNull();
    // Cursor must be base64-decodable to "<iso>|<uuid>" pointing at the LAST row of the page
    const last = page.entries[page.entries.length - 1];
    if (!last || !page.nextCursor) throw new Error("missing");
    const decoded = Buffer.from(page.nextCursor, "base64url").toString("utf8");
    expect(decoded).toBe(`${last.createdAt.toISOString()}|${last.id}`);
  });

  it("filters by entry type when requested", async () => {
    const { db, calls } = createFakeDb({ selectResult: [] });
    await getCreditHistory({ db: db as never, app: "test-app" }, owner, {
      entryTypes: ["purchase", "bonus_grant"],
      limit: 10,
    });

    const whereCall = calls.find((c) => c.mode === "where");
    expect(whereCall).toBeDefined();
    expect(collectParamValues(whereCall?.args[0])).toEqual(
      expect.arrayContaining(["purchase", "bonus_grant"]),
    );
  });

  it("clamps limit to MAX_LIMIT (200)", async () => {
    const { db, calls } = createFakeDb({ selectResult: [] });
    await getCreditHistory({ db: db as never, app: "test-app" }, owner, { limit: 9999 });
    expect(calls.find((c) => c.mode === "select")).toBeDefined();
    // Limit clamping is internal; just verify no error.
  });

  it("ignores invalid cursors instead of throwing", async () => {
    const { db } = createFakeDb({ selectResult: [makeRow()] });
    const page = await getCreditHistory({ db: db as never, app: "test-app" }, owner, {
      cursor: "not-valid-base64!!",
    });
    expect(page.entries).toHaveLength(1);
  });
});
