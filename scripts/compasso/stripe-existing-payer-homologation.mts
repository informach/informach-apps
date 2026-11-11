import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import Stripe from "../../packages/billing/node_modules/stripe/esm/stripe.esm.node.js";
import { createStripePaymentFactReader } from "../../packages/billing/src/payment-facts";
import { createStripeLegacyDeferralProvider } from "../../packages/billing/src/providers/stripe-legacy-deferral";

// Synthetic test clock only: this experiment does not update application data.
const key = process.env.STRIPE_SECRET_KEY ?? "";
assert.match(key, /^(sk|rk)_test_/, "A test-mode Stripe credential is required");
const stripe = new Stripe(key, {
  apiVersion: "2026-04-22.dahlia",
  timeout: 30_000,
  maxNetworkRetries: 2,
});
assert.equal((await stripe.balance.retrieve()).livemode, false);
const marker = `compasso-existing-${randomUUID().slice(0, 24)}`;
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
  const method = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    default_payment_method: method.id,
    payment_behavior: "error_if_incomplete",
  });
  assert.equal(sub.status, "active");
  const originalEnd = sub.items.data[0]?.current_period_end;
  assert.ok(originalEnd && originalEnd > now);
  const initialInvoices = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  assert.equal(
    initialInvoices.data.filter(
      (invoice) => invoice.status === "paid" && invoice.amount_paid === 4990,
    ).length,
    1,
  );
  const desiredEnd = originalEnd + 10 * 86400;
  const provider = createStripeLegacyDeferralProvider({
    secretKey: "unused",
    mode: "dev",
    client: stripe,
  });
  const deferral = {
    intentId: randomUUID(),
    customerId: customer.id,
    subscriptionId: sub.id,
    priceId: price.id,
    interval: "month" as const,
    amountCents: 4990,
    expectedPeriodEnd: originalEnd,
    deferUntil: desiredEnd,
  };
  await assert.rejects(provider.defer({ ...deferral, amountCents: 4991 }));
  assert.equal((await stripe.subscriptions.retrieve(sub.id)).status, "active");
  assert.deepEqual(await provider.defer(deferral), { status: "deferred", until: desiredEnd });
  assert.deepEqual(await provider.defer(deferral), { status: "deferred", until: desiredEnd });
  const facts = await createStripePaymentFactReader({ secretKey: key }).read(
    sub.id,
    new Set([price.id]),
  );
  assert.ok(facts);
  assert.ok(facts.periods.length > 0);
  for (const period of facts.periods.filter((entry) => entry.end.getTime() > originalEnd * 1000)) {
    const invoice = await stripe.invoices.retrieve(period.invoiceId);
    const lines = await stripe.invoices.listLineItems(period.invoiceId, { limit: 100 });
    const line = lines.data.find((item) => item.id === period.lineId);
    assert.ok(line);
    process.stdout.write(
      `Synthetic extended-period invoice: paid=${invoice.amount_paid}, line=${line.amount}, reason=${invoice.billing_reason}.\n`,
    );
  }
  assert.ok(
    facts.periods.every((period) => period.end.getTime() <= originalEnd * 1000),
    "A zero-value trial invoice must not become a paid period",
  );
  async function advance(target: number) {
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: target });
    let state = await stripe.testHelpers.testClocks.retrieve(clock.id);
    for (let attempt = 0; state.status === "advancing" && attempt < 45; attempt++) {
      await delay(2000);
      state = await stripe.testHelpers.testClocks.retrieve(clock.id);
    }
    assert.equal(state.status, "ready");
  }
  await advance(originalEnd + 2 * 3600);
  const interim = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  assert.equal(
    interim.data.filter((invoice) => invoice.status === "paid" && invoice.amount_paid > 0).length,
    1,
  );
  await advance(desiredEnd + 2 * 3600);
  const final = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  assert.equal(
    final.data.filter((invoice) => invoice.status === "paid" && invoice.amount_paid === 4990)
      .length,
    2,
  );
  process.stdout.write(
    "Stripe test: assinatura paga, adiamento idempotente e próxima cobrança somente após a data estendida.\n",
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
