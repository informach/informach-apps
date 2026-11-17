import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeFutureContractProvider } from "../providers/stripe-future-contract";

function fixture() {
  const now = Math.floor(Date.now() / 1000);
  const setup = {
    intentId: "intent_fixture",
    customerId: "cus_fixture",
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    expiresAt: now + 3600,
  };
  const future = {
    intentId: setup.intentId,
    customerId: setup.customerId,
    paymentMethodId: "pm_fixture",
    priceId: "price_fixture",
    interval: "month" as const,
    startsAt: now + 86400,
    paidThroughMs: (now + 86400) * 1000,
    amountCents: 4990,
  };
  const session = {
    id: "cs_fixture",
    object: "checkout.session",
    livemode: false,
    mode: "setup",
    customer: setup.customerId,
    metadata: { compasso_future_intent: setup.intentId },
    expires_at: setup.expiresAt,
    success_url: setup.successUrl,
    cancel_url: setup.cancelUrl,
    status: "open",
    url: "https://checkout.stripe.com/test",
    setup_intent: "seti_fixture",
  };
  const intent = {
    id: "seti_fixture",
    object: "setup_intent",
    livemode: false,
    status: "succeeded",
    usage: "off_session",
    customer: setup.customerId,
    metadata: { compasso_future_intent: setup.intentId },
    payment_method: future.paymentMethodId,
  };
  const method = {
    id: future.paymentMethodId,
    object: "payment_method",
    livemode: false,
    customer: setup.customerId,
  };
  const price = {
    id: future.priceId,
    object: "price",
    livemode: false,
    active: true,
    type: "recurring",
    billing_scheme: "per_unit",
    currency: "brl",
    unit_amount: 4990,
    recurring: { interval: "month", interval_count: 1 },
  };
  const schedule = {
    id: "sub_sched_fixture",
    object: "subscription_schedule",
    livemode: false,
    customer: setup.customerId,
    metadata: { compasso_future_intent: setup.intentId },
    status: "not_started",
    subscription: null as string | null,
    released_subscription: null as string | null,
    end_behavior: "release",
    default_settings: {
      default_payment_method: future.paymentMethodId,
      automatic_tax: { enabled: false },
    },
    phases: [{ start_date: future.startsAt, items: [{ price: future.priceId, quantity: 1 }] }],
  };
  let sessionCreated = false;
  let scheduleCreated = false;
  let setupWrites = 0;
  let expireWrites = 0;
  let scheduleWrites = 0;
  let cancelWrites = 0;
  let loseSetup = false;
  let loseSchedule = false;
  let loseCancel = false;
  const list = (data: unknown[]) => ({ object: "list", data, has_more: false, url: "/v1/fixture" });
  const transport: typeof fetch = async (raw, init) => {
    const url = new URL(typeof raw === "string" ? raw : raw instanceof URL ? raw.href : raw.url);
    const methodName = init?.method ?? "GET";
    let body: unknown;
    let status = 200;
    if (url.pathname === "/v1/checkout/sessions" && methodName === "GET")
      body = list(sessionCreated ? [session] : []);
    else if (url.pathname === "/v1/checkout/sessions" && methodName === "POST") {
      setupWrites++;
      sessionCreated = true;
      if (loseSetup) {
        loseSetup = false;
        status = 500;
        body = { error: { message: "lost setup response", type: "api_error" } };
      } else body = session;
    } else if (
      url.pathname === "/v1/checkout/sessions/cs_fixture/expire" &&
      methodName === "POST"
    ) {
      expireWrites++;
      session.status = "expired";
      body = session;
    } else if (url.pathname === "/v1/checkout/sessions/cs_fixture") body = session;
    else if (url.pathname === "/v1/setup_intents/seti_fixture") body = intent;
    else if (url.pathname === "/v1/payment_methods/pm_fixture") body = method;
    else if (url.pathname === "/v1/prices/price_fixture") body = price;
    else if (url.pathname === "/v1/subscription_schedules" && methodName === "GET")
      body = list(scheduleCreated ? [schedule] : []);
    else if (url.pathname === "/v1/subscription_schedules" && methodName === "POST") {
      scheduleWrites++;
      scheduleCreated = true;
      if (loseSchedule) {
        loseSchedule = false;
        status = 500;
        body = { error: { message: "lost schedule response", type: "api_error" } };
      } else body = schedule;
    } else if (
      url.pathname === "/v1/subscription_schedules/sub_sched_fixture" &&
      methodName === "GET"
    )
      body = schedule;
    else if (
      url.pathname === "/v1/subscription_schedules/sub_sched_fixture/cancel" &&
      methodName === "POST"
    ) {
      cancelWrites++;
      schedule.status = "canceled";
      if (loseCancel) {
        loseCancel = false;
        status = 500;
        body = { error: { message: "lost cancellation response", type: "api_error" } };
      } else body = schedule;
    } else throw new Error(`Unexpected Stripe fixture path: ${url.pathname}`);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "request-id": "req_fixture" },
    });
  };
  const client = new Stripe("sk_test_fixture", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const provider = createStripeFutureContractProvider({ secretKey: "unused", mode: "dev", client });
  return {
    setup,
    future,
    session,
    intent,
    method,
    price,
    schedule,
    provider,
    loseSetup: () => {
      loseSetup = true;
    },
    loseSchedule: () => {
      loseSchedule = true;
    },
    loseCancel: () => {
      loseCancel = true;
    },
    setupWrites: () => setupWrites,
    expireWrites: () => expireWrites,
    scheduleWrites: () => scheduleWrites,
    cancelWrites: () => cancelWrites,
  };
}

describe("Stripe future contract boundary", () => {
  it("recovers a lost setup response and verifies the off-session authorization belongs to the customer", async () => {
    const f = fixture();
    f.loseSetup();
    await expect(f.provider.setup(f.setup)).rejects.toThrow();
    expect(await f.provider.setup(f.setup)).toMatchObject({ id: "cs_fixture", status: "open" });
    expect(f.setupWrites()).toBe(1);
    f.session.status = "complete";
    expect(await f.provider.readSetup(f.setup, f.session.id)).toEqual({
      status: "complete",
      paymentMethodId: "pm_fixture",
    });
    f.method.customer = "cus_other";
    await expect(f.provider.readSetup(f.setup, f.session.id)).rejects.toThrow("another customer");
  });
  it("recovers a lost schedule response without creating a second future subscription", async () => {
    const f = fixture();
    expect(await f.provider.findSchedule(f.future)).toBeNull();
    expect(f.scheduleWrites()).toBe(0);
    f.loseSchedule();
    await expect(f.provider.schedule(f.future)).rejects.toThrow();
    expect(await f.provider.findSchedule(f.future)).toEqual({
      id: "sub_sched_fixture",
      status: "not_started",
    });
    expect(await f.provider.schedule(f.future)).toEqual({
      id: "sub_sched_fixture",
      status: "not_started",
    });
    expect(f.scheduleWrites()).toBe(1);
    f.schedule.status = "active";
    f.schedule.subscription = "sub_fixture";
    expect(await f.provider.readSchedule(f.future, f.schedule.id)).toEqual({
      id: f.schedule.id,
      status: "active",
      subscriptionId: "sub_fixture",
    });
    await expect(
      f.provider.schedule({ ...f.future, paidThroughMs: f.future.startsAt * 1000 + 1 }),
    ).rejects.toThrow("Invalid future subscription terms");
    await expect(f.provider.schedule({ ...f.future, priceId: "price_other" })).rejects.toThrow(
      "conflicts",
    );
    f.schedule.phases.push({
      start_date: f.future.startsAt + 86400,
      items: [{ price: f.future.priceId, quantity: 1 }],
    });
    await expect(f.provider.schedule(f.future)).rejects.toThrow("conflicts");
  });
  it("expires an uncompleted setup session without repeating the mutation", async () => {
    const f = fixture();
    expect(await f.provider.findSetupSession(f.setup)).toBeNull();
    await f.provider.setup(f.setup);
    expect(await f.provider.findSetupSession(f.setup)).toMatchObject({
      id: f.session.id,
      status: "open",
    });
    expect(await f.provider.expireSetup(f.setup, f.session.id)).toMatchObject({
      status: "expired",
    });
    expect(await f.provider.findSetupSession(f.setup)).toMatchObject({
      id: f.session.id,
      status: "expired",
    });
    expect(await f.provider.expireSetup(f.setup, f.session.id)).toMatchObject({
      status: "expired",
    });
    expect(f.expireWrites()).toBe(1);
  });
  it("refuses to create a schedule too close to the end of the paid period", async () => {
    const f = fixture();
    const startsAt = Math.floor(Date.now() / 1000) + 60;
    await expect(
      f.provider.schedule({ ...f.future, startsAt, paidThroughMs: startsAt * 1000 }),
    ).rejects.toThrow("too close");
    expect(f.scheduleWrites()).toBe(0);
  });
  it("recovers a lost future cancellation without a second provider mutation", async () => {
    const f = fixture();
    await f.provider.schedule(f.future);
    f.loseCancel();
    await expect(f.provider.cancelSchedule(f.future, f.schedule.id)).rejects.toThrow();
    expect(await f.provider.cancelSchedule(f.future, f.schedule.id)).toEqual({
      id: f.schedule.id,
      status: "canceled",
    });
    expect(f.cancelWrites()).toBe(1);
    f.schedule.status = "active";
    await expect(f.provider.cancelSchedule(f.future, f.schedule.id)).rejects.toThrow(
      "normal cancellation flow",
    );
  });
});
