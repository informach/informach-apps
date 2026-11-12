import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { safeContext, scrubEvent } from "./telemetry";

describe("telemetry privacy", () => {
  it("removes identities, learner content, cookies and SQL parameters before transport", () => {
    const event: ErrorEvent = {
      type: undefined,
      user: { email: "parent@example.test", ip_address: "1.2.3.4" },
      extra: { answer: "private student answer" },
      contexts: { form: { nickname: "private name" } },
      breadcrumbs: [{ message: "typed private answer" }],
      request: {
        url: "https://example.test/api/email/unsubscribe?t=private-token",
        data: "private body",
        cookies: { session: "secret" },
        headers: { authorization: "secret" },
      },
      exception: {
        values: [
          {
            value: "Failed query: insert values ($1) params: private-answer",
            stacktrace: {
              frames: [{ filename: "service.ts", lineno: 12, vars: { answer: "private-answer" } }],
            },
          },
        ],
      },
    };
    const result = scrubEvent(event);
    expect(JSON.stringify(result)).not.toMatch(/private|parent@|authorization|1\.2\.3\.4/);
    expect(result.exception?.values?.[0]?.stacktrace?.frames?.[0]?.lineno).toBe(12);
    expect(result.request?.url).toBe("https://example.test/api/email/unsubscribe");
  });
  it("keeps operational counters and opaque IDs while scrubbing nested secrets", () => {
    expect(
      safeContext({
        skipped: 2,
        subscriptionId: "sub_123",
        nested: { token: "secret", answer: "work" },
        error: new Error("Failed query: secret"),
      }),
    ).toEqual({
      skipped: 2,
      subscriptionId: "sub_123",
      nested: { token: "[redacted]", answer: "[redacted]" },
      error: { type: "Error", message: "Database operation failed (details withheld)" },
    });
  });
});
