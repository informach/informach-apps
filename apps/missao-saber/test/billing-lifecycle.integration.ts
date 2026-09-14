import { randomUUID } from "node:crypto";
import {
  type BillingServiceConfig,
  CheckoutPendingError,
  createBillingService,
} from "@informach/billing";
import { PRODUCTS } from "@informach/config";
import { db, eq } from "@informach/db";
import { checkoutIntents, customers, subscriptions, users } from "@informach/db/schema";
import { afterAll, describe, expect, it, vi } from "vitest";
import { withBillingLifecycle } from "@/features/billing/repository";

type Provider = NonNullable<BillingServiceConfig["providerClient"]>;
type State = NonNullable<Awaited<ReturnType<NonNullable<Provider["findCheckoutSession"]>>>>;
const owners: string[] = [];
const customerIds: string[] = [];
afterAll(async () => {
  for (const id of customerIds) {
    await db.delete(checkoutIntents).where(eq(checkoutIntents.customerId, id));
    await db.delete(subscriptions).where(eq(subscriptions.customerId, id));
    await db.delete(customers).where(eq(customers.id, id));
  }
  for (const id of owners) await db.delete(users).where(eq(users.id, id));
});

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture(withRemoteSubscription = false) {
  const owner = randomUUID();
  owners.push(owner);
  const email = `${owner}@example.test`;
  const app = `review-${owner}`;
  await db.insert(users).values({ id: owner, name: "Lifecycle test", email });
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_${owner}`,
      subjectType: "user",
      subjectId: owner,
      app,
      email,
    })
    .returning();
  if (!customer) throw new Error("Missing fixture");
  customerIds.push(customer.id);
  const sessions = new Map<string, State & { intentId: string }>();
  const requests: Parameters<Provider["createCheckoutSession"]>[0][] = [];
  const remote = { active: withRemoteSubscription, loseResponse: false, failBeforeCreate: false };
  const provider: Provider = {
    name: "stripe",
    async createCustomer() {
      throw new Error("Customer already seeded");
    },
    async retrieveCustomer() {
      throw new Error("Unexpected provider call");
    },
    async createPortalSession() {
      throw new Error("Unexpected provider call");
    },
    async cancelSubscription() {
      throw new Error("Use remote customer closure");
    },
    async updateSubscription() {
      throw new Error("Unexpected provider call");
    },
    verifyWebhookSignature() {
      throw new Error("Use verified event fixture");
    },
    async findCheckoutSession(_customer: string, intentId: string) {
      return [...sessions.values()].find((s) => s.intentId === intentId) ?? null;
    },
    async createCheckoutSession(input: Parameters<Provider["createCheckoutSession"]>[0]) {
      requests.push(input);
      if (remote.failBeforeCreate) throw new Error("Transport unavailable");
      const id = `cs_${requests.length}`;
      sessions.set(id, {
        id,
        url: `https://checkout.example.test/${id}`,
        status: "open",
        subscriptionId: null,
        intentId: input.metadata.checkout_intent_id ?? "",
      });
      if (remote.loseResponse) {
        remote.loseResponse = false;
        throw new Error("Response lost");
      }
      return { id, url: `https://checkout.example.test/${id}` };
    },
    async prepareSubscriptionCheckout(_customer: string, preserve?: string) {
      if (remote.active) throw new CheckoutPendingError();
      for (const s of sessions.values())
        if (s.id !== preserve && s.status === "open") s.status = "expired";
    },
    async closeCustomerSubscriptions() {
      for (const s of sessions.values()) if (s.status === "open") s.status = "expired";
      remote.active = false;
      return { expired: sessions.size, canceled: 1, subscriptionIds: [`sub_${owner}`] };
    },
    async retrieveSubscription() {
      return {
        id: `sub_${owner}`,
        status: remote.active ? "active" : "canceled",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      };
    },
  };
  const config: BillingServiceConfig = {
    db,
    provider: "stripe",
    providerClient: provider,
    app,
    appName: "Lifecycle test",
    publicAppUrl: "http://localhost:3005",
    organizationsEnabled: false,
    stripeMode: "dev",
    managedCheckout: true,
    guardClosedBilling: true,
    withSubjectLock: (subject, operation) => withBillingLifecycle(subject.id, operation),
    products: PRODUCTS.filter((p) => p.app === "missao-saber").map((p) => ({
      ...p,
      stripePriceId: { dev: `price_${p.id}`, prod: `price_${p.id}` },
    })),
    resolveSubjectEmail: async () => email,
  };
  const service = createBillingService(config);
  const checkout = (productId = "missao_individual_monthly") =>
    withBillingLifecycle(owner, () =>
      service.createSubscriptionCheckout({
        subject: { type: "user", id: owner },
        productId,
        successUrl: "http://localhost:3005/familia?ok=1",
        cancelUrl: "http://localhost:3005/familia",
      }),
    );
  const close = () =>
    withBillingLifecycle(owner, () =>
      service.closeRemoteBillingForSubject({ type: "user", id: owner }),
    );
  const localSubscription = async () => {
    const [row] = await db
      .insert(subscriptions)
      .values({
        customerId: customer.id,
        provider: "stripe",
        providerSubscriptionId: `sub_${owner}`,
        productId: "missao_individual_monthly",
        providerPriceId: "price_fixture",
        status: "past_due",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400000),
        metadata: { dunning: { pending: true, attempts: 0, lastInvoiceId: `in_${owner}` } },
      })
      .returning();
    if (!row) throw new Error("Missing subscription");
    return row;
  };
  return {
    owner,
    customer,
    app,
    config,
    service,
    provider,
    sessions,
    requests,
    remote,
    checkout,
    close,
    localSubscription,
  };
}

describe("durable billing lifecycle on isolated PostgreSQL", () => {
  it("does not create from a reserved intent during webhook settlement and releases expired checkouts", async () => {
    const f = await fixture(true);
    await expect(f.checkout()).rejects.toBeInstanceOf(CheckoutPendingError);
    const event = () => ({
      id: `evt_${randomUUID()}`,
      type: "customer.updated",
      payload: { data: { object: { customer: f.customer.providerCustomerId } } },
    });
    await withBillingLifecycle(f.owner, () => f.service.handleStripeEvent(event()));
    expect(f.requests).toHaveLength(0);
    await expect(db.delete(users).where(eq(users.id, f.owner))).rejects.toThrow();
    f.remote.active = false;
    const checkout = await f.checkout();
    const session = f.sessions.get(checkout.sessionId);
    if (!session) throw new Error("Missing checkout");
    session.status = "expired";
    await withBillingLifecycle(f.owner, () =>
      f.service.handleStripeEvent({ ...event(), type: "checkout.session.expired" }),
    );
    expect(
      await db.select().from(checkoutIntents).where(eq(checkoutIntents.customerId, f.customer.id)),
    ).toHaveLength(0);
    await db.delete(users).where(eq(users.id, f.owner));
  });
  it("keeps the shared account protected after projection and releases only after confirmed remote cancellation", async () => {
    const f = await fixture();
    const checkout = await f.checkout();
    const session = f.sessions.get(checkout.sessionId);
    if (!session) throw new Error("Missing checkout");
    session.status = "complete";
    session.subscriptionId = `sub_${f.owner}`;
    f.remote.active = true;
    await withBillingLifecycle(f.owner, () =>
      f.service.handleStripeEvent({
        id: `evt_${randomUUID()}`,
        type: "customer.subscription.created",
        payload: {
          data: {
            object: {
              id: session.subscriptionId,
              customer: f.customer.providerCustomerId,
              status: "active",
              items: {
                data: [
                  {
                    price: { id: "price_missao_individual_monthly" },
                    current_period_start: Math.floor(Date.now() / 1000),
                    current_period_end: Math.floor(Date.now() / 1000) + 86400,
                  },
                ],
              },
              metadata: {
                product_id: "missao_individual_monthly",
                checkout_intent_id: session.intentId,
              },
            },
          },
        },
      }),
    );
    expect(await f.service.hasProSubscription({ type: "user", id: f.owner })).toBe(true);
    expect(
      await db.select().from(checkoutIntents).where(eq(checkoutIntents.customerId, f.customer.id)),
    ).toHaveLength(1);
    await expect(db.delete(users).where(eq(users.id, f.owner))).rejects.toThrow();
    await expect(f.checkout()).rejects.toMatchObject({ name: "AlreadySubscribedError" });
    expect(f.requests).toHaveLength(1);
    const terminalEvent = () => ({
      id: `evt_${randomUUID()}`,
      type: "customer.subscription.deleted",
      payload: {
        data: {
          object: {
            id: session.subscriptionId,
            customer: f.customer.providerCustomerId,
            status: "canceled",
            items: {
              data: [
                {
                  price: { id: "price_missao_individual_monthly" },
                  current_period_start: Math.floor(Date.now() / 1000),
                  current_period_end: Math.floor(Date.now() / 1000) + 86400,
                },
              ],
            },
            metadata: {
              product_id: "missao_individual_monthly",
              checkout_intent_id: session.intentId,
            },
          },
        },
      },
    });
    // An out-of-order terminal event cannot release the guard while Stripe is active.
    await withBillingLifecycle(f.owner, () => f.service.handleStripeEvent(terminalEvent()));
    await expect(db.delete(users).where(eq(users.id, f.owner))).rejects.toThrow();
    f.remote.active = false;
    await withBillingLifecycle(f.owner, () => f.service.handleStripeEvent(terminalEvent()));
    expect(
      await db.select().from(checkoutIntents).where(eq(checkoutIntents.customerId, f.customer.id)),
    ).toHaveLength(0);
    expect((await f.checkout()).sessionId).not.toBe(checkout.sessionId);
  });
  it("starts a new intent only after an unknown request can no longer become payable", async () => {
    const f = await fixture();
    f.remote.failBeforeCreate = true;
    await expect(f.checkout()).rejects.toThrow("Transport unavailable");
    const first = f.requests[0];
    if (!first?.expiresAt) throw new Error("Missing fixed expiry");
    const clock = vi.spyOn(Date, "now").mockReturnValue((first.expiresAt + 1) * 1000);
    f.remote.failBeforeCreate = false;
    try {
      await f.checkout();
    } finally {
      clock.mockRestore();
    }
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]?.idempotencyKey).not.toBe(first.idempotencyKey);
    expect([...f.sessions.values()].filter((s) => s.status === "open")).toHaveLength(1);
  });
  it("reuses a payable checkout beyond five minutes, expires old plans and starts again after expiry", async () => {
    const f = await fixture();
    const a = await f.checkout();
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60000);
    try {
      expect(await f.checkout()).toEqual(a);
    } finally {
      clock.mockRestore();
    }
    expect(f.requests).toHaveLength(1);
    const b = await f.checkout("missao_family_monthly");
    expect(b.sessionId).not.toBe(a.sessionId);
    expect(f.sessions.get(a.sessionId)?.status).toBe("expired");
    expect([...f.sessions.values()].filter((s) => s.status === "open")).toHaveLength(1);
    const latest = f.sessions.get(b.sessionId);
    if (!latest) throw new Error("Missing checkout");
    latest.status = "expired";
    expect((await f.checkout("missao_family_monthly")).sessionId).not.toBe(b.sessionId);
  });
  it("recovers a lost response, protects shared account deletion and blocks completed but unprojected payment", async () => {
    const f = await fixture();
    f.remote.loseResponse = true;
    await expect(f.checkout()).rejects.toThrow("Response lost");
    await expect(db.delete(users).where(eq(users.id, f.owner))).rejects.toThrow();
    const recovered = await f.checkout();
    expect(f.requests).toHaveLength(1);
    const session = f.sessions.get(recovered.sessionId);
    if (!session) throw new Error("Missing checkout");
    session.status = "complete";
    session.subscriptionId = `sub_${f.owner}`;
    f.remote.active = true;
    await expect(f.checkout("missao_family_monthly")).rejects.toBeInstanceOf(CheckoutPendingError);
    expect(f.requests).toHaveLength(1);
    await f.close();
    expect(
      await db.select().from(checkoutIntents).where(eq(checkoutIntents.customerId, f.customer.id)),
    ).toHaveLength(0);
    await db.delete(users).where(eq(users.id, f.owner));
  });
  it("replays the exact durable request before closure when the first outcome is unknown", async () => {
    const f = await fixture();
    f.remote.failBeforeCreate = true;
    await expect(f.checkout()).rejects.toThrow("Transport unavailable");
    await expect(f.close()).rejects.toThrow("Transport unavailable");
    await expect(db.delete(users).where(eq(users.id, f.owner))).rejects.toThrow();
    f.remote.failBeforeCreate = false;
    await f.close();
    expect(f.requests[2]).toEqual(f.requests[0]);
    expect([...f.sessions.values()].every((s) => s.status === "expired")).toBe(true);
  });
  it("refuses a remote subscription even without local webhooks and serializes concurrent checkout calls", async () => {
    const f = await fixture(true);
    await expect(f.checkout()).rejects.toBeInstanceOf(CheckoutPendingError);
    expect(f.requests).toHaveLength(0);
    await expect(db.delete(users).where(eq(users.id, f.owner))).rejects.toThrow();
    f.remote.active = false;
    const results = await Promise.allSettled([f.checkout(), f.checkout("missao_family_monthly")]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect([...f.sessions.values()].filter((s) => s.status === "open")).toHaveLength(1);
  });
  it("holds the lifecycle lock over delayed reconciliation, then closure stays canceled", async () => {
    const f = await fixture(true);
    const sub = await f.localSubscription();
    const entered = deferred();
    const release = deferred();
    const retrieve = vi.spyOn(f.provider, "retrieveSubscription").mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return {
        id: sub.providerSubscriptionId,
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      };
    });
    const running = f.service.reconcileSubscriptions();
    await entered.promise;
    try {
      await expect(f.close()).rejects.toMatchObject({ code: "BUSY" });
    } finally {
      release.resolve();
    }
    expect((await running).reconciled).toBe(1);
    await f.close();
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)))[0]?.status,
    ).toBe("canceled");
    expect(await f.service.hasProSubscription({ type: "user", id: f.owner })).toBe(false);
    retrieve.mockRestore();
  });
  it("reloads candidates after closure and never sends dunning from a stale snapshot", async () => {
    const f = await fixture(true);
    const sub = await f.localSubscription();
    const service = createBillingService({
      ...f.config,
      withSubjectLock: async (subject, operation) => {
        await f.close();
        return withBillingLifecycle(subject.id, operation);
      },
    });
    const retrieve = vi.spyOn(f.provider, "retrieveSubscription");
    expect((await service.reconcileSubscriptions()).reconciled).toBe(0);
    expect(retrieve).not.toHaveBeenCalled();
    // Recreate the stale candidate while retaining the customer's closure tombstone.
    await db.update(subscriptions).set({ status: "past_due" }).where(eq(subscriptions.id, sub.id));
    const send = vi.fn(async () => {});
    expect((await f.service.retryDunningEmails({ send })).sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    await db.update(subscriptions).set({ status: "canceled" }).where(eq(subscriptions.id, sub.id));
  });
  it("serializes dunning delivery with closure and reloads before sending", async () => {
    const f = await fixture(true);
    await f.localSubscription();
    const entered = deferred();
    const release = deferred();
    const send = vi.fn(async () => {
      entered.resolve();
      await release.promise;
    });
    const running = f.service.retryDunningEmails({ send });
    await entered.promise;
    try {
      await expect(f.close()).rejects.toMatchObject({ code: "BUSY" });
    } finally {
      release.resolve();
    }
    expect((await running).sent).toBe(1);
    await f.close();
    expect((await f.service.retryDunningEmails({ send })).sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent provider events and never revives a deleted subscription", async () => {
    const f = await fixture(true);
    const sub = await f.localSubscription();
    await db
      .update(subscriptions)
      .set({ status: "active", confirmedAt: new Date(), metadata: {} })
      .where(eq(subscriptions.id, sub.id));
    const subscriptionObject = {
      id: sub.providerSubscriptionId,
      customer: f.customer.providerCustomerId,
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_missao_individual_monthly" },
            current_period_start: 1789300000,
            current_period_end: 1791892000,
          },
        ],
      },
      metadata: { product_id: "missao_individual_monthly" },
    };
    await Promise.all([
      f.service.handleStripeEvent({
        id: `evt_failed_${randomUUID()}`,
        type: "invoice.payment_failed",
        payload: {
          created: 1789336200,
          data: {
            object: {
              id: `in_${randomUUID()}`,
              customer: f.customer.providerCustomerId,
              parent: { subscription_details: { subscription: sub.providerSubscriptionId } },
            },
          },
        },
      }),
      f.service.handleStripeEvent({
        id: `evt_old_active_${randomUUID()}`,
        type: "customer.subscription.updated",
        payload: { created: 1789336100, data: { object: subscriptionObject } },
      }),
    ]);
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)))[0]?.status,
    ).toBe("past_due");

    await f.service.handleStripeEvent({
      id: `evt_paid_${randomUUID()}`,
      type: "invoice.paid",
      payload: {
        created: 1789336500,
        data: {
          object: {
            id: `in_paid_${randomUUID()}`,
            customer: f.customer.providerCustomerId,
            billing_reason: "subscription_cycle",
            amount_paid: 1990,
            currency: "brl",
            parent: { subscription_details: { subscription: sub.providerSubscriptionId } },
          },
        },
      },
    });
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)))[0],
    ).toMatchObject({ status: "active", confirmedAt: expect.any(Date) });
    await f.service.handleStripeEvent({
      id: `evt_delayed_failed_${randomUUID()}`,
      type: "invoice.payment_failed",
      payload: {
        created: 1789336400,
        data: {
          object: {
            id: `in_old_${randomUUID()}`,
            customer: f.customer.providerCustomerId,
            parent: { subscription_details: { subscription: sub.providerSubscriptionId } },
          },
        },
      },
    });
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)))[0]?.status,
    ).toBe("active");

    await f.service.handleStripeEvent({
      id: `evt_deleted_${randomUUID()}`,
      type: "customer.subscription.deleted",
      payload: {
        created: 1789336600,
        data: { object: { ...subscriptionObject, status: "canceled", canceled_at: 1789336600 } },
      },
    });
    await f.service.handleStripeEvent({
      id: `evt_delayed_active_${randomUUID()}`,
      type: "customer.subscription.updated",
      payload: { created: 1789336700, data: { object: subscriptionObject } },
    });
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)))[0]?.status,
    ).toBe("canceled");
  });
});
