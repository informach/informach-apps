import { randomUUID } from "node:crypto";
import { CheckoutPendingError, createBillingService } from "@informach/billing";
import { inspectUserCheckoutAuthorization } from "@informach/billing/checkout-authorizations";
import { createStripeProvider } from "@informach/billing/providers/stripe";
import { PRODUCTS } from "@informach/config";
import { db, eq } from "@informach/db";
import { checkoutIntents, customers } from "@informach/db/schema";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { iniciarTentativaDeCompraLocked } from "@/features/cobranca/repository";
import { prepararMinhaCompra } from "@/features/cobranca/service";
import { pedidoDaCompra } from "./compra-apoio";
import { adultoDoTeste } from "./teste-apoio";

/** Native admission and PostgreSQL are real. Stripe SDK uses only fixture HTTP;
 * this proves protocol recovery, not a sandbox payment or an invoice settlement.
 */
async function fixture() {
  const adulto = await adultoDoTeste();
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
  const list = (data: unknown[]) => ({ object: "list", data, has_more: false, url: "/fixture" });
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    let resposta: unknown;
    if (request.method === "POST" && url.pathname === "/v1/customers") {
      const body = new URLSearchParams(await request.text());
      resposta = {
        id: remoteCustomerId,
        object: "customer",
        email: body.get("email"),
        metadata: {},
      };
    } else if (request.method === "GET" && url.pathname === "/v1/subscriptions") {
      resposta = list([]);
    } else if (request.method === "GET" && url.pathname === "/v1/checkout/sessions") {
      expect(url.searchParams.get("customer")).toBe(remoteCustomerId);
      resposta = list(
        sessions.filter(
          (s) => !url.searchParams.get("status") || s.status === url.searchParams.get("status"),
        ),
      );
    } else if (request.method === "GET" && url.pathname.startsWith("/v1/checkout/sessions/")) {
      resposta = sessions.find((s) => s.id === url.pathname.split("/").pop());
    } else if (request.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      const body = new URLSearchParams(await request.text());
      const id = `cs_test_${sessions.length + 1}_native`;
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
    products: PRODUCTS.filter((p) => p.app === "recreio").map((p) => ({
      ...p,
      stripePriceId: { dev: `price_${p.id}`, prod: "" },
    })),
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
  return {
    adulto,
    recibo,
    authorization,
    billing,
    entrada,
    sessions,
    enviar,
    inspect,
    perderProximaResposta: () => {
      perderResposta = true;
    },
  };
}

describe("Checkout vinculado a aceite financeiro durável", () => {
  it("resposta perdida é lida do provedor; recibo, chave e prazo não se renovam", async () => {
    const f = await fixture();
    f.perderProximaResposta();
    await expect(f.enviar()).rejects.toThrow();
    expect(f.sessions).toHaveLength(1);
    const [cliente] = await db
      .select()
      .from(customers)
      .where(eq(customers.subjectId, f.adulto.conta.id));
    if (!cliente) throw new Error("Cliente local ausente");
    const [antes] = await db
      .select()
      .from(checkoutIntents)
      .where(eq(checkoutIntents.customerId, cliente.id));
    expect(antes).toMatchObject({ id: f.recibo.id, requestStarted: true, providerSessionId: null });
    expect(antes?.request.expiresAt).toBe(f.authorization.expiresAt);
    const inspeccionado = await f.inspect();
    expect(inspeccionado?.state).toMatchObject({ id: f.sessions[0]?.id, status: "open" });
    const recuperada = await f.enviar();
    expect(recuperada.sessionId).toBe(f.sessions[0]?.id);
    expect(f.sessions).toHaveLength(1);
    const [depois] = await db
      .select()
      .from(checkoutIntents)
      .where(eq(checkoutIntents.customerId, cliente.id));
    expect(depois?.id).toBe(antes?.id);
    expect(depois?.request).toEqual(antes?.request);
    expect(f.sessions[0]?.expires_at).toBe(f.authorization.expiresAt);
    expect(await f.inspect(randomUUID())).toBeNull();
  });
  it("tentativa expirada não é substituída sob o aceite antigo", async () => {
    const f = await fixture();
    await f.enviar();
    const primeira = f.sessions[0];
    if (!primeira) throw new Error("Sessão ausente");
    primeira.status = "expired";
    await expect(f.enviar()).rejects.toBeInstanceOf(CheckoutPendingError);
    expect(f.sessions).toHaveLength(1);
    expect((await f.inspect())?.state?.status).toBe("expired");
  });
  it("outro aceite ou prazo não toma uma tentativa ainda pendente", async () => {
    const f = await fixture();
    await f.enviar();
    for (const managedAuthorization of [
      { ...f.authorization, id: randomUUID() },
      { ...f.authorization, expiresAt: f.authorization.expiresAt + 60 },
    ])
      await expect(
        comCicloDeCobranca(f.adulto.conta.id, () =>
          f.billing.createSubscriptionCheckout({ ...f.entrada, managedAuthorization }),
        ),
      ).rejects.toBeInstanceOf(CheckoutPendingError);
    expect(f.sessions).toHaveLength(1);
    expect((await f.inspect())?.state?.id).toBe(f.sessions[0]?.id);
  });
  it("autorização inválida ou vencida é recusada antes de criar cliente externo", async () => {
    const f = await fixture();
    for (const managedAuthorization of [
      { ...f.authorization, id: "outra" },
      { ...f.authorization, expiresAt: 1 },
    ])
      await expect(
        f.billing.createSubscriptionCheckout({ ...f.entrada, managedAuthorization }),
      ).rejects.toThrow("authorization");
    await expect(
      f.billing.createSubscriptionCheckout({ ...f.entrada, actorId: randomUUID() }),
    ).rejects.toThrow("own payer");
    expect(
      await db.select().from(customers).where(eq(customers.subjectId, f.adulto.conta.id)),
    ).toEqual([]);
    expect(f.sessions).toEqual([]);
  });
});
