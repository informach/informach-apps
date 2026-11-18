import { randomUUID } from "node:crypto";
import { createBillingService } from "@informach/billing";
import { inspectUserCheckoutAuthorization } from "@informach/billing/checkout-authorizations";
import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { createStripeProvider } from "@informach/billing/providers/stripe";
import { PRODUCTS } from "@informach/config";
import { db } from "@informach/db";
import Stripe from "stripe";
import { expect } from "vitest";
import { conferirCatalogoDoRecreio } from "@/features/cobranca/catalogo";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { iniciarTentativaDeCompraLocked } from "@/features/cobranca/repository";
import type { RuntimeDeCompra } from "@/features/cobranca/runtime";
import { prepararMinhaCompra } from "@/features/cobranca/service";
import { pedidoDaCompra } from "./compra-apoio";
import { adultoDoTeste } from "./teste-apoio";

/** Native admission and PostgreSQL are real. Stripe SDK uses only fixture HTTP;
 * this proves protocol recovery, not a sandbox payment or an invoice settlement.
 */
export async function fixtureDeCheckout(
  extensao?: (request: Request) => Promise<Response | null>,
  comJogador = false,
) {
  const adulto = await adultoDoTeste(comJogador);
  const pedido = pedidoDaCompra();
  const recibo = await prepararMinhaCompra(adulto.autor, pedido);
  const sessions: {
    id: string;
    object: string;
    customer: string;
    mode: string;
    status: string;
    url: string;
    subscription: string | null;
    metadata: { checkout_intent_id: string };
    expires_at: number;
  }[] = [];
  const remoteCustomerId = `cus_native_${randomUUID().replaceAll("-", "")}`;
  let perderResposta = false;
  let inspecaoIndisponivel = false;
  let depoisDePersistir: (() => Promise<void>) | undefined;
  let depoisDoPortal: (() => Promise<void>) | undefined;
  const portais: { customer: string; configuration: string | null; url: string }[] = [];
  const products = PRODUCTS.filter((p) => p.app === "recreio").map((p) => ({
    ...p,
    stripePriceId: { dev: `price_${p.id}`, prod: "" },
  }));
  const variaveis = Object.fromEntries(
    products.map((p) => {
      if (!p.stripePriceEnvironmentVariable) throw new Error("Missing catalog variable");
      return [p.stripePriceEnvironmentVariable, p.stripePriceId.dev];
    }),
  );
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
  const origin = "https://recreio.example.test";
  const portal = {
    id: "bpc_recreio",
    active: true,
    livemode: false,
    metadata: { app: "recreio" },
    default_return_url: `${origin}/conta/assinatura`,
    business_profile: {
      terms_of_service_url: `${origin}/termos`,
      privacy_policy_url: `${origin}/privacidade`,
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
  const list = (data: unknown[]) => ({ object: "list", data, has_more: false, url: "/fixture" });
  const requests: { method: string; path: string }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    requests.push({ method: request.method, path: url.pathname });
    const estendida = await extensao?.(request.clone());
    if (estendida) return estendida;
    let resposta: unknown;
    if (request.method === "GET" && url.pathname.startsWith("/v1/prices/")) {
      resposta = prices.find((p) => p.id === url.pathname.split("/").pop());
    } else if (request.method === "GET" && url.pathname.startsWith("/v1/products/")) {
      resposta = { id: url.pathname.split("/").pop(), active: true, metadata: { app: "recreio" } };
    } else if (
      request.method === "GET" &&
      url.pathname === "/v1/billing_portal/configurations/bpc_recreio"
    ) {
      resposta = portal;
    } else if (request.method === "POST" && url.pathname === "/v1/customers") {
      const body = new URLSearchParams(await request.text());
      resposta = {
        id: remoteCustomerId,
        object: "customer",
        email: body.get("email"),
        metadata: {},
      };
    } else if (request.method === "POST" && url.pathname === "/v1/billing_portal/sessions") {
      const body = new URLSearchParams(await request.text());
      expect(body.get("customer")).toBe(remoteCustomerId);
      expect(body.get("configuration")).toBe(portal.id);
      const criada = {
        customer: remoteCustomerId,
        configuration: body.get("configuration"),
        url: `https://billing.stripe.com/p/session/${randomUUID()}`,
      };
      portais.push(criada);
      await depoisDoPortal?.();
      resposta = {
        id: `bps_fixture_${portais.length}`,
        object: "billing_portal.session",
        ...criada,
      };
    } else if (request.method === "GET" && url.pathname === "/v1/subscriptions") {
      resposta = list([]);
    } else if (request.method === "GET" && url.pathname === "/v1/checkout/sessions") {
      if (inspecaoIndisponivel) throw new TypeError("Fixture provider unavailable");
      expect(url.searchParams.get("customer")).toBe(remoteCustomerId);
      resposta = list(
        sessions.filter(
          (s) => !url.searchParams.get("status") || s.status === url.searchParams.get("status"),
        ),
      );
    } else if (request.method === "GET" && url.pathname.startsWith("/v1/checkout/sessions/")) {
      if (inspecaoIndisponivel) throw new TypeError("Fixture provider unavailable");
      resposta = sessions.find((s) => s.id === url.pathname.split("/").pop());
    } else if (request.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      const body = new URLSearchParams(await request.text());
      const id = `cs_test_${recibo.id.replaceAll("-", "")}_${sessions.length + 1}_native`;
      const intentId = body.get("metadata[checkout_intent_id]");
      if (!intentId) throw new Error("Native authorization absent from HTTP request");
      expect(body.get("subscription_data[metadata][checkout_intent_id]")).toBe(intentId);
      const session = {
        id,
        object: "checkout.session",
        customer: remoteCustomerId,
        mode: "subscription",
        status: "open",
        url: `https://checkout.stripe.com/c/pay/${id}`,
        subscription: null,
        metadata: { checkout_intent_id: intentId },
        expires_at: Number(body.get("expires_at")),
      };
      sessions.push(session);
      await depoisDePersistir?.();
      if (perderResposta) {
        perderResposta = false;
        throw new TypeError("Fixture response lost after provider persistence");
      }
      resposta = session;
    } else throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}`);
    if (!resposta) throw new Error("Fixture session absent");
    return Response.json(resposta, { headers: { "request-id": "req_checkout_fixture" } });
  };
  const stripe = new Stripe("sk_test_native_checkout_fixture", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const provider = createStripeProvider({
    secretKey: "unused",
    webhookSecret: "unused",
    appName: "Recreio fixture",
    client: stripe,
  });
  const billing = createBillingService({
    db,
    provider: "stripe",
    providerClient: provider,
    app: "recreio",
    appName: "Recreio fixture",
    organizationsEnabled: false,
    stripeMode: "dev",
    publicAppUrl: "https://recreio.example.test",
    managedCheckout: true,
    portalConfigurationId: portal.id,
    products,
    resolveSubjectEmail: async () => adulto.conta.email,
  });
  const authorization = {
    id: recibo.id,
    expiresAt: Math.floor(Date.parse(recibo.aceitoEm) / 1000) + 3600,
  };
  const entrada = {
    subject: { type: "user" as const, id: adulto.conta.id },
    actorId: adulto.conta.id,
    productId: pedido.produtoId,
    successUrl: "https://recreio.example.test/conta/assinatura?volta=1",
    cancelUrl: "https://recreio.example.test/conta/assinatura?volta=1",
    managedAuthorization: authorization,
  };
  const enviar = () =>
    comCicloDeCobranca(adulto.conta.id, async () => {
      await iniciarTentativaDeCompraLocked(adulto.autor, recibo.id);
      return billing.createSubscriptionCheckout(entrada);
    });
  const inspect = (payerId: string = adulto.conta.id, id = recibo.id) =>
    comCicloDeCobranca(payerId, () =>
      inspectUserCheckoutAuthorization(
        { db, app: "recreio", provider: "stripe", providerClient: provider },
        payerId,
        id,
      ),
    );
  const runtime: RuntimeDeCompra = {
    async conferirCatalogo() {
      await conferirCatalogoDoRecreio({
        leitor: createStripePaymentFactReader({ secretKey: "unused", client: stripe }),
        modo: "dev",
        variaveis,
        portalId: portal.id,
        urlDoApp: origin,
      });
    },
    precoDoProduto(id) {
      const produto = products.find((p) => p.id === id);
      if (!produto) throw new Error("Fixture product absent");
      return produto.stripePriceId.dev;
    },
    urlDeRetorno: `${origin}/conta/assinatura?retorno=1`,
    criarCheckout: (input) => billing.createSubscriptionCheckout(input),
    // Executor already holds the financial lifecycle lock.
    inspecionar: (payerId, id) =>
      inspectUserCheckoutAuthorization(
        { db, app: "recreio", provider: "stripe", providerClient: provider },
        payerId,
        id,
      ),
  };
  return {
    adulto,
    stripe,
    provider,
    providerCustomerId: remoteCustomerId,
    recibo,
    authorization,
    billing,
    entrada,
    sessions,
    enviar,
    inspect,
    runtime,
    requests,
    prices,
    portais,
    aposCriarPortal: (callback: () => Promise<void>) => {
      depoisDoPortal = callback;
    },
    products,
    aposPersistir: (callback: () => Promise<void>) => {
      depoisDePersistir = callback;
    },
    indisponibilizarInspecao: () => {
      inspecaoIndisponivel = true;
    },
    restaurarInspecao: () => {
      inspecaoIndisponivel = false;
    },
    perderProximaResposta: () => {
      perderResposta = true;
    },
  };
}
