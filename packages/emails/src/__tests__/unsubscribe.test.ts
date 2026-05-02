import { describe, expect, it, vi } from "vitest";
import { buildUnsubscribeToken } from "../list-unsubscribe";
import { processUnsubscribe } from "../unsubscribe";
import { createFakeDb } from "./_fake-db";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("processUnsubscribe", () => {
  it("rejects an invalid token", async () => {
    const { db, calls } = createFakeDb();
    const result = await processUnsubscribe({ db: db as never, secret: SECRET }, "garbage");
    expect(result).toEqual({ ok: false, reason: "invalid-token" });
    expect(calls.length).toBe(0);
  });

  it("looks up the user by email when identifier looks like an email", async () => {
    const token = buildUnsubscribeToken(SECRET, "user@example.com", "auth.verify-email");
    const { db, calls } = createFakeDb({
      selectResult: [{ id: "user-1" }],
      insertResult: [],
    });
    const onAudit = vi.fn();

    const result = await processUnsubscribe({ db: db as never, secret: SECRET, onAudit }, token);
    expect(result).toEqual({
      ok: true,
      identifier: "user@example.com",
      category: "auth.verify-email",
      userId: "user-1",
    });
    expect(calls.filter((c) => c.mode === "select").length).toBe(1);
    expect(calls.filter((c) => c.mode === "insert").length).toBe(1);
    expect(onAudit).toHaveBeenCalledWith({
      eventType: "email.unsubscribe_recorded",
      actorId: "user-1",
      payload: {
        category: "auth.verify-email",
        identifierKind: "email",
        emailHash: expect.any(String),
        emailDomain: "example.com",
      },
    });
    expect(JSON.stringify(onAudit.mock.calls[0]?.[0])).not.toContain("user@example.com");
  });

  it("does not insert when no matching user is found", async () => {
    const token = buildUnsubscribeToken(SECRET, "nobody@example.com", "auth.verify-email");
    const { db, calls } = createFakeDb({ selectResult: [] });

    const result = await processUnsubscribe({ db: db as never, secret: SECRET }, token);
    expect(result).toEqual({
      ok: true,
      identifier: "nobody@example.com",
      category: "auth.verify-email",
      userId: null,
    });
    expect(calls.filter((c) => c.mode === "insert").length).toBe(0);
  });

  it("inserts for a direct user id only when that user exists", async () => {
    const token = buildUnsubscribeToken(SECRET, "user-direct-id", "marketing.weekly");
    const { db, calls } = createFakeDb({
      selectResult: [{ id: "user-direct-id" }],
      insertResult: [],
    });

    const result = await processUnsubscribe({ db: db as never, secret: SECRET }, token);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.userId).toBe("user-direct-id");
    expect(calls.filter((c) => c.mode === "select").length).toBe(1);
    expect(calls.filter((c) => c.mode === "insert").length).toBe(1);
  });

  it("does not insert for unknown non-email identifiers", async () => {
    const token = buildUnsubscribeToken(SECRET, "organization-slug", "billing.payment-failed");
    const { db, calls } = createFakeDb({ selectResult: [], insertResult: [] });

    const result = await processUnsubscribe({ db: db as never, secret: SECRET }, token);

    expect(result).toEqual({
      ok: true,
      identifier: "organization-slug",
      category: "billing.payment-failed",
      userId: null,
    });
    expect(calls.filter((c) => c.mode === "insert").length).toBe(0);
  });
});
