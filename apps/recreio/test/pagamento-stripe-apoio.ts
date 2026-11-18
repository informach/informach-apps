import { randomUUID } from "node:crypto";
import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { expect } from "vitest";
import type { RuntimeDeConciliacao } from "@/features/cobranca/conciliacao-runtime";
import { fixtureDeCheckout } from "./compra-stripe-apoio";

type Checkout = Awaited<ReturnType<typeof fixtureDeCheckout>>;
function dados(f: Checkout) {
  const produto = f.products.find((p) => p.id === f.entrada.productId);
  if (!produto?.listPrice) throw new Error("Fixture approved offer absent");
  const sufixo = randomUUID().replaceAll("-", ""),
    inicio = Math.floor(Date.now() / 1000) - 120,
    fim = inicio + 86_400;
  const assinatura = {
    id: `sub_fixture_${sufixo}`,
    object: "subscription",
    customer: f.providerCustomerId,
    livemode: false,
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: null,
    canceled_at: null,
    metadata: {
      checkout_intent_id: f.recibo.id,
      subject_type: "user",
      subject_id: f.adulto.conta.id.toString(),
      product_id: produto.id,
    },
    items: {
      data: [
        {
          id: `si_${sufixo}`,
          price: { id: produto.stripePriceId.dev },
          current_period_start: inicio,
          current_period_end: fim,
        },
      ],
    },
  };
  const fatura = {
    id: `in_fixture_${sufixo}`,
    object: "invoice",
    customer: f.providerCustomerId,
    livemode: false,
    amount_paid: produto.listPrice.amountCents,
    currency: "brl",
    status: "paid",
    status_transitions: { paid_at: inicio + 1 },
  };
  const charge = {
    id: `ch_fixture_${sufixo}`,
    object: "charge",
    customer: f.providerCustomerId,
    livemode: false,
    paid: true,
    captured: true,
    amount_captured: produto.listPrice.amountCents,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
    currency: "brl",
  };
  const pagamento = {
    id: `pi_fixture_${sufixo}`,
    object: "payment_intent",
    customer: f.providerCustomerId,
    livemode: false,
    status: "succeeded",
    latest_charge: charge,
  };
  const alocacao = {
    id: `inpay_fixture_${sufixo}`,
    object: "invoice_payment",
    invoice: fatura.id,
    amount_paid: produto.listPrice.amountCents,
    status: "paid",
    payment: { type: "payment_intent", payment_intent: pagamento.id },
  };
  const linha = {
    id: `il_fixture_${sufixo}`,
    amount: produto.listPrice.amountCents,
    parent: { subscription_item_details: { subscription: assinatura.id } },
    pricing: { price_details: { price: produto.stripePriceId.dev } },
    period: { start: inicio, end: fim },
  };
  const disputas: { id: string; status: string }[] = [];
  return { assinatura, fatura, charge, pagamento, alocacao, linha, disputas, pago: true };
}

/** SDK and PG are real; all remote financial responses remain inside fixture
 * HTTP. No payment is sent to Stripe and no sandbox settlement is claimed.
 */
export async function fixtureDePagamento() {
  let financeiro: ReturnType<typeof dados> | null = null;
  let indisponivel = false;
  const list = (data: unknown[]) => ({ object: "list", data, has_more: false, url: "/fixture" });
  const f: Checkout = await fixtureDeCheckout(async (request) => {
    if (request.method !== "GET") return null;
    const url = new URL(request.url);
    let resposta: unknown;
    if (url.pathname === "/v1/subscriptions") {
      expect(url.searchParams.get("customer")).toBe(f.providerCustomerId);
      if (indisponivel) throw new TypeError("Fixture financial provider unavailable");
      resposta = list(financeiro ? [financeiro.assinatura] : []);
    } else if (financeiro && url.pathname === `/v1/subscriptions/${financeiro.assinatura.id}`) {
      if (indisponivel) throw new TypeError("Fixture financial provider unavailable");
      resposta = financeiro.assinatura;
    } else if (financeiro && url.pathname === "/v1/invoices") {
      expect(url.searchParams.get("subscription")).toBe(financeiro.assinatura.id);
      resposta = list(financeiro.pago ? [financeiro.fatura] : []);
    } else if (financeiro && url.pathname === "/v1/invoice_payments") {
      expect(url.searchParams.get("invoice")).toBe(financeiro.fatura.id);
      resposta = list([financeiro.alocacao]);
    } else if (financeiro && url.pathname === `/v1/payment_intents/${financeiro.pagamento.id}`)
      resposta = financeiro.pagamento;
    else if (financeiro && url.pathname === `/v1/invoices/${financeiro.fatura.id}/lines`)
      resposta = list([financeiro.linha]);
    else if (financeiro && url.pathname === "/v1/disputes") resposta = list(financeiro.disputas);
    else return null;
    return Response.json(resposta, { headers: { "request-id": "req_financial_fixture" } });
  });
  const find = f.provider.findCheckoutSession;
  if (!find) throw new Error("Fixture Stripe provider lacks Checkout reads");
  const runtimeFinanceiro: RuntimeDeConciliacao = {
    modo: "dev",
    produtos: f.products,
    conferirCatalogo: f.runtime.conferirCatalogo,
    leitor: createStripePaymentFactReader({
      secretKey: "unused",
      client: f.stripe,
      expectedMode: "dev",
    }),
    lerCheckout: find,
  };
  return {
    ...f,
    runtimeFinanceiro,
    concluirCheckout(pago = true) {
      const session = f.sessions[0];
      if (!session) throw new Error("Create Checkout through the native executor first");
      financeiro ??= dados(f);
      financeiro.pago = pago;
      financeiro.assinatura.status = pago ? "active" : "incomplete";
      session.status = "complete";
      session.subscription = financeiro.assinatura.id;
      return financeiro;
    },
    indisponibilizar: () => {
      indisponivel = true;
    },
  };
}
