import { describe, expect, it } from "vitest";
import { parseSendgridWebhookPayload } from "../sendgrid-webhook";

describe("parseSendgridWebhookPayload", () => {
  it("accepts valid SendGrid event arrays and keeps extra provider fields", () => {
    const parsed = parseSendgridWebhookPayload(
      Buffer.from(
        JSON.stringify([
          {
            email: "user@example.com",
            event: "delivered",
            timestamp: 1_700_000_000,
            sg_event_id: "provider-extra-field",
          },
        ]),
      ),
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.events[0]?.event).toBe("delivered");
      expect(parsed.events[0]).toHaveProperty("sg_event_id", "provider-extra-field");
    }
  });

  it("rejects invalid JSON", () => {
    const parsed = parseSendgridWebhookPayload(Buffer.from("{"));

    expect(parsed).toEqual({ ok: false, reason: "invalid-json" });
  });

  it("rejects payloads that are not SendGrid event arrays", () => {
    const parsed = parseSendgridWebhookPayload(
      Buffer.from(JSON.stringify([{ event: "delivered", timestamp: 1_700_000_000 }])),
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toBe("invalid-schema");
    }
  });
});
