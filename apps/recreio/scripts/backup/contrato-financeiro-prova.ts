import { once } from "node:events";
import { createServer } from "node:http";
import { createStripeRecreioClosureInventory } from "@informach/billing/providers/stripe-recreio-closure-inventory";
import {
  createStripeRecreioRenewals,
  recreioRenewalKey,
} from "@informach/billing/providers/stripe-recreio-renewals";
import Stripe from "stripe";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Independent synthetic remote state from the source's native SDK fixture.
 * Only loopback HTTP; no provider interface, payment or receipt is mocked. */
export async function criarContratoFinanceiroDeProva(
  dado: RetiradaNativaDeProva["financeiro"]["comContrato"],
) {
  exigir(
    process.env.CI === "true" &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      process.platform === "linux" &&
      dado.inicio < dado.fim &&
      dado.fim * 1000 > Date.now(),
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const metadata = {
    checkout_intent_id: dado.compraId,
    subject_type: "user",
    subject_id: dado.contaId,
    product_id: "recreio_individual_monthly",
  };
  const assinatura = {
    id: dado.assinaturaStripeId,
    object: "subscription",
    customer: dado.clienteStripeId,
    livemode: false,
    status: "active",
    collection_method: "charge_automatically",
    cancel_at_period_end: false,
    cancel_at: null,
    schedule: null,
    pending_update: null,
    pause_collection: null,
    metadata,
    items: {
      has_more: false,
      data: [
        {
          id: "si_closed_native_contract",
          quantity: 1,
          price: { id: "price_recreio_individual_monthly" },
          current_period_start: dado.inicio,
          current_period_end: dado.fim,
        },
      ],
    },
  };
  const checkout = {
    id: dado.checkoutStripeId,
    object: "checkout.session",
    customer: dado.clienteStripeId,
    livemode: false,
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    subscription: assinatura.id,
    metadata,
  };
  let cancelamentoId: string | undefined;
  let pedidos = 0,
    escritas = 0,
    violacoes = 0;
  const servidor = createServer(async (pedido, resposta) => {
    pedidos++;
    resposta.setHeader("content-type", "application/json");
    try {
      const url = new URL(pedido.url ?? "/", "http://127.0.0.1");
      let body: unknown;
      if (pedidos > 100) throw new Error("Closed request budget exceeded");
      if (pedido.method === "GET" && url.pathname === `/v1/customers/${dado.clienteStripeId}`) {
        body = {
          id: dado.clienteStripeId,
          object: "customer",
          livemode: false,
          metadata: { subject_type: "user", subject_id: dado.contaId },
        };
      } else if (pedido.method === "GET" && url.pathname === `/v1/subscriptions/${assinatura.id}`) {
        body = assinatura;
      } else if (
        pedido.method === "GET" &&
        ["/v1/subscriptions", "/v1/checkout/sessions"].includes(url.pathname) &&
        url.searchParams.get("customer") === dado.clienteStripeId &&
        url.searchParams.get("limit") === "100" &&
        !url.searchParams.has("starting_after")
      ) {
        body = {
          object: "list",
          data: [url.pathname === "/v1/subscriptions" ? assinatura : checkout],
          has_more: false,
        };
      } else if (
        pedido.method === "POST" &&
        url.pathname === `/v1/subscriptions/${assinatura.id}` &&
        cancelamentoId &&
        pedido.headers["idempotency-key"] === recreioRenewalKey(cancelamentoId) &&
        escritas === 0
      ) {
        let texto = "";
        for await (const parte of pedido) {
          texto += parte.toString("utf8");
          if (texto.length > 256) throw new Error("Closed request body exceeded");
        }
        if (texto !== "cancel_at_period_end=true") throw new Error("Closed mutation refused");
        escritas++;
        assinatura.cancel_at_period_end = true;
        body = assinatura;
      } else throw new Error("Closed request refused");
      resposta.end(JSON.stringify(body));
    } catch {
      violacoes++;
      resposta.statusCode = 400;
      resposta.end(
        JSON.stringify({ error: { type: "invalid_request_error", message: "Closed boundary" } }),
      );
    }
  });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const endereco = servidor.address();
  exigir(
    endereco && typeof endereco !== "string" && endereco.address === "127.0.0.1",
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const secretKey = "rk_test_closed_private_contract";
  const client = new Stripe(secretKey, {
    apiVersion: "2026-04-22.dahlia",
    host: "127.0.0.1",
    port: endereco.port,
    protocol: "http",
    timeout: 2000,
    maxNetworkRetries: 0,
    telemetry: false,
  });
  return {
    inventario: createStripeRecreioClosureInventory({ secretKey, mode: "dev", client }),
    renovacoes: createStripeRecreioRenewals({ secretKey, mode: "dev", client }),
    admitirCancelamento(id: string) {
      exigir(!cancelamentoId && /^[a-f0-9-]{36}$/.test(id), "EXECUTOR_FORA_DO_ESCOPO");
      cancelamentoId = id;
    },
    conferir() {
      exigir(
        violacoes === 0 &&
          pedidos > 5 &&
          pedidos <= 100 &&
          escritas === 1 &&
          assinatura.status === "active" &&
          assinatura.cancel_at_period_end,
        "CONTRATO_NATIVO_DIVERGENTE",
      );
      return { pedidos, escritas };
    },
    async encerrar() {
      servidor.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        servidor.close((erro) => (erro ? reject(erro) : resolve())),
      );
    },
  };
}
