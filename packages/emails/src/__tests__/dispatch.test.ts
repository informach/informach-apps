import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DispatchInput,
  dispatchEmail,
  type MemoryOutbox,
  type MemoryOutboxEntry,
  type SendFn,
} from "../dispatch";
import { createFakeDb } from "./_fake-db";

function createTestOutbox(): MemoryOutbox & { entries: MemoryOutboxEntry[] } {
  const entries: MemoryOutboxEntry[] = [];
  return {
    entries,
    push: (entry) => entries.push(entry),
    list: () => entries,
    clear: () => {
      entries.length = 0;
    },
  };
}

function makeInput(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    to: "user@example.com",
    subject: "Hello",
    text: "Body",
    html: "<p>Body</p>",
    category: "auth.verify-email",
    messageKey: `key-${Math.random().toString(36).slice(2)}`,
    unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=abc",
    unsubscribeMailto: "unsubscribe@example.com",
    userId: "user-1",
    ...overrides,
  };
}

describe("dispatchEmail validation", () => {
  it("requires html or text", async () => {
    const { db } = createFakeDb();
    const sendMock: SendFn = vi.fn();
    await expect(
      dispatchEmail(
        {
          db: db as never,
          defaultFrom: "noreply@example.com",
          mode: "live",
          sandboxDir: "./tmp",
          send: sendMock,
        },
        makeInput({ html: undefined, text: undefined }),
      ),
    ).rejects.toThrow(/html.*or.*text/);
  });
});

describe("dispatchEmail sandbox mode", () => {
  let sandboxDir: string;

  beforeEach(async () => {
    sandboxDir = await mkdtemp(join(tmpdir(), "informach-emails-"));
  });

  afterEach(async () => {
    await rm(sandboxDir, { recursive: true, force: true });
  });

  it("writes the message to disk and never calls send", async () => {
    const { db } = createFakeDb({
      insertResult: [{ id: "fake-id", status: "pending", sendAttempts: 0 }],
      updateResult: [{ id: "fake-id", status: "sending", sendAttempts: 1 }],
    });
    const sendMock: SendFn = vi.fn();

    const result = await dispatchEmail(
      {
        db: db as never,
        defaultFrom: "noreply@example.com",
        mode: "sandbox",
        sandboxDir,
        send: sendMock,
      },
      makeInput(),
    );

    expect(result).toEqual({ ok: true, status: "sent", deliveryId: "fake-id" });
    expect(sendMock).not.toHaveBeenCalled();

    const files = await readdir(sandboxDir);
    expect(files).toContain("fake-id.json");
    expect(files).toContain("fake-id.html");

    const meta = JSON.parse(await readFile(join(sandboxDir, "fake-id.json"), "utf8"));
    expect(meta.to).toBe("user@example.com");
    expect(meta.headers["List-Unsubscribe"]).toContain(
      "<https://app.example.com/api/email/unsubscribe?t=abc>",
    );
    expect(meta.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("returns already-sent if the same messageKey already has status=sent", async () => {
    const { db } = createFakeDb({
      insertResult: [], // INSERT ON CONFLICT DO NOTHING returns no rows
      selectResult: [{ id: "old-id", status: "sent", sendAttempts: 1 }],
    });
    const sendMock: SendFn = vi.fn();

    const result = await dispatchEmail(
      {
        db: db as never,
        defaultFrom: "noreply@example.com",
        mode: "sandbox",
        sandboxDir,
        send: sendMock,
      },
      makeInput(),
    );

    expect(result).toEqual({ ok: true, status: "already-sent", deliveryId: "old-id" });
  });

  it("returns skipped when claim returns no rows (raced by another process)", async () => {
    const { db } = createFakeDb({
      insertResult: [{ id: "fake-id", status: "pending", sendAttempts: 0 }],
      updateResult: [], // UPDATE matched 0 rows
    });
    const sendMock: SendFn = vi.fn();

    const result = await dispatchEmail(
      {
        db: db as never,
        defaultFrom: "noreply@example.com",
        mode: "sandbox",
        sandboxDir,
        send: sendMock,
      },
      makeInput(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe("skipped");
  });
});

describe("dispatchEmail live mode", () => {
  it("calls send with the right payload, headers and customArgs on success", async () => {
    const { db } = createFakeDb({
      insertResult: [{ id: "fake-id", status: "pending", sendAttempts: 0 }],
      updateResult: [{ id: "fake-id", status: "sending", sendAttempts: 1 }],
    });
    const send: SendFn = vi.fn().mockResolvedValue({ messageId: "mid-123" });

    const result = await dispatchEmail(
      {
        db: db as never,
        defaultFrom: "noreply@example.com",
        mode: "live",
        sandboxDir: "./tmp",
        send,
      },
      makeInput(),
    );

    expect(result).toEqual({ ok: true, status: "sent", deliveryId: "fake-id" });
    expect(send).toHaveBeenCalledTimes(1);
    const msg = (send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(msg.to).toBe("user@example.com");
    expect(msg.subject).toBe("Hello");
    expect((msg.headers as Record<string, string>)["List-Unsubscribe"]).toContain(
      "https://app.example.com/api/email/unsubscribe?t=abc",
    );
    expect((msg.headers as Record<string, string>)["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect((msg.customArgs as Record<string, string>).delivery_id).toBe("fake-id");
    expect((msg.customArgs as Record<string, string>).category).toBe("auth.verify-email");
    expect((msg.customArgs as Record<string, string>).user_id).toBe("user-1");
    expect(msg.categories).toEqual(["auth.verify-email"]);
  });

  it("does NOT retry on a permanent error and marks failed", async () => {
    const { db } = createFakeDb({
      insertResult: [{ id: "fake-id", status: "pending", sendAttempts: 0 }],
      updateResult: [{ id: "fake-id", status: "sending", sendAttempts: 1 }],
    });
    const sendError = Object.assign(new Error("rejected"), {
      response: { statusCode: 401 },
    });
    const send: SendFn = vi.fn().mockRejectedValue(sendError);

    const result = await dispatchEmail(
      {
        db: db as never,
        defaultFrom: "noreply@example.com",
        mode: "live",
        sandboxDir: "./tmp",
        send,
        sleep: async () => {},
      },
      makeInput(),
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("rejected");
  });

  it("retries up to inlineRetryAttempts times on transient errors and marks failed at the end", async () => {
    const { db } = createFakeDb({
      insertResult: [{ id: "fake-id", status: "pending", sendAttempts: 0 }],
      updateResult: [{ id: "fake-id", status: "sending", sendAttempts: 1 }],
    });
    const sendError = Object.assign(new Error("rate limit"), {
      response: { statusCode: 429 },
    });
    const send: SendFn = vi.fn().mockRejectedValue(sendError);

    const result = await dispatchEmail(
      {
        db: db as never,
        defaultFrom: "noreply@example.com",
        mode: "live",
        sandboxDir: "./tmp",
        send,
        sleep: async () => {},
        inlineRetryAttempts: 3,
      },
      makeInput(),
    );

    expect(send).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe("failed");
  });

  it("eventually succeeds when a transient error resolves on a later retry", async () => {
    const { db } = createFakeDb({
      insertResult: [{ id: "fake-id", status: "pending", sendAttempts: 0 }],
      updateResult: [{ id: "fake-id", status: "sending", sendAttempts: 1 }],
    });
    const transient = Object.assign(new Error("oops"), { response: { statusCode: 503 } });
    const send: SendFn = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ messageId: "mid-ok" });

    const result = await dispatchEmail(
      {
        db: db as never,
        defaultFrom: "noreply@example.com",
        mode: "live",
        sandboxDir: "./tmp",
        send,
        sleep: async () => {},
        inlineRetryAttempts: 3,
      },
      makeInput(),
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.status).toBe("sent");
  });
});

describe("dispatchEmail memory mode", () => {
  it("collects the message in the in-memory outbox and never calls send", async () => {
    const { db } = createFakeDb({
      insertResult: [{ id: "fake-id", status: "pending", sendAttempts: 0 }],
      updateResult: [{ id: "fake-id", status: "sending", sendAttempts: 1 }],
    });
    const sendMock: SendFn = vi.fn();
    const outbox = createTestOutbox();

    const result = await dispatchEmail(
      {
        db: db as never,
        defaultFrom: "noreply@example.com",
        mode: "memory",
        sandboxDir: "./tmp",
        send: sendMock,
        outbox,
      },
      makeInput(),
    );

    expect(result).toEqual({ ok: true, status: "sent", deliveryId: "fake-id" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(outbox.entries).toHaveLength(1);
    const entry = outbox.entries[0];
    expect(entry?.to).toBe("user@example.com");
    expect(entry?.category).toBe("auth.verify-email");
    expect(entry?.headers["List-Unsubscribe"]).toContain(
      "<https://app.example.com/api/email/unsubscribe?t=abc>",
    );
    expect(entry?.categories).toEqual(["auth.verify-email"]);
    expect(entry?.customArgs.delivery_id).toBe("fake-id");
  });
});
