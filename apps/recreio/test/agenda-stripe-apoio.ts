import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { fixtureDePagamento } from "./pagamento-stripe-apoio";

type Financeiro = ReturnType<Awaited<ReturnType<typeof fixtureDePagamento>>["concluirCheckout"]>;

/** Closed HTTP boundary for the real Stripe SDK; never sends payments or
 * establishes sandbox settlement. Native admission and receipts use real PG. */
export function transporteDeAgenda() {
  let financeiro: Financeiro | undefined;
  const agendaId = `sub_sched_fixture_${randomUUID().replaceAll("-", "")}`;
  let attached = false;
  let configurada = false;
  let liberada = false;
  let destino = "";
  let pedidoId = "";
  let perda: "create" | "update" | "release" | null = null;
  let antes: (() => Promise<void>) | undefined;
  let depois: (() => Promise<void>) | undefined;
  const eventos: {
    id: string;
    request: { idempotency_key: string };
    data: { object: { id: string } };
  }[] = [];
  const escritas: { path: string; body: URLSearchParams; key: string | null }[] = [];
  function contexto() {
    if (!financeiro) throw new Error("Closed schedule fixture not initialized");
    const item = financeiro.assinatura.items.data[0];
    if (!item) throw new Error("Closed subscription item absent");
    return { financeiro, item };
  }
  let inicio = 0,
    fim = 0;
  function fase(preco: string, start: number, end: number, metadata: Record<string, string>) {
    return {
      start_date: start,
      end_date: end,
      items: [{ price: preco, quantity: 1, metadata: {}, discounts: [], tax_rates: [] }],
      add_invoice_items: [],
      currency: "brl",
      collection_method: "charge_automatically",
      default_tax_rates: [],
      discounts: [],
      metadata,
      proration_behavior: "none",
    };
  }
  function agenda() {
    const { financeiro } = contexto();
    const metadata = { ...financeiro.assinatura.metadata };
    return {
      id: agendaId,
      object: "subscription_schedule",
      customer: financeiro.assinatura.customer,
      livemode: false,
      status: liberada ? "released" : "active",
      subscription: attached ? financeiro.assinatura.id : null,
      released_subscription: liberada ? financeiro.assinatura.id : null,
      metadata: configurada ? { recreio_plan_intent: pedidoId } : {},
      end_behavior: "release",
      phases: [
        fase(financeiro.linha.pricing.price_details.price, inicio, fim, metadata),
        ...(configurada
          ? [fase(destino, fim, fim + 30 * 86400, { ...metadata, recreio_plan_intent: pedidoId })]
          : []),
      ],
    };
  }
  return {
    agendaId,
    escritas,
    abrir(dados: Financeiro) {
      financeiro = dados;
      const { item } = contexto();
      inicio = item.current_period_start;
      fim = item.current_period_end;
    },
    perderResposta(operacao: "create" | "update" | "release") {
      perda = operacao;
    },
    antesDeEnviar(callback: () => Promise<void>) {
      antes = callback;
    },
    aposPersistir(callback: () => Promise<void>) {
      depois = callback;
    },
    aplicar() {
      const { item } = contexto();
      if (!configurada) throw new Error("Closed schedule is not configured");
      item.price.id = destino;
      item.current_period_start = fim;
      item.current_period_end = fim + 30 * 86400;
    },
    async http(request: Request): Promise<Response | null> {
      if (!financeiro) return null;
      const path = new URL(request.url).pathname;
      let resposta: unknown;
      if (request.method === "GET" && path === `/v1/subscriptions/${financeiro.assinatura.id}`)
        resposta = { ...financeiro.assinatura, schedule: attached ? agendaId : null };
      else if (request.method === "GET" && path === "/v1/events")
        resposta = { object: "list", data: eventos, has_more: false, url: "/v1/events" };
      else if (request.method === "GET" && path === `/v1/subscription_schedules/${agendaId}`)
        resposta = agenda();
      else if (request.method === "POST" && path.startsWith("/v1/subscription_schedules")) {
        await antes?.();
        const body = new URLSearchParams(await request.text());
        const key = request.headers.get("idempotency-key");
        escritas.push({ path, body, key });
        let operacao: "create" | "update" | "release";
        if (path === "/v1/subscription_schedules") {
          operacao = "create";
          expect(body.get("from_subscription")).toBe(financeiro.assinatura.id);
          if (attached || !key) throw new Error("Closed schedule creation scope invalid");
          attached = true;
          eventos.push({
            id: `evt_${randomUUID()}`,
            request: { idempotency_key: key },
            data: { object: { id: agendaId } },
          });
        } else if (path === `/v1/subscription_schedules/${agendaId}`) {
          operacao = "update";
          const preco = body.get("phases[1][items][0][price]");
          const marcador = body.get("metadata[recreio_plan_intent]");
          if (!preco || !marcador) throw new Error("Closed schedule terms absent");
          expect(body.get("phases[1][metadata][product_id]")).toBe(
            financeiro.assinatura.metadata.product_id,
          );
          expect(body.get("phases[1][proration_behavior]")).toBe("none");
          destino = preco;
          pedidoId = marcador;
          configurada = true;
        } else if (path === `/v1/subscription_schedules/${agendaId}/release`) {
          operacao = "release";
          attached = false;
          liberada = true;
        } else throw new Error("Unexpected closed schedule mutation");
        await depois?.();
        if (perda === operacao) {
          perda = null;
          throw new TypeError("Closed schedule response lost after persistence");
        }
        resposta = agenda();
      } else return null;
      return Response.json(resposta, { headers: { "request-id": "req_native_plan_fixture" } });
    },
  };
}
