import Stripe from "stripe";

type Subscription = {
  id: string;
  customer: string;
  status: string;
  items: {
    data: { price: { id: string }; current_period_start: number; current_period_end: number }[];
  };
};
type Invoice = { id: string; customer: string; amount_paid: number; currency: string };
type Payment = { id: string; customer: string; amount: number; currency: string };

// An isolated HTTP provider boundary. The SDK, settlement reader, signature
// verification and application handlers remain real; unknown reads fail closed.
const subscriptions = new Map<string, Subscription>();
const invoices = new Map<
  string,
  {
    invoice: Invoice;
    subscriptionId: string;
    start: number;
    end: number;
    priceId: string;
    paidAt: number;
  }
>();
const payments = new Map<string, Payment & { created: number }>();
export function registerPaidInvoice(
  subscription: Subscription,
  invoice: Invoice,
  period?: { start: number; end: number },
) {
  const item = subscription.items.data[0];
  if (!item) throw new Error("Payment fixture requires a subscription item");
  subscriptions.set(subscription.id, subscription);
  const paidAt = Math.floor(Date.now() / 1000);
  invoices.set(invoice.id, {
    invoice,
    subscriptionId: subscription.id,
    paidAt,
    start: period?.start ?? item.current_period_start,
    end: period?.end ?? item.current_period_end,
    priceId: item.price.id,
  });
  payments.set(`pi_${invoice.id}`, {
    id: `pi_${invoice.id}`,
    customer: invoice.customer,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    created: paidAt,
  });
}
export function registerPaidPack(payment: Payment) {
  payments.set(payment.id, { ...payment, created: Math.floor(Date.now() / 1000) });
}

const list = (data: unknown[], url: string) => ({ object: "list", data, has_more: false, url });
const transport: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  if ((init?.method ?? "GET").toUpperCase() !== "GET")
    throw new Error("Unexpected Stripe fixture mutation");
  let body: unknown;
  const id = url.pathname.split("/")[3];
  if (url.pathname.startsWith("/v1/subscriptions/") && id) {
    const subscription = subscriptions.get(id);
    if (subscription)
      body = {
        ...subscription,
        object: "subscription",
        cancel_at_period_end: false,
        cancel_at: null,
        trial_end: null,
        canceled_at: null,
      };
  } else if (url.pathname === "/v1/invoices") {
    body = list(
      [...invoices.values()]
        .filter((row) => row.subscriptionId === url.searchParams.get("subscription"))
        .map((row) => ({
          ...row.invoice,
          object: "invoice",
          status: "paid",
          status_transitions: { paid_at: row.paidAt },
        })),
      url.pathname,
    );
  } else if (url.pathname === "/v1/invoice_payments") {
    const row = invoices.get(url.searchParams.get("invoice") ?? "");
    if (row)
      body = list(
        [
          {
            id: `inpay_${row.invoice.id}`,
            object: "invoice_payment",
            invoice: row.invoice.id,
            amount_paid: row.invoice.amount_paid,
            status: "paid",
            payment: { type: "payment_intent", payment_intent: `pi_${row.invoice.id}` },
          },
        ],
        url.pathname,
      );
  } else if (url.pathname.startsWith("/v1/invoices/") && url.pathname.endsWith("/lines") && id) {
    const row = invoices.get(id);
    if (row)
      body = list(
        [
          {
            id: `il_${id}`,
            amount: row.invoice.amount_paid,
            parent: { subscription_item_details: { subscription: row.subscriptionId } },
            pricing: { price_details: { price: row.priceId } },
            period: { start: row.start, end: row.end },
          },
        ],
        url.pathname,
      );
  } else if (url.pathname.startsWith("/v1/payment_intents/") && id) {
    const payment = payments.get(id);
    if (payment)
      body = {
        ...payment,
        object: "payment_intent",
        status: "succeeded",
        amount_received: payment.amount,
        latest_charge: {
          id: `ch_${id}`,
          object: "charge",
          payment_intent: id,
          customer: payment.customer,
          paid: true,
          captured: true,
          amount: payment.amount,
          amount_captured: payment.amount,
          amount_refunded: 0,
          refunded: false,
          currency: payment.currency,
          disputed: false,
          created: payment.created,
        },
      };
  }
  if (body === undefined) throw new Error(`Unexpected Stripe fixture request: ${url.pathname}`);
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "request-id": "req_fixture" },
  });
};

export const settlementClient = new Stripe("sk_test_fixture", {
  apiVersion: "2026-04-22.dahlia",
  maxNetworkRetries: 0,
  httpClient: Stripe.createFetchHttpClient(transport),
});
