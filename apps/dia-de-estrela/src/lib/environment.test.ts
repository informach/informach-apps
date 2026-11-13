import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment";

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3008",
  NEXT_PUBLIC_APP_URL: "http://localhost:3008",
  SENDGRID_API_KEY: "SG.test",
  SENDGRID_FROM: "test@example.test",
  EMAIL_SANDBOX_MODE: "memory",
  CRON_SECRET: "test-cron-with-at-least-32-characters",
};
const production: NodeJS.ProcessEnv = {
  ...base,
  BETTER_AUTH_URL: "https://estrela.example.test",
  NEXT_PUBLIC_APP_URL: "https://estrela.example.test",
  EMAIL_SANDBOX_MODE: "live",
  REDIS_URL: "redis://localhost:6379",
  SENTRY_DSN: "https://key@example.test/1",
  NEXT_PUBLIC_SENTRY_DSN: "https://key@example.test/1",
  SENDGRID_WEBHOOK_PUBLIC_KEY: "public-key",
  VAPID_PUBLIC_KEY: "public-vapid",
  VAPID_PRIVATE_KEY: "private-vapid",
};
describe("deployment environment", () => {
  it("treats empty optional variables as unset, while preserving required provider validation", () => {
    const local = validateEnvironment({
      ...base,
      REDIS_URL: "",
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
    });
    expect(local.REDIS_URL).toBeUndefined();
    expect(local.SENTRY_DSN).toBeUndefined();
    expect(() => validateEnvironment({ ...base, DATABASE_URL: "" })).toThrow("DATABASE_URL");
  });
  it("accepts a complete production configuration without payment credentials", () => {
    expect(validateEnvironment(production).EMAIL_SANDBOX_MODE).toBe("live");
    expect(
      Object.keys(validateEnvironment(production)).some((name) => name.startsWith("STRIPE")),
    ).toBe(false);
  });
  it.each([
    { EMAIL_SANDBOX_MODE: "sandbox" },
    { REDIS_URL: undefined },
    { SENDGRID_WEBHOOK_PUBLIC_KEY: "" },
    { NEXT_PUBLIC_SENTRY_DSN: undefined },
    { COMPASSO_ISOLATED_DATABASE: "1" },
    { VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" },
    { VAPID_PRIVATE_KEY: "" },
    { BETTER_AUTH_URL: "https://different.example.test" },
  ])("rejects incomplete or mixed production configuration (%j)", (override) => {
    expect(() => validateEnvironment({ ...production, ...override })).toThrow();
  });
  it("rejects localhost deployment even if an isolated-test flag is set", () => {
    expect(() =>
      validateEnvironment({
        ...base,
        RAILWAY_ENVIRONMENT_ID: "production",
        COMPASSO_ISOLATED_DATABASE: "1",
      }),
    ).toThrow();
  });
  it("never includes rejected credentials in validation errors", () => {
    expect(() => validateEnvironment({ ...base, BETTER_AUTH_SECRET: "sensitive" })).toThrow(
      "BETTER_AUTH_SECRET",
    );
    try {
      validateEnvironment({ ...base, BETTER_AUTH_SECRET: "sensitive" });
    } catch (error) {
      expect(String(error)).not.toContain("sensitive");
    }
  });
});
