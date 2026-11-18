import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { criarConferenciaDeFinanciamento } from "./financiamento-stripe";

/** The SDK and graph are real; HTTP data is closed and follows the externally
 * observed annual credit/renewal values. No native acceptance/access is claimed. */
function fixture() {
  const start = 1795032000,
    month = 30 * 86400,
    year = 365 * 86400;
  const metadata = {
    checkout_intent_id: "a5cf7a5d-8fdb-426b-a00c-a662fd6516aa",
    subject_type: "user",
    subject_id: "payer_fixture",
    product_id: "recreio_individual_annual",
  };
  const subscription = {
    id: "sub_funding",
    object: "subscription",
    customer: "cus_funding",
    livemode: false,
    status: "active",
    metadata,
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: null,
    canceled_at: null,
    items: {
      has_more: false,
      data: [
        {
          id: "si_funding",
          quantity: 1,
          price: { id: "price_family" },
          current_period_start: start + month,
          current_period_end: start + 2 * month,
        },
      ],
    },
  };
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
    customer: "cus_funding",
    total,
    amount_paid: paid,
    starting_balance: initial,
    ending_balance: ending,
    status_transitions: { paid_at: paidAt },
    parent: { subscription_details: { subscription: subscription.id } },
  });
  const invoices = [
    invoice("in_original", 59900, 59900, 0, 0, start),
    invoice("in_credit", -47110, 0, 0, -47110, start + 1),
    invoice("in_renewal", 12790, 0, -47110, -34320, start + month),
  ];
  const lines = new Map([
    [
      "in_original",
      [line("il_original", "in_original", 59900, "price_annual", start, start + year)],
    ],
    [
      "in_credit",
      [
        line("il_credit", "in_credit", -59900, "price_annual", start, start + year, {
          invoice: "in_original",
          invoice_line_items: ["il_original"],
        }),
        line("il_family", "in_credit", 12790, "price_family", start, start + month),
      ],
    ],
    [
      "in_renewal",
      [line("il_renewal", "in_renewal", 12790, "price_family", start + month, start + 2 * month)],
    ],
  ]);
  const charge = {
    id: "ch_funding",
    object: "charge",
    livemode: false,
    customer: "cus_funding",
    currency: "brl",
    paid: true,
    captured: true,
    amount_captured: 59900,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
    payment_intent: "pi_funding",
  };
  const ledger = [
    {
      id: "cbtxn_renewal",
      object: "customer_balance_transaction",
      livemode: false,
      customer: "cus_funding",
      currency: "brl",
      type: "applied_to_invoice",
      invoice: "in_renewal",
      amount: 12790,
      ending_balance: -34320,
    },
    {
      id: "cbtxn_credit",
      object: "customer_balance_transaction",
      livemode: false,
      customer: "cus_funding",
      currency: "brl",
      type: "applied_to_invoice",
      invoice: "in_credit",
      amount: -47110,
      ending_balance: -47110,
    },
  ];
  const paths: string[] = [];
  let balanceReads = 0,
    subReads = 0,
    changeBalance = false,
    changeHead = false,
    repeatLedger = false,
    changeContract = false;
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
    if (path === "/v1/subscriptions/sub_funding") {
      subReads++;
      body =
        changeContract && subReads > 1
          ? {
              ...subscription,
              items: {
                has_more: false,
                data: subscription.items.data.map((item) => ({
                  ...item,
                  price: { id: "price_annual" },
                })),
              },
            }
          : subscription;
    } else if (path === "/v1/invoices") body = list(invoices);
    else if (path === "/v1/invoice_payments") {
      const invoiceId = url.searchParams.get("invoice");
      body = list(
        invoiceId === "in_original"
          ? [
              {
                id: "inpay_original",
                object: "invoice_payment",
                invoice: invoiceId,
                livemode: false,
                status: "paid",
                currency: "brl",
                amount_paid: 59900,
                payment: { type: "payment_intent", payment_intent: "pi_funding" },
              },
            ]
          : [],
      );
    } else if (path === "/v1/payment_intents/pi_funding")
      body = {
        id: "pi_funding",
        object: "payment_intent",
        customer: "cus_funding",
        status: "succeeded",
        livemode: false,
        latest_charge: charge,
      };
    else if (/^\/v1\/invoices\/[^/]+\/lines$/.test(path))
      body = list(lines.get(path.split("/")[3] ?? "") ?? []);
    else if (path === "/v1/customers/cus_funding") {
      balanceReads++;
      body = {
        id: "cus_funding",
        object: "customer",
        livemode: false,
        balance: changeBalance && balanceReads > 1 ? 0 : -34320,
        invoice_credit_balance: { brl: 34320 },
        email: "not-returned@example.test",
      };
    } else if (path === "/v1/customers/cus_funding/balance_transactions") {
      if (url.searchParams.get("limit") === "1") {
        const first = ledger[0];
        if (!first) throw new Error("Missing closed ledger head");
        body = list([{ ...first, id: changeHead ? "cbtxn_new" : first.id }], true);
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
    clienteId: "cus_funding",
    assinaturaId: "sub_funding",
    precosAceitos: new Set(["price_annual", "price_family"]),
  };
  return {
    conference,
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
  };
}

describe("conferência privada do saldo e da origem das faturas", () => {
  it("reuses captured facts and proves annual credit/zero-paid renewal without changing ordinary coverage", async () => {
    const f = fixture(),
      result = await f.read();
    expect(result?.snapshot.periods).toHaveLength(1);
    expect(result?.snapshot.periods[0]?.priceId).toBe("price_annual");
    expect(result?.financiamento.periodos).toHaveLength(3);
    expect(
      result?.financiamento.periodos.every(
        (p) => p.estado === "comprovado" && p.capturasDeOrigem.join() === "ch_funding",
      ),
    ).toBe(true);
    expect(
      result?.financiamento.periodos.find((p) => p.linhaId === "il_original")?.cobertoAte,
    ).toBe(1795032000);
    expect(result?.financiamento.ultimaMovimentacaoId).toBe("cbtxn_renewal");
    expect(f.paths.filter((p) => p === "/v1/payment_intents/pi_funding")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("not-returned@example.test");
  });
  it("a fully refunded origin revokes every dependent proof without rewriting own invoice flags", async () => {
    const f = fixture();
    f.charge.amount_refunded = 59900;
    f.charge.refunded = true;
    const result = await f.read();
    expect(result?.financiamento.periodos.every((p) => p.estado === "revogado")).toBe(true);
    expect(result?.snapshot.periods[0]?.fullyRefunded).toBe(true);
    expect(result?.fatos.invoices.find((i) => i.id === "in_renewal")?.amountPaidCents).toBe(0);
  });
  it("detects a balance change or a new same-balance ledger head before returning proof", async () => {
    for (const kind of ["balance", "head"]) {
      const f = fixture();
      if (kind === "balance") f.changeBalance();
      else f.changeHead();
      await expect(f.read()).rejects.toMatchObject({ motivo: "saldo_alterado_durante_a_leitura" });
    }
  });
  it("bounds duplicate ledger pagination without creating any remote resource", async () => {
    const f = fixture();
    f.repeatLedger();
    await expect(f.read()).rejects.toMatchObject({ motivo: "ledger_repetido_ou_excessivo" });
    expect(f.paths.filter((p) => p.endsWith("/balance_transactions"))).toHaveLength(2);
  });
  it("refuses another customer/mode/currency in the ledger", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        const m = f.ledger[0];
        if (m) m.customer = "cus_foreign";
      },
      (f: ReturnType<typeof fixture>) => {
        const m = f.ledger[0];
        if (m) m.livemode = true;
      },
      (f: ReturnType<typeof fixture>) => {
        const m = f.ledger[0];
        if (m) m.currency = "usd";
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(f.read()).rejects.toMatchObject({ motivo: "movimento_fora_do_escopo" });
    }
  });
  it("final contract read rejects a concurrent price change", async () => {
    const f = fixture();
    f.changeContract();
    await expect(f.read()).rejects.toMatchObject({ motivo: "contrato_alterado_durante_a_leitura" });
  });
  it("caller customer identity is a boundary, not an inference from provider responses", async () => {
    const f = fixture();
    await expect(
      f.conference.conferir(
        { ...f.input, clienteId: "cus_foreign" },
        { deadlineMs: Date.now() + 90_000 },
      ),
    ).rejects.toMatchObject({ motivo: "fatos_fora_do_escopo" });
    expect(f.paths.some((p) => p.startsWith("/v1/customers/"))).toBe(false);
  });
  it("an expired deadline refuses even the initial provider request", async () => {
    const f = fixture();
    await expect(
      f.conference.conferir(f.input, { deadlineMs: Date.now() - 1 }),
    ).rejects.toMatchObject({ motivo: "prazo_da_leitura" });
    expect(f.paths).toEqual([]);
  });
});
