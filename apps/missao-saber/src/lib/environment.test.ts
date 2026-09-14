import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment";

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3005",
  NEXT_PUBLIC_APP_URL: "http://localhost:3005",
  SENDGRID_API_KEY: "SG.test",
  SENDGRID_FROM: "test@example.test",
  EMAIL_SANDBOX_MODE: "memory",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  STRIPE_MODE: "dev",
  CRON_SECRET: "test-cron-with-at-least-32-characters",
};
const production: NodeJS.ProcessEnv = {
  ...base,
  BETTER_AUTH_URL: "https://missao.example.test",
  NEXT_PUBLIC_APP_URL: "https://missao.example.test",
  STRIPE_SECRET_KEY: "rk_live_fixture",
  STRIPE_MODE: "prod",
  EMAIL_SANDBOX_MODE: "live",
  REDIS_URL: "redis://localhost:6379",
  SENTRY_DSN: "https://key@example.test/1",
  NEXT_PUBLIC_SENTRY_DSN: "https://key@example.test/1",
  SENDGRID_WEBHOOK_PUBLIC_KEY: "public-key",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture",
  MISSAO_INDIVIDUAL_MONTHLY_PRICE: "price_1",
  MISSAO_INDIVIDUAL_ANNUAL_PRICE: "price_2",
  MISSAO_FAMILY_MONTHLY_PRICE: "price_3",
  MISSAO_FAMILY_ANNUAL_PRICE: "price_4",
};
describe("deployment environment", () => {
  it("allows local production builds with Stripe test and requires matching key modes", () => {
    expect(validateEnvironment(base).STRIPE_MODE).toBe("dev");
    expect(() => validateEnvironment({ ...base, STRIPE_SECRET_KEY: "sk_live_fixture" })).toThrow(
      "test Stripe",
    );
  });
  it("accepts restricted live keys with complete production dependencies", () => {
    expect(validateEnvironment(production).STRIPE_MODE).toBe("prod");
  });
  it.each([
    { EMAIL_SANDBOX_MODE: "sandbox" },
    { REDIS_URL: undefined },
    { SENDGRID_WEBHOOK_PUBLIC_KEY: "" },
    { NEXT_PUBLIC_SENTRY_DSN: undefined },
    { STRIPE_PORTAL_CONFIGURATION_ID: "" },
    { MISSAO_FAMILY_ANNUAL_PRICE: "price_TODO" },
    { MISSAO_ISOLATED_TEST: "1" },
    { BETTER_AUTH_URL: "https://different.example.test" },
    { STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_MODE: "dev" },
  ])("rejects incomplete or mixed production configuration (%j)", (override) => {
    expect(() => validateEnvironment({ ...production, ...override })).toThrow();
  });
  it("rejects localhost deployment even if an isolated-test flag is set", () => {
    expect(() =>
      validateEnvironment({
        ...base,
        RAILWAY_ENVIRONMENT_ID: "production",
        MISSAO_ISOLATED_TEST: "1",
      }),
    ).toThrow();
  });
  it("never includes rejected credentials in validation errors", () => {
    expect(() => validateEnvironment({ ...base, STRIPE_SECRET_KEY: "sensitive-value" })).toThrow(
      "STRIPE_SECRET_KEY",
    );
    try {
      validateEnvironment({ ...base, STRIPE_SECRET_KEY: "sensitive-value" });
    } catch (error) {
      expect(String(error)).not.toContain("sensitive-value");
    }
  });
});
