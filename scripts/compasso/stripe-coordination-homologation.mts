import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import Stripe from "../../packages/billing/node_modules/stripe/esm/stripe.esm.node.js";
import { createStripeFutureContractProvider } from "../../packages/billing/src/providers/stripe-future-contract";

// Test mode only: moving the start of a schedule that has not started. No
// application database or live object is read or written.
const key = process.env.STRIPE_SECRET_KEY ?? "";
assert.match(key, /^(sk|rk)_test_/, "A test-mode Stripe credential is required");
const stripe = new Stripe(key, {
  apiVersion: "2026-04-22.dahlia",
  timeout: 30_000,
  maxNetworkRetries: 2,
});
assert.equal((await stripe.balance.retrieve()).livemode, false);
const marker = `compasso-coordination-${randomUUID().slice(0, 18)}`;
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
  const provider = createStripeFutureContractProvider({
    secretKey: "unused",
    mode: "dev",
    client: stripe,
  });
  const oldStart = now + 14 * 86400;
  const newStart = now + 40 * 86400;
  const future = {
    intentId: randomUUID(),
    customerId: customer.id,
    paymentMethodId: method.id,
    priceId: price.id,
    interval: "month" as const,
    startsAt: oldStart,
    paidThroughMs: oldStart * 1000,
    amountCents: 4990,
  };
  const scheduled = await provider.schedule(future);
  assert.equal(scheduled.status, "not_started");
  const coordinationId = randomUUID();
  const move = { scheduleId: scheduled.id, coordinationId, newStartsAt: newStart };
  // A different coordination must not be able to reuse a stale request.
  await assert.rejects(
    provider.moveScheduleStart(future, { ...move, newStartsAt: oldStart }),
    /Invalid future schedule move/,
  );
  const moved = await provider.moveScheduleStart(future, move);
  assert.deepEqual(moved, { id: scheduled.id, status: "not_started", moved: true });
  // Lost response: the retry recognizes the move without a second update.
  const updatedAt = (await stripe.subscriptionSchedules.retrieve(scheduled.id)).phases[0]
    ?.start_date;
  assert.equal(updatedAt, newStart);
  assert.deepEqual(await provider.moveScheduleStart(future, move), moved);
  await assert.rejects(
    provider.moveScheduleStart(future, { ...move, coordinationId: randomUUID() }),
    /moved by another coordination/,
  );
  // After the local receipt moves too, the schedule is found under the new terms.
  const movedTerms = { ...future, startsAt: newStart, paidThroughMs: newStart * 1000 };
  assert.deepEqual(await provider.findSchedule(movedTerms), {
    id: scheduled.id,
    status: "not_started",
  });
  assert.equal((await provider.readSchedule(movedTerms, scheduled.id)).status, "not_started");
  // A start too close to move is refused before any update.
  const close = await stripe.customers.create({
    name: marker,
    test_clock: clock.id,
    metadata: { test_run: marker },
  });
  const closeMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: close.id });
  const closeFuture = {
    ...future,
    intentId: randomUUID(),
    customerId: close.id,
    paymentMethodId: closeMethod.id,
    startsAt: now + 600,
    paidThroughMs: (now + 600) * 1000,
  };
  const closeSchedule = await provider.schedule(closeFuture);
  await assert.rejects(
    provider.moveScheduleStart(closeFuture, {
      scheduleId: closeSchedule.id,
      coordinationId: randomUUID(),
      newStartsAt: newStart,
    }),
    /too close to move safely/,
  );
  assert.equal(
    (await stripe.subscriptionSchedules.retrieve(closeSchedule.id)).phases[0]?.start_date,
    now + 600,
  );
  await provider.cancelSchedule(closeFuture, closeSchedule.id);
  async function advance(target: number) {
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: target });
    let state = await stripe.testHelpers.testClocks.retrieve(clock.id);
    for (let attempt = 0; state.status === "advancing" && attempt < 60; attempt++) {
      await delay(2000);
      state = await stripe.testHelpers.testClocks.retrieve(clock.id);
    }
    assert.equal(state.status, "ready");
  }
  // Nothing is charged on the original date.
  await advance(oldStart + 2 * 3600);
  assert.equal((await provider.readSchedule(movedTerms, scheduled.id)).status, "not_started");
  const early = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  assert.equal(early.data.filter((invoice) => invoice.amount_due > 0).length, 0);
  // Exactly one paid charge after the moved date.
  await advance(newStart + 60);
  await advance(newStart + 2 * 3600);
  const started = await provider.readSchedule(movedTerms, scheduled.id);
  assert.equal(started.status, "active");
  assert.ok(started.subscriptionId);
  const invoices = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  const paid = invoices.data.filter(
    (invoice) => invoice.status === "paid" && invoice.amount_paid === 4990,
  );
  assert.equal(paid.length, 1);
  const line = paid[0]?.lines.data[0];
  assert.ok(line && line.period.start >= newStart);
  // A started schedule is not moved again.
  assert.deepEqual(
    await provider.moveScheduleStart(movedTerms, {
      scheduleId: scheduled.id,
      coordinationId: randomUUID(),
      newStartsAt: newStart + 86400,
    }),
    { id: scheduled.id, status: "active", moved: false },
  );
  await stripe.subscriptions.cancel(started.subscriptionId, { invoice_now: false, prorate: false });
  process.stdout.write(
    "Stripe test: início da agenda movido no lugar, resposta perdida reconhecida, outra coordenação recusada, início próximo recusado, nenhuma cobrança na data antiga e uma única cobrança paga depois da nova data.\n",
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
