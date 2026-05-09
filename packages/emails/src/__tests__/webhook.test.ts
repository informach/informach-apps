import { describe, expect, it, vi } from "vitest";
import {
  handleSendgridEvent,
  handleSendgridEvents,
  type SendgridEvent,
  verifySendgridSignature,
} from "../webhook";
import { createFakeDb } from "./_fake-db";

function makeEvent(overrides: Partial<SendgridEvent>): SendgridEvent {
  return {
    email: "user@example.com",
    event: "delivered",
    timestamp: 1700000000,
    sg_message_id: "msg-id-123",
    delivery_id: "delivery-1",
    ...overrides,
  };
}

describe("verifySendgridSignature", () => {
  it("returns true for a valid signed SendGrid payload", () => {
    const publicKey =
      "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE83T4O/n84iotIvIW4mdBgQ/7dAfSmpqIM8kF9mN1flpVKS3GRqe62gw+2fNNRaINXvVpiglSI8eNEc6wEA3F+g==";
    const signature =
      "MEUCIGHQVtGj+Y3LkG9fLcxf3qfI10QysgDWmMOVmxG0u6ZUAiEAyBiXDWzM+uOe5W0JuG+luQAbPIqHh89M15TluLtEZtM=";
    const timestamp = "1600112502";
    const payload = `${JSON.stringify([
      {
        email: "hello@world.com",
        event: "dropped",
        reason: "Bounced Address",
        sg_event_id: "ZHJvcC0xMDk5NDkxOS1MUnpYbF9OSFN0T0doUTRrb2ZTbV9BLTA",
        sg_message_id: "LRzXl_NHStOGhQ4kofSm_A.filterdrecv-p3mdw1-756b745b58-kmzbl-18-5F5FC76C-9.0",
        "smtp-id": "<LRzXl_NHStOGhQ4kofSm_A@ismtpd0039p1iad1.sendgrid.net>",
        timestamp: 1600112492,
      },
    ])}\r\n`;

    expect(verifySendgridSignature(publicKey, Buffer.from(payload), signature, timestamp)).toBe(
      true,
    );
  });

  it("returns false when signature is missing", () => {
    expect(verifySendgridSignature("PUBKEY", Buffer.from("body"), null, "1700000000")).toBe(false);
  });
  it("returns false when timestamp is missing", () => {
    expect(verifySendgridSignature("PUBKEY", Buffer.from("body"), "sig", null)).toBe(false);
  });
  it("returns false when public key is empty", () => {
    expect(verifySendgridSignature("", Buffer.from("body"), "sig", "1700000000")).toBe(false);
  });
  it("returns false when ECDSA conversion or verification fails (does not throw)", () => {
    expect(verifySendgridSignature("not-a-valid-pubkey", Buffer.from("body"), "sig", "ts")).toBe(
      false,
    );
  });
});

describe("handleSendgridEvent", () => {
  it("marks bounced and inserts a suppression on `bounce`", async () => {
    const { db, calls } = createFakeDb({
      selectQueue: [[{ id: "delivery-1", category: "auth.verify-email" }]],
      updateResult: [],
      insertResult: [],
    });
    const onAudit = vi.fn();
    await handleSendgridEvent(
      { db: db as never, onAudit },
      makeEvent({ event: "bounce", reason: "550 mailbox full" }),
    );
    expect(calls.some((c) => c.mode === "update")).toBe(true);
    expect(calls.some((c) => c.mode === "insert")).toBe(true);
    expect(onAudit).toHaveBeenCalledWith({
      eventType: "email.suppression_recorded",
      actorId: null,
      payload: {
        emailHash: expect.any(String),
        emailDomain: "example.com",
        deliveryId: "delivery-1",
        category: "auth.verify-email",
        providerEvent: "bounce",
        reason: "550 mailbox full",
        source: "sendgrid",
      },
    });
    expect(JSON.stringify(onAudit.mock.calls[0]?.[0])).not.toContain("user@example.com");
  });

  it("marks dropped and inserts a suppression on `dropped`", async () => {
    const { db, calls } = createFakeDb({
      selectQueue: [[{ id: "delivery-1" }]],
      updateResult: [],
      insertResult: [],
    });
    await handleSendgridEvent({ db: db as never }, makeEvent({ event: "dropped" }));
    expect(calls.filter((c) => c.mode === "update").length).toBe(1);
    expect(calls.filter((c) => c.mode === "insert").length).toBe(1);
  });

  it("marks complained and inserts a suppression on `spamreport`", async () => {
    const { db, calls } = createFakeDb({
      selectQueue: [[{ id: "delivery-1" }]],
      updateResult: [],
      insertResult: [],
    });
    await handleSendgridEvent({ db: db as never }, makeEvent({ event: "spamreport" }));
    expect(calls.filter((c) => c.mode === "insert").length).toBe(1);
  });

  it("logs a warning on `deferred` and does not touch the DB", async () => {
    const { db, calls } = createFakeDb({ selectQueue: [[{ id: "delivery-1" }]] });
    const warn = vi.fn();
    await handleSendgridEvent(
      { db: db as never, logger: { warn } },
      makeEvent({ event: "deferred" }),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    const logContext = warn.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(logContext.emailDomain).toBe("example.com");
    expect(logContext.emailHash).toEqual(expect.any(String));
    expect(JSON.stringify(logContext)).not.toContain("user@example.com");
    expect(calls.some((c) => c.mode === "update")).toBe(false);
    expect(calls.some((c) => c.mode === "insert")).toBe(false);
  });

  it("inserts an email_unsubscribes row when a user is found by email", async () => {
    // findDelivery returns null (no delivery_id, no sg_message_id), then user lookup hits.
    const { db, calls } = createFakeDb({
      selectResult: [{ id: "user-77" }],
      insertResult: [],
    });
    await handleSendgridEvent(
      { db: db as never },
      makeEvent({
        event: "unsubscribe",
        email: "user@example.com",
        delivery_id: undefined,
        sg_message_id: undefined,
        category: "marketing.weekly",
      }),
    );
    expect(calls.filter((c) => c.mode === "insert").length).toBe(1);
  });

  it("ignores unknown event types", async () => {
    const { db, calls } = createFakeDb({ selectQueue: [[{ id: "delivery-1" }]] });
    await handleSendgridEvent({ db: db as never }, makeEvent({ event: "weird-future-event" }));
    expect(calls.filter((c) => c.mode === "update").length).toBe(0);
    expect(calls.filter((c) => c.mode === "insert").length).toBe(0);
  });
});

describe("handleSendgridEvents", () => {
  it("aggregates processed and failed counts and continues past errors", async () => {
    const { db } = createFakeDb({
      selectQueue: [[{ id: "d1" }], [{ id: "d2" }], [{ id: "d3" }]],
      updateResult: [],
      insertResult: [],
    });

    const events: SendgridEvent[] = [
      makeEvent({ event: "delivered", delivery_id: "d1" }),
      makeEvent({ event: "bounce", delivery_id: "d2" }),
      makeEvent({ event: "spamreport", delivery_id: "d3" }),
    ];

    const result = await handleSendgridEvents({ db: db as never }, events);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("counts a thrown handler as failed and keeps going", async () => {
    let calls = 0;
    const failingDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              calls += 1;
              if (calls === 1) {
                return Promise.reject(new Error("boom"));
              }
              return Promise.resolve([{ id: "d2" }]);
            }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => Promise.resolve([])),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      })),
    };

    const events: SendgridEvent[] = [
      makeEvent({ event: "delivered", delivery_id: "d1" }),
      makeEvent({ event: "delivered", delivery_id: "d2" }),
    ];
    const error = vi.fn();
    const result = await handleSendgridEvents(
      { db: failingDb as never, logger: { error } },
      events,
    );
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(error).toHaveBeenCalled();
    const logContext = error.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(logContext.emailDomain).toBe("example.com");
    expect(logContext.emailHash).toEqual(expect.any(String));
    expect(JSON.stringify(logContext)).not.toContain("user@example.com");
  });
});
