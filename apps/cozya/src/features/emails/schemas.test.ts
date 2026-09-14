import { describe, expect, it } from "vitest";
import { parseSendgridEventsPayload } from "./schemas";

describe("parseSendgridEventsPayload", () => {
  it("accepts provider category arrays and preserves the separate custom argument", () => {
    const event = {
      email: "user@example.com",
      event: "group_unsubscribe",
      timestamp: 1,
      category: ["billing.payment-failed"],
      informach_category: "billing.payment-failed",
    };
    expect(parseSendgridEventsPayload([event])).toEqual({ ok: true, events: [event] });
  });
  it("accepts valid SendGrid event payloads", () => {
    const result = parseSendgridEventsPayload([
      {
        email: "user@example.com",
        event: "delivered",
        timestamp: 1_735_689_600,
        sg_message_id: "sendgrid-message-id",
        delivery_id: "delivery-id",
        category: "auth.sign-in",
        user_id: "user-id",
      },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.email).toBe("user@example.com");
    }
  });

  it("rejects malformed or empty payloads", () => {
    expect(parseSendgridEventsPayload([]).ok).toBe(false);
    expect(parseSendgridEventsPayload([{ event: "delivered", timestamp: 1 }]).ok).toBe(false);
    expect(parseSendgridEventsPayload({ email: "user@example.com" }).ok).toBe(false);
  });
});
