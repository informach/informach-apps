import { describe, expect, it, vi } from "vitest";
import type { SendFn } from "../dispatch";
import {
  recoverStaleDeliveries,
  retryFailedDeliveries,
  syncSendgridSuppressions,
} from "../sweepers";
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
    const onAudit = vi.fn();
    const result = await syncSendgridSuppressions({
      db: db as never,
      apiKey: "SG.test",
      fetch: fetchMock as unknown as typeof fetch,
      onAudit,
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
    expect(onAudit).toHaveBeenCalledTimes(4);
    expect(onAudit).toHaveBeenCalledWith({
      eventType: "email.suppression_recorded",
      actorId: null,
      payload: {
        emailHash: expect.any(String),
        emailDomain: "x.com",
        providerSuppressionType: expect.any(String),
        reason: expect.any(String),
        source: "sendgrid",
      },
    });
    expect(JSON.stringify(onAudit.mock.calls[0]?.[0])).not.toContain("a@x.com");
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

describe("retryFailedDeliveries", () => {
  const baseRow = {
    id: "row-1",
    recipient: "user@example.com",
    category: "billing.payment-success",
    messageKey: "key-1",
    subject: "Hello",
    html: "<p>Hi</p>",
    text: "Hi",
    sendAttempts: 1,
    updatedAt: new Date(Date.now() - 24 * 3600 * 1000), // 1 day ago — past any backoff
    userId: "user-1",
  };

  const buildUnsubscribeUrl = vi.fn(
    (id: string, cat: string) => `https://app.example.com/api/email/unsubscribe?t=${id}-${cat}`,
  );

  it("preserves the original app envelope when another app processes the shared queue", async () => {
    const original = {
      ...baseRow,
      category: "billing.payment-success",
      fromAddress: "Missão Saber <missao@example.test>",
      unsubscribeUrl: "https://missao.example.test/api/email/unsubscribe?t=original-signature",
      unsubscribeMailto: null,
    };
    const { db } = createFakeDb({
      selectQueue: [[original], []],
      updateResult: [{ id: original.id }],
    });
    const send = vi.fn<SendFn>().mockResolvedValue({ messageId: "retried" });
    await retryFailedDeliveries({
      db: db as never,
      defaultFrom: "Cozya <cozya@example.test>",
      send,
      buildUnsubscribeUrl,
      unsubscribeMailto: "cozya@example.test",
    });
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      from: original.fromAddress,
      headers: { "List-Unsubscribe": `<${original.unsubscribeUrl}>` },
    });
  });

  it("re-claims and re-sends rows in status='failed' that are past the backoff window", async () => {
    const { db } = createFakeDb({
      selectQueue: [[baseRow], []],
      updateResult: [{ id: baseRow.id }],
    });
    const send: SendFn = vi.fn().mockResolvedValue({ messageId: "mid-retry" });
    const onAudit = vi.fn();

    const result = await retryFailedDeliveries({
      db: db as never,
      defaultFrom: "noreply@example.com",
      send,
      buildUnsubscribeUrl,
      unsubscribeMailto: "unsubscribe@example.com",
      rng: () => 0.5,
      onAudit,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(1);
    expect(result.recovered).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);

    const msg = (send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      headers: Record<string, string>;
      customArgs: Record<string, string>;
      categories: string[];
    };
    expect(msg.headers["List-Unsubscribe"]).toContain(
      "https://app.example.com/api/email/unsubscribe?t=user@example.com-billing.payment-success",
    );
    expect(msg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(msg.customArgs.delivery_id).toBe(baseRow.id);
    expect(msg.customArgs.user_id).toBe(baseRow.userId);
    expect(msg.customArgs.informach_category).toBe(baseRow.category);
    expect(msg.customArgs).not.toHaveProperty("category");
    expect(msg.categories).toEqual(["billing.payment-success"]);
    expect(onAudit).toHaveBeenCalledWith({
      eventType: "email.delivery_sent",
      actorId: "user-1",
      payload: {
        deliveryId: "row-1",
        category: "billing.payment-success",
        providerMessageId: "mid-retry",
        source: "retry",
      },
    });
  });

  it("skips suppressed recipients before retrying", async () => {
    const { db } = createFakeDb({
      selectQueue: [[baseRow], [{ reason: "bounce" }]],
      updateResult: [{ id: baseRow.id }],
    });
    const send: SendFn = vi.fn();

    const result = await retryFailedDeliveries({
      db: db as never,
      defaultFrom: "noreply@example.com",
      send,
      buildUnsubscribeUrl,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.retried).toBe(0);
  });

  it("skips non-auth categories when the user unsubscribed before retrying", async () => {
    const row = { ...baseRow, category: "billing.payment-failed" };
    const { db } = createFakeDb({
      selectQueue: [[row], [], [{ userId: row.userId }]],
      updateResult: [{ id: row.id }],
    });
    const send: SendFn = vi.fn();

    const result = await retryFailedDeliveries({
      db: db as never,
      defaultFrom: "noreply@example.com",
      send,
      buildUnsubscribeUrl,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.retried).toBe(0);
  });

  it("skips rows above MAX_ATTEMPTS without sending", async () => {
    const { db } = createFakeDb({
      selectResult: [{ ...baseRow, sendAttempts: 8 }], // MAX_ATTEMPTS = 8
      updateResult: [{ id: baseRow.id }],
    });
    const send: SendFn = vi.fn();

    const result = await retryFailedDeliveries({
      db: db as never,
      defaultFrom: "noreply@example.com",
      send,
      buildUnsubscribeUrl,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.retried).toBe(0);
  });

  it("skips rows whose backoff window has not elapsed", async () => {
    const { db } = createFakeDb({
      selectResult: [{ ...baseRow, nextAttemptAt: new Date(Date.now() + 60_000) }],
      updateResult: [{ id: baseRow.id }],
    });
    const send: SendFn = vi.fn();

    const result = await retryFailedDeliveries({
      db: db as never,
      defaultFrom: "noreply@example.com",
      send,
      buildUnsubscribeUrl,
      rng: () => 0.5,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("skips rows with no persisted body (cannot rebuild without html/text)", async () => {
    const { db } = createFakeDb({
      selectResult: [{ ...baseRow, html: null, text: null }],
      updateResult: [{ id: baseRow.id }],
    });
    const send: SendFn = vi.fn();

    const result = await retryFailedDeliveries({
      db: db as never,
      defaultFrom: "noreply@example.com",
      send,
      buildUnsubscribeUrl,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("marks back to failed when send raises and counts the failure", async () => {
    const { db, calls } = createFakeDb({
      selectQueue: [[baseRow], []],
      updateResult: [{ id: baseRow.id }],
    });
    const sendError = Object.assign(new Error("rate limit"), {
      response: { statusCode: 429 },
    });
    const send: SendFn = vi.fn().mockRejectedValue(sendError);

    const result = await retryFailedDeliveries({
      db: db as never,
      defaultFrom: "noreply@example.com",
      send,
      buildUnsubscribeUrl,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.recovered).toBe(0);
    const finalUpdate = calls
      .filter((call) => call.mode === "update")
      .at(-1)
      ?.chain.find((entry) => entry.method === "set")?.args[0] as Record<string, unknown>;
    expect(finalUpdate.nextAttemptAt).toBeInstanceOf(Date);
  });

  it("counts as skipped when claim returns no rows (raced by another sweeper)", async () => {
    const { db } = createFakeDb({
      selectQueue: [[baseRow], []],
      updateResult: [], // claim matched 0 rows
    });
    const send: SendFn = vi.fn();

    const result = await retryFailedDeliveries({
      db: db as never,
      defaultFrom: "noreply@example.com",
      send,
      buildUnsubscribeUrl,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});
