import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import type StripeType from "../../packages/billing/node_modules/stripe";
import {
  createStripePlanSchedules,
  type PlanScheduleInput,
} from "../../packages/billing/src/providers/stripe-plans";

// Opt-in, test-mode-only provider contract test. It never imports application env or a database.
const requireBilling = createRequire(
  new URL("../../packages/billing/package.json", import.meta.url),
);
const Stripe: typeof StripeType = requireBilling("stripe");
const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
assert.match(secretKey, /^(sk|rk)_test_/, "A dedicated test-mode credential is required");
const stripe = new Stripe(secretKey, {
  apiVersion: "2026-04-22.dahlia",
  timeout: 30_000,
  maxNetworkRetries: 2,
});
assert.equal((await stripe.balance.retrieve()).livemode, false);
const marker = `compasso-plans-${randomUUID().slice(0, 24)}`;
const cleanup: (() => Promise<unknown>)[] = [];
let frozen = Math.floor(Date.now() / 1000);
const outcomes: string[] = [];
let cleanupFailed = 0;
try {
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: frozen, name: marker });
  cleanup.push(() => stripe.testHelpers.testClocks.del(clock.id));
  const product = await stripe.products.create({ name: marker, metadata: { test_run: marker } });
  cleanup.unshift(() => stripe.products.update(product.id, { active: false }));
  const monthly = await stripe.prices.create({
    product: product.id,
    currency: "brl",
    unit_amount: 4990,
    recurring: { interval: "month" },
  });
  cleanup.unshift(() => stripe.prices.update(monthly.id, { active: false }));
  const annual = await stripe.prices.create({
    product: product.id,
    currency: "brl",
    unit_amount: 49900,
    recurring: { interval: "year" },
  });
  cleanup.unshift(() => stripe.prices.update(annual.id, { active: false }));
  const customer = await stripe.customers.create({
    name: marker,
    test_clock: clock.id,
    metadata: { test_run: marker },
  });
  const method = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: method.id },
  });
  const coupon = await stripe.coupons.create({
    duration: "repeating",
    duration_in_months: 3,
    percent_off: 10,
    name: marker,
  });
  cleanup.unshift(() => stripe.coupons.del(coupon.id));
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: monthly.id, quantity: 1 }],
    payment_behavior: "error_if_incomplete",
    discounts: [{ coupon: coupon.id }],
    metadata: { test_run: marker, product_id: "compasso_monthly" },
  });
  const item = sub.items.data[0];
  assert.ok(item);
  const adapter = createStripePlanSchedules({
    secretKey: "unused",
    client: stripe,
    now: () => new Date(frozen * 1000),
  });
  const input: PlanScheduleInput = {
    intentId: randomUUID(),
    customerId: customer.id,
    subscriptionId: sub.id,
    fromPriceId: monthly.id,
    toPriceId: annual.id,
    toProductId: "compasso_annual",
    interval: "year",
    effectiveAt: new Date(item.current_period_end * 1000),
    requestStartedAt: new Date(frozen * 1000),
  };
  const invoicesBefore = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  const scheduleId = await adapter.create(input);
  assert.equal(
    await adapter.create(input),
    scheduleId,
    "Lost creation response must recover the same schedule",
  );
  assert.equal(await adapter.reconcile({ ...input, scheduleId, cancel: false }), "scheduled");
  assert.equal(await adapter.reconcile({ ...input, scheduleId, cancel: false }), "scheduled");
  const scheduled = await stripe.subscriptionSchedules.retrieve(scheduleId);
  assert.equal(
    scheduled.phases[0]?.discounts[0]?.discount,
    scheduled.phases[1]?.discounts[0]?.discount,
  );
  assert.equal((await stripe.subscriptions.retrieve(sub.id)).items.data[0]?.price.id, monthly.id);
  assert.equal(
    (await stripe.invoices.list({ customer: customer.id, limit: 100 })).data.length,
    invoicesBefore.data.length,
  );
  outcomes.push(
    "same subscription, recovered response, no immediate invoice, existing discount preserved",
  );
  assert.equal(await adapter.reconcile({ ...input, scheduleId, cancel: true }), "canceled");
  assert.equal((await stripe.subscriptions.retrieve(sub.id)).status, "active");
  assert.equal(await adapter.reconcile({ ...input, scheduleId, cancel: true }), "canceled");
  outcomes.push("undo releases scheduling without canceling the paid subscription");
  const next = { ...input, intentId: randomUUID() };
  const nextScheduleId = await adapter.create(next);
  await adapter.reconcile({ ...next, scheduleId: nextScheduleId, cancel: false });
  // Stripe renewals remain draft for an hour before automatic collection.
  frozen = item.current_period_end + 7200;
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: frozen });
  let ready = false;
  for (let attempt = 0; attempt < 55; attempt++) {
    const state = await stripe.testHelpers.testClocks.retrieve(clock.id);
    if (state.status === "ready") {
      ready = true;
      break;
    }
    await delay(1000);
  }
  assert.ok(ready, "Test clock did not become ready");
  assert.equal(
    await adapter.reconcile({ ...next, scheduleId: nextScheduleId, cancel: false }),
    "applied",
  );
  const changed = await stripe.subscriptions.retrieve(sub.id);
  assert.equal(changed.items.data[0]?.price.id, annual.id);
  assert.equal(changed.schedule, null);
  assert.equal(changed.status, "active");
  const renewed = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  assert.equal(renewed.data.length, invoicesBefore.data.length + 1);
  assert.equal(renewed.data[0]?.status, "paid");
  outcomes.push(
    "Stripe test clock changed interval automatically with exactly one renewal invoice",
  );
  const yearItem = changed.items.data[0];
  assert.ok(yearItem);
  const back: PlanScheduleInput = {
    ...next,
    intentId: randomUUID(),
    fromPriceId: annual.id,
    toPriceId: monthly.id,
    toProductId: "compasso_monthly",
    interval: "month",
    effectiveAt: new Date(yearItem.current_period_end * 1000),
    requestStartedAt: new Date(frozen * 1000),
  };
  const backId = await adapter.create(back);
  assert.equal(
    await adapter.reconcile({ ...back, scheduleId: backId, cancel: false }),
    "scheduled",
  );
  assert.equal(
    (await stripe.subscriptionSchedules.retrieve(backId)).phases[1]?.start_date,
    yearItem.current_period_end,
  );
  assert.equal(await adapter.reconcile({ ...back, scheduleId: backId, cancel: true }), "canceled");
  outcomes.push("annual to monthly preserves the full paid year");
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ failed: true, outcomes, message: error instanceof Error ? error.message : "Unknown provider test failure" })}\n`,
  );
  process.exitCode = 1;
} finally {
  const failures: unknown[] = [];
  for (const remove of cleanup)
    try {
      await remove();
    } catch (error) {
      failures.push(error);
    }
  cleanupFailed = failures.length;
  if (cleanupFailed) {
    process.exitCode = 1;
    process.stderr.write(
      `Test resource cleanup failed for ${cleanupFailed} resources (${marker})\n`,
    );
  }
}
process.stdout.write(
  `${JSON.stringify({ testMode: true, passed: !process.exitCode, outcomes, cleanup: cleanupFailed ? "failed" : "completed" }, null, 2)}\n`,
);
