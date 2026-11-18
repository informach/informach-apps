import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { createStripeProvider } from "@informach/billing/providers/stripe";
import { createStripeRecreioPlanSchedules } from "@informach/billing/providers/stripe-plans";
import { PRODUCTS } from "@informach/config";
import Stripe from "stripe";
import { z } from "zod";
import { isStripeTestSecret } from "../src/lib/environment";

class BoundaryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BoundaryError";
  }
}
function verify(value: unknown, code: string): asserts value {
  if (!value) throw new BoundaryError(code);
}
function failureDetails(error: unknown): unknown {
  if (error instanceof AggregateError) return error.errors.map(failureDetails);
  if (error instanceof BoundaryError) return { type: error.name, code: error.code };
  if (error instanceof Stripe.errors.StripeError)
    return { type: error.type, code: error.code ?? null, parameter: error.param ?? null };
  return { type: error instanceof Error ? error.name : "unknown" };
}
const id = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;

/** Provider boundary only. Does not complete/admit a native Checkout or grant
 * access; test clocks/SDK exercise real test resources in GitHub exclusively. */
async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  const pnpm = process.env.npm_execpath;
  const temporary = process.env.RUNNER_TEMP;
  const expectedAccount = process.env.STRIPE_EXPECTED_ACCOUNT;
  const runId = process.env.GITHUB_RUN_ID;
  verify(
    process.env.GITHUB_ACTIONS === "true" &&
      process.env.CI === "true" &&
      isStripeTestSecret(key) &&
      key &&
      pnpm &&
      temporary &&
      expectedAccount &&
      runId,
    "invalid_test_executor",
  );
  const prefix = `recreio:provider-test:${runId}:${process.env.GITHUB_RUN_ATTEMPT}`;
  const catalogPath = resolve(temporary, "recreio-stripe-plans-catalog.json");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [pnpm, "exec", "tsx", "scripts/sandbox-catalogo.ts"], {
      env: {
        ...process.env,
        RECREIO_SANDBOX_APP_URL: "https://recreio.informach.com.br",
        RECREIO_SANDBOX_APPLY: "false",
        RECREIO_SANDBOX_RECEIPT_PATH: catalogPath,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", () => reject(new BoundaryError("catalog_process_failed")));
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new BoundaryError("catalog_not_verified")),
    );
  });
  const catalog = z
    .object({
      source: z.literal(process.env.GITHUB_SHA ?? ""),
      accountId: z.literal(expectedAccount),
      mode: z.literal("dev"),
      verified: z.literal(true),
      variables: z.record(z.string(), z.string()),
    })
    .parse(JSON.parse(await readFile(catalogPath, "utf8")));
  const products = PRODUCTS.filter((p) => p.app === "recreio" && p.kind === "subscription");
  function offer(tier: "family" | "individual"): {
    productId: string;
    priceId: string;
    amountCents: number;
  } {
    const product = products.find((p) => p.tier === tier && p.interval === "month");
    verify(product?.listPrice && product.stripePriceEnvironmentVariable, "approved_offer_missing");
    const priceId = catalog.variables[product.stripePriceEnvironmentVariable];
    verify(typeof priceId === "string" && priceId.startsWith("price_"), "verified_price_missing");
    return { productId: product.id, priceId, amountCents: product.listPrice.amountCents };
  }
  const family = offer("family"),
    individual = offer("individual");
  const stripe = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    timeout: 10_000,
    maxNetworkRetries: 0,
  });
  const account = await stripe.accounts.retrieve(expectedAccount);
  verify(account.id === expectedAccount, "wrong_test_account");
  const reader = createStripePaymentFactReader({
    secretKey: "unused",
    client: stripe,
    expectedMode: "dev",
  });
  const acceptedPrices = new Set([family.priceId, individual.priceId]);
  let clock: Stripe.TestHelpers.TestClock | undefined;
  let customerId: string | undefined,
    subscriptionId: string | undefined,
    scheduleId: string | undefined;
  let failure: unknown,
    cleanupConfirmed = false;
  const proof: Record<string, unknown> = {};
  async function advance(target: number) {
    verify(clock, "test_clock_missing");
    await stripe.testHelpers.testClocks.advance(
      clock.id,
      { frozen_time: target },
      { idempotencyKey: `${prefix}:advance:${target}` },
    );
    const deadline = Date.now() + 120_000;
    for (;;) {
      clock = await stripe.testHelpers.testClocks.retrieve(clock.id);
      if (clock.status === "ready") break;
      verify(clock.status === "advancing" && Date.now() < deadline, "test_clock_did_not_advance");
      await setTimeout(2000);
    }
    verify(clock.frozen_time === target, "test_clock_time_differs");
  }
  try {
    clock = await stripe.testHelpers.testClocks.create(
      { name: `recreio-provider-${runId}`, frozen_time: Math.floor(Date.now() / 1000) },
      { idempotencyKey: `${prefix}:clock` },
    );
    const customer = await stripe.customers.create(
      {
        test_clock: clock.id,
        metadata: { recreio_homologacao_run: runId, boundary: "provider_api_only" },
      },
      { idempotencyKey: `${prefix}:customer` },
    );
    customerId = customer.id;
    verify(
      !customer.livemode && id(customer.test_clock) === clock.id,
      "customer_not_in_test_clock",
    );
    const payment = await stripe.paymentMethods.create(
      { type: "card", card: { token: "tok_visa" } },
      { idempotencyKey: `${prefix}:payment` },
    );
    verify(!payment.livemode, "payment_method_not_test");
    await stripe.paymentMethods.attach(
      payment.id,
      { customer: customer.id },
      { idempotencyKey: `${prefix}:attach` },
    );
    await stripe.customers.update(
      customer.id,
      { invoice_settings: { default_payment_method: payment.id } },
      { idempotencyKey: `${prefix}:default` },
    );
    const origin = {
      authorizationId: `provider_fixture_${randomUUID()}`,
      productId: individual.productId,
      payerId: `provider_fixture_${runId}`,
    };
    const sub = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: individual.priceId, quantity: 1 }],
        payment_behavior: "error_if_incomplete",
        metadata: {
          subject_type: "user",
          subject_id: origin.payerId,
          checkout_intent_id: origin.authorizationId,
          product_id: origin.productId,
          recreio_homologacao_run: runId,
        },
      },
      { idempotencyKey: `${prefix}:subscription` },
    );
    subscriptionId = sub.id;
    verify(
      !sub.livemode && sub.status === "active" && sub.items.data.length === 1,
      "initial_contract_not_active",
    );
    const item = sub.items.data[0];
    verify(item, "initial_item_absent");
    const first = await reader.read(sub.id, acceptedPrices);
    verify(
      first?.customerId === customer.id &&
        first.periods.some(
          (p) => p.priceId === individual.priceId && !p.fullyRefunded && !p.disputed,
        ),
      "initial_payment_not_proven",
    );
    const firstInvoiceId = id(sub.latest_invoice);
    verify(firstInvoiceId, "initial_invoice_missing");
    const initialInvoice = await stripe.invoices.retrieve(firstInvoiceId);
    verify(
      !initialInvoice.livemode &&
        initialInvoice.status === "paid" &&
        initialInvoice.amount_paid === individual.amountCents &&
        initialInvoice.currency === "brl",
      "initial_invoice_differs",
    );
    const billing = createStripeProvider({
      secretKey: "unused",
      webhookSecret: "unused",
      appName: "Recreio provider API fixture",
      client: stripe,
    });
    verify(billing.previewInvoice, "preview_api_missing");
    const prorationDate = clock.frozen_time;
    const preview = await billing.previewInvoice({
      customerId: customer.id,
      providerSubscriptionId: sub.id,
      newPriceId: family.priceId,
      prorationBehavior: "always_invoice",
      prorationDate,
    });
    verify(
      preview.currency === "BRL" &&
        preview.amountDueCents === family.amountCents - individual.amountCents,
      "upgrade_quote_differs",
    );
    const declined = await stripe.paymentMethods.create(
      { type: "card", card: { token: "tok_chargeCustomerFail" } },
      { idempotencyKey: `${prefix}:declined-method` },
    );
    verify(!declined.livemode, "declined_method_not_test");
    await stripe.paymentMethods.attach(
      declined.id,
      { customer: customer.id },
      { idempotencyKey: `${prefix}:attach-declined` },
    );
    await stripe.subscriptions.update(
      sub.id,
      { default_payment_method: declined.id },
      { idempotencyKey: `${prefix}:use-declined` },
    );
    const upgradeRequest: Parameters<typeof billing.updateSubscription>[0] = {
      providerSubscriptionId: sub.id,
      newPriceId: family.priceId,
      prorationBehavior: "always_invoice",
      prorationDate,
      paymentBehavior: "pending_if_incomplete",
      idempotencyKey: `${prefix}:upgrade`,
    };
    const update = await billing.updateSubscription(upgradeRequest);
    const upgradeInvoiceId = update.latestInvoice?.id;
    verify(
      upgradeInvoiceId &&
        upgradeInvoiceId !== firstInvoiceId &&
        update.latestInvoice?.status === "open",
      "upgrade_payment_not_pending",
    );
    const replay = await billing.updateSubscription(upgradeRequest);
    verify(replay.latestInvoice?.id === upgradeInvoiceId, "upgrade_replay_created_other_invoice");
    const pending = await stripe.subscriptions.retrieve(sub.id);
    verify(
      !pending.livemode &&
        pending.pending_update &&
        pending.items.data[0]?.price.id === individual.priceId &&
        pending.metadata.product_id === origin.productId,
      "unpaid_upgrade_changed_contract",
    );
    const unpaid = await reader.read(sub.id, acceptedPrices);
    verify(
      unpaid?.priceId === individual.priceId &&
        !unpaid.periods.some((p) => p.priceId === family.priceId),
      "unpaid_upgrade_created_paid_period",
    );
    const paidUpgrade = await stripe.invoices.pay(
      upgradeInvoiceId,
      { payment_method: payment.id },
      { idempotencyKey: `${prefix}:pay-upgrade` },
    );
    verify(
      paidUpgrade.status === "paid" &&
        paidUpgrade.amount_paid === preview.amountDueCents &&
        !paidUpgrade.livemode,
      "upgrade_invoice_differs",
    );
    let upgraded = await stripe.subscriptions.retrieve(sub.id);
    const upgradeDeadline = Date.now() + 60_000;
    while (upgraded.pending_update || upgraded.items.data[0]?.price.id !== family.priceId) {
      verify(Date.now() < upgradeDeadline, "paid_upgrade_not_effective");
      await setTimeout(2000);
      upgraded = await stripe.subscriptions.retrieve(sub.id);
    }
    verify(
      !upgraded.livemode &&
        id(upgraded.customer) === customer.id &&
        upgraded.metadata.product_id === origin.productId &&
        upgraded.items.data[0]?.current_period_end === item.current_period_end,
      "upgrade_scope_or_period_differs",
    );
    const fundedUpgrade = await reader.read(sub.id, acceptedPrices);
    verify(
      fundedUpgrade?.periods.some(
        (p) =>
          p.invoiceId === paidUpgrade.id &&
          p.priceId === family.priceId &&
          !p.fullyRefunded &&
          !p.disputed,
      ),
      "upgrade_paid_period_not_proven",
    );
    await stripe.subscriptions.update(
      sub.id,
      { default_payment_method: payment.id },
      { idempotencyKey: `${prefix}:restore-method` },
    );
    Object.assign(proof, {
      upgradeInvoiceId,
      upgradeAmountPaid: paidUpgrade.amount_paid,
      fixedProrationDate: prorationDate,
      pendingUpgradeKeptOriginalPrice: true,
      upgradePaymentApplied: true,
    });
    const adapter = createStripeRecreioPlanSchedules({
      secretKey: "unused",
      client: stripe,
      mode: "dev",
      now: () => {
        verify(clock, "test_clock_missing");
        return new Date(clock.frozen_time * 1000);
      },
    });
    const input = {
      intentId: randomUUID(),
      customerId: customer.id,
      subscriptionId: sub.id,
      fromPriceId: family.priceId,
      toPriceId: individual.priceId,
      toProductId: individual.productId,
      interval: "month" as const,
      effectiveAt: new Date(item.current_period_end * 1000),
      requestStartedAt: new Date(clock.frozen_time * 1000),
      origin,
    };
    scheduleId = await adapter.create(input);
    verify((await adapter.create(input)) === scheduleId, "schedule_replay_differs");
    const request = { ...input, scheduleId, cancel: false };
    verify((await adapter.reconcile(request)) === "scheduled", "schedule_not_confirmed");
    verify((await adapter.reconcile(request)) === "scheduled", "schedule_replay_not_confirmed");
    await advance(item.current_period_end + 7200);
    verify((await adapter.reconcile(request)) === "applied", "future_phase_not_applied");
    const changed = await stripe.subscriptions.retrieve(sub.id);
    verify(
      !changed.livemode &&
        changed.id === sub.id &&
        changed.metadata.product_id === origin.productId &&
        changed.items.data[0]?.price.id === individual.priceId,
      "changed_contract_or_origin_differs",
    );
    const after = await reader.read(sub.id, acceptedPrices);
    verify(
      after?.periods.some(
        (p) => p.priceId === individual.priceId && !p.fullyRefunded && !p.disputed,
      ),
      "renewal_payment_not_proven",
    );
    const renewalId = id(changed.latest_invoice);
    verify(renewalId && renewalId !== firstInvoiceId, "renewal_invoice_missing");
    const renewal = await stripe.invoices.retrieve(renewalId);
    verify(
      !renewal.livemode &&
        renewal.status === "paid" &&
        renewal.amount_paid === individual.amountCents,
      "renewal_invoice_differs",
    );
    const canceling = await stripe.subscriptions.update(
      sub.id,
      { cancel_at_period_end: true },
      { idempotencyKey: `${prefix}:cancel-at-end` },
    );
    verify(
      canceling.cancel_at_period_end && canceling.status === "active",
      "cancellation_not_scheduled",
    );
    const nextEnd = canceling.items.data[0]?.current_period_end;
    verify(nextEnd, "cancellation_period_missing");
    await advance(nextEnd + 7200);
    const terminal = await stripe.subscriptions.retrieve(sub.id);
    verify(terminal.status === "canceled" && !terminal.livemode, "cancellation_not_effective");
    let paymentIntentId: string | undefined;
    for await (const allocation of stripe.invoicePayments.list({
      invoice: firstInvoiceId,
      status: "paid",
      limit: 100,
    })) {
      verify(!paymentIntentId, "initial_invoice_payment_ambiguous");
      verify(
        allocation.amount_paid === individual.amountCents,
        "initial_invoice_allocation_differs",
      );
      if (allocation.payment.type === "payment_intent")
        paymentIntentId = id(allocation.payment.payment_intent);
    }
    verify(paymentIntentId, "initial_payment_missing");
    const paid = await stripe.paymentIntents.retrieve(paymentIntentId);
    verify(
      !paid.livemode && id(paid.customer) === customer.id && paid.status === "succeeded",
      "refund_scope_differs",
    );
    const refund = await stripe.refunds.create(
      { payment_intent: paid.id },
      { idempotencyKey: `${prefix}:refund` },
    );
    verify(
      refund.status === "succeeded" &&
        refund.amount === individual.amountCents &&
        id(refund.payment_intent) === paid.id &&
        refund.currency === "brl",
      "refund_not_confirmed",
    );
    const refunded = await reader.read(sub.id, acceptedPrices);
    verify(
      refunded?.periods.some(
        (p) =>
          p.invoiceId === firstInvoiceId && p.priceId === individual.priceId && p.fullyRefunded,
      ),
      "refund_fact_not_detected",
    );
    Object.assign(proof, {
      initialInvoiceId: firstInvoiceId,
      initialAmountPaid: initialInvoice.amount_paid,
      renewalInvoiceId: renewal.id,
      renewalAmountPaid: renewal.amount_paid,
      currency: "BRL",
      sameSubscriptionPreserved: true,
      initialProductPreserved: true,
      scheduleApplied: true,
      cancellationEffective: true,
      refundId: refund.id,
      refundDetectedByReader: true,
    });
  } catch (error) {
    failure = error;
  }
  try {
    if (clock) {
      const owned: Stripe.Customer[] = [];
      for await (const owner of stripe.customers.list({ test_clock: clock.id, limit: 100 })) {
        verify(
          owned.length < 1 &&
            !owner.livemode &&
            owner.metadata.recreio_homologacao_run === runId &&
            id(owner.test_clock) === clock.id,
          "cleanup_clock_inventory_differs",
        );
        owned.push(owner);
      }
      if (customerId)
        verify(owned.length === 1 && owned[0]?.id === customerId, "cleanup_clock_owner_missing");
      customerId ??= owned[0]?.id;
      if (customerId) {
        const owner = await stripe.customers.retrieve(customerId);
        verify(
          !owner.deleted &&
            !owner.livemode &&
            owner.metadata.recreio_homologacao_run === runId &&
            id(owner.test_clock) === clock.id,
          "cleanup_customer_scope_differs",
        );
        const subs: Stripe.Subscription[] = [];
        for await (const sub of stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 100,
        })) {
          verify(
            subs.length < 6 && !sub.livemode && sub.metadata.recreio_homologacao_run === runId,
            "cleanup_contract_scope_differs",
          );
          subs.push(sub);
        }
        for (const sub of subs) {
          const attached = id(sub.schedule);
          if (attached) {
            const schedule = await stripe.subscriptionSchedules.retrieve(attached);
            verify(
              !schedule.livemode &&
                id(schedule.customer) === customerId &&
                id(schedule.subscription) === sub.id,
              "cleanup_schedule_scope_differs",
            );
            if (["active", "not_started"].includes(schedule.status))
              await stripe.subscriptionSchedules.release(attached, { preserve_cancel_date: true });
          }
          if (!["canceled", "incomplete_expired"].includes(sub.status)) {
            const canceled = await stripe.subscriptions.cancel(sub.id, {
              invoice_now: false,
              prorate: false,
            });
            verify(canceled.status === "canceled", "cleanup_contract_not_canceled");
          }
        }
      }
      const deleted = await stripe.testHelpers.testClocks.del(clock.id);
      verify(deleted.deleted, "cleanup_clock_not_deleted");
      cleanupConfirmed = true;
    }
  } catch (cleanup) {
    failure = failure
      ? new AggregateError([failure, cleanup], "Provider boundary and cleanup failed")
      : cleanup;
  }
  await writeFile(
    resolve(temporary, "recreio-stripe-provider-plans.json"),
    `${JSON.stringify({ source: process.env.GITHUB_SHA, workflowRunId: runId, accountId: account.id, mode: "dev", boundary: "provider_api_test_clock", nativeCheckoutCompleted: false, nativePlanChangeAccepted: false, nativeGameAccessProven: false, providerWebhookDeliveryProven: false, customerId, subscriptionId, scheduleId, clockId: clock?.id, cleanupConfirmed, ...proof, status: failure ? "failed" : "passed", failureType: failure instanceof Error ? failure.name : null, failureCode: failure instanceof BoundaryError ? failure.code : failure instanceof Stripe.errors.StripeError ? (failure.code ?? failure.type) : null }, null, 2)}\n`,
  );
  if (failure) {
    console.error(
      JSON.stringify({
        status: "failed",
        details: failureDetails(failure),
        code:
          failure instanceof BoundaryError
            ? failure.code
            : failure instanceof Stripe.errors.StripeError
              ? (failure.code ?? failure.type)
              : "provider_boundary_failed",
      }),
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: "failed",
      type: "provider_boundary_setup",
      code:
        error instanceof BoundaryError
          ? error.code
          : error instanceof Stripe.errors.StripeError
            ? (error.code ?? error.type)
            : "setup_unconfirmed",
    }),
  );
  process.exitCode = 1;
});
