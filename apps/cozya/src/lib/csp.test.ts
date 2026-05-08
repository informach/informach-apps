import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requiredEnv = {
  DATABASE_URL: "postgres://informach:informach@localhost:5432/informach",
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3002",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3002",
  SENDGRID_API_KEY: "sendgrid-key",
  SENDGRID_FROM: "no-reply@example.com",
  CRON_SECRET: "c".repeat(32),
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  OPENROUTER_API_KEY: "sk-or-test-123",
};

function stubEnv() {
  for (const [key, value] of Object.entries(requiredEnv)) {
    vi.stubEnv(key, value);
  }
}

describe("shouldSkipCsp", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    stubEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not skip the unsubscribe endpoint because GET renders HTML", async () => {
    const { shouldSkipCsp } = await import("./csp");

    expect(shouldSkipCsp("/api/email/unsubscribe")).toBe(false);
    expect(shouldSkipCsp("/api/email/unsubscribe/confirm")).toBe(false);
  });

  it("still skips server-to-server endpoints", async () => {
    const { shouldSkipCsp } = await import("./csp");

    expect(shouldSkipCsp("/api/webhooks/stripe")).toBe(true);
    expect(shouldSkipCsp("/api/jobs/digest")).toBe(true);
    expect(shouldSkipCsp("/api/health")).toBe(true);
  });
});
