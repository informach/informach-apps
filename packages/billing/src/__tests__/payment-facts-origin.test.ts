import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { createStripePaymentFactReader } from "../payment-facts";

/** Real SDK decoding, closed fixture HTTP; no invoice or external payment. */
function fixture(aposLeitura?: (path: string) => void) {
  const subscription = {
    id: "sub_origin",
    object: "subscription",
    customer: "cus_origin",
    livemode: false,
    status: "active",
    metadata: {
      checkout_intent_id: "621e284a-4dd7-44be-8aa2-fd6ddd3b925f",
      subject_type: "user",
      subject_id: "payer_origin",
      product_id: "recreio_individual_monthly",
    },
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: null,
    canceled_at: null,
    items: {
      has_more: false,
      data: [
        {
          id: "si_origin",
          quantity: 1,
          price: { id: "price_origin" },
          current_period_start: 1794225600,
          current_period_end: 1796817600,
        },
      ],
    },
  };
  let invoiceMode = false,
    invoices = false;
  const paths: string[] = [];
  const list = (data: unknown[]) => ({ object: "list", data, has_more: false, url: "/fixture" });
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    if (request.method !== "GET") throw new Error("Reader may only use GET");
    paths.push(url.pathname);
    aposLeitura?.(url.pathname);
    let body: unknown;
    if (url.pathname === "/v1/subscriptions/sub_origin") body = subscription;
    else if (url.pathname === "/v1/subscriptions") body = list([subscription]);
    else if (url.pathname === "/v1/invoices")
      body = list(invoices ? [{ id: "in_mode", livemode: invoiceMode }] : []);
    else throw new Error("Unexpected financial fixture request");
    return Response.json(body, { headers: { "request-id": "req_origin_fixture" } });
  };
  const client = new Stripe("sk_test_origin_fixture", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const reader = createStripePaymentFactReader({
    secretKey: "unused",
    client,
    expectedMode: "dev",
  });
  return {
    subscription,
    paths,
    reader,
    usarFaturaLive: () => {
      invoices = true;
      invoiceMode = true;
    },
  };
}

describe("financial mode and native purchase origin", () => {
  it("returns the exact server-created origin, with no invented paid period", async () => {
    const f = fixture(),
      snapshot = await f.reader.read("sub_origin", new Set(["price_origin"]));
    expect(snapshot?.origin).toEqual({
      authorizationId: f.subscription.metadata.checkout_intent_id,
      subjectType: "user",
      subjectId: "payer_origin",
      productId: "recreio_individual_monthly",
    });
    expect(snapshot?.periods).toEqual([]);
    expect(await f.reader.listSubscriptionIds("cus_origin")).toEqual(["sub_origin"]);
  });
  it("missing metadata does not fabricate native consent", async () => {
    const f = fixture();
    f.subscription.metadata.checkout_intent_id = "";
    expect((await f.reader.read("sub_origin", new Set(["price_origin"])))?.origin).toBeUndefined();
  });
  it("rejects a foreign mode before reading invoices and in the full contract list", async () => {
    const f = fixture();
    f.subscription.livemode = true;
    await expect(f.reader.read("sub_origin", new Set(["price_origin"]))).rejects.toThrow(
      "another Stripe mode",
    );
    expect(f.paths).not.toContain("/v1/invoices");
    await expect(f.reader.listSubscriptionIds("cus_origin")).rejects.toThrow("another Stripe mode");
  });
  it("rejects an invoice from the other mode before settlement reads", async () => {
    const f = fixture();
    f.usarFaturaLive();
    await expect(f.reader.read("sub_origin", new Set(["price_origin"]))).rejects.toThrow(
      "another Stripe mode",
    );
    expect(f.paths).not.toContain("/v1/invoice_payments");
  });
  it("refuses an expired worker budget before sending a provider request", async () => {
    const f = fixture(),
      budget = { deadlineMs: Date.now() - 1 };
    await expect(f.reader.read("sub_origin", new Set(["price_origin"]), budget)).rejects.toThrow(
      "deadline exceeded",
    );
    await expect(f.reader.listSubscriptionIds("cus_origin", budget)).rejects.toThrow(
      "deadline exceeded",
    );
    expect(f.paths).toEqual([]);
  });
  it("does not continue to invoices after the subscription read exhausts the budget", async () => {
    const inicio = Date.now(),
      relogio = vi.spyOn(Date, "now").mockReturnValue(inicio);
    try {
      const f = fixture(() => relogio.mockReturnValue(inicio + 1001));
      await expect(
        f.reader.read("sub_origin", new Set(["price_origin"]), { deadlineMs: inicio + 1000 }),
      ).rejects.toThrow("deadline exceeded");
      expect(f.paths).toEqual(["/v1/subscriptions/sub_origin"]);
    } finally {
      relogio.mockRestore();
    }
  });
  it("rejects a late subscription history response instead of accepting a partial observation", async () => {
    const inicio = Date.now(),
      relogio = vi.spyOn(Date, "now").mockReturnValue(inicio);
    try {
      const f = fixture(() => relogio.mockReturnValue(inicio + 1001));
      await expect(
        f.reader.listSubscriptionIds("cus_origin", { deadlineMs: inicio + 1000 }),
      ).rejects.toThrow("deadline exceeded");
      expect(f.paths).toEqual(["/v1/subscriptions"]);
    } finally {
      relogio.mockRestore();
    }
  });
});
