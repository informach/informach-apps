import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import Stripe from "stripe";
import { criarConferenciaDeFinanciamento } from "@/features/cobranca/financiamento-stripe";

/** The SDK and graph are real; HTTP data is closed and follows the externally
 * observed annual credit/renewal values. No native acceptance/access is claimed. */
export function fixtureDeFinanciamento(
  escopo: {
    paganteId?: string;
    autorizacaoId?: string;
    clienteId?: string;
    assinaturaId?: string;
    sufixo?: string;
  } = {},
) {
  const identidade = (id: string) => (escopo.sufixo ? `${id}_${escopo.sufixo}` : id);
  const start = 1795032000,
    month = 30 * 86400,
    year = 365 * 86400;
  const metadata = {
    checkout_intent_id: escopo.autorizacaoId ?? "a5cf7a5d-8fdb-426b-a00c-a662fd6516aa",
    subject_type: "user",
    subject_id: escopo.paganteId ?? "payer_fixture",
    product_id: "recreio_individual_annual",
  };
  const cancellation: {
    cancel_at: number | null;
    trial_end: number | null;
    canceled_at: number | null;
  } = { cancel_at: null, trial_end: null, canceled_at: null };
  const subscription = {
    ...cancellation,
    id: escopo.assinaturaId ?? identidade("sub_funding"),
    object: "subscription",
    customer: escopo.clienteId ?? "cus_funding",
    livemode: false,
    status: "active",
    metadata,
    cancel_at_period_end: false,
    items: {
      has_more: false,
      data: [
        {
          id: identidade("si_funding"),
          quantity: 1,
          price: { id: "price_family" },
          current_period_start: start + month,
          current_period_end: start + 2 * month,
        },
      ],
    },
  };
  const subscriptions = new Map([[subscription.id, subscription]]);
  const line = (
    id: string,
    invoice: string,
    amount: number,
    price: string,
    begins: number,
    ends: number,
    credited?: { invoice: string; invoice_line_items: string[] },
  ) => ({
    id,
    invoice,
    amount,
    currency: "brl",
    livemode: false,
    quantity: 1,
    period: { start: begins, end: ends },
    pricing: { price_details: { price } },
    parent: {
      subscription_item_details: {
        subscription: subscription.id,
        proration_details: { credited_items: credited ?? null },
      },
    },
  });
  const invoice = (
    id: string,
    total: number,
    paid: number,
    initial: number,
    ending: number,
    paidAt: number,
  ) => ({
    id,
    object: "invoice",
    livemode: false,
    status: "paid",
    currency: "brl",
    customer: escopo.clienteId ?? "cus_funding",
    total,
    amount_paid: paid,
    starting_balance: initial,
    ending_balance: ending,
    status_transitions: { paid_at: paidAt },
    parent: { subscription_details: { subscription: subscription.id } },
  });
  const invoices = [
    invoice(identidade("in_original"), 59900, 59900, 0, 0, start),
    invoice(identidade("in_credit"), -47110, 0, 0, -47110, start + 1),
    invoice(identidade("in_renewal"), 12790, 0, -47110, -34320, start + month),
  ];
  const lines = new Map([
    [
      identidade("in_original"),
      [
        line(
          identidade("il_original"),
          identidade("in_original"),
          59900,
          "price_annual",
          start,
          start + year,
        ),
      ],
    ],
    [
      identidade("in_credit"),
      [
        line(
          identidade("il_credit"),
          identidade("in_credit"),
          -59900,
          "price_annual",
          start,
          start + year,
          {
            invoice: identidade("in_original"),
            invoice_line_items: [identidade("il_original")],
          },
        ),
        line(
          identidade("il_family"),
          identidade("in_credit"),
          12790,
          "price_family",
          start,
          start + month,
        ),
      ],
    ],
    [
      identidade("in_renewal"),
      [
        line(
          identidade("il_renewal"),
          identidade("in_renewal"),
          12790,
          "price_family",
          start + month,
          start + 2 * month,
        ),
      ],
    ],
  ]);
  const charge = {
    id: identidade("ch_funding"),
    object: "charge",
    livemode: false,
    customer: escopo.clienteId ?? "cus_funding",
    currency: "brl",
    paid: true,
    captured: true,
    amount_captured: 59900,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
    payment_intent: identidade("pi_funding"),
  };
  const ledger = [
    {
      id: identidade("cbtxn_renewal"),
      object: "customer_balance_transaction",
      livemode: false,
      customer: escopo.clienteId ?? "cus_funding",
      currency: "brl",
      type: "applied_to_invoice",
      invoice: identidade("in_renewal"),
      amount: 12790,
      ending_balance: -34320,
    },
    {
      id: identidade("cbtxn_credit"),
      object: "customer_balance_transaction",
      livemode: false,
      customer: escopo.clienteId ?? "cus_funding",
      currency: "brl",
      type: "applied_to_invoice",
      invoice: identidade("in_credit"),
      amount: -47110,
      ending_balance: -47110,
    },
  ];
  const paths: string[] = [];
  let balance = -34320,
    balanceReads = 0,
    changeBalance = false,
    changeHead = false,
    repeatLedger = false,
    changeContract = false;
  const subReads = new Map<string, number>();
  const list = (data: unknown[], has_more = false) => ({
    object: "list",
    data,
    has_more,
    url: "/fixture",
  });
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url),
      path = url.pathname;
    paths.push(path);
    if (request.method !== "GET") throw new Error("Funding conference is read only");
    let body: unknown;
    if (path.startsWith("/v1/subscriptions/")) {
      const current = subscriptions.get(path.split("/")[3] ?? "");
      if (!current) throw new Error("Unknown closed subscription");
      const count = (subReads.get(current.id) ?? 0) + 1;
      subReads.set(current.id, count);
      body =
        changeContract && count > 1
          ? {
              ...current,
              items: {
                has_more: false,
                data: current.items.data.map((item) => ({
                  ...item,
                  price: { id: "price_annual" },
                })),
              },
            }
          : current;
    } else if (path === "/v1/invoices")
      body = list(
        invoices.filter(
          (f) =>
            f.parent.subscription_details.subscription === url.searchParams.get("subscription"),
        ),
      );
    else if (path === "/v1/invoice_payments") {
      const invoiceId = url.searchParams.get("invoice");
      body = list(
        invoiceId === identidade("in_original")
          ? [
              {
                id: identidade("inpay_original"),
                object: "invoice_payment",
                invoice: invoiceId,
                livemode: false,
                status: "paid",
                currency: "brl",
                amount_paid: 59900,
                payment: { type: "payment_intent", payment_intent: identidade("pi_funding") },
              },
            ]
          : [],
      );
    } else if (path === `/v1/payment_intents/${charge.payment_intent}`)
      body = {
        id: identidade("pi_funding"),
        object: "payment_intent",
        customer: escopo.clienteId ?? "cus_funding",
        status: "succeeded",
        livemode: false,
        latest_charge: charge,
      };
    else if (path === "/v1/disputes") body = list([{ id: "dp_funding", status: "needs_response" }]);
    else if (/^\/v1\/invoices\/[^/]+\/lines$/.test(path))
      body = list(lines.get(path.split("/")[3] ?? "") ?? []);
    else if (path === `/v1/customers/${escopo.clienteId ?? "cus_funding"}`) {
      balanceReads++;
      body = {
        id: escopo.clienteId ?? "cus_funding",
        object: "customer",
        livemode: false,
        balance: changeBalance && balanceReads > 1 ? 0 : balance,
        invoice_credit_balance: { brl: -balance },
        email: "not-returned@example.test",
      };
    } else if (path === `/v1/customers/${escopo.clienteId ?? "cus_funding"}/balance_transactions`) {
      if (url.searchParams.get("limit") === "1") {
        const first = ledger[0];
        if (!first) throw new Error("Missing closed ledger head");
        body = list([{ ...first, id: changeHead ? identidade("cbtxn_new") : first.id }], true);
      } else body = list(ledger, repeatLedger);
    } else throw new Error(`Unexpected funding fixture request ${path}`);
    return Response.json(body, { headers: { "request-id": "req_native_funding" } });
  };
  const client = new Stripe("sk_test_closed_native_funding", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const reader = createStripePaymentFactReader({
    secretKey: "unused",
    client,
    expectedMode: "dev",
  });
  const conference = criarConferenciaDeFinanciamento({
    modo: "dev",
    cliente: client,
    leitor: reader,
  });
  const input = {
    clienteId: escopo.clienteId ?? "cus_funding",
    assinaturaId: escopo.assinaturaId ?? identidade("sub_funding"),
    precosAceitos: new Set(["price_annual", "price_family"]),
  };
  return {
    conference,
    identidade,
    input,
    paths,
    ledger,
    charge,
    subscription,
    read: () => conference.conferir(input, { deadlineMs: Date.now() + 90_000 }),
    changeBalance() {
      changeBalance = true;
    },
    changeHead() {
      changeHead = true;
    },
    repeatLedger() {
      repeatLedger = true;
    },
    changeContract() {
      changeContract = true;
    },
    followingContract() {
      subscription.status = "canceled";
      subscription.canceled_at = start + 2 * month;
      const following = {
        ...structuredClone(subscription),
        id: identidade("sub_following"),
        status: "active",
        canceled_at: null,
        metadata: {
          ...metadata,
          checkout_intent_id: "ba821981-d2aa-4d38-8ab4-f580dfda4f3f",
          product_id: "recreio_family_monthly",
        },
        items: {
          has_more: false,
          data: [
            {
              id: identidade("si_following"),
              quantity: 1,
              price: { id: "price_family" },
              current_period_start: start + 2 * month,
              current_period_end: start + 3 * month,
            },
          ],
        },
      };
      subscriptions.set(following.id, following);
      const next = invoice(identidade("in_following"), 12790, 0, -34320, -21530, start + 2 * month);
      next.parent.subscription_details.subscription = following.id;
      invoices.push(next);
      const nextLine = line(
        identidade("il_following"),
        next.id,
        12790,
        "price_family",
        start + 2 * month,
        start + 3 * month,
      );
      nextLine.parent.subscription_item_details.subscription = following.id;
      lines.set(next.id, [nextLine]);
      const prior = ledger[0];
      if (!prior) throw new Error("Missing closed ledger head");
      ledger.unshift({
        ...prior,
        id: identidade("cbtxn_following"),
        invoice: next.id,
        amount: 12790,
        ending_balance: -21530,
      });
      balance = -21530;
      return following;
    },
  };
}
