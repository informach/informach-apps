import { describe, expect, it } from "vitest";
import { readAccountEnvironment } from "./environment";

const local = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "http://localhost:3011",
  BETTER_AUTH_SECRET: "a".repeat(32),
  COMPASSO_TRIAL_HASH_SECRET: "b".repeat(32),
  EMAIL_SANDBOX_MODE: "memory",
};
describe("account deployment configuration", () => {
  it("reads only the legacy deployment price variables registered by the shared catalog", () => {
    const env = readAccountEnvironment({
      ...local,
      MISSAO_FAMILY_MONTHLY_PRICE: "price_legacy",
      UNRELATED_KEY: "private",
    });
    expect(env.legacyPrices.MISSAO_FAMILY_MONTHLY_PRICE).toBe("price_legacy");
    expect(env.legacyPrices).not.toHaveProperty("UNRELATED_KEY");
  });
  it("rejects a short configured job secret even before enabling billing", () => {
    expect(() => readAccountEnvironment({ ...local, CRON_SECRET: "short" })).toThrow();
    expect(
      readAccountEnvironment({ ...local, CRON_SECRET: "c".repeat(32) }).CRON_SECRET,
    ).toHaveLength(32);
  });
  it("keeps optimized local builds on the registered local issuer", () => {
    expect(readAccountEnvironment(local)).toMatchObject({
      environment: "development",
      origin: "http://localhost:3011",
    });
  });
  it.each([
    undefined,
    "http://localhost:3006",
    "https://conta.informach.com.br.evil.test",
    "https://conta.informach.com.br/",
  ])("rejects an unregistered origin %s", (origin) => {
    expect(() => readAccountEnvironment({ ...local, NEXT_PUBLIC_APP_URL: origin })).toThrow();
  });
  it("requires live email for the public issuer, independently of compilation mode", () => {
    for (const NODE_ENV of ["development", "production"]) {
      const publicDeployment = {
        ...local,
        NODE_ENV,
        NEXT_PUBLIC_APP_URL: "https://conta.informach.com.br",
      };
      expect(() => readAccountEnvironment(publicDeployment)).toThrow();
      expect(
        readAccountEnvironment({
          ...publicDeployment,
          EMAIL_SANDBOX_MODE: "live",
          SENDGRID_API_KEY: "SG.synthetic_fixture",
        }).environment,
      ).toBe("production");
    }
  });
  it("never enables live Stripe on an optimized localhost build", () => {
    expect(() =>
      readAccountEnvironment({
        ...local,
        COMPASSO_BILLING_ENABLED: "true",
        STRIPE_MODE: "prod",
        STRIPE_SECRET_KEY: "sk_live_synthetic_fixture",
        STRIPE_WEBHOOK_SECRET: "whsec_synthetic_fixture",
        STRIPE_PORTAL_CONFIGURATION_ID: "bpc_synthetic_fixture",
        CRON_SECRET: "c".repeat(32),
      }),
    ).toThrow();
  });
  it("allows test maintenance with sales off but still rejects live or mismatched credentials locally", () => {
    expect(
      readAccountEnvironment({
        ...local,
        STRIPE_SECRET_KEY: "sk_test_synthetic_fixture",
        STRIPE_WEBHOOK_SECRET: "whsec_synthetic_fixture",
      }),
    ).toMatchObject({ COMPASSO_BILLING_ENABLED: false });
    expect(() =>
      readAccountEnvironment({
        ...local,
        STRIPE_MODE: "prod",
        STRIPE_SECRET_KEY: "sk_live_synthetic_fixture",
      }),
    ).toThrow();
    expect(() =>
      readAccountEnvironment({
        ...local,
        STRIPE_MODE: "dev",
        STRIPE_SECRET_KEY: "sk_live_synthetic_fixture",
      }),
    ).toThrow();
    // Restricted keys, as the production services use, follow the same mode rule.
    expect(
      readAccountEnvironment({
        ...local,
        STRIPE_SECRET_KEY: "rk_test_synthetic_fixture",
        STRIPE_WEBHOOK_SECRET: "whsec_synthetic_fixture",
      }),
    ).toMatchObject({ STRIPE_SECRET_KEY: "rk_test_synthetic_fixture" });
    expect(() =>
      readAccountEnvironment({
        ...local,
        STRIPE_MODE: "dev",
        STRIPE_SECRET_KEY: "rk_live_synthetic_fixture",
      }),
    ).toThrow();
    expect(() =>
      readAccountEnvironment({
        ...local,
        STRIPE_SECRET_KEY: "sk_test_synthetic_fixture",
        STRIPE_WEBHOOK_SECRET: "invalid",
      }),
    ).toThrow();
  });
});
