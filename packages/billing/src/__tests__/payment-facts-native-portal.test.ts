import { PRODUCTS } from "@informach/config";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripePaymentFactReader, type NativePlanPortalPolicy } from "../payment-facts";

const policy: NativePlanPortalPolicy = {
  planUpdates: "application",
  app: "recreio",
  returnUrl: "https://recreio.example.test/conta/assinatura",
  termsUrl: "https://recreio.example.test/termos",
  privacyUrl: "https://recreio.example.test/privacidade",
};

/** Real Stripe SDK and HTTP decoding; transport stays inside the fixture. */
function fixture() {
  const products = PRODUCTS.filter((p) => p.app === "recreio").map((p) => ({
    ...p,
    stripePriceId: { dev: `price_${p.id}`, prod: "" },
  }));
  const prices = products.map((p) => ({
    id: p.stripePriceId.dev,
    active: true,
    livemode: false,
    type: "recurring",
    billing_scheme: "per_unit",
    unit_amount: p.listPrice?.amountCents,
    currency: "brl",
    recurring: { interval: p.interval, interval_count: 1 },
    product: `prod_${p.tier}`,
  }));
  const metadata = { app: "recreio" };
  const portal = {
    id: "bpc_recreio",
    active: true,
    livemode: false,
    metadata,
    default_return_url: policy.returnUrl,
    business_profile: {
      terms_of_service_url: policy.termsUrl,
      privacy_policy_url: policy.privacyUrl,
    },
    login_page: { enabled: false },
    features: {
      subscription_update: { enabled: false },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["name", "address", "email", "tax_id"] },
    },
  };
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    if (request.method !== "GET") throw new Error("Catalog verification must be read-only");
    let body: unknown;
    if (url.pathname.startsWith("/v1/prices/")) {
      body = prices.find((p) => p.id === url.pathname.split("/").pop());
    } else if (url.pathname.startsWith("/v1/products/")) {
      body = { id: url.pathname.split("/").pop(), active: true, metadata: { app: metadata.app } };
    } else if (url.pathname === "/v1/billing_portal/configurations/bpc_recreio") body = portal;
    else throw new Error(`Unexpected fixture request: ${url.pathname}`);
    if (!body) throw new Error("Fixture price absent");
    return Response.json(body, { headers: { "request-id": "req_catalog_fixture" } });
  };
  const client = new Stripe("sk_test_native_catalog_fixture", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  return {
    products,
    prices,
    portal,
    metadata,
    reader: createStripePaymentFactReader({ secretKey: "unused", client }),
  };
}
type Fixture = ReturnType<typeof fixture>;

describe("native plan management portal boundary", () => {
  it("accepts four approved prices in two products with plan changes kept in the app", async () => {
    const f = fixture();
    await expect(
      f.reader.verifyCatalog(f.products, "dev", "bpc_recreio", policy),
    ).resolves.toBeUndefined();
    await expect(f.reader.verifyCatalog(f.products, "dev", "bpc_recreio")).rejects.toThrow(
      "one product",
    );
  });
  const invalid: Array<[string, (f: Fixture) => void]> = [
    [
      "portal changes plans without native coverage selection",
      (f) => {
        f.portal.features.subscription_update.enabled = true;
      },
    ],
    [
      "immediate cancellation",
      (f) => {
        f.portal.features.subscription_cancel.mode = "immediately";
      },
    ],
    [
      "cancellation prorates",
      (f) => {
        f.portal.features.subscription_cancel.proration_behavior = "create_prorations";
      },
    ],
    [
      "cannot cancel",
      (f) => {
        f.portal.features.subscription_cancel.enabled = false;
      },
    ],
    [
      "public portal login",
      (f) => {
        f.portal.login_page.enabled = true;
      },
    ],
    [
      "another Stripe mode",
      (f) => {
        f.portal.livemode = true;
      },
    ],
    [
      "foreign return URL",
      (f) => {
        f.portal.default_return_url = "https://other.example.test/";
      },
    ],
    [
      "foreign terms",
      (f) => {
        f.portal.business_profile.terms_of_service_url = "https://other.example.test/termos";
      },
    ],
    [
      "foreign privacy",
      (f) => {
        f.portal.business_profile.privacy_policy_url = "https://other.example.test/privacy";
      },
    ],
    [
      "unnecessary customer fields",
      (f) => {
        f.portal.features.customer_update.allowed_updates.push("phone");
      },
    ],
    [
      "missing invoices",
      (f) => {
        f.portal.features.invoice_history.enabled = false;
      },
    ],
    [
      "missing payment methods",
      (f) => {
        f.portal.features.payment_method_update.enabled = false;
      },
    ],
  ];
  it.each(invalid)("refuses %s", async (_name, change) => {
    const f = fixture();
    change(f);
    await expect(f.reader.verifyCatalog(f.products, "dev", "bpc_recreio", policy)).rejects.toThrow(
      "native plan and coverage",
    );
  });
  it("rejects mixed app scope and wrong remote product ownership", async () => {
    const f = fixture();
    await expect(f.reader.verifyCatalog([], "dev", "bpc_recreio", policy)).rejects.toThrow("scope");
    await expect(
      f.reader.verifyCatalog(f.products, "dev", "bpc_recreio", { ...policy, app: "edi" }),
    ).rejects.toThrow("scope");
    f.metadata.app = "edi";
    await expect(f.reader.verifyCatalog(f.products, "dev", "bpc_recreio", policy)).rejects.toThrow(
      "approved offer",
    );
  });
  it("rejects changed price, currency or interval before opening the portal", async () => {
    for (const change of [
      (f: Fixture) => {
        for (const price of f.prices) price.unit_amount = 1;
      },
      (f: Fixture) => {
        for (const price of f.prices) price.currency = "usd";
      },
      (f: Fixture) => {
        for (const price of f.prices) price.recurring.interval_count = 2;
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(
        f.reader.verifyCatalog(f.products, "dev", "bpc_recreio", policy),
      ).rejects.toThrow("approved offer");
    }
  });
});
