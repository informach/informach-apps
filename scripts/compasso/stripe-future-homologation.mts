import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import Stripe from "../../packages/billing/node_modules/stripe/esm/stripe.esm.node.js";
import { createStripeProvider } from "../../packages/billing/src/providers/stripe";
import { createStripeFutureContractProvider } from "../../packages/billing/src/providers/stripe-future-contract";

// Explicit test-mode-only fixture; no application database or live object is read.
const key = process.env.STRIPE_SECRET_KEY ?? "";
assert.match(key, /^(sk|rk)_test_/, "A test-mode Stripe credential is required");
const stripe = new Stripe(key, {
  apiVersion: "2026-04-22.dahlia",
  timeout: 30_000,
  maxNetworkRetries: 2,
});
assert.equal((await stripe.balance.retrieve()).livemode, false);
const marker = `compasso-future-${randomUUID().slice(0, 24)}`;
const cleanup: Array<() => Promise<unknown>> = [];
let cleanupFailed = 0;
try {
  const now = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: now, name: marker });
  cleanup.push(() => stripe.testHelpers.testClocks.del(clock.id));
  const product = await stripe.products.create({ name: marker, metadata: { test_run: marker } });
  cleanup.unshift(() => stripe.products.update(product.id, { active: false }));
  const price = await stripe.prices.create({
    product: product.id,
    currency: "brl",
    unit_amount: 4990,
    recurring: { interval: "month" },
    metadata: { test_run: marker },
  });
  cleanup.unshift(() => stripe.prices.update(price.id, { active: false }));
  const customer = await stripe.customers.create({
    name: marker,
    test_clock: clock.id,
    metadata: { test_run: marker },
  });
  const provider = createStripeFutureContractProvider({
    secretKey: "unused",
    mode: "dev",
    client: stripe,
  });
  const accountId = randomUUID();
  const setup = {
    intentId: randomUUID(),
    customerId: customer.id,
    successUrl: `https://example.com/?pagamento=${accountId}#compasso`,
    cancelUrl: `https://example.com/?pagamento=${accountId}#compasso`,
    expiresAt: now + 3600,
  };
  const session = await provider.setup(setup);
  assert.equal(session.status, "open");
  assert.deepEqual(await provider.findSetupSession(setup), { id: session.id, status: "open" });
  assert.equal((await provider.setup(setup)).id, session.id);
  assert.equal((await provider.readSetup(setup, session.id)).status, "open");
  assert.equal((await provider.expireSetup(setup, session.id)).status, "expired");
  assert.deepEqual(await provider.findSetupSession(setup), { id: session.id, status: "expired" });
  assert.equal((await provider.expireSetup(setup, session.id)).status, "expired");
  const method = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  const startsAt = now + 14 * 86400;
  const future = {
    intentId: randomUUID(),
    customerId: customer.id,
    paymentMethodId: method.id,
    priceId: price.id,
    interval: "month" as const,
    startsAt,
    paidThroughMs: startsAt * 1000,
    amountCents: 4990,
  };
  const before = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  const scheduled = await provider.schedule(future);
  assert.equal(scheduled.status, "not_started");
  assert.equal((await provider.schedule(future)).id, scheduled.id);
  assert.equal(
    (await stripe.invoices.list({ customer: customer.id, limit: 100 })).data.length,
    before.data.length,
  );
  const cancelCustomer = await stripe.customers.create({
    name: marker,
    test_clock: clock.id,
    metadata: { test_run: marker },
  });
  const cancelMethod = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: cancelCustomer.id,
  });
  const cancelFuture = {
    ...future,
    intentId: randomUUID(),
    customerId: cancelCustomer.id,
    paymentMethodId: cancelMethod.id,
  };
  const cancellation = await provider.schedule(cancelFuture);
  assert.equal((await provider.cancelSchedule(cancelFuture, cancellation.id)).status, "canceled");
  assert.equal((await provider.cancelSchedule(cancelFuture, cancellation.id)).status, "canceled");
  assert.deepEqual(await provider.findSchedule(cancelFuture), {
    id: cancellation.id,
    status: "canceled",
  });
  async function advance(target: number) {
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: target });
    let state = await stripe.testHelpers.testClocks.retrieve(clock.id);
    for (let attempt = 0; state.status === "advancing" && attempt < 45; attempt++) {
      await delay(2000);
      state = await stripe.testHelpers.testClocks.retrieve(clock.id);
    }
    assert.equal(state.status, "ready");
  }
  await advance(startsAt + 60);
  // Stripe's scheduled first invoice can remain draft for about an hour.
  await advance(startsAt + 2 * 3600);
  const invoices = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  const startedSchedule = await provider.readSchedule(future, scheduled.id);
  assert.equal(startedSchedule.status, "active");
  assert.ok(startedSchedule.subscriptionId);
  const paid = invoices.data.filter(
    (invoice) => invoice.status === "paid" && invoice.amount_paid === 4990,
  );
  assert.equal(paid.length, 1);
  assert.equal(
    (await stripe.invoices.list({ customer: cancelCustomer.id, limit: 100 })).data.length,
    0,
  );
  assert.equal((await provider.schedule(future)).id, scheduled.id);
  const closure = createStripeProvider({
    secretKey: "unused",
    webhookSecret: "unused",
    appName: "compasso",
    client: stripe,
  });
  const closed = await closure.closeCustomerSubscriptions?.(customer.id);
  assert.ok(closed?.subscriptionIds.includes(startedSchedule.subscriptionId));
  assert.equal((await provider.readSchedule(future, scheduled.id)).status, "canceled");
  assert.equal(
    (await stripe.subscriptions.retrieve(startedSchedule.subscriptionId)).status,
    "canceled",
  );
  process.stdout.write(
    "Stripe test: setup recuperado; sem fatura antecipada; uma fatura paga após o início; cancelamento futuro e encerramento após início confirmados.\n",
  );
} finally {
  for (const remove of cleanup) {
    try {
      await remove();
    } catch {
      cleanupFailed++;
    }
  }
  if (cleanupFailed) {
    process.stderr.write(`Falha ao limpar ${cleanupFailed} recurso(s) de teste.\n`);
    process.exitCode = 1;
  }
}
