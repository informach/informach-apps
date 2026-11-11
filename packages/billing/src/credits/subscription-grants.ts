import type { Product } from "@informach/config";
import type { Database } from "@informach/db";
import { customers, subscriptionPaymentPeriods, subscriptions } from "@informach/db/schema";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { resolveCreditOwner } from "../collection-accounts";
import { BillingError } from "../errors";
import { monthlyCreditWindow } from "./calendar";
import { grantBonusCredits } from "./grant";
import { lockCreditOwner } from "./locks";

/** Shared by invoice handling and the recurring job. Both use the same window receipt. */
export async function grantCalendarSubscriptionCredits(
  deps: { db: Database; app: string; products: readonly Product[] },
  input: { subscriptionId: string; invoiceId?: string; now?: Date },
) {
  const now = input.now ?? new Date();
  return deps.db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, input.subscriptionId))
      .for("update");
    if (!sub) throw new BillingError("Credit subscription not found");
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, sub.customerId), eq(customers.app, deps.app)));
    if (!customer) throw new BillingError("Subscription is outside the credit scope");
    if (deps.app === "compasso" && customer.subjectType !== "billing_account")
      throw new BillingError("Compasso requires a durable commercial account");
    if (
      !["active", "past_due", "canceled"].includes(sub.status) &&
      !(deps.app === "compasso" && sub.status === "trialing")
    )
      return { granted: false, amount: 0 };
    if (input.invoiceId) {
      const [knownInvoice] = await tx
        .select({ id: subscriptionPaymentPeriods.id })
        .from(subscriptionPaymentPeriods)
        .where(
          and(
            eq(subscriptionPaymentPeriods.subscriptionId, sub.id),
            eq(subscriptionPaymentPeriods.providerInvoiceId, input.invoiceId),
          ),
        )
        .limit(1);
      if (!knownInvoice)
        throw new BillingError(
          "Invoice payment facts must be reconciled before granting calendar credits",
        );
    }
    const [fact] = await tx
      .select()
      .from(subscriptionPaymentPeriods)
      .where(
        and(
          eq(subscriptionPaymentPeriods.subscriptionId, sub.id),
          input.invoiceId
            ? eq(subscriptionPaymentPeriods.providerInvoiceId, input.invoiceId)
            : undefined,
          eq(subscriptionPaymentPeriods.fullyRefunded, false),
          eq(subscriptionPaymentPeriods.disputed, false),
          lte(subscriptionPaymentPeriods.periodStart, now),
          gt(subscriptionPaymentPeriods.periodEnd, now),
        ),
      )
      .orderBy(desc(subscriptionPaymentPeriods.periodEnd))
      .limit(1);
    // No period is inferred from Stripe status or the arrival date of a webhook.
    if (!fact) return { granted: false, amount: 0 };
    const product = deps.products.find(
      (p) =>
        p.creditSchedule === "calendar_month" &&
        p.app === deps.app &&
        p.kind === "subscription" &&
        (p.stripePriceId.dev === fact.providerPriceId ||
          p.stripePriceId.prod === fact.providerPriceId),
    );
    if (!product?.bonusCreditsPerMonth)
      throw new BillingError("Paid credit price is not in the approved catalog");
    const window = monthlyCreditWindow(fact.periodStart, fact.periodEnd, now);
    if (!window) return { granted: false, amount: 0 };
    const owner = await resolveCreditOwner(tx, deps.app, {
      type: customer.subjectType,
      id: customer.subjectId,
    });
    await lockCreditOwner(tx, owner);
    const grant = await grantBonusCredits(
      { db: tx, app: deps.app },
      {
        owner,
        amount: product.bonusCreditsPerMonth,
        reason: "subscription_monthly",
        expiresAt: window.endsAt,
        effectiveAt: now,
        fundingPeriodId: fact.id,
        stripeEventId: `monthly:${sub.id}:${window.beginsAt.toISOString()}`,
        metadata: {
          subscriptionId: sub.id,
          invoiceId: fact.providerInvoiceId,
          periodStart: window.beginsAt.toISOString(),
          productId: product.id,
        },
      },
    );
    await tx
      .update(subscriptions)
      .set({
        nextCreditGrantAt: product.interval === "year" ? window.nextGrantAt : null,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id));
    return {
      granted: !grant.alreadyProcessed,
      amount: grant.alreadyProcessed ? 0 : product.bonusCreditsPerMonth,
    };
  });
}
