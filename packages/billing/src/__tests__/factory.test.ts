import { describe, expect, it, vi } from "vitest";
import { createBillingService, type BillingServiceConfig } from "../index";
import { BillingError, WebhookSignatureError } from "../errors";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

function baseConfig(overrides: Partial<BillingServiceConfig> = {}): BillingServiceConfig {
  return {
    provider: "stripe",
    db: createFakeDb().db as never,
    appName: "test",
    publicAppUrl: "https://app.example.com",
    products: [],
    organizationsEnabled: false,
    stripeMode: "dev",
    resolveSubjectEmail: vi.fn(async () => "user@example.com"),
    ...overrides,
  };
}

describe("createBillingService", () => {
  it("throws when provider='stripe' and stripeSecretKey is missing without injected client", () => {
    expect(() => createBillingService(baseConfig())).toThrow(BillingError);
  });

  it("throws for an unknown provider when no providerClient is injected", () => {
    expect(() => createBillingService(baseConfig({ provider: "asaas" }))).toThrow(
      /asaas.*not implemented/,
    );
  });

  it("uses an injected providerClient (no Stripe SDK construction)", () => {
    const { provider } = createFakeProvider();
    const service = createBillingService(baseConfig({ providerClient: provider }));
    expect(service).toBeDefined();
    expect(typeof service.getOrCreateCustomer).toBe("function");
    expect(typeof service.createSubscriptionCheckout).toBe("function");
    expect(typeof service.createCreditPackCheckout).toBe("function");
    expect(typeof service.handleStripeEvent).toBe("function");
    expect(typeof service.verifyWebhookSignature).toBe("function");
  });

  it("delegates webhook verification to the provider", () => {
    const { provider } = createFakeProvider();
    const service = createBillingService(baseConfig({ providerClient: provider }));
    const event = service.verifyWebhookSignature("raw", "sig");
    expect(event.id).toBe("evt_test_1");
    expect(provider.verifyWebhookSignature).toHaveBeenCalledWith("raw", "sig");
  });

  it("propagates WebhookSignatureError from provider", () => {
    const { provider } = createFakeProvider({ failVerify: true });
    const service = createBillingService(baseConfig({ providerClient: provider }));
    expect(() => service.verifyWebhookSignature("raw", "sig")).toThrow(WebhookSignatureError);
  });
});
