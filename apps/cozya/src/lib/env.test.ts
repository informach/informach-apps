import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
};

function stubEnv(overrides: Partial<Record<keyof typeof requiredEnv | "REDIS_URL", string>>) {
  for (const [key, value] of Object.entries({ ...requiredEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

describe("env", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("requires REDIS_URL in production", async () => {
    stubEnv({ NODE_ENV: "production", REDIS_URL: "" });

    await expect(import("./env")).rejects.toThrow(
      "REDIS_URL is required when NODE_ENV=production",
    );
  });

  it("allows missing REDIS_URL outside production", async () => {
    stubEnv({ NODE_ENV: "test", REDIS_URL: "" });

    const { env } = await import("./env");

    expect(env.REDIS_URL).toBeUndefined();
  });
});
