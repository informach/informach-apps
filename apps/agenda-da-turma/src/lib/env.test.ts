import { afterEach, beforeEach, expect, it, vi } from "vitest";

const requiredEnv = {
  DATABASE_URL: "postgres://informach:informach@localhost:5432/informach",
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3001",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3001",
  SENDGRID_API_KEY: "sendgrid-key",
  SENDGRID_FROM: "no-reply@example.com",
  CRON_SECRET: "c".repeat(32),
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  OPENROUTER_API_KEY: "sk-or-test",
};

type EnvKey =
  | keyof typeof requiredEnv
  | "RAILWAY_ENVIRONMENT_ID"
  | "REDIS_URL"
  | "E2E_RELAX_AUTH_RATE_LIMITS"
  | "OPENROUTER_HTTP_REFERER"
  | "OPENROUTER_X_TITLE"
  | "MASTRA_LOG_LEVEL"
  | "CSP_ENFORCE";

function stubEnv(overrides: Partial<Record<EnvKey, string>>) {
  for (const [key, value] of Object.entries({ ...requiredEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

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

  await expect(import("./env")).rejects.toThrow("REDIS_URL is required when NODE_ENV=production");
});

it("requires HTTPS app URLs in production", async () => {
  stubEnv({
    NODE_ENV: "production",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_URL: "http://agenda-da-turma.informach.com.br",
    NEXT_PUBLIC_APP_URL: "https://agenda-da-turma.informach.com.br",
  });

  await expect(import("./env")).rejects.toThrow(
    "BETTER_AUTH_URL must equal the registered NEXT_PUBLIC_APP_URL origin",
  );
});

it("requires matching auth and public app origins in production", async () => {
  stubEnv({
    NODE_ENV: "production",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_URL: "https://auth.informach.com.br",
    NEXT_PUBLIC_APP_URL: "https://agenda-da-turma.informach.com.br",
  });

  await expect(import("./env")).rejects.toThrow(
    "BETTER_AUTH_URL must equal the registered NEXT_PUBLIC_APP_URL origin",
  );
});

it("allows missing REDIS_URL outside production", async () => {
  stubEnv({ NODE_ENV: "test", REDIS_URL: "" });

  const { env } = await import("./env");

  expect(env.REDIS_URL).toBeUndefined();
});

it("defaults CSP to report-only outside production", async () => {
  stubEnv({ CSP_ENFORCE: "", NODE_ENV: "test" });

  const { env } = await import("./env");

  expect(env.CSP_ENFORCE).toBe("0");
});

it("defaults CSP to enforce in production", async () => {
  stubEnv({
    BETTER_AUTH_URL: "https://agenda-da-turma.informach.com.br",
    CSP_ENFORCE: "",
    NEXT_PUBLIC_APP_URL: "https://agenda-da-turma.informach.com.br",
    NODE_ENV: "production",
    REDIS_URL: "redis://localhost:6379",
  });

  const { env } = await import("./env");

  expect(env.CSP_ENFORCE).toBe("1");
});

it("allows explicit CSP report-only in production", async () => {
  stubEnv({
    BETTER_AUTH_URL: "https://agenda-da-turma.informach.com.br",
    CSP_ENFORCE: "0",
    NEXT_PUBLIC_APP_URL: "https://agenda-da-turma.informach.com.br",
    NODE_ENV: "production",
    REDIS_URL: "redis://localhost:6379",
  });

  const { env } = await import("./env");

  expect(env.CSP_ENFORCE).toBe("0");
});

it("supports optimized localhost builds with full Redis and CSP enforcement", async () => {
  stubEnv({ NODE_ENV: "production", REDIS_URL: "redis://localhost:6379", CSP_ENFORCE: "" });
  const { env } = await import("./env");
  expect(env.CSP_ENFORCE).toBe("1");
});
it("refuses localhost configuration on Railway", async () => {
  stubEnv({
    NODE_ENV: "production",
    REDIS_URL: "redis://localhost:6379",
    RAILWAY_ENVIRONMENT_ID: "synthetic",
  });
  await expect(import("./env")).rejects.toThrow("Railway deployment must use");
});
it.each([
  "http://agenda-da-turma.informach.com.br",
  "https://example.test",
  "http://localhost:9999",
  "http://localhost:3001/path",
])("refuses an unregistered origin: %s", async (origin) => {
  stubEnv({
    NODE_ENV: "production",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_URL: origin,
    NEXT_PUBLIC_APP_URL: origin,
  });
  await expect(import("./env")).rejects.toThrow("exact registered application origin");
});
