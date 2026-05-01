import { describe, expect, it, vi } from "vitest";
import { recoverStaleDeliveries, syncSendgridSuppressions } from "../sweepers";
import { createFakeDb } from "./_fake-db";

describe("recoverStaleDeliveries", () => {
  it("returns the count of rows the UPDATE returned", async () => {
    const { db } = createFakeDb({ updateResult: [{ id: "a" }, { id: "b" }] });
    const result = await recoverStaleDeliveries({
      db: db as never,
      staleAfterMs: 30 * 60 * 1000,
    });
    expect(result.recovered).toBe(2);
  });

  it("returns 0 when nothing is stale", async () => {
    const { db } = createFakeDb({ updateResult: [] });
    const result = await recoverStaleDeliveries({ db: db as never });
    expect(result.recovered).toBe(0);
  });

  it("issues a single UPDATE call against the deliveries table", async () => {
    const { db, calls } = createFakeDb({ updateResult: [] });
    await recoverStaleDeliveries({ db: db as never });
    const updateCalls = calls.filter((c) => c.mode === "update");
    expect(updateCalls.length).toBe(1);
  });
});

describe("syncSendgridSuppressions", () => {
  it("fetches every suppression endpoint once when pages are short", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const isFirst = url.includes("offset=0");
      return new Response(isFirst ? JSON.stringify([{ email: "a@x.com" }]) : "[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const { db, calls } = createFakeDb({ insertResult: [] });
    const result = await syncSendgridSuppressions({
      db: db as never,
      apiKey: "SG.test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.synced).toBe(4);
    expect(result.byType).toEqual({
      bounces: 1,
      blocks: 1,
      spam_reports: 1,
      invalid_emails: 1,
    });
    const insertCalls = calls.filter((c) => c.mode === "insert");
    expect(insertCalls.length).toBe(4);
  });

  it("paginates while a page returns the full limit (500)", async () => {
    let callIndex = 0;
    const fullPage = Array.from({ length: 500 }, (_, i) => ({ email: `u${i}@x.com` }));
    const fetchMock = vi.fn(async () => {
      callIndex += 1;
      // Only the first page is full; second is empty for each type.
      return new Response(callIndex % 2 === 1 ? JSON.stringify(fullPage) : "[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const { db } = createFakeDb({ insertResult: [] });
    const result = await syncSendgridSuppressions({
      db: db as never,
      apiKey: "SG.test",
      fetch: fetchMock as unknown as typeof fetch,
      types: ["bounces"],
    });

    expect(result.synced).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when SendGrid returns non-2xx", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    const { db } = createFakeDb({ insertResult: [] });
    await expect(
      syncSendgridSuppressions({
        db: db as never,
        apiKey: "SG.bad",
        fetch: fetchMock as unknown as typeof fetch,
        types: ["bounces"],
      }),
    ).rejects.toThrow(/SendGrid suppression fetch failed/);
  });

  it("requires apiKey", async () => {
    const { db } = createFakeDb();
    await expect(syncSendgridSuppressions({ db: db as never, apiKey: "" })).rejects.toThrow(
      /apiKey is required/,
    );
  });
});
