import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeProvider } from "../providers/stripe";

/** Real SDK, closed HTTP only. Does not certify a native plan-change receipt. */
function fixture() {
  const writes: Array<{ path: string; params: URLSearchParams; key: string | null }> = [];
  const reads: string[] = [];
  const subscription = {
    id: "sub_fixture",
    object: "subscription",
    status: "active",
    customer: "cus_fixture",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: "si_fixture",
          price: { id: "price_initial" },
          quantity: 1,
          current_period_end: 1900000000,
        },
      ],
    },
    latest_invoice: null,
  };
  const transport: typeof fetch = async (url, init) => {
    const request = new Request(url, init),
      path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/v1/subscriptions/sub_fixture") {
      reads.push(path);
      return Response.json(subscription);
    }
    if (request.method !== "POST") throw new Error("Unexpected closed request");
    const params = new URLSearchParams(await request.text());
    writes.push({ path, params, key: request.headers.get("idempotency-key") });
    if (path === "/v1/invoices/create_preview")
      return Response.json({
        id: "upcoming_in_fixture",
        object: "invoice",
        amount_due: 6800,
        total: 6800,
        currency: "brl",
        lines: { data: [{ amount: -5990 }, { amount: 12790 }] },
      });
    if (path === "/v1/subscriptions/sub_fixture") return Response.json(subscription);
    throw new Error("Unexpected closed mutation");
  };
  const client = new Stripe("sk_test_closed_proration", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const provider = createStripeProvider({
    secretKey: "unused",
    webhookSecret: "unused",
    appName: "fixture",
    client,
  });
  return { provider, reads, writes };
}

describe("proporcional fixado entre prévia e tentativa", () => {
  it("envia o mesmo segundo no preview e na aplicação, com chave e pagamento pendente explícitos", async () => {
    const f = fixture();
    const prorationDate = 1800000000;
    const preview = await f.provider.previewInvoice?.({
      customerId: "cus_fixture",
      providerSubscriptionId: "sub_fixture",
      newPriceId: "price_target",
      prorationDate,
      prorationBehavior: "always_invoice",
    });
    expect(preview).toMatchObject({
      amountDueCents: 6800,
      totalCents: 6800,
      subtotalCents: 12790,
      prorationCreditCents: -5990,
      currency: "BRL",
    });
    await f.provider.updateSubscription({
      providerSubscriptionId: "sub_fixture",
      newPriceId: "price_target",
      prorationDate,
      prorationBehavior: "always_invoice",
      paymentBehavior: "pending_if_incomplete",
      idempotencyKey: "recreio:upgrade:fixture",
    });
    expect(f.writes).toHaveLength(2);
    expect(f.writes[0]?.params.get("subscription_details[proration_date]")).toBe(
      String(prorationDate),
    );
    expect(f.writes[1]?.params.get("proration_date")).toBe(String(prorationDate));
    expect(f.writes[1]?.params.get("payment_behavior")).toBe("pending_if_incomplete");
    expect(f.writes[1]?.params.get("items[0][id]")).toBe("si_fixture");
    expect(f.writes[1]?.params.get("items[0][price]")).toBe("price_target");
    expect(f.writes[1]?.key).toBe("recreio:upgrade:fixture");
    expect(f.writes[1]?.params.get("metadata[product_id]")).toBeNull();
  });
  it("conserva o comportamento dos consumidores que não fornecem a nova data/chave", async () => {
    const f = fixture();
    await f.provider.previewInvoice?.({
      customerId: "cus_fixture",
      providerSubscriptionId: "sub_fixture",
      newPriceId: "price_target",
    });
    await f.provider.updateSubscription({
      providerSubscriptionId: "sub_fixture",
      newPriceId: "price_target",
    });
    expect(f.writes[0]?.params.get("subscription_details[proration_date]")).toBeNull();
    expect(f.writes[1]?.params.get("proration_date")).toBeNull();
    expect(f.writes[1]?.params.get("proration_behavior")).toBe("create_prorations");
    expect(f.writes[1]?.params.get("payment_behavior")).toBeNull();
    // stripe-node may generate its own retry key; the native request key is never invented here.
    expect(f.writes[1]?.key).not.toBe("recreio:upgrade:fixture");
  });
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    "recusa segundo inválido %s antes da rede",
    async (prorationDate) => {
      const f = fixture();
      await expect(
        f.provider.previewInvoice?.({
          customerId: "cus_fixture",
          providerSubscriptionId: "sub_fixture",
          newPriceId: "price_target",
          prorationDate,
        }),
      ).rejects.toThrow("Unix second");
      await expect(
        f.provider.updateSubscription({
          providerSubscriptionId: "sub_fixture",
          newPriceId: "price_target",
          prorationDate,
        }),
      ).rejects.toThrow("Unix second");
      expect(f.reads).toEqual([]);
      expect(f.writes).toEqual([]);
    },
  );
});
