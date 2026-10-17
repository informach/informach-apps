import { createHmac, randomUUID } from "node:crypto";
import {
  AlreadySubscribedError,
  type BillingProviderClient,
  createBillingService,
  SubscriptionRequiredError,
} from "@informach/billing";
import { PRODUCTS } from "@informach/config";
import { db, eq } from "@informach/db";
import { cozyaProfiles, creditLedger, subscriptions, users } from "@informach/db/schema";
import { describe, expect, it, vi } from "vitest";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { billing } from "@/features/billing/service";
import { getKitchenAccess, startKitchenTrial } from "@/features/kitchen/access";

const catalog = PRODUCTS.filter((product) => product.app === "cozya");
const unsupported = async (): Promise<never> => {
  throw new Error("Unexpected provider operation in payment review");
};
const provider: BillingProviderClient = {
  name: "stripe",
  createCustomer: vi.fn(async ({ email, metadata }) => ({
    id: `cus_review_${randomUUID()}`,
    email,
    metadata: metadata ?? {},
  })),
  retrieveCustomer: unsupported,
  createCheckoutSession: vi.fn(async () => ({
    id: `cs_review_${randomUUID()}`,
    url: "https://checkout.stripe.com/review",
  })),
  createPortalSession: vi.fn(async () => ({ url: "https://billing.stripe.com/review" })),
  cancelSubscription: vi.fn(async ({ providerSubscriptionId, atPeriodEnd }) => ({
    id: providerSubscriptionId,
    status: atPeriodEnd === false ? "canceled" : "active",
    cancelAtPeriodEnd: atPeriodEnd !== false,
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
  })),
  updateSubscription: unsupported,
  retrieveSubscription: unsupported,
  verifyWebhookSignature: () => {
    throw new Error("Tests verify real signatures through the app route");
  },
};
// Only outbound payment-provider calls are simulated. Product catalog, app access,
// PostgreSQL, Stripe signature verification, HTTP webhook and ledger are real.
const checkoutBilling = createBillingService({
  provider: "stripe",
  providerClient: provider,
  db,
  app: "cozya",
  appName: "Cozya",
  publicAppUrl: "https://review.example.com",
  products: catalog,
  organizationsEnabled: false,
  stripeMode: "dev",
  resolveSubjectEmail: async ({ id }) => `${id}@e2e.local`,
});

async function deliver(
  type: string,
  object: Record<string, unknown>,
  id = `evt_review_${randomUUID()}`,
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id,
    object: "event",
    type,
    data: { object },
    created: timestamp,
    livemode: false,
  });
  const signature = createHmac("sha256", "whsec_integration")
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const response = await stripeWebhook(
    new Request("https://review.example.com/api/webhooks/stripe", {
      method: "POST",
      body,
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

describe("payment compatibility with the kitchen trial", () => {
  it("does not subtract an expired trial's usage from the next paid credit grant", async () => {
    const id = randomUUID();
    const now = Date.now();
    const day = 86400000;
    await db.insert(users).values({ id, name: "Expired trial", email: `${id}@e2e.local` });
    await db.insert(creditLedger).values([
      {
        ownerType: "user",
        ownerId: id,
        app: "cozya",
        entryType: "promo_grant",
        amount: 3,
        createdAt: new Date(now - 20 * day),
        expiresAt: new Date(now - 6 * day),
      },
      {
        ownerType: "user",
        ownerId: id,
        app: "cozya",
        entryType: "consumption",
        amount: -3,
        createdAt: new Date(now - 19 * day),
      },
      {
        ownerType: "user",
        ownerId: id,
        app: "cozya",
        entryType: "bonus_grant",
        amount: 50,
        createdAt: new Date(now),
        expiresAt: new Date(now + 31 * day),
      },
    ]);
    expect((await billing.getBalance({ type: "user", id })).available).toBe(50);
    const reservation = await billing.reserveCredits({
      owner: { type: "user", id },
      estimatedAmount: 50,
      app: "cozya",
      feature: "cozya.recipe.extract_from_text",
    });
    expect((await billing.getBalance({ type: "user", id })).available).toBe(0);
    await billing.commitReservation({ reservationId: reservation.id, actualAmount: 50 });
    expect((await billing.getBalance({ type: "user", id })).available).toBe(0);
  });
  it.each(["incomplete", "paused"])(
    "cancels %s subscriptions before account deletion",
    async (status) => {
      const id = randomUUID();
      await db.insert(users).values({ id, name: "Account deletion", email: `${id}@e2e.local` });
      const subject = { type: "user" as const, id };
      const customer = await checkoutBilling.getOrCreateCustomer({
        subject,
        email: `${id}@e2e.local`,
      });
      const subscriptionId = `sub_review_${randomUUID()}`;
      await deliver("customer.subscription.created", {
        id: subscriptionId,
        customer: customer.providerCustomerId,
        status,
        items: {
          data: [
            { price: { id: catalog.find((p) => p.id === "cozya_pro_monthly")?.stripePriceId.dev } },
          ],
        },
      });
      expect(await checkoutBilling.cancelBillingForSubject(subject)).toEqual({
        canceled: 1,
        failed: 0,
      });
      expect(provider.cancelSubscription).toHaveBeenLastCalledWith({
        providerSubscriptionId: subscriptionId,
        atPeriodEnd: false,
      });
      expect(
        (
          await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.providerSubscriptionId, subscriptionId))
        )[0]?.status,
      ).toBe("canceled");
    },
  );
  it("rejects an unsigned webhook without changing entitlement", async () => {
    const result = await stripeWebhook(
      new Request("https://review.example.com/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ type: "invoice.paid" }),
      }),
    );
    expect(result.status).toBe(400);
  });

  it.each([
    { productId: "cozya_pro_monthly", cents: 1490, days: 30 },
    { productId: "cozya_pro_annual", cents: 14900, days: 365 },
  ])(
    "preserves $productId checkout, 50-credit grants, packs, cancellation and trial boundaries",
    async ({ productId, cents, days }) => {
      const product = catalog.find((entry) => entry.id === productId);
      if (!product) throw new Error("Expected configured product");
      expect(product.listPrice).toEqual({ amountCents: cents, currency: "BRL" });
      expect(product.bonusCreditsPerMonth).toBe(50);
      const user = {
        id: randomUUID(),
        email: `billing-${randomUUID()}@e2e.local`,
        name: "Billing review",
        emailVerified: true,
      };
      await db.insert(users).values(user);
      const owner = { type: "user" as const, id: user.id };
      expect((await startKitchenTrial(user)).ok).toBe(true);
      expect((await billing.getBalance(owner)).available).toBe(3);
      expect(await billing.hasProSubscription(owner)).toBe(false);
      await expect(
        checkoutBilling.createCreditPackCheckout({
          subject: owner,
          productId: "cozya_credits_10",
          successUrl: "https://review.example.com/settings/billing",
          cancelUrl: "https://review.example.com/settings/billing",
        }),
      ).rejects.toBeInstanceOf(SubscriptionRequiredError);
      const checkout = await checkoutBilling.createSubscriptionCheckout({
        subject: owner,
        productId,
        successUrl: "https://review.example.com/dashboard?welcome=1",
        cancelUrl: "https://review.example.com/choose-plan",
      });
      expect(checkout.url).toBe("https://checkout.stripe.com/review");
      expect(provider.createCheckoutSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: "subscription",
          priceId: product.stripePriceId.dev,
          trialDays: undefined,
        }),
      );
      const customer = await checkoutBilling.getOrCreateCustomer({
        subject: owner,
        email: user.email,
      });
      const now = Math.floor(Date.now() / 1000);
      const subscription = {
        id: `sub_review_${randomUUID()}`,
        customer: customer.providerCustomerId,
        status: "active",
        items: {
          data: [
            {
              price: { id: product.stripePriceId.dev },
              current_period_start: now,
              current_period_end: now + days * 86400,
            },
          ],
        },
        metadata: { product_id: productId },
      };
      await deliver("checkout.session.completed", {
        id: checkout.sessionId,
        mode: "subscription",
        customer: customer.providerCustomerId,
        subscription: subscription.id,
      });
      expect(await billing.hasProSubscription(owner)).toBe(false);
      await deliver("customer.subscription.created", subscription);
      expect(await getKitchenAccess(user.id)).toMatchObject({
        isPro: true,
        canPlan: true,
        canUseAi: true,
      });
      expect((await billing.getBalance(owner)).available).toBe(3);
      const invoice = {
        id: `in_review_${randomUUID()}`,
        customer: customer.providerCustomerId,
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: subscription.id },
        },
        billing_reason: "subscription_create",
        amount_paid: cents,
        currency: "brl",
      };
      const invoiceEvent = `evt_review_${randomUUID()}`;
      await deliver("invoice.paid", invoice, invoiceEvent);
      expect((await billing.getBalance(owner)).available).toBe(53);
      expect((await deliver("invoice.paid", invoice, invoiceEvent)).deduped).toBe(true);
      expect((await billing.getBalance(owner)).available).toBe(53);
      await expect(
        checkoutBilling.createSubscriptionCheckout({
          subject: owner,
          productId,
          successUrl: "https://review.example.com/dashboard",
          cancelUrl: "https://review.example.com/choose-plan",
        }),
      ).rejects.toBeInstanceOf(AlreadySubscribedError);
      if (days === 365) {
        const current = await billing.getSubscription(owner);
        if (!current) throw new Error("Expected annual subscription");
        expect(current.nextCreditGrantAt).not.toBeNull();
        await db
          .update(subscriptions)
          .set({ nextCreditGrantAt: new Date(Date.now() - 1000) })
          .where(eq(subscriptions.id, current.id));
        expect((await billing.grantPendingMonthlyBonusCredits()).totalCredits).toBe(50);
        expect((await billing.grantPendingMonthlyBonusCredits()).totalCredits).toBe(0);
      } else {
        await deliver("invoice.paid", {
          ...invoice,
          id: `in_review_${randomUUID()}`,
          billing_reason: "subscription_cycle",
        });
      }
      expect((await billing.getBalance(owner)).available).toBe(103);
      await checkoutBilling.createCreditPackCheckout({
        subject: owner,
        productId: "cozya_credits_10",
        successUrl: "https://review.example.com/settings/billing",
        cancelUrl: "https://review.example.com/settings/billing",
      });
      const pack = catalog.find((entry) => entry.id === "cozya_credits_10");
      expect(provider.createCheckoutSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ mode: "payment", priceId: pack?.stripePriceId.dev }),
      );
      const paymentId = `pi_review_${randomUUID()}`;
      const paymentEvent = `evt_review_${randomUUID()}`;
      const payment = {
        id: paymentId,
        customer: customer.providerCustomerId,
        amount: 690,
        currency: "brl",
        metadata: {
          product_id: "cozya_credits_10",
          credit_amount: "10",
          subject_type: "user",
          subject_id: user.id,
        },
      };
      await deliver("payment_intent.succeeded", payment, paymentEvent);
      await deliver("payment_intent.succeeded", payment, paymentEvent);
      expect((await billing.getBalance(owner)).available).toBe(113);
      expect(
        (
          await checkoutBilling.createPortalSession({
            subject: owner,
            returnUrl: "https://review.example.com/settings/billing",
          })
        ).url,
      ).toBe("https://billing.stripe.com/review");
      const failedInvoice = {
        ...invoice,
        id: `in_review_${randomUUID()}`,
        billing_reason: "subscription_cycle",
      };
      await deliver("invoice.payment_failed", failedInvoice);
      expect(await billing.hasProSubscription(owner)).toBe(false);
      await db
        .update(cozyaProfiles)
        .set({ trialStartedAt: new Date(Date.now() - 15 * 86400000) })
        .where(eq(cozyaProfiles.userId, user.id));
      expect(await getKitchenAccess(user.id)).toMatchObject({
        isPro: false,
        canPlan: false,
        canUseAi: false,
      });
      await deliver("customer.subscription.updated", subscription);
      // A generic subscription update can arrive while Stripe still has an
      // unpaid invoice. It must not restore paid access before payment succeeds.
      expect(await billing.hasProSubscription(owner)).toBe(false);
      await deliver("invoice.paid", failedInvoice);
      const expectedAfterRecovery = days === 365 ? 113 : 163;
      expect((await billing.getBalance(owner)).available).toBe(expectedAfterRecovery);
      const active = await billing.getSubscription(owner);
      if (!active) throw new Error("Expected active subscription");
      await checkoutBilling.cancelSubscription({ subscriptionId: active.id, atPeriodEnd: true });
      expect(await billing.hasProSubscription(owner)).toBe(true);
      await deliver("customer.subscription.deleted", { ...subscription, status: "canceled" });
      expect(await billing.hasProSubscription(owner)).toBe(false);
      expect((await billing.getBalance(owner)).available).toBe(expectedAfterRecovery);
    },
  );
});
