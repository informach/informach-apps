import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  createStripeRecreioPlanSchedules,
  planScheduleKey,
  type RecreioPlanScheduleInput,
} from "../providers/stripe-plans";

/** Real SDK serialization against a closed HTTP transport. No provider I/O. */
function fixture() {
  let now = new Date("2026-11-18T12:00:00Z");
  const input: RecreioPlanScheduleInput = {
    intentId: "native_change",
    customerId: "cus_native",
    subscriptionId: "sub_native",
    fromPriceId: "price_family",
    toPriceId: "price_individual",
    toProductId: "recreio_individual_monthly",
    interval: "month",
    effectiveAt: new Date("2026-12-18T12:00:00Z"),
    requestStartedAt: now,
    origin: {
      authorizationId: "native_purchase",
      productId: "recreio_family_monthly",
      payerId: "native_payer",
    },
  };
  const start = now.getTime() / 1000;
  const end = input.effectiveAt.getTime() / 1000;
  function phase(price: string, begins: number, ends: number, metadata: Record<string, string>) {
    return {
      start_date: begins,
      end_date: ends,
      items: [{ price, quantity: 1, metadata: {}, discounts: [], tax_rates: [] }],
      add_invoice_items: [],
      currency: "brl",
      collection_method: "charge_automatically",
      default_tax_rates: [],
      discounts: [],
      metadata,
      proration_behavior: "none",
    };
  }
  const sub = {
    id: input.subscriptionId,
    object: "subscription",
    customer: input.customerId,
    livemode: false,
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    pending_update: null,
    pause_collection: null,
    metadata: {
      subject_type: "user",
      subject_id: input.origin.payerId,
      checkout_intent_id: input.origin.authorizationId,
      product_id: input.origin.productId,
    },
    discounts: [],
    items: {
      object: "list",
      has_more: false,
      data: [
        {
          id: "si_native",
          quantity: 1,
          price: { id: input.fromPriceId },
          current_period_start: start,
          current_period_end: end,
          discounts: [],
        },
      ],
    },
  };
  let attached: string | null = null;
  const metadata: Record<string, string> = {};
  const schedule = {
    id: "sub_sched_native",
    object: "subscription_schedule",
    customer: input.customerId,
    livemode: false,
    status: "active",
    metadata,
    phases: [phase(input.fromPriceId, start, end, { retained: "yes" })],
    end_behavior: "release",
  };
  const events: Array<{
    id: string;
    object: string;
    request: { idempotency_key: string };
    data: { object: { id: string } };
  }> = [];
  const writes: Array<{ path: string; params: URLSearchParams; key: string | null }> = [];
  let lose: "create" | "update" | null = null;
  const remoteSchedule = () => ({
    ...schedule,
    subscription: attached ? sub.id : null,
    released_subscription: schedule.status === "released" ? sub.id : null,
  });
  const transport: typeof fetch = async (url, init) => {
    const request = new Request(url, init);
    const path = new URL(request.url).pathname;
    let data: unknown;
    if (request.method === "GET") {
      if (path === `/v1/subscriptions/${sub.id}`) data = { ...sub, schedule: attached };
      else if (path === "/v1/events")
        data = { object: "list", data: events, has_more: false, url: "/v1/events" };
      else if (path === `/v1/subscription_schedules/${schedule.id}`) data = remoteSchedule();
      else throw new Error(`Unexpected closed GET ${path}`);
    } else if (request.method === "POST") {
      const params = new URLSearchParams(await request.text());
      const key = request.headers.get("idempotency-key");
      writes.push({ path, params, key });
      if (path === "/v1/subscription_schedules") {
        expect(params.get("from_subscription")).toBe(sub.id);
        if (attached) throw new Error("Schedule already attached");
        if (!key) throw new Error("Missing creation key");
        attached = schedule.id;
        events.push({
          id: "evt_native_create",
          object: "event",
          request: { idempotency_key: key },
          data: { object: { id: schedule.id } },
        });
        if (lose === "create") {
          lose = null;
          throw new TypeError("Creation response lost");
        }
      } else if (path === `/v1/subscription_schedules/${schedule.id}`) {
        schedule.metadata = Object.fromEntries(
          [...params].flatMap(([key, value]) => {
            const name = /^metadata\[([^\]]+)\]$/.exec(key)?.[1];
            return name ? [[name, value]] : [];
          }),
        );
        const price = params.get("phases[1][items][0][price]");
        const product = params.get("phases[1][metadata][product_id]");
        const marker = params.get("phases[1][metadata][recreio_plan_intent]");
        if (!price || !product || !marker) throw new Error("Incomplete phase payload");
        schedule.phases = [
          schedule.phases[0] ?? phase(input.fromPriceId, start, end, {}),
          phase(price, end, end + 30 * 86400, {
            retained: "yes",
            product_id: product,
            recreio_plan_intent: marker,
          }),
        ];
        if (lose === "update") {
          lose = null;
          throw new TypeError("Configuration response lost");
        }
      } else if (path === `/v1/subscription_schedules/${schedule.id}/release`) {
        expect(params.get("preserve_cancel_date")).toBe("true");
        attached = null;
        schedule.status = "released";
      } else throw new Error(`Unexpected closed POST ${path}`);
      data = remoteSchedule();
    } else throw new Error("Unexpected closed HTTP method");
    return Response.json(data, { headers: { "request-id": "req_native_schedule" } });
  };
  const client = new Stripe("sk_test_closed_schedule", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const adapter = createStripeRecreioPlanSchedules({
    secretKey: "unused",
    mode: "dev",
    client,
    now: () => now,
  });
  return {
    input,
    adapter,
    sub,
    schedule,
    events,
    writes,
    setNow: (date: Date) => {
      now = date;
    },
    loseResponse: (operation: "create" | "update") => {
      lose = operation;
    },
    attach: () => {
      attached = schedule.id;
    },
    reconcile: (cancel = false) => adapter.reconcile({ ...input, scheduleId: schedule.id, cancel }),
  };
}

describe("agendamento Stripe nativo do Recreio", () => {
  it("conserva a origem do Checkout e altera o mesmo contrato apenas no fim pago", async () => {
    const f = fixture();
    expect(await f.adapter.create(f.input)).toBe(f.schedule.id);
    expect(await f.reconcile()).toBe("scheduled");
    expect(await f.reconcile()).toBe("scheduled");
    expect(f.writes).toHaveLength(2);
    expect(f.writes[0]?.key).toBe(planScheduleKey(f.input.intentId, "recreio"));
    const params = f.writes[1]?.params;
    expect(params?.get("proration_behavior")).toBe("none");
    expect(params?.get("phases[1][items][0][price]")).toBe(f.input.toPriceId);
    expect(params?.get("phases[1][metadata][product_id]")).toBe(f.input.origin.productId);
    expect(params?.get("phases[1][metadata][recreio_plan_intent]")).toBe(f.input.intentId);
    expect(params?.get("metadata[compasso_plan_intent]")).toBeNull();
    expect(f.sub.items.data[0]?.price.id).toBe(f.input.fromPriceId);
    expect(f.sub.metadata.checkout_intent_id).toBe(f.input.origin.authorizationId);
  });

  it.each(["create", "update"] as const)(
    "recupera resposta perdida de %s sem outra agenda",
    async (operation) => {
      const f = fixture();
      f.loseResponse(operation);
      if (operation === "create") await expect(f.adapter.create(f.input)).rejects.toThrow();
      expect(await f.adapter.create(f.input)).toBe(f.schedule.id);
      if (operation === "update") await expect(f.reconcile()).rejects.toThrow();
      expect(await f.reconcile()).toBe("scheduled");
      expect(f.writes).toHaveLength(2);
    },
  );

  it.each(["subject_type", "subject_id", "checkout_intent_id", "product_id"] as const)(
    "recusa origem divergente em %s antes de escrever",
    async (field) => {
      const f = fixture();
      f.sub.metadata[field] = "foreign";
      await expect(f.adapter.create(f.input)).rejects.toThrow("original purchase");
      expect(f.writes).toEqual([]);
    },
  );
  it("recusa modo, customer e origem ausente antes de criar", async () => {
    const f = fixture();
    f.sub.livemode = true;
    await expect(f.adapter.create(f.input)).rejects.toThrow("original purchase");
    f.sub.livemode = false;
    f.sub.customer = "cus_foreign";
    await expect(f.adapter.create(f.input)).rejects.toThrow("scope");
    f.sub.customer = f.input.customerId;
    await expect(
      f.adapter.create({ ...f.input, origin: { ...f.input.origin, payerId: "" } }),
    ).rejects.toThrow("scope");
    expect(f.writes).toEqual([]);
  });
  it("não adota agenda anexada sem recibo exato da criação nativa", async () => {
    const f = fixture();
    f.attach();
    await expect(f.adapter.create(f.input)).rejects.toThrow("exact native creation receipt");
    f.schedule.metadata.compasso_plan_intent = f.input.intentId;
    await expect(f.adapter.create(f.input)).rejects.toThrow("another request");
    expect(f.writes).toEqual([]);
  });
  it("uma chave Compasso não comprova a criação e a janela vencida não autoriza repetir", async () => {
    const f = fixture();
    f.events.push({
      id: "evt_foreign",
      object: "event",
      request: { idempotency_key: planScheduleKey(f.input.intentId) },
      data: { object: { id: f.schedule.id } },
    });
    f.setNow(new Date(f.input.requestStartedAt.getTime() + 24 * 3600_000));
    await expect(f.adapter.create(f.input)).rejects.toThrow("idempotency window elapsed");
    expect(f.writes).toEqual([]);
  });
  it("recusa fase que apagaria o aceite original", async () => {
    const f = fixture();
    const phase = f.schedule.phases[0];
    if (!phase) throw new Error("Fixture phase absent");
    phase.metadata.product_id = "foreign";
    await f.adapter.create(f.input);
    await expect(f.reconcile()).rejects.toThrow("overwrite the original purchase");
    expect(f.writes).toHaveLength(1);
  });
  it.each(["product_id", "recreio_plan_intent"])(
    "recusa deriva em %s antes de admitir aplicação",
    async (key) => {
      const f = fixture();
      await f.adapter.create(f.input);
      await f.reconcile();
      const phase = f.schedule.phases[1];
      const item = f.sub.items.data[0];
      if (!phase || !item) throw new Error("Fixture phase/item absent");
      phase.metadata[key] = "foreign";
      await expect(f.reconcile()).rejects.toThrow("differs");
      item.price.id = f.input.toPriceId;
      item.current_period_start = f.input.effectiveAt.getTime() / 1000;
      await expect(f.reconcile()).rejects.toThrow("differs");
      expect(f.writes).toHaveLength(2);
    },
  );
  it("confere o modo da agenda antes de liberar ou configurar", async () => {
    const f = fixture();
    await f.adapter.create(f.input);
    f.schedule.livemode = true;
    await expect(f.reconcile(true)).rejects.toThrow("another request");
    expect(f.writes).toHaveLength(1);
  });
  it("desfazer libera somente o envelope e preserva contrato e data de cancelamento", async () => {
    const f = fixture();
    await f.adapter.create(f.input);
    await f.reconcile();
    expect(await f.reconcile(true)).toBe("canceled");
    expect(await f.reconcile(true)).toBe("canceled");
    expect(f.writes).toHaveLength(3);
    expect(f.sub.status).toBe("active");
    expect(f.sub.items.data[0]?.price.id).toBe(f.input.fromPriceId);
  });
  it("admite a fase comprovada e libera o envelope sem cancelar a assinatura", async () => {
    const f = fixture();
    await f.adapter.create(f.input);
    await f.reconcile();
    const item = f.sub.items.data[0];
    if (!item) throw new Error("Fixture item absent");
    item.price.id = f.input.toPriceId;
    item.current_period_start = f.input.effectiveAt.getTime() / 1000;
    expect(await f.reconcile()).toBe("applied");
    expect(await f.reconcile()).toBe("applied");
    expect(f.writes).toHaveLength(3);
    expect(f.sub.id).toBe(f.input.subscriptionId);
    expect(f.sub.metadata.product_id).toBe(f.input.origin.productId);
  });
});
