import { once } from "node:events";
import { createServer } from "node:http";
import { createStripeRecreioClosureInventory } from "@informach/billing/providers/stripe-recreio-closure-inventory";
import Stripe from "stripe";
import { exigir } from "./provas-arquivos";

type Cenario =
  | "ok"
  | "indisponivel"
  | "outro_pagante"
  | "outro_cliente"
  | "live"
  | "contrato_desconhecido"
  | "pagina_incompleta"
  | "checkout_desconhecido";
/** Closed HTTP fixture used only by GitHub qualification. The actual Stripe
 * SDK and inventory adapter run unchanged. Its literal key is synthetic;
 * no provider credential, external request or provider write is possible. */
export async function criarInventarioFinanceiroDeProva(dado: {
  contaId: string;
  clienteStripeId: string;
}) {
  exigir(
    process.env.CI === "true" &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      process.platform === "linux",
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  let cenario: Cenario = "ok",
    pedidos = 0,
    escrita = false;
  let aposInventario: (() => Promise<void>) | undefined;
  const servidor = createServer(async (pedido, resposta) => {
    pedidos++;
    resposta.setHeader("content-type", "application/json");
    const url = new URL(pedido.url ?? "/", "http://127.0.0.1");
    const cliente = url.pathname === `/v1/customers/${dado.clienteStripeId}`;
    const lista =
      ["/v1/subscriptions", "/v1/checkout/sessions"].includes(url.pathname) &&
      url.searchParams.get("customer") === dado.clienteStripeId &&
      url.searchParams.get("limit") === "100";
    if (pedido.method !== "GET" || (!cliente && !lista) || pedidos > 100) {
      escrita ||= pedido.method !== "GET";
      resposta.statusCode = 400;
      resposta.end(
        JSON.stringify({
          error: { type: "invalid_request_error", message: "Closed synthetic boundary" },
        }),
      );
      return;
    }
    if (cenario === "indisponivel") {
      resposta.statusCode = 503;
      resposta.end(
        JSON.stringify({ error: { type: "api_error", message: "Synthetic provider unavailable" } }),
      );
      return;
    }
    if (cliente) {
      resposta.end(
        JSON.stringify({
          id: cenario === "outro_cliente" ? "cus_other_synthetic" : dado.clienteStripeId,
          object: "customer",
          livemode: cenario === "live",
          metadata: {
            subject_type: "user",
            subject_id: cenario === "outro_pagante" ? "another_synthetic_payer" : dado.contaId,
          },
        }),
      );
      return;
    }
    if (url.pathname === "/v1/checkout/sessions") {
      try {
        await aposInventario?.();
      } catch {
        resposta.statusCode = 500;
        resposta.end(
          JSON.stringify({ error: { type: "api_error", message: "Synthetic local fault" } }),
        );
        return;
      }
    }
    const desconhecido =
      (cenario === "contrato_desconhecido" && url.pathname === "/v1/subscriptions") ||
      (cenario === "checkout_desconhecido" && url.pathname === "/v1/checkout/sessions");
    const item =
      url.pathname === "/v1/subscriptions"
        ? { id: "sub_unknown_synthetic", livemode: false }
        : { id: "cs_unknown_synthetic", livemode: false };
    resposta.end(
      JSON.stringify({
        object: "list",
        data: desconhecido ? [item] : [],
        has_more: cenario === "pagina_incompleta",
      }),
    );
  });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const endereco = servidor.address();
  exigir(
    endereco && typeof endereco !== "string" && endereco.address === "127.0.0.1",
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const chaveSintetica = "rk_test_synthetic_private_recovery";
  const client = new Stripe(chaveSintetica, {
    apiVersion: "2026-04-22.dahlia",
    host: "127.0.0.1",
    port: endereco.port,
    protocol: "http",
    timeout: 2000,
    maxNetworkRetries: 0,
    telemetry: false,
  });
  const inventario = createStripeRecreioClosureInventory({
    secretKey: chaveSintetica,
    mode: "dev",
    client,
  });
  return {
    inventario,
    cenario(entrada: Cenario) {
      cenario = entrada;
    },
    aposInventario(callback: (() => Promise<void>) | undefined) {
      aposInventario = callback;
    },
    conferir() {
      exigir(!escrita && pedidos > 0 && pedidos <= 100, "INVENTARIO_FORA_DO_ESCOPO");
      return pedidos;
    },
    async encerrar() {
      servidor.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        servidor.close((erro) => (erro ? reject(erro) : resolve())),
      );
    },
  };
}
