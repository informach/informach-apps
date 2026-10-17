import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { provisionEdiStripe, STRIPE_API_VERSION, Stripe } from "./stripe-provision.mts";

const database = new URL(process.env.DATABASE_URL ?? "");
assert.ok(
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Operational harness runs outside Turbo with a disposable database.
  process.env.EDI_ISOLATED_DATABASE === "1" &&
    ["127.0.0.1", "localhost"].includes(database.hostname),
  "Stripe homologation requires the disposable integration database",
);
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Opt-in provider credential is supplied only to this uncached operational harness.
const secretKey = process.env.EDI_STRIPE_TEST_KEY ?? "";
assert.ok(/^(sk|rk)_test_/.test(secretKey), "EDI_STRIPE_TEST_KEY must be a test-mode key");
const stripe = new Stripe(secretKey, {
  apiVersion: STRIPE_API_VERSION,
  timeout: 30000,
  maxNetworkRetries: 2,
});
const provisioned = await provisionEdiStripe({ secretKey, mode: "dev", apply: true });
const webhookSecret = `whsec_${randomBytes(32).toString("hex")}`;
Object.assign(process.env, {
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3006",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  EMAIL_SANDBOX_MODE: "memory",
  SENDGRID_API_KEY: "",
  LOG_LEVEL: "error",
  EDI_BILLING_ENABLED: "true",
  STRIPE_MODE: "dev",
  STRIPE_SECRET_KEY: secretKey,
  STRIPE_WEBHOOK_SECRET: webhookSecret,
  STRIPE_PORTAL_CONFIGURATION_ID: provisioned.portalConfigurationId,
  EDI_MONTHLY_PRICE_DEV: provisioned.prices.edi_suite_monthly,
  EDI_ANNUAL_PRICE_DEV: provisioned.prices.edi_suite_annual,
});
const { db, eq, and } = await import("../../packages/db/src/index");
const {
  users,
  customers,
  ediEntitlements,
  subscriptionPaymentPeriods,
  subscriptions,
  webhookEvents,
  ediOutbox,
} = await import("../../packages/db/src/schema/index");
const { createBillingService } = await import("../../packages/billing/src/index");
const { createStripeProvider } = await import("../../packages/billing/src/providers/stripe");
const { createStripePaymentFactReader } = await import("../../packages/billing/src/payment-facts");
const { ediProducts } = await import("../../apps/edi/src/features/billing/catalog");
const { getEnv } = await import("../../apps/edi/src/lib/env");
const { handleStripeWebhook } = await import("../../apps/edi/src/features/billing/webhook-handler");
const { reconcileBilling } = await import("../../apps/edi/src/features/billing/reconciliation");
const { withCustomerBillingLifecycle, withBillingLifecycle } = await import(
  "../../apps/edi/src/features/billing/lifecycle"
);
const { enqueueBillingCustomer } = await import("../../apps/edi/src/features/billing/repository");
const { decideAccess } = await import("../../packages/edi-licensing/src/policy");
const reader = createStripePaymentFactReader({ secretKey });
const products = ediProducts(getEnv());
const billing = createBillingService({
  provider: "stripe",
  stripeSecretKey: secretKey,
  stripeWebhookSecret: webhookSecret,
  portalConfigurationId: provisioned.portalConfigurationId,
  db,
  app: "edi",
  appName: "Edi isolated homologation",
  publicAppUrl: "http://localhost:3006",
  products,
  organizationsEnabled: false,
  stripeMode: "dev",
  guardClosedBilling: true,
  managedCheckout: true,
  withSubjectLock: (subject, operation) => withBillingLifecycle(subject.id, operation),
  resolveSubjectEmail: async (subject) => `${subject.id}@example.invalid`,
});
const processStripeWebhook = (request: Request) =>
  handleStripeWebhook(request, { billing, reader });
const createSuiteCheckout = (userId: string, productId: string) =>
  billing.createSubscriptionCheckout({
    subject: { type: "user", id: userId },
    actorId: userId,
    productId,
    successUrl: "http://localhost:3006/conta?checkout=success",
    cancelUrl: "http://localhost:3006/conta?checkout=canceled",
  });
const accepted = new Set(products.map((entry) => entry.stripePriceId.dev));
const runId = randomUUID();
const clocks: string[] = [];
const standaloneCustomers: string[] = [];
const checks: string[] = [];
const eventVersions = new Set<string>();

async function until<T>(description: string, read: () => Promise<T>, ready: (value: T) => boolean) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const value = await read();
    if (ready(value)) return value;
    await delay(1500);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
function passed(check: string) {
  checks.push(check);
  console.log(`[edi-stripe] PASS ${check}`);
}

async function customerFixture(clock = true) {
  let clockId: string | undefined;
  if (clock) {
    const created = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000) - 120,
      name: `edi-homologation:${runId}`,
    });
    clockId = created.id;
    clocks.push(created.id);
  }
  const userId = randomUUID();
  // No customer email: provider notifications cannot reach a real recipient.
  const customer = await stripe.customers.create({
    test_clock: clockId,
    name: "Edi isolated homologation",
    metadata: { app: "edi", edi_homologation: runId, subject_type: "user", subject_id: userId },
  });
  assert.equal(customer.livemode, false);
  if (!clock) standaloneCustomers.push(customer.id);
  const email = `${userId}@example.invalid`;
  await db.insert(users).values({ id: userId, name: "Edi isolated homologation", email });
  await db.insert(customers).values({
    app: "edi",
    provider: "stripe",
    providerCustomerId: customer.id,
    subjectType: "user",
    subjectId: userId,
    email,
  });
  return { userId, customerId: customer.id as string, clockId };
}
async function setCard(customerId: string, paymentMethod: string) {
  const attached = await stripe.paymentMethods.attach(paymentMethod, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: attached.id },
  });
  return attached.id as string;
}
async function subscriptionFixture(paymentMethod = "pm_card_visa") {
  const owner = await customerFixture();
  const card = await setCard(owner.customerId, paymentMethod);
  const subscription = await stripe.subscriptions.create({
    customer: owner.customerId,
    items: [{ price: provisioned.prices.edi_suite_monthly }],
    default_payment_method: card,
    payment_behavior: "error_if_incomplete",
    metadata: {
      app: "edi",
      edi_homologation: runId,
      product_id: "edi_suite_monthly",
      subject_type: "user",
      subject_id: owner.userId,
    },
  });
  assert.equal(subscription.livemode, false);
  assert.equal(subscription.status, "active");
  return { ...owner, subscriptionId: subscription.id as string };
}
async function realEvent(type: string, objectId: string) {
  return until(
    `Stripe ${type}`,
    async () => {
      for await (const event of stripe.events.list({ type, limit: 100 })) {
        if (event.data.object.id === objectId) return event;
        // Bound the scan; our test objects were just created in this account.
        if (event.created < Math.floor(Date.now() / 1000) - 3600) break;
      }
      return null;
    },
    (event) => event !== null,
  );
}
async function deliver(event: { id: string; type: string; api_version?: string }) {
  eventVersions.add(event.api_version ?? "unknown");
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  return processStripeWebhook(
    new Request("http://localhost:3006/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    }),
  );
}
async function reconcile(customerId: string) {
  await enqueueBillingCustomer(customerId, `homologation-${randomUUID()}`, false);
  const errors: unknown[] = [];
  const result = await reconcileBilling({
    reader,
    products,
    mode: "dev",
    withCustomerLock: withCustomerBillingLifecycle,
    onError: (_id, error) => errors.push(error),
  });
  if (errors.length) throw errors[0];
  assert.ok(result.processed > 0);
}
async function entitlement(userId: string) {
  const [row] = await db.select().from(ediEntitlements).where(eq(ediEntitlements.userId, userId));
  assert.ok(row);
  return row;
}
async function advance(clockId: string | undefined, frozenTime: number) {
  assert.ok(clockId);
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: frozenTime });
  await until<{ status: string }>(
    "test clock ready",
    () => stripe.testHelpers.testClocks.retrieve(clockId),
    (clock) => clock.status === "ready",
  );
}
async function snapshot(subscriptionId: string) {
  const result = await reader.read(subscriptionId, accepted);
  assert.ok(result);
  return result;
}
async function paymentIntentForInvoice(invoiceId: string) {
  const payments = await stripe.invoicePayments.list({
    invoice: invoiceId,
    status: "paid",
    limit: 100,
  });
  const payment = payments.data.find(
    (entry: { payment: { type: string } }) => entry.payment.type === "payment_intent",
  );
  assert.ok(payment?.payment.payment_intent);
  return typeof payment.payment.payment_intent === "string"
    ? payment.payment.payment_intent
    : payment.payment.payment_intent.id;
}

let failure: unknown;
try {
  await reader.verifyCatalog(products, "dev", provisioned.portalConfigurationId);
  passed("approved_catalog_and_restricted_portal");
  const checkoutOwner = await customerFixture(false);
  const checkout = await createSuiteCheckout(checkoutOwner.userId, "edi_suite_monthly");
  const checkoutAgain = await createSuiteCheckout(checkoutOwner.userId, "edi_suite_monthly");
  assert.equal(checkoutAgain.sessionId, checkout.sessionId);
  const checkoutState = await stripe.checkout.sessions.retrieve(checkout.sessionId);
  assert.equal(checkoutState.mode, "subscription");
  assert.equal(checkoutState.livemode, false);
  assert.equal(checkoutState.subscription, null);
  await stripe.checkout.sessions.expire(checkout.sessionId);
  await reconcile(checkoutOwner.customerId);
  assert.equal((await entitlement(checkoutOwner.userId)).paidThrough, null);
  passed("checkout_creation_double_click_and_abandonment_without_access");

  const paid = await subscriptionFixture();
  const createdEvent = await realEvent("customer.subscription.created", paid.subscriptionId);
  await deliver(createdEvent);
  await reconcile(paid.customerId);
  const initial = await snapshot(paid.subscriptionId);
  assert.equal(initial.periods.length, 1);
  assert.equal(initial.periods[0]?.fullyRefunded, false);
  assert.equal((await entitlement(paid.userId)).paidThrough?.getTime(), initial.end.getTime());
  passed("first_real_test_payment_projects_access");
  const replay = await deliver(createdEvent);
  assert.ok("deduped" in replay && replay.deduped);
  await reconcile(paid.customerId);
  const [localSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, paid.subscriptionId));
  assert.ok(localSub);
  assert.equal(
    (
      await db
        .select()
        .from(subscriptionPaymentPeriods)
        .where(eq(subscriptionPaymentPeriods.subscriptionId, localSub.id))
    ).length,
    1,
  );
  passed("signed_snapshot_replay_is_idempotent");

  const renewalTime = Math.floor(initial.end.getTime() / 1000) + 3700;
  await advance(paid.clockId, renewalTime);
  const renewed = await until(
    "renewal invoice payment",
    () => snapshot(paid.subscriptionId),
    (value) => value.periods.length === 2,
  );
  await reconcile(paid.customerId);
  assert.ok(renewed.end > initial.end);
  assert.equal((await entitlement(paid.userId)).paidThrough?.getTime(), renewed.end.getTime());
  passed("test_clock_renewal_extends_only_paid_period");
  const failingCard = await setCard(paid.customerId, "pm_card_chargeCustomerFail");
  await stripe.subscriptions.update(paid.subscriptionId, { default_payment_method: failingCard });
  const oldActiveUpdate = await realEvent("customer.subscription.updated", paid.subscriptionId);
  await advance(paid.clockId, Math.floor(renewed.end.getTime() / 1000) + 3700);
  const overdue = await until(
    "failed renewal",
    () => snapshot(paid.subscriptionId),
    (value) => value.status === "past_due",
  );
  assert.equal(overdue.periods.length, 2);
  await reconcile(paid.customerId);
  assert.equal((await entitlement(paid.userId)).paidThrough, null);
  const decision = decideAccess(
    {
      status: overdue.status,
      trialEnd: overdue.trialEnd,
      suspended: false,
      periods: overdue.periods.map((period) => ({
        start: period.start,
        end: period.end,
        refunded: period.fullyRefunded,
        disputed: period.disputed,
      })),
    },
    new Date(overdue.start),
  );
  assert.deepEqual(decision, { allowed: false, reason: "payment_required" });
  passed("failed_renewal_does_not_grant_access");
  await deliver(oldActiveUpdate);
  await reconcile(paid.customerId);
  assert.equal((await entitlement(paid.userId)).paidThrough, null);
  passed("old_active_event_cannot_restore_unpaid_access");

  const canceled = await subscriptionFixture();
  const cancelInitial = await snapshot(canceled.subscriptionId);
  const scheduled = await stripe.subscriptions.update(canceled.subscriptionId, {
    cancel_at: Math.floor(cancelInitial.end.getTime() / 1000),
  });
  assert.equal(scheduled.cancel_at_period_end, false);
  assert.equal((await snapshot(canceled.subscriptionId)).cancelAtPeriodEnd, true);
  const provider = createStripeProvider({
    secretKey,
    webhookSecret,
    appName: "edi",
    client: stripe,
  });
  const reactivated = await provider.reactivateSubscription?.({
    providerSubscriptionId: canceled.subscriptionId,
  });
  assert.equal(reactivated?.cancelAtPeriodEnd, false);
  assert.equal((await stripe.subscriptions.retrieve(canceled.subscriptionId)).cancel_at, null);
  await stripe.subscriptions.update(canceled.subscriptionId, {
    cancel_at: Math.floor(cancelInitial.end.getTime() / 1000),
  });
  await reconcile(canceled.customerId);
  const [cancelRow] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, canceled.subscriptionId));
  assert.equal(cancelRow?.cancelAtPeriodEnd?.getTime(), cancelInitial.end.getTime());
  assert.equal(
    (await entitlement(canceled.userId)).paidThrough?.getTime(),
    cancelInitial.end.getTime(),
  );
  await advance(canceled.clockId, Math.floor(cancelInitial.end.getTime() / 1000) + 120);
  const cancelFinal = await snapshot(canceled.subscriptionId);
  assert.equal(cancelFinal.status, "canceled");
  assert.equal(cancelFinal.periods.length, 1);
  const ended = decideAccess(
    {
      status: cancelFinal.status,
      trialEnd: null,
      suspended: false,
      periods: cancelFinal.periods.map((period) => ({
        start: period.start,
        end: period.end,
        refunded: period.fullyRefunded,
        disputed: period.disputed,
      })),
    },
    new Date(cancelInitial.end),
  );
  assert.equal(ended.allowed, false);
  passed("cancellation_preserves_paid_term_and_stops_renewal");

  const refunded = await subscriptionFixture();
  await reconcile(refunded.customerId);
  const beforeRefund = await snapshot(refunded.subscriptionId);
  const invoiceId = beforeRefund.periods[0]?.invoiceId;
  assert.ok(invoiceId);
  const refund = await stripe.refunds.create({
    payment_intent: await paymentIntentForInvoice(invoiceId),
  });
  assert.equal(refund.status, "succeeded");
  const refundChargeId = typeof refund.charge === "string" ? refund.charge : refund.charge.id;
  const refundEvent = await realEvent("charge.refunded", refundChargeId);
  await deliver(refundEvent);
  assert.equal((await entitlement(refunded.userId)).suspended, true);
  await reconcile(refunded.customerId);
  assert.equal((await snapshot(refunded.subscriptionId)).periods[0]?.fullyRefunded, true);
  assert.equal((await entitlement(refunded.userId)).paidThrough, null);
  const reconciledRefund = await entitlement(refunded.userId);
  await deliver(refundEvent);
  assert.deepEqual(await entitlement(refunded.userId), reconciledRefund);
  await reconcile(refunded.customerId);
  assert.equal((await entitlement(refunded.userId)).paidThrough, null);
  passed("full_refund_suspends_immediately_and_replay_never_restores_access");

  const disputed = await subscriptionFixture("pm_card_createDispute");
  const disputedSnapshot = await until(
    "real test dispute",
    () => snapshot(disputed.subscriptionId),
    (value) => value.periods.some((period) => period.disputed),
  );
  const disputeInvoice = disputedSnapshot.periods[0]?.invoiceId;
  assert.ok(disputeInvoice);
  const disputeIntent = await stripe.paymentIntents.retrieve(
    await paymentIntentForInvoice(disputeInvoice),
  );
  const disputeList = await stripe.disputes.list({
    charge: disputeIntent.latest_charge,
    limit: 100,
  });
  assert.ok(disputeList.data[0]);
  const disputeEvent = await realEvent("charge.dispute.created", disputeList.data[0].id);
  await deliver(disputeEvent);
  assert.equal((await entitlement(disputed.userId)).suspended, true);
  await reconcile(disputed.customerId);
  assert.equal((await entitlement(disputed.userId)).suspended, true);
  assert.equal((await entitlement(disputed.userId)).paidThrough, null);
  passed("real_test_dispute_suspends_and_reconciliation_preserves_suspension");

  const invalidPayload = JSON.stringify(createdEvent);
  await assert.rejects(
    processStripeWebhook(
      new Request("http://localhost:3006/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": stripe.webhooks.generateTestHeaderString({
            payload: invalidPayload,
            secret: "different-local-test-secret",
          }),
        },
        body: invalidPayload,
      }),
    ),
  );
  const eventRows = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.eventType, "customer.subscription.created"));
  assert.equal(eventRows.length, 1);
  const outbox = await db
    .select()
    .from(ediOutbox)
    .where(
      and(
        eq(ediOutbox.subjectId, paid.customerId),
        eq(ediOutbox.dedupeKey, `stripe:${createdEvent.id}:${paid.customerId}`),
      ),
    );
  assert.equal(outbox.length, 1);
  passed("invalid_signature_has_no_effect_and_event_outbox_is_deduplicated");
} catch (error) {
  failure = error;
} finally {
  for (const id of clocks) {
    try {
      const clock = await stripe.testHelpers.testClocks.retrieve(id);
      assert.equal(clock.name, `edi-homologation:${runId}`);
      await stripe.testHelpers.testClocks.del(id);
    } catch (error) {
      failure ??= error;
    }
  }
  for (const id of standaloneCustomers) {
    try {
      const customer = await stripe.customers.retrieve(id);
      assert.equal(customer.metadata.edi_homologation, runId);
      assert.equal(customer.livemode, false);
      await stripe.customers.del(id);
    } catch (error) {
      failure ??= error;
    }
  }
  console.log(
    JSON.stringify(
      {
        runId,
        checks,
        eventVersions: [...eventVersions],
        apiVersion: STRIPE_API_VERSION,
        cleanup: failure ? "inspect_failure" : "complete",
        mode: "test",
        remoteWebhookDelivery: false,
      },
      null,
      2,
    ),
  );
  const connection = (
    globalThis as typeof globalThis & {
      __informachPg?: { end: (options: { timeout: number }) => Promise<void> };
    }
  ).__informachPg;
  await connection?.end({ timeout: 5 });
}
if (failure) {
  console.error(failure instanceof Error ? failure.message : "Stripe homologation failed");
  process.exitCode = 1;
}
