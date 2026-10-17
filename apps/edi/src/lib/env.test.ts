import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { envSchema } from "./env";

describe("commercial environment", () => {
  const base = {
    BETTER_AUTH_SECRET: "a".repeat(32),
    CRON_SECRET: "b".repeat(32),
    EMAIL_SANDBOX_MODE: "memory",
  };
  it("allows isolated development without enabling billing", () => {
    expect(envSchema.parse(base).EDI_BILLING_ENABLED).toBe("false");
  });
  it("keeps telemetry optional locally and rejects malformed configured DSNs", () => {
    expect(envSchema.parse(base).SENTRY_DSN).toBe("");
    expect(
      envSchema.parse({ ...base, SENTRY_DSN: "https://public@example.invalid/1" }).SENTRY_DSN,
    ).toBe("https://public@example.invalid/1");
    expect(envSchema.safeParse({ ...base, SENTRY_DSN: "not-a-dsn" }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, SENTRY_DSN: "https://example.invalid" }).success).toBe(
      false,
    );
    expect(
      envSchema.safeParse({ ...base, SENTRY_DSN: "http://public@example.invalid/1" }).success,
    ).toBe(false);
  });
  it("rejects insecure production and incomplete billing", () => {
    expect(envSchema.safeParse({ ...base, NODE_ENV: "production" }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, EDI_BILLING_ENABLED: "true" }).success).toBe(false);
  });
  const production = {
    ...base,
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://edi.example.test",
    EMAIL_SANDBOX_MODE: "live",
    SENDGRID_API_KEY: "SG.test-fixture",
    EDI_LICENSE_KEY_ID: "ephemeral-test",
    EDI_LICENSE_PRIVATE_KEY: generateKeyPairSync("ed25519")
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
    EDI_DESKTOP_CLIENT_ID: "edi-desktop",
  };
  it("allows production preparation with billing disabled, but requires a real signing identity", () => {
    expect(envSchema.parse(production).EDI_BILLING_ENABLED).toBe("false");
    for (const changes of [
      { EDI_LICENSE_PRIVATE_KEY: "" },
      { EDI_LICENSE_PRIVATE_KEY: "not-a-private-key" },
      { EDI_LICENSE_KEY_ID: "" },
      { EDI_DESKTOP_CLIENT_ID: "edi-desktop-development" },
    ])
      expect(envSchema.safeParse({ ...production, ...changes }).success).toBe(false);
  });
  it("rejects mixed Stripe environments and missing or duplicated price IDs", () => {
    const billing = {
      ...production,
      EDI_BILLING_ENABLED: "true",
      STRIPE_MODE: "prod",
      STRIPE_SECRET_KEY: "rk_live_fixture",
      STRIPE_WEBHOOK_SECRET: "whsec_fixture",
      STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture",
      EDI_MONTHLY_PRICE_PROD: "price_monthly",
      EDI_ANNUAL_PRICE_PROD: "price_annual",
    };
    expect(envSchema.safeParse(billing).success).toBe(true);
    for (const changes of [
      { STRIPE_MODE: "dev", STRIPE_SECRET_KEY: "sk_test_fixture" },
      { STRIPE_SECRET_KEY: "sk_test_fixture" },
      { EDI_MONTHLY_PRICE_PROD: "" },
      { EDI_ANNUAL_PRICE_PROD: "price_monthly" },
    ])
      expect(envSchema.safeParse({ ...billing, ...changes }).success).toBe(false);
  });
  it("requires a canonical origin without credentials, path, query or trailing slash", () => {
    for (const value of [
      "not-a-url",
      "https://user:password@edi.example.test",
      "https://edi.example.test/path",
      "https://edi.example.test?x=1",
      "https://edi.example.test/",
    ])
      expect(envSchema.safeParse({ ...base, NEXT_PUBLIC_APP_URL: value }).success).toBe(false);
  });
});
