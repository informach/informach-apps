import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentry-scrub";

describe("scrubSentryEvent", () => {
  it("removes bearer calendar links, invitation tokens and SQL parameters", async () => {
    const token = "a".repeat(64);
    const result = await scrubSentryEvent({
      type: undefined,
      request: { url: `https://example.com/api/calendario/${token}` },
      breadcrumbs: [{ data: { url: `https://example.com/familia/convite?token=${token}` } }],
      exception: {
        values: [{ value: "Failed query: insert notice params: private school content" }],
      },
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain("private school content");
  });
  it("hashes emails and removes request PII before sending to Sentry", async () => {
    const event: ErrorEvent = {
      type: undefined,
      user: {
        email: "User@Example.com",
      },
      request: {
        cookies: {
          session: "secret-session",
        },
        headers: {
          Authorization: "Bearer token",
          cookie: "session=abc",
        },
        data: {
          email: "user@example.com",
          password: "secret",
        },
      },
      message: "Failed login for USER@example.com",
      exception: {
        values: [
          {
            type: "Error",
            value: "Could not reset user@example.com",
          },
        ],
      },
    };

    const result = await scrubSentryEvent(event);
    const hashedEmail = result?.user?.email;

    expect(result).toBe(event);
    expect(hashedEmail).toMatch(/^email_[a-f0-9]{12}$/);
    expect(result?.message).toBe(`Failed login for ${hashedEmail}`);
    expect(result?.exception?.values?.[0]?.value).toBe(`Could not reset ${hashedEmail}`);
    expect(result?.request?.cookies).toBeUndefined();
    expect(result?.request?.headers?.cookie).toBe("[Filtered]");
    expect(result?.request?.headers?.Authorization).toBe("[Filtered]");
    expect(result?.request?.data).toBe("[Filtered]");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("User@Example.com");
    expect(serialized).not.toContain("USER@example.com");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("Bearer token");
    expect(serialized).not.toContain("session=abc");
    expect(serialized).not.toContain("secret-session");
    expect(serialized).not.toContain("secret");
  });
});
